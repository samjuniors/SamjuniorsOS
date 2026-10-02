import { SophiaMemoryRecord } from './personal-memory-store';

/**
 * ============================================================================
 * SOPHIA MEMORY LIFECYCLE MODEL (M4-B.1 — lifecycle foundation)
 * ============================================================================
 * The explicit lifecycle state machine for Sophia Personal Memory. This
 * module is PURE: no storage, no I/O, no model judgment — deterministic
 * state definitions, a transition table, and a legacy-derivation rule that
 * migrate the overloaded pre-M4-B.1 `active` boolean semantics.
 *
 * SEMANTIC CONTRACT — what ACTIVE means (and deliberately does NOT mean):
 *   ACTIVE means ONLY that the memory is currently eligible to be retrieved
 *   into Sophia's Personal Mind context. It does NOT mean:
 *     - objectively true
 *     - Company Brain truth
 *     - authorization, permission, or governance policy
 *     - an execution instruction
 *     - permanently correct or universally applicable
 *     - a verified epistemic fact
 *   A personal memory is ADVISORY CONTEXT ONLY — it shapes conversational
 *   style and relevance, never company facts, authorization, or execution.
 *
 * LIFECYCLE AUTHORITY (M4-B.1):
 *   `lifecycleState` IS the lifecycle authority. The legacy boolean `active`
 *   is a DERIVED mirror (active === (lifecycleState === 'ACTIVE')) kept for
 *   read-compat with the K-2/M4-A API surface; no write path may treat the
 *   boolean as authoritative anymore.
 *
 * WHO MAY TRANSITION (non-negotiable):
 *   The ONLY system-initiated action in the entire lifecycle is CREATE of a
 *   PENDING_REVIEW capture candidate. EVERY belief-bearing transition —
 *   activate, archive, reject, supersede, restore — is executed exclusively
 *   by an authenticated Founder through the governed store methods. There is
 *   NO automatic activation: the capture gate never returns ACCEPT and a
 *   captured candidate can ONLY become ACTIVE through an explicit Founder
 *   confirmation (M4-A contract, unchanged).
 *
 * STATES:
 *   PENDING_REVIEW — captured candidate awaiting explicit Founder review.
 *                    Created by the deterministic capture stage. Not in
 *                    context. The review queue shows exactly these records.
 *   ACTIVE         — eligible for retrieval into Personal Mind context
 *                    (advisory context only — see above).
 *   SUPERSEDED     — replaced by a successor memory chosen by the Founder
 *                    (create-B + mark-A pattern). Out of context; retained
 *                    with its provenance and a pointer to the successor.
 *   ARCHIVED       — removed from context by the Founder without deletion
 *                    ("forget from cognition, not from record"). Out of
 *                    context; retained and restorable.
 *   REJECTED       — Founder reviewed a pending candidate and refused it.
 *                    Terminal tombstone: out of context, retained for
 *                    provenance and duplicate detection (a rejected
 *                    candidate must not silently re-enter the capture
 *                    queue as a "new" proposal). Physical DELETE remains the
 *                    explicit escape hatch.
 *
 *   (DELETED is not a state — it is the physical delete event exposed by
 *   the existing DELETE endpoint, unchanged.)
 *
 * TRANSITION TABLE (founder-only, fail-closed):
 *   PENDING_REVIEW → ACTIVE | ARCHIVED | REJECTED
 *   ACTIVE         → ARCHIVED | SUPERSEDED
 *   ARCHIVED       → ACTIVE  | SUPERSEDED
 *   SUPERSEDED     → ACTIVE                      (restore a wrong supersession)
 *   REJECTED       → (terminal)
 *   A transition to PENDING_REVIEW is never valid from any state.
 *   A same-state transition is an idempotent no-op (allowed, unrecorded).
 */

export const SOPHIA_MEMORY_LIFECYCLE_STATES = [
  'PENDING_REVIEW',
  'ACTIVE',
  'SUPERSEDED',
  'ARCHIVED',
  'REJECTED',
] as const;

