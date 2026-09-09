'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Send,
  Terminal as TerminalIcon,
  Shield,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Ban,
  Settings2,
  HelpCircle,
  LogIn,
  RotateCw,
  Loader2,
  X,
} from 'lucide-react';
import {
  CommandOutcome,
  CommandErrorState,
  deriveTerminalOutcomeFromOrchestrateResponse,
  deriveTerminalOutcomeFromInstance,
  deriveTerminalErrorFromHttpStatus,
  deriveTerminalErrorFromNetworkFailure,
  generateCommandIdempotencyKey,
  persistLastCommandPointer,
  loadLastCommandPointer,
  clearLastCommandPointer,
  LastCommandPointer,
  OrchestrateResponseBody,
  WorkflowInstanceView,
} from '@/lib/cockpit/command-terminal-state';

/**
 * PHASE 3.2 — COMMAND TERMINAL
 *
 * An INPUT SURFACE for the founder, not an authority surface:
 * - submits to the EXISTING POST /api/orchestrate contract (no second API),
 * - sends a client-generated idempotency key so the EXISTING server-side
 *   idempotency store governs duplicates,
 * - displays ONLY authoritative server state (run status / durable instance
 *   status) — HTTP 200 or success:true never renders as "success",
 * - performs NO orchestration, NO authorization, NO approval, and holds no
 *   company state beyond a sessionStorage pointer used to re-read durable
 *   state after a page refresh.
 *
 * Approval integration: when the server reports `requires_approval`, the
 * terminal surfaces the state and fires onApprovalRequested so the existing
 * Side-Effect Authorization Gate inbox (Phase 3.1 loop) refreshes — approval
 * itself happens ONLY in that existing inbox.
 */

interface CommandTerminalProps {
  /** Fired when the server reports an approval-worthy outcome so the existing inbox can refresh immediately. */
  onApprovalRequested?: () => void;
  /** Fired with the final server-derived outcome (used by the cockpit for its real stream events). */
  onOutcome?: (directive: string, outcome: CommandOutcome | CommandErrorState, isOutcome: boolean) => void;
}

type SubmissionPhase = 'idle' | 'submitting';

interface ResultState {
  directive: string;
  /** true → `outcome` (server run result); false → `error` (request failed). */
  isOutcome: boolean;
  outcome?: CommandOutcome;
  error?: CommandErrorState;
  /** True when this result was re-read from durable state after a refresh. */
  reread?: boolean;
  submittedAt: string;
}

