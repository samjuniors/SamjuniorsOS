import { SophiaMemoryStore } from './personal-memory-store';
import { MemoryGate, isTaskScopedInstruction } from './memory-gate';
import {
  SophiaMemoryExtractor,
  ExtractedMemoryCandidate,
  MemoryExtractionInput,
} from './memory-extractor';

/**
 * ============================================================================
 * SOPHIA MEMORY CAPTURE STAGE (M4-A)
 * ============================================================================
 * Asynchronous, fire-and-forget Personal Mind capture that runs AFTER the
 * assistant reply has been persisted and BEFORE the turn result is returned
 * (it is invoked without awaiting — capture is NEVER a conversational
 * dependency).
 *
 * PIPELINE (per turn):
 *   persisted founder message + persisted assistant reply
 *     -> LLM extraction (untrusted proposals only)
 *     -> deterministic MemoryGate (REJECT | NEEDS_REVIEW)
 *     -> REJECT      : nothing persisted
 *     -> NEEDS_REVIEW: INACTIVE SophiaMemory candidate (captureStatus pending)
 *     -> Founder confirmation via the EXISTING governed PATCH on
 *        /api/sofia/memory (active: true) is the ONLY activation path.
 *
 * M4-A EXPLICIT NON-GOALS: no automatic activation (no ACCEPT outcome is
 * ever produced), no forgetting/decay/TTL, no consolidation or semantic
 * merging, no vector search, no cross-brain promotion. Captured candidates
 * accumulate as inactive records until the Founder confirms or deletes them.
 *
 * FAILURE CONTAINMENT: every failure mode below is contained inside the
 * stage — the conversational turn that triggered capture always succeeds:
 *   - extraction unavailable/malformed -> no candidates, no persistence
 *   - gate failure                     -> rejection, no persistence
 *   - persistence failure              -> logged, candidate lost (fail-safe:
 *                                         NO fake memory is ever created)
 *   - Prisma mirror failure            -> swallowed by the store's
 *                                         opportunistic dual-write contract
 *
 * IDEMPOTENCY (two deterministic layers):
 *   1. Turn-level: the capture key prefix "m4cap:<conversationId>:<turnId>:"
 *      is checked BEFORE extraction — a replayed turn never re-captures
 *      (the turn executors additionally return cached replies on idempotent
 *      replay before this stage would even run).
 *   2. Candidate-level: each persisted candidate carries the deterministic
 *      key "m4cap:<conversationId>:<turnId>:<index>"; the store's
 *      founder-scoped key dedupe makes any re-persistence a no-op replay.
 *
 * PROVENANCE: candidates record provenance "conversation:<conversationId>"
 * and metadata preserving the full trace (founderMessageId, turnId, ingress,
 * capture timestamp, gate decision/reasons). No provenance is ever taken
 * from the model.
 *
 * OBSERVABILITY: structured single-line events are logged. Candidate CONTENT
 * is never logged — private memory text must not leak into generic logs.
 */

export interface SophiaMemoryCaptureInput {
  /** Authenticated founder principal — NEVER model- or body-supplied. */
  founderId: string;
  conversationId: string;
  founderMessageId: string;
  assistantMessageId?: string;
  turnId?: string;
  founderMessage: string;
  assistantReply: string;
  ingress: string;
}

export interface SophiaMemoryCaptureOptions {
  /**
   * Deterministic test seam for the LLM extraction step. Production callers
   * omit it (the live SophiaMemoryExtractor runs). Tests inject a fixed
   * proposal source so the gate/persistence/idempotency behavior can be
   * verified without a live model call.
   */
  extract?: (input: MemoryExtractionInput) => Promise<ExtractedMemoryCandidate[]>;
}

export interface SophiaMemoryCaptureOutcome {
  status: 'captured' | 'skipped' | 'rejected' | 'failed';
  reason?: string;
  /** Number of inactive candidates persisted (0 unless status === 'captured'). */
  persisted: number;
}

/** Cheap deterministic pre-filter — trivial turns never reach the model. */
const CAPTURE_MIN_FOUNDER_MESSAGE_CHARS = 8;

function logCaptureEvent(event: string, fields: Record<string, unknown>): void {
  // Single-line structured event. Never includes candidate content.
  console.log(`[SophiaMemoryCapture] ${JSON.stringify({ event, ...fields })}`);
}

/**
 * M4-A HARDENING (observability): classifies an extraction failure from the
 * error message ALONE — never from conversation or candidate content.
 * Provider 429 storms were previously visible only as a raw error string;
 * the class makes capture loss greppable and countable in dev logs without
 * any new telemetry infrastructure.
 */
