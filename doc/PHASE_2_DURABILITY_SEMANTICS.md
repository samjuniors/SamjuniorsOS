# PHASE 2.6.1 — Long-Running Step Execution & Lease Semantics

Authoritative definition of what happens when a scheduled workflow step executes
for longer than the `sched-item` lease TTL, and how the system behaves in every
degraded condition. This document is normative: the implementation in
`lib/server/workflow/scheduler.ts` (`startLeaseRenewal` guard) and
`lib/server/coordination/lease-manager.ts` must match it.

## The layered safety model

```
coordination        (DistributedLease / sched-item lease — WHO works on it)
    ↓
authorization       (SideEffectAuthorizationGate — MAY it happen at all)
    ↓
idempotency         (IdempotencyRecord — has it already happened / is it ambiguous)
    ↓
external side effect (provider call: Resend email, Stripe transfer, ...)
    ↓
durable result      (stateVersion-guarded CAS transitions + audit trail)
    or UNKNOWN_EXTERNAL_RESULT
```

**Lease renewal is coordination only.** It never grants business authorization
(the gate is authoritative), never provides exactly-once execution (idempotency
is authoritative for external side effects), and never erases the fundamental
ambiguity of an external side effect whose result was never observed.

## Execution timeline

```
evaluateDueWork(item):
  acquire lease "sched-item:{id}"        (TTL = leaseTtlMs, default 30s)
  fresh re-read of item                  (Phase 2.6 anti-clobber)
  push occurrence record {status:'triggered'} + persist   ← occurrence-level idempotency marker
  startLeaseRenewal(leaseKey)            (renew at ~TTL/3; hard cap 15 min)
  await runtime.executeReadyStep(...)    (gate → idempotency claim → claimStepAtomic →
                                           LLM/tool/provider execution → CAS transitions)
  stop renewal
  finalize occurrence + item             (completed / failed / retry-with-backoff)
  release lease                          (holder-guarded delete)
```

## Scenario semantics

### 1. Lease expires during execution (renewal guard NOT active, e.g. pre-2.6.1 or cap reached)
The row's `expiresAt` passes. The worker does not crash and keeps executing.
Any other scheduler's `evaluateDueWork` may now acquire the lease; on its fresh
re-read it sees this occurrence already recorded as `'triggered'` in
`executionHistory` and **skips re-execution** (occurrence-level idempotency).
Stale workflow-step writes by the original worker are rejected by the
`stateVersion`-guarded `transitionStepAtomic` CAS (fail-closed
`ConcurrencyConflictError`). The original worker's `release()` fails harmlessly
(holder-guarded). The occurrence is durably marked `coordinationLost: true`.

### 2. Renewal succeeds
The lease TTL is extended atomically (holder + unexpired guards in the
conditional UPDATE). Coordination remains unambiguous for the whole execution.
No authorization, idempotency, or audit semantics change.

### 3. Renewal fails (returns false or throws)
`renew` returns false when the lease is expired, released, or held by another
worker; it throws when the database is unreachable (fail-closed
`DatabaseAuthorityError` in authoritative mode). In both cases the guard marks
`coordinationLost` but **does not abort in-flight work** — aborting a possibly
in-flight external side effect is unsafe (the provider may have already acted).
The execution finishes; its observed outcome is recorded with the durable
`coordinationLost` marker and a reason string. This is the honest model:
coordination was uncertain, not fabricated.

### 4. Worker loses DB connectivity mid-execution
All authoritative reads/writes fail closed (`DatabaseAuthorityError`), including
renewal (marked lost). No in-memory or file fallback exists on the authoritative
path. Finalization writes fail; the occurrence remains durably `'triggered'`
(the pre-execution marker), which blocks duplicate execution by any other worker
until recovery. After connectivity returns, the workflow-step claim can be
recovered via the Phase 2.6 crash-recovery path (transition to `'ready'` clears
stale `claimedBy`).

### 5. Worker crashes (process death) mid-execution
The lease expires after TTL with no renewal. The occurrence stays `'triggered'`
in durable `executionHistory`; competing workers skip re-execution of that
occurrence. The workflow step remains claimed by the dead worker
(`claimedBy`/`claimedAt`); recovery is the documented Phase 2.6 mechanism: a
transition of the step to `'ready'` clears the stale claim identity, allowing
re-claim. External side effects already dispatched before the crash may have
occurred — their state is governed by the idempotency record (`in_progress` →
`unknown` on unresolved termination), never blindly retried.

### 6. Provider times out
The step execution surfaces a failure (exception or error result). The runtime
transitions the step to `'failed'` via CAS and the scheduler applies the step's
`retryPolicy` (`maxRetries`, canonical `backoffMs`). If the provider may have
executed the action before the timeout, the idempotency record's state governs
retry safety (see §8).

### 7. Provider returns AFTER lease loss
The late response cannot resuscitate coordination: the step's durable state was
either finalized by the CAS of another worker (our stale transition fails with
`ConcurrencyConflictError`) or still awaits recovery. The occurrence record
carries `coordinationLost: true` with the observed outcome for audit. The
external side effect itself is governed by idempotency: a replay attempt by a
new worker hits the idempotency record and is blocked or classified, never
silently duplicated.

### 8. Idempotency state is unknown
When an operation terminated without observing its external outcome, the
idempotency state machine records status `'unknown'` and throws on replay with
"blind retry is prohibited without provider reconciliation." The gate surfaces
`UNKNOWN_EXTERNAL_RESULT`. Re-execution requires provider-side reconciliation
(e.g. Resend's idempotency key). The system never fabricates success.

### 9. Another worker acquires the expired lease
The new holder performs the fresh re-read inside its critical section. Because
the occurrence was durably marked `'triggered'` before the original execution
began, the new holder's occurrence-idempotency check skips re-execution and it
releases the lease. The original worker's finalization is therefore the only
write for this occurrence (safe); its stale step-level writes still go through
the CAS guard. Result: exactly one execution attempt per occurrence, with the
ambiguity honestly recorded.

## Boundaries

- Renewal cadence: `max(1000, leaseTtlMs / 3)` — one slow renewal cannot expire the lease.
- Hard cap: `maxRenewalDurationMs` (default 15 min) — a hung execution loses
  coordination deterministically; the system self-heals via lease expiry. This
  is the "bounded" guarantee: no execution can hold renewed coordination forever.
- The renewal timer is `unref`'d: it never keeps the Node event loop alive.
- Renewal never extends another worker's lease (holder-guarded atomic UPDATE).
- Stale/expired holders can never renew (the same guard rejects them).
