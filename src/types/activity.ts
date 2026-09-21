/**
 * PHASE 4.4C — AUTHORITATIVE ACTIVITY PROJECTION (types).
 *
 * Activity is a READ PROJECTION of authoritative company records, never a
 * second event store and never a new source of truth:
 *
 *   authoritative persisted records
 *     → deterministic Activity projection (src/lib/server/activity/projection.ts)
 *       → GET /api/activity (founder-gated, fail-closed)
 *         → ActivitySurface (existing UI surface)
 *
 * Product distinction (founder directive 4.4C):
 *   Activity ≠ Audit. Activity is the founder-readable company history
 *   ("what has the company actually done?"); Audit is the security /
 *   governance record with detailed authorization evidence. Activity items
 *   summarize events and carry PROVENANCE POINTERS (existing IDs only) —
 *   they never embed payloads, hashes, targets or authorization evidence;
 *   the existing inspector/detail surfaces provide that authorized depth.
 */

/** Deterministic taxonomy of important company events (founder directive).
 *  The numeric order is ALSO the deterministic tie-break rank for events
 *  with identical timestamps (stable regardless of database ordering). */
export const ACTIVITY_CATEGORIES = [
  'work_started',
  'work_completed',
  'work_failed',
  'approval_requested',
  'approval_approved',
  'approval_rejected',
  'side_effect_authorized',
  'side_effect_denied',
  'scheduled_execution',
  'automation_paused',
  'automation_resumed',
  'automation_cancelled',
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** Deterministic tie-break rank (lower = earlier in the taxonomy = earlier
 *  among identical timestamps). Derived from the frozen category order. */
export const ACTIVITY_CATEGORY_RANK: Record<ActivityCategory, number> =
  Object.fromEntries(ACTIVITY_CATEGORIES.map((c, i) => [c, i])) as Record<
    ActivityCategory,
    number
  >;

/** Lifecycle status of the projected event, where the authoritative record
 *  carries one. Honest per category — never invented. */
export type ActivityEventStatus =
  | 'completed'
  | 'failed'
  | 'awaiting_approval'
  | 'in_flight'
  | 'approved'
  | 'rejected'
  | 'pending'
  | 'allowed'
  | 'denied'
  | 'paused'
  | 'resumed'
  | 'cancelled';

/**
 * Provenance pointers for tracing an Activity item back to its AUTHORITATIVE
 * source records. Existing IDs only — the projection never manufactures
 * identifiers. Workstream identity reuses the SAME deterministic derivation
 * as the canonical canvas read-model (deterministicIdHash in
 * src/lib/server/graph/read-model.ts), so Activity items trace to the exact
 * workstream objects the founder already sees on the canvas.
 */
export interface ActivityProvenance {
  /** Canvas workstream identity (deterministicIdHash, read-model scheme). */
  workstreamId?: string;
  /** Workstream directive/objective title (truncated by the projection). */
  workstreamTitle?: string;
  workflowInstanceId?: string;
  stepId?: string;
  agentRunId?: string;
  approvalId?: string;
  auditId?: string;
  scheduleId?: string;
  occurrenceId?: string;
  occurrenceNumber?: number;
}

/** One projected company event. `id` is a DETERMINISTIC projection identity
 *  (`category:sourceRecordId`) — stable across recomputations, which is what
 *  makes duplicate-source deduplication sound. */
export interface ActivityEventDTO {
  id: string;
  category: ActivityCategory;
  /** Concise, human-readable, NON-SENSITIVE summary. */
  summary: string;
  /** Authoritative event time (ISO 8601 UTC) from the source record. */
  at: string;
  /** Authoritative lifecycle status where the record carries one. */
  status?: ActivityEventStatus;
  /** Who performed the event (agent name / 'Founder' / 'system'). */
  actor?: string;
  provenance: ActivityProvenance;
}

/** Response contract for GET /api/activity. */
export interface ActivityResponseDTO {
  asOfTime: string;
  /** Total projected logical events (post-dedup) before the limit slice. */
  totalProjected: number;
  events: ActivityEventDTO[];
}