const OUTCOME_META: Record<
  CommandOutcome['kind'],
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string; chip: string }
> = {
  completed: {
    label: 'COMPLETED',
    icon: CheckCircle2,
    tone: 'text-emerald-400',
    chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  running: {
    label: 'RUNNING',
    icon: Clock,
    tone: 'text-indigo-400',
    chip: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  },
  awaiting_approval: {
    label: 'AWAITING FOUNDER APPROVAL',
    icon: Shield,
    tone: 'text-amber-400',
    chip: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  failed: {
    label: 'FAILED',
    icon: XCircle,
    tone: 'text-rose-400',
    chip: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  },
  blocked: {
    label: 'BLOCKED',
    icon: Ban,
    tone: 'text-orange-400',
    chip: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  unconfigured: {
    label: 'ENGINE NOT CONFIGURED',
    icon: Settings2,
    tone: 'text-slate-400',
    chip: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  },
  unknown: {
    label: 'UNKNOWN',
    icon: HelpCircle,
    tone: 'text-slate-400',
    chip: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  },
};

const ERROR_META: Record<
  CommandErrorState['kind'],
  { label: string; icon: React.ComponentType<{ className?: string }>; chip: string }
> = {
  unauthenticated: {
    label: 'AUTHENTICATION REQUIRED',
    icon: LogIn,
    chip: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  },
  unauthorized: {
    label: 'NOT AUTHORIZED',
    icon: Ban,
    chip: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  },
  validation: {
    label: 'INVALID COMMAND',
    icon: AlertTriangle,
    chip: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  duplicate_in_progress: {
    label: 'ALREADY IN PROGRESS',
    icon: Clock,
    chip: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  unknown_result: {
    label: 'UNKNOWN PRIOR RESULT',
    icon: HelpCircle,
    chip: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  prior_failure: {
    label: 'PRIOR ATTEMPT FAILED',
    icon: XCircle,
    chip: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  payload_mismatch: {
    label: 'IDEMPOTENCY KEY MISMATCH',
    icon: AlertTriangle,
    chip: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  conflict: {
    label: 'CONFLICT',
    icon: AlertTriangle,
    chip: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  server_error: {
    label: 'SERVER ERROR',
    icon: XCircle,
    chip: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  },
  network_error: {
    label: 'NO SERVER RESPONSE',
    icon: RotateCw,
    chip: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
};

const MAX_DIRECTIVE_LENGTH = 2000;

export function CommandTerminal({ onApprovalRequested, onOutcome }: CommandTerminalProps) {
  const [directiveInput, setDirectiveInput] = useState('');
  const [phase, setPhase] = useState<SubmissionPhase>('idle');
  const [result, setResult] = useState<ResultState | null>(null);

  /**
   * The idempotency key is generated ONCE per submission attempt and REUSED on
   * network-failure retry, so a genuine retry cannot create duplicate work
   * (the server-side idempotency store replays the completed record instead).
   * A new submission always generates a fresh key.
   */
  const idempotencyKeyRef = useRef<string | null>(null);
  const retryDirectiveRef = useRef<string | null>(null);

  // -----------------------------------------------------------------------
  // Refresh re-read: recover the LAST command's authoritative state from the
  // durable workflow store (existing GET /api/workflow/instances contract).
  // The sessionStorage value is only a POINTER; the displayed state is always
  // re-fetched from the server. On 401/errors the re-read is skipped silently,
  // matching the approvals inbox convention.
  // -----------------------------------------------------------------------
  useEffect(() => {
    let mounted = true;
    const pointer = loadLastCommandPointer();
    if (!pointer) return;

    (async () => {
      try {
        const res = await fetch('/api/workflow/instances');
        if (!res.ok) return;
        const instances: WorkflowInstanceView[] = await res.json();
        if (!mounted || !Array.isArray(instances)) return;
        const found = instances.find(
          (i) => i?.instanceId === pointer.workflowInstanceId
        );
        if (!found) {
          // No durable record for the pointer — discard it honestly.
          clearLastCommandPointer();
          return;
        }
        const outcome = deriveTerminalOutcomeFromInstance(found);
        if (outcome.kind === 'awaiting_approval') {
          onApprovalRequested?.();
        }
        setResult({
          directive: pointer.directive,
          isOutcome: true,
          outcome,
          reread: true,
          submittedAt: pointer.submittedAt,
        });
      } catch {
        // Network/parse failure during re-read: keep the pointer, show nothing.
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // Submission — the ONLY action this terminal performs. It calls the existing
  // /api/orchestrate contract; all validation, authentication, authorization,
  // idempotency, orchestration, approval gating, persistence, and audit remain
  // entirely server-side.
  // -----------------------------------------------------------------------
  const submit = useCallback(
    async (directive: string, idempotencyKey: string) => {
      setPhase('submitting');

      try {
        const res = await fetch('/api/orchestrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ directive, idempotencyKey }),
        });

        const replayed = res.headers.get('x-idempotent-replay') === 'true';
        let body: OrchestrateResponseBody | null = null;
        try {
          body = (await res.json()) as OrchestrateResponseBody;
        } catch {
          body = null;
        }

        if (res.ok) {
          // Authoritative outcome — derived ONLY from the server's run status.
          const outcome = deriveTerminalOutcomeFromOrchestrateResponse(body, {
            replayed,
          });
          setResult({
            directive,
            isOutcome: true,
            outcome,
            submittedAt: new Date().toISOString(),
          });
          onOutcome?.(directive, outcome, true);

          if (outcome.workflowInstanceId) {
            persistLastCommandPointer({
              workflowInstanceId: outcome.workflowInstanceId,
              directive,
              idempotencyKey,
              submittedAt: new Date().toISOString(),
            });
          } else {
            // No durable work was created (e.g. engine unconfigured) — no pointer.
            clearLastCommandPointer();
          }

          if (outcome.kind === 'awaiting_approval') {
            onApprovalRequested?.();
          }
        } else {
          // Failed request — surface the server's safe actionable message.
          const error = deriveTerminalErrorFromHttpStatus(res.status, body);
          setResult({
            directive,
            isOutcome: false,
            error,
            submittedAt: new Date().toISOString(),
          });
          onOutcome?.(directive, error, false);
        }
      } catch (reason) {
        const error = deriveTerminalErrorFromNetworkFailure(reason);
        setResult({
          directive,
          isOutcome: false,
          error,
          submittedAt: new Date().toISOString(),
        });
        onOutcome?.(directive, error, false);
      } finally {
        setPhase('idle');
      }
    },
    [onApprovalRequested, onOutcome]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const directive = directiveInput.trim();
    if (!directive || phase === 'submitting') return;

    // New submission → new idempotency key; forget any prior retry context.
    idempotencyKeyRef.current = generateCommandIdempotencyKey();
    retryDirectiveRef.current = directive;
    setDirectiveInput('');
    submit(directive, idempotencyKeyRef.current);
  };

  const handleRetrySameKey = () => {
    const key = idempotencyKeyRef.current;
    const directive = retryDirectiveRef.current;
    if (!key || !directive || phase === 'submitting') return;
    // Re-submit with the SAME idempotency key: the existing server-side store
    // either replays the completed record or rejects the duplicate — never
    // double-executes.
    submit(directive, key);
  };

  const dismissResult = () => setResult(null);

  const canRetrySameKey =
    result &&
    !result.isOutcome &&
    result.error?.retrySameKey === true &&
    phase === 'idle';

  return (
    <div className="max-w-5xl mx-auto">
      {/* RESULT PANEL — authoritative server state only */}
      <div aria-live="polite" aria-atomic="true">
        {result && (
          <div
            data-testid="command-terminal-result"
            className="mb-3 rounded-xl border border-slate-800 bg-[#161b22]/90 backdrop-blur-md overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/80 bg-slate-900/50">
              <div className="flex items-center gap-2 min-w-0">
                <TerminalIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Command Result
                </span>
                {(() => {
                  const meta = result.isOutcome
                    ? OUTCOME_META[result.outcome!.kind]
                    : ERROR_META[result.error!.kind];
                  const Icon = meta.icon;
                  return (
                    <span
                      data-testid="command-terminal-status-chip"
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border shrink-0 ${meta.chip}`}
                    >
                      <Icon className="w-3 h-3 inline-block mr-1 -mt-0.5" />
                      {meta.label}
                    </span>
                  );
                })()}
                {result.outcome?.replayed && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shrink-0">
                    IDEMPOTENT REPLAY
                  </span>
                )}
                {result.reread && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-500/15 text-slate-400 border border-slate-500/30 shrink-0">
                    DURABLE RE-READ
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canRetrySameKey && (
                  <button
                    type="button"
                    onClick={handleRetrySameKey}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-indigo-300 bg-indigo-950/50 hover:bg-indigo-900/60 border border-indigo-500/30 rounded-md transition"
                  >
                    <RotateCw className="w-3 h-3" />
                    Retry (same key)
                  </button>
                )}
                <button
                  type="button"
                  onClick={dismissResult}
                  aria-label="Dismiss result"
                  className="p-1 text-slate-500 hover:text-slate-300 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="px-4 py-3 space-y-2">
              <div className="text-[11px] text-slate-400 truncate" title={result.directive}>
                <span className="text-slate-500 font-mono">&gt; </span>
                {result.directive}
              </div>

              {result.isOutcome ? (
                <>
                  <p className="text-xs text-slate-200 leading-relaxed" data-testid="command-terminal-detail">
                    {result.outcome!.detail}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-slate-500">
                    {result.outcome!.workflowInstanceId && (
                      <span>
                        instance:{' '}
                        <span className="text-slate-400">
                          {result.outcome!.workflowInstanceId}
                        </span>
                      </span>
                    )}
                    {result.outcome!.executionMode && (
                      <span>
                        mode: <span className="text-slate-400">{result.outcome!.executionMode}</span>
                      </span>
                    )}
                    <span>
                      liveAi:{' '}
                      <span className="text-slate-400">
                        {String(result.outcome!.liveAi ?? false)}
                      </span>
                    </span>
                  </div>
                  {result.outcome!.kind === 'awaiting_approval' && (
                    <p className="text-[11px] text-amber-400/90 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 shrink-0" />
                      The side-effect approval is pending in the Side-Effect
                      Authorization Gate inbox above — decide it there.
                    </p>
                  )}
                  {result.outcome!.kind === 'unconfigured' && (
                    <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Settings2 className="w-3.5 h-3.5 shrink-0" />
                      No workflow was created and no results were fabricated.
                      Configure the engine secret, then re-dispatch the directive.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-300 leading-relaxed" data-testid="command-terminal-detail">
                  {result.error!.detail}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* INPUT ROW */}
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={directiveInput}
            onChange={(e) => setDirectiveInput(e.target.value.slice(0, MAX_DIRECTIVE_LENGTH))}
            maxLength={MAX_DIRECTIVE_LENGTH}
            placeholder='Command the company: "Audit student drop-off rate and generate sprint PRD"…'
            aria-label="Founder directive for orchestration"
            className="w-full px-4 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 shadow-inner font-sans"
          />
        </div>
        <button
          type="submit"
          disabled={phase === 'submitting' || !directiveInput.trim()}
          className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-1.5"
        >
          {phase === 'submitting' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Dispatching…</span>
            </>
          ) : (
            <>
              <span>Dispatch</span>
              <Send className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
