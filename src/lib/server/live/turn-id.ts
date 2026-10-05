/**
 * Phase 4 (governance review) — server-side turnId validation for the live
 * voice protocol and the SOFIA ask ingress.
 *
 * Client-supplied turnIds are trust-boundary inputs that become durable
 * idempotency keys in the canonical conversation store (`${turnId}` founder
 * message, `${turnId}:assistant` assistant marker / cancelled marker) and
 * entries in the live server's processedTurnIds suppression map:
 *
 *   - Unbounded length would be unbounded durable keys + server memory
 *     (a multi-megabyte turnId was accepted and persisted pre-Phase-4).
 *   - The `:` character is RESERVED for the executor's key composition
 *     (`${turnId}:assistant`) — a turnId containing `:` could alias another
 *     turn's idempotency keys.
 *   - A small fixed charset keeps the keyspace auditable and prevents
 *     control-char / format-string surprises in stores and logs.
 *
 * Every turnId format minted in this repo fits this space:
 * `voice_turn_<ms>_<n>` (companion bridge), `turn_<ms>_<rand>` (legacy live
 * client), `sofia-ask-<uuid>` / `sofia-<uuid>` (SOFIA ask surface), and the
 * deterministic test fixtures (`p3_wire_turn_1`, `turn_stt_001`, …).
 */
export const MAX_TURN_ID_LENGTH = 128;

const TURN_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** True when the value is a string usable as a turnId at a trust boundary:
 * 1–128 characters of `[A-Za-z0-9_-]` (no `:`, no whitespace, no unicode). */
export function isValidTurnId(value: unknown): value is string {
  return typeof value === 'string' && TURN_ID_PATTERN.test(value);
}