function classifyExtractionFailure(err: unknown): {
  failureClass: 'PROVIDER_RATE_LIMITED' | 'PROVIDER_ERROR' | 'PARSE_ERROR' | 'UNKNOWN';
  providerStatus: number | null;
} {
  const message = String((err as any)?.message || err || '');
  const statusMatch = message.match(/status\s+(\d{3})/i);
  const providerStatus = statusMatch ? Number(statusMatch[1]) : null;
  if (providerStatus === 429 || /rate.?limit|too many requests|429/i.test(message)) {
    return { failureClass: 'PROVIDER_RATE_LIMITED', providerStatus: providerStatus ?? 429 };
  }
  if (/^parse\b|parseCandidates|malformed (json|output)|json/i.test(message) && /parse|malformed/i.test(message)) {
    return { failureClass: 'PARSE_ERROR', providerStatus };
  }
  if (providerStatus !== null || /api request failed|provider|network|fetch|timeout|ECONN/i.test(message)) {
    return { failureClass: 'PROVIDER_ERROR', providerStatus };
  }
  return { failureClass: 'UNKNOWN', providerStatus };
}

/**
 * Derives the deterministic capture key base from authoritative turn
 * identity. turnId is the primary identity; a turn executed without one
 * falls back to the persisted assistant (or founder) message id — still a
 * deterministic function of what was persisted, never of wall-clock time.
 */
function captureKeyBase(input: SophiaMemoryCaptureInput): string {
  const turnIdentity = input.turnId || input.assistantMessageId || input.founderMessageId;
  return `m4cap:${input.conversationId}:${turnIdentity}`;
}

/**
 * Runs the M4-A capture pipeline for one completed turn. NEVER throws —
 * every failure is contained and returned as a failed/skipped outcome.
 */
