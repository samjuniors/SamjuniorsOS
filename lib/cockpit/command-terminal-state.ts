/**
 * Phase 3.2 — Command Terminal state derivation (pure, client-safe).
 *
 * The Command Terminal is an INPUT SURFACE, not an authority surface. This module
 * contains NO authorization logic, NO orchestration logic, and NO state of its
 * own: it derives the terminal's DISPLAY state from authoritative server
 * responses (/api/orchestrate response envelope) and from durable workflow
 * instance state re-read over the existing /api/workflow/instances contract.
 *
 * Hard rules encoded here (pinned by tests/phase3_2_command_terminal.test.ts):
 * - HTTP 200 / `success: true` NEVER maps to "completed". Only the authoritative
 *   run status (data.status) can produce `completed`.
 * - The unconfigured-engine response (status 'failed' + liveAi false +
 *   executionMode 'unconfigured') maps to `unconfigured`, never `failed`-as-error
 *   and never success — the engine reported the truth and no work was created.
 * - Unknown server states stay `unknown`. Nothing is fabricated.
 */

// ---------------------------------------------------------------------------
// Minimal typed mirror of the EXISTING /api/orchestrate response contract.
// This is a read-only view of what app/api/orchestrate/route.ts returns today
// (subset of types/os.ts OrchestrationRun relevant to terminal display). It is
// NOT a second command model — the server route remains the single authority.
// ---------------------------------------------------------------------------

export type OrchestrateRunStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'synthesizing'
  | 'completed'
  | 'paused'
  | 'failed'
  | 'requires_approval';

export interface OrchestrateResponseData {
  id?: string;
  directive?: string;
  status?: OrchestrateRunStatus;
  liveAi?: boolean;
  title?: string;
  summary?: string;
  failureReason?: string;
  executiveResult?: {
    executionOutcome?: string;
    summary?: string;
    failureReason?: string;
    recommendedNextActions?: string[];
  };
  verificationResult?: {
    isCompliant?: boolean;
    notes?: string;
  };
  executionSummary?: {
    executionMode?: string;
    totalTasksExecuted?: number;
  };
  workflowInstanceId?: string;
}

export interface OrchestrateResponseBody {
  success?: boolean;
  data?: OrchestrateResponseData;
  liveAi?: boolean;
  executionMode?: string;
  workflowInstanceId?: string;
  error?: string;
  /** Structured error code on 409 responses (Phase 3.2 route error mapping). */
  code?: string;
}

/** Raw durable instance view re-read from GET /api/workflow/instances. */
export interface WorkflowInstanceView {
  instanceId?: string;
  status?: string;
  objective?: string;
  updatedAt?: string;
  stepStates?: Record<string, { status?: string; blockedReason?: string }>;
}

// ---------------------------------------------------------------------------
// Terminal outcome model
// ---------------------------------------------------------------------------

export type CommandOutcomeKind =
  | 'completed'
  | 'running'
  | 'awaiting_approval'
  | 'failed'
  | 'blocked'
  | 'unconfigured'
  | 'unknown';

export interface CommandOutcome {
  kind: CommandOutcomeKind;
  /** Safe, server-provided human explanation (never fabricated client-side). */
  detail: string;
  workflowInstanceId?: string;
  executionMode?: string;
  liveAi?: boolean;
  /** True when the server replayed a completed idempotent record. */
  replayed?: boolean;
}

export type CommandErrorKind =
  | 'unauthenticated' // 401 — no/invalid founder session
  | 'unauthorized' // 403 — authenticated but not permitted
  | 'validation' // 400 — malformed command
  | 'duplicate_in_progress' // 409 — same idempotency key already running
  | 'unknown_result' // 409 — ambiguous prior outcome, blind retry prohibited
  | 'prior_failure' // 409 — key bound to a definitively failed attempt
  | 'payload_mismatch' // 422 — key reused with altered payload
  | 'conflict' // 409 — other conflict
  | 'server_error' // 5xx
  | 'network_error'; // fetch rejected (timeout / unreachable)

export interface CommandErrorState {
  kind: CommandErrorKind;
  detail: string;
  /** Safe server-provided message when available. */
  serverMessage?: string;
  /** True when re-submitting with the SAME idempotency key is the correct retry. */
  retrySameKey: boolean;
}

// ---------------------------------------------------------------------------
// Derivation: authoritative run response → terminal outcome
// ---------------------------------------------------------------------------

function unconfiguredDetail(run: OrchestrateResponseData): string {
  return (
    run.failureReason ||
    run.executiveResult?.failureReason ||
    'Orchestration engine is not configured: no live AI execution occurred and no work was created (no fabricated results).'
  );
}

/**
 * Maps the authoritative /api/orchestrate response body to the terminal outcome.
 *
 * The `success` envelope flag and the HTTP status are NOT outcome signals —
 * only `data.status` (the durable orchestration run status synthesized by the
 * existing runtime) is. A 200 with success:true and status:'failed' is a FAILED
 * (or UNCONFIGURED) outcome, never a success.
 */