export type SophiaMemoryLifecycleState = (typeof SOPHIA_MEMORY_LIFECYCLE_STATES)[number];

/** Birth states — the only states a NEW record may be created in. */
export const SOPHIA_MEMORY_LIFECYCLE_BIRTH_STATES: readonly SophiaMemoryLifecycleState[] = [
  'PENDING_REVIEW', // capture path (M4-A) — awaits Founder review
  'ACTIVE',         // founder-direct path (governed route) — active on authoring
];

/**
 * Allowed transitions. Keys are the CURRENT state; values are the states the
 * record may move to. Founder-executed only; enforced fail-closed by the
 * store. Same-state "transitions" are treated as idempotent no-ops by the
 * store and are NOT listed here.
 */
export const SOPHIA_MEMORY_LIFECYCLE_TRANSITIONS: Readonly<
  Record<SophiaMemoryLifecycleState, readonly SophiaMemoryLifecycleState[]>
> = {
  PENDING_REVIEW: ['ACTIVE', 'ARCHIVED', 'REJECTED'],
  ACTIVE: ['ARCHIVED', 'SUPERSEDED'],
  ARCHIVED: ['ACTIVE', 'SUPERSEDED'],
  SUPERSEDED: ['ACTIVE'],
  REJECTED: [],
};

/** Type guard against untrusted lifecycle state strings. */
export function isSophiaMemoryLifecycleState(value: unknown): value is SophiaMemoryLifecycleState {
  return (
    typeof value === 'string' &&
    (SOPHIA_MEMORY_LIFECYCLE_STATES as readonly string[]).includes(value)
  );
}

/** Deterministic transition validity (pure). */
export function canTransitionSophiaMemory(
  from: SophiaMemoryLifecycleState,
  to: SophiaMemoryLifecycleState
): boolean {
  return SOPHIA_MEMORY_LIFECYCLE_TRANSITIONS[from].includes(to);
}

/**
 * CONTEXT ELIGIBILITY (the ACTIVE definition, operationally):
 * returns true iff the memory is currently eligible to be retrieved into
 * Sophia's Personal Mind context. Eligibility is NOT truth, NOT
 * authorization, NOT verification — advisory context only.
 */
export function isEligibleForPersonalMindContext(state: SophiaMemoryLifecycleState): boolean {
  return state === 'ACTIVE';
}

/**
 * LEGACY DERIVATION (lazy migration, read-time):
 * resolves the lifecycle state of a record written before M4-B.1 (no
 * lifecycleState field). The mapping is total and behavior-preserving
 * against every K-2/M4-A pinned behavior:
 *
 *   active === true                                  → ACTIVE
 *   active === false && metadata.captureStatus pending → PENDING_REVIEW  (captured, unreviewed)
 *   active === false && otherwise                    → ARCHIVED          (founder-deactivated)
 *
 * Records written after M4-B.1 always carry an explicit lifecycleState;
 * this function never overrides it.
 */
export function resolveLifecycleState(record: {
  lifecycleState?: string | null;
  active?: boolean;
  metadata?: Record<string, unknown> | null;
}): SophiaMemoryLifecycleState {
  if (isSophiaMemoryLifecycleState(record.lifecycleState)) {
    return record.lifecycleState;
  }
  if (record.active === true) {
    return 'ACTIVE';
  }
  if (
    record.metadata &&
    typeof record.metadata === 'object' &&
    (record.metadata as Record<string, unknown>).captureStatus === 'pending'
  ) {
    return 'PENDING_REVIEW';
  }
  return 'ARCHIVED';
}

/**
 * Read-path normalizer: returns the record with its lifecycleState resolved
 * (legacy rows derived, post-M4-B.1 rows untouched). Pure — never writes.
 */
export function withResolvedLifecycle(
  record: SophiaMemoryRecord
): SophiaMemoryRecord {
  if (isSophiaMemoryLifecycleState(record.lifecycleState)) {
    return record;
  }
  return { ...record, lifecycleState: resolveLifecycleState(record) };
}