export async function captureSophiaMemoryCandidates(
  input: SophiaMemoryCaptureInput,
  options: SophiaMemoryCaptureOptions = {}
): Promise<SophiaMemoryCaptureOutcome> {
  try {
    const store = SophiaMemoryStore.getInstance();
    const founderId = (input.founderId || '').trim();
    const founderMessage = (input.founderMessage || '').trim();
    const assistantReply = (input.assistantReply || '').trim();
    const conversationId = (input.conversationId || '').trim();

    if (!founderId || !conversationId || !input.founderMessageId) {
      return { status: 'skipped', reason: 'MISSING_AUTHORITATIVE_TURN_IDENTITY', persisted: 0 };
    }
    if (founderMessage.length < CAPTURE_MIN_FOUNDER_MESSAGE_CHARS || !assistantReply) {
      return { status: 'skipped', reason: 'TRIVIAL_TURN', persisted: 0 };
    }

    // --- P2 follow-up: task/temporal-scoped instructions are not preferences ---
    // Deterministic pre-extraction skip (see TASK_SCOPED_INSTRUCTION_PATTERNS
    // in memory-gate.ts — shared with the candidate-level gate rule): an
    // explicitly scoped instruction can never become a durable personal
    // memory, and skipping here also saves the provider call.
    if (isTaskScopedInstruction(founderMessage)) {
      logCaptureEvent('capture_skipped', {
        conversationId,
        turnId: input.turnId ?? null,
        reason: 'TRANSIENT_TURN_SCOPE',
      });
      return { status: 'skipped', reason: 'TRANSIENT_TURN_SCOPE', persisted: 0 };
    }

    logCaptureEvent('capture_started', {
      conversationId,
      turnId: input.turnId ?? null,
      ingress: input.ingress,
    });

    // --- Turn-level replay guard (deterministic capture key prefix) ---
    const captureBase = captureKeyBase(input);
    if (await store.hasIdempotencyKeyPrefix(founderId, `${captureBase}:`)) {
      logCaptureEvent('capture_skipped', { conversationId, reason: 'ALREADY_CAPTURED' });
      return { status: 'skipped', reason: 'ALREADY_CAPTURED', persisted: 0 };
    }

    // --- LLM extraction (untrusted proposals only) ---
    let proposed: ExtractedMemoryCandidate[];
    try {
      // The default extractor MUST NOT be detached: extract() internally
      // calls this.parseCandidates(...), so a bare SophiaMemoryExtractor.extract
      // reference would lose its class receiver and throw a TypeError on
      // every live capture. Wrapping the call in an arrow function invokes it
      // through the class, keeping the receiver intact (regression-pinned by
      // the default-extractor child test in the M4-A suite).
      const extractor =
        options.extract ??
        ((extractionInput: MemoryExtractionInput) => SophiaMemoryExtractor.extract(extractionInput));
      proposed = await extractor({ founderMessage, assistantReply });
    } catch (err: any) {
      const { failureClass, providerStatus } = classifyExtractionFailure(err);
      logCaptureEvent('extraction_failed', {
        conversationId,
        turnId: input.turnId ?? null,
        failureClass,
        providerStatus,
        error: String(err?.message || err).slice(0, 200),
      });
      return { status: 'failed', reason: 'EXTRACTION_FAILED', persisted: 0 };
    }

    if (!Array.isArray(proposed) || proposed.length === 0) {
      logCaptureEvent('capture_skipped', { conversationId, reason: 'NO_CANDIDATES' });
      return { status: 'skipped', reason: 'NO_CANDIDATES', persisted: 0 };
    }

    // --- Deterministic gate + inactive persistence ---
    const provenance = `conversation:${conversationId}`;
    // P2 follow-up (dedupe blindspot): the duplicate comparison pool is the
    // AUTHORITATIVE founder-scoped collection (listAllMemories), NOT the
    // paginated newest-50 the API exposes. The phase-2 observation proved an
    // exact duplicate of the 55-record set's oldest entry was RE-PERSISTED
    // because it fell outside the visible page — dedupe correctness must never
    // depend on page visibility.
    const existing = await store.listAllMemories(founderId);
    const existingContents = existing.map((m) => m.content);

    let persisted = 0;
    let rejected = 0;
    const capturedAt = new Date().toISOString();

    for (let index = 0; index < proposed.length; index++) {
      const gateResult = MemoryGate.evaluate(proposed[index], {
        founderId,
        provenance,
        existingContents,
      });

      if (gateResult.decision !== 'NEEDS_REVIEW' || !gateResult.candidate) {
        // REJECT: nothing is persisted. (ACCEPT is never produced in M4-A.)
        rejected++;
        logCaptureEvent('gate_rejected', {
          conversationId,
          turnId: input.turnId ?? null,
          candidateIndex: index,
          reasons: gateResult.reasons,
        });
        continue;
      }

      try {
        const record = await store.createMemory({
          founderId,
          memoryType: gateResult.candidate.memoryType,
          content: gateResult.candidate.content,
          provenance,
          confidence: gateResult.candidate.confidence,
          idempotencyKey: `${captureBase}:${index}`,
          active: false, // M4-A: candidates are INACTIVE until Founder confirmation
          metadata: {
            captureStatus: 'pending',
            captureSource: 'm4a_turn_capture',
            conversationId,
            founderMessageId: input.founderMessageId,
            assistantMessageId: input.assistantMessageId ?? null,
            turnId: input.turnId ?? null,
            ingress: input.ingress,
            capturedAt,
            gate: {
              decision: gateResult.decision,
              reasons: gateResult.reasons,
              evaluatedAt: capturedAt,
            },
          },
        });
        persisted++;
        existingContents.push(record.content);
        logCaptureEvent('candidate_persisted', {
          conversationId,
          memoryId: record.id,
          captureKey: `${captureBase}:${index}`,
        });
      } catch (err: any) {
        // Store validation failure (fail-closed) or persistence error:
        // the candidate is lost — no fake memory is ever created.
        logCaptureEvent('candidate_persist_failed', {
          conversationId,
          turnId: input.turnId ?? null,
          candidateIndex: index,
          error: String(err?.message || err).slice(0, 200),
        });
      }
    }

    if (persisted > 0) {
      logCaptureEvent('capture_completed', { conversationId, persisted, rejected });
      return { status: 'captured', persisted };
    }
    return { status: 'rejected', reason: 'ALL_CANDIDATES_REJECTED', persisted: 0 };
  } catch (err: any) {
    // Absolute containment: capture can NEVER fail the conversation.
    logCaptureEvent('capture_failed', {
      conversationId: input?.conversationId ?? null,
      error: String(err?.message || err).slice(0, 200),
    });
    return { status: 'failed', reason: 'CAPTURE_STAGE_ERROR', persisted: 0 };
  }
}

/**
 * Fire-and-forget entry point for the turn executors. Invoke WITHOUT
 * awaiting after the assistant reply has been persisted. The underlying
 * capture never throws and this wrapper adds a second containment layer,
 * so a floating capture promise can never corrupt a successful turn.
 */
export function scheduleSophiaMemoryCapture(input: SophiaMemoryCaptureInput): void {
  void captureSophiaMemoryCandidates(input).catch((err) => {
    console.error(
      `[SophiaMemoryCapture] unexpected capture failure: ${String((err as any)?.message || err).slice(0, 200)}`
    );
  });
}