export function deriveTerminalOutcomeFromOrchestrateResponse(
  body: OrchestrateResponseBody | null | undefined,
  options?: { replayed?: boolean }
): CommandOutcome {
  const run = body?.data;

  if (!run || typeof run.status !== 'string') {
    // Defensive: a 200 without a run payload carries no authoritative outcome.
    return {
      kind: 'unknown',
      detail: body?.error || 'Server response carried no orchestration result.',
      workflowInstanceId: body?.workflowInstanceId,
      executionMode: body?.executionMode,
      replayed: options?.replayed,
    };
  }

  const workflowInstanceId = run.workflowInstanceId || body?.workflowInstanceId;
  const executionMode =
    run.executionSummary?.executionMode || body?.executionMode;
  const liveAi = typeof run.liveAi === 'boolean' ? run.liveAi : body?.liveAi;

  const base = {
    workflowInstanceId,
    executionMode,
    liveAi,
    replayed: options?.replayed,
  };

  switch (run.status) {
    case 'completed':
      return {
        ...base,
        kind: 'completed',
        detail:
          run.summary ||
          run.executiveResult?.summary ||
          'Orchestration completed with a durable result.',
      };

    case 'requires_approval':
      return {
        ...base,
        kind: 'awaiting_approval',
        detail:
          run.executiveResult?.summary ||
          run.summary ||
          'Consequential side-effect step requires founder approval before execution.',
      };

    case 'running':
    case 'planning':
    case 'synthesizing':
    case 'paused':
      return {
        ...base,
        kind: 'running',
        detail:
          run.summary ||
          'Orchestration is running; the server response reports in-progress work.',
      };

    case 'failed': {
      const isUnconfigured =
        executionMode === 'unconfigured' ||
        (liveAi === false &&
          /GEMINI_API_KEY/i.test(
            `${run.failureReason || ''} ${run.executiveResult?.failureReason || ''}`
          ));
      if (isUnconfigured) {
        return { ...base, kind: 'unconfigured', detail: unconfiguredDetail(run) };
      }
      return {
        ...base,
        kind: 'failed',
        detail:
          run.failureReason ||
          run.executiveResult?.failureReason ||
          run.summary ||
          'Orchestration failed. No successful result was produced.',
      };
    }

    case 'idle':
    default:
      return {
        ...base,
        kind: 'unknown',
        detail:
          run.summary ||
          `Server reported run status '${run.status}' — treated as unknown, not success.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Derivation: durable instance state (refresh re-read) → terminal outcome
// ---------------------------------------------------------------------------

/**
 * Maps a raw durable WorkflowInstanceState (re-read via the existing
 * /api/workflow/instances GET contract) to the terminal outcome. Used after a
 * page refresh to display the AUTHORITATIVE current state of the last command
 * rather than a stale response snapshot.
 */
export function deriveTerminalOutcomeFromInstance(
  instance: WorkflowInstanceView | null | undefined
): CommandOutcome {
  if (!instance || typeof instance.status !== 'string') {
    return {
      kind: 'unknown',
      detail: 'No durable record found for the last command.',
    };
  }

  const steps = Object.values(instance.stepStates || {});
  const anyAwaiting = steps.some((s) => s?.status === 'awaiting_approval');

  const base = {
    workflowInstanceId: instance.instanceId,
    detail: `Verified from durable state: workflow is '${instance.status}'.`,
  };

  if (anyAwaiting || instance.status === 'awaiting_approval') {
    return { ...base, kind: 'awaiting_approval' };
  }

  switch (instance.status) {
    case 'completed':
      return { ...base, kind: 'completed' };
    case 'failed':
      return { ...base, kind: 'failed' };
    case 'blocked': {
      const blockedStep = steps.find(
        (s) => s?.status === 'blocked' && s.blockedReason
      );
      return {
        ...base,
        kind: 'blocked',
        detail: blockedStep
          ? `Blocked: ${blockedStep.blockedReason}`
          : base.detail,
      };
    }
    case 'cancelled':
      return {
        ...base,
        kind: 'failed',
        detail: 'Verified from durable state: workflow was cancelled.',
      };
    case 'running':
    case 'pending':
    case 'waiting':
      return { ...base, kind: 'running' };
    default:
      return {
        ...base,
        kind: 'unknown',
        detail: `Verified from durable state: workflow is '${instance.status}'.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Derivation: HTTP error response → terminal error state
// ---------------------------------------------------------------------------

const DEFAULT_ERROR_DETAIL: Record<CommandErrorKind, string> = {
  unauthenticated:
    'Founder session required. Re-authenticate and try again — the command was not submitted.',
  unauthorized:
    'This session is not authorized to issue orchestration commands.',
  validation: 'The command was rejected by the server as malformed.',
  duplicate_in_progress:
    'A submission with this idempotency key is already in progress — no duplicate work was created.',
  unknown_result:
    'Prior outcome of this idempotency key is unknown (coordination loss). Blind retry is prohibited; inspect the result before retrying.',
  prior_failure:
    'The previous attempt with this idempotency key failed definitively. Issue the command again to start a fresh operation.',
  payload_mismatch:
    'This idempotency key is bound to a different directive payload. Use a new submission.',
  conflict: 'The request conflicted with existing server state.',
  server_error:
    'The server failed to process the command. No result was claimed.',
  network_error:
    'No response from the server (network/timeout). Retrying re-uses the same idempotency key, so it cannot create duplicate work.',
};

/**
 * Maps an HTTP error response (status + parsed body) to the terminal error
 * state. Uses the structured `code` field when present (Phase 3.2 route error
 * mapping) and falls back to the status code. Server-provided messages are
 * surfaced verbatim when safe (the route only returns curated messages).
 */
export function deriveTerminalErrorFromHttpStatus(
  status: number,
  body?: OrchestrateResponseBody | null
): CommandErrorState {
  const serverMessage = typeof body?.error === 'string' ? body.error : undefined;
  const code = typeof body?.code === 'string' ? body.code : undefined;

  let kind: CommandErrorKind;
  switch (status) {
    case 400:
      kind = 'validation';
      break;
    case 401:
      kind = 'unauthenticated';
      break;
    case 403:
      kind = 'unauthorized';
      break;
    case 422:
      kind = 'payload_mismatch';
      break;
    case 409:
      if (code === 'idempotency_in_progress') kind = 'duplicate_in_progress';
      else if (code === 'idempotency_unknown') kind = 'unknown_result';
      else if (code === 'idempotency_prior_failure') kind = 'prior_failure';
      else if (serverMessage?.includes('currently in progress'))
        kind = 'duplicate_in_progress';
      else if (serverMessage && /UNKNOWN state|blind retry/i.test(serverMessage))
        kind = 'unknown_result';
      else kind = 'conflict';
      break;
    default:
      kind = 'server_error';
      // Backward-compat sniff for pre-3.2 servers that returned these store
      // errors as generic 500s — classified so the terminal can still show
      // the honest duplicate/coordination-loss state.
      if (serverMessage?.includes('currently in progress')) {
        kind = 'duplicate_in_progress';
      } else if (serverMessage && /UNKNOWN state|blind retry/i.test(serverMessage)) {
        kind = 'unknown_result';
      }
      break;
  }

  return {
    kind,
    detail: serverMessage || DEFAULT_ERROR_DETAIL[kind],
    serverMessage,
    // For HTTP error responses, only an ambiguous prior outcome (409 unknown)
    // calls for a same-key retry; network_error is produced solely by the
    // network-failure derivation, which always sets retrySameKey: true.
    retrySameKey: kind === 'unknown_result',
  };
}

/** Maps a fetch rejection (no HTTP response) to the terminal error state. */
export function deriveTerminalErrorFromNetworkFailure(
  reason?: unknown
): CommandErrorState {
  const message =
    reason instanceof Error ? reason.message : reason ? String(reason) : '';
  return {
    kind: 'network_error',
    detail: DEFAULT_ERROR_DETAIL.network_error,
    serverMessage: message || undefined,
    retrySameKey: true,
  };
}

// ---------------------------------------------------------------------------
// Idempotency key generation (client-side UNIQUE KEY ONLY — safety comes from
// the server-side idempotency store, never from this value itself).
// ---------------------------------------------------------------------------

export function generateCommandIdempotencyKey(): string {
  const c: Crypto | undefined =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return `cc-${c.randomUUID()}`;
  }
  // Fallback for exotic environments; uniqueness is still enforced server-side
  // by the payload binding and the durable idempotency record.
  return `cc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Session pointer for refresh re-read (points at AUTHORITATIVE state only)
// ---------------------------------------------------------------------------

export interface LastCommandPointer {
  workflowInstanceId: string;
  directive: string;
  idempotencyKey: string;
  submittedAt: string;
}

const POINTER_STORAGE_KEY = 'samjuniors-cockpit:last-command';

export function persistLastCommandPointer(pointer: LastCommandPointer): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(POINTER_STORAGE_KEY, JSON.stringify(pointer));
    }
  } catch {
    // Non-authoritative pointer only; failure to persist is harmless.
  }
}

export function loadLastCommandPointer(): LastCommandPointer | null {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(POINTER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.workflowInstanceId === 'string' &&
        typeof parsed.directive === 'string'
      ) {
        return parsed as LastCommandPointer;
      }
    }
  } catch {
    // Corrupt pointer — discard.
  }
  return null;
}

export function clearLastCommandPointer(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(POINTER_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}
