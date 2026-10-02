# ADR 0005: TelemetryMetric Prisma Model Disposition

## Status
ACCEPTED — 2026-10-02 (R3 Honest-Metrics Closure; founder-approved scope: document the decision, do not delete the model, do not modify the schema)

## Context & Problem

The R3 pre-flight audit (see `worklog.md`, Task ID `r3-preflight-audit`) and the
M5 memory-agent architecture evaluation (`docs/architecture/M5_MEMORY_AGENT_ARCHITECTURE_EVALUATION.md`,
gap G9) independently identified the `TelemetryMetric` Prisma model as dead
schema weight:

1. **Zero code usage.** No module in `src/` imports, instantiates, or queries
   `TelemetryMetric` (verified by repository-wide search). There is no write
   path, no read path, and no API surface that touches it.
2. **Zero rows.** The `telemetry_metrics` table was queried directly
   (2026-10-02): `0` rows. Because no write path exists in the current code,
   no rows can accumulate.
3. **Different design intent than agent metrics.** The model was designed as a
   landing table for *external reality-grounding business feeds*
   (`source` values like `"LUMORAGLM_PROD"`, `"STRIPE_PROD"`; metric keys like
   `monthly_revenue`), per `docs/architecture/MEMORY_RECONCILIATION_REPORT.md`
   (item 21: "DEAD — zero usages ... EXTEND later or DEPRECATE"). It is NOT the
   per-turn agent performance abstraction — that role belongs to the in-code
   `TurnMetrics` type / `TurnStopwatch` (`src/lib/server/sophia/metrics.ts`),
   which the R3 closure wires on the canonical agent-chat path.

The M5.5 roadmap row asked for a "retrieve-or-remove TelemetryMetric schema
decision", explicitly noting that any schema change is a separate approval.

## Architectural Decision

**Retain the `TelemetryMetric` Prisma model as-is: do not wire it, do not
delete it, and do not introduce a runtime telemetry subsystem.**

Rationale:

- **Deletion is deferred, not declined.** Removing the model is a schema
  change (a migration on a table that exists in deployed databases) and per
  the approved R3 scope and the M5.5 row, schema changes require a separate
  founder approval. The model is inert: no code path can write to it, so it
  imposes no runtime cost, no privacy exposure, and no retention obligation
  while dormant.
- **Its intended role remains plausible but unproven.** A future
  reality-grounding feed (Stripe revenue, product usage) would be a
  materially different ingestion problem from agent-turn metrics, with its
  own privacy/retention review. If that milestone lands and still has no use
  for this shape, deletion should be revisited as part of that work.
- **Agent-turn metrics stay in the typed in-code abstraction.** The R3
  Honest-Metrics Closure wires `TurnStopwatch`/`TurnMetrics` on the
  agent-chat canonical path with measured-or-absent semantics (no persistent
  per-turn telemetry store). Nothing about this ADR routes agent metrics into
  `TelemetryMetric`.

## Consequences

- The Prisma schema keeps one dead model (documented here); `prisma/schema.prisma`
  is unchanged by the R3 closure.
- Any future PR that wires or deletes `TelemetryMetric` must supersede this ADR
  and carry explicit founder approval for the schema/behavior change.
- The absence of a runtime telemetry subsystem is deliberate: no consumer
  exists for per-turn telemetry (verified by the R3 pre-flight audit), and the
  offline benchmarks (`benchmark/memory-retrieval`, `benchmark/generation-faithfulness`)
  already measure retrieval and generation quality against frozen fixtures.

## Evidence Index

- `prisma/schema.prisma` — `model TelemetryMetric` (lines 246–256 at the time
  of writing), `source` comment values `"LUMORAGLM_PROD"` / `"STRIPE_PROD"`.
- `docs/architecture/M5_MEMORY_AGENT_ARCHITECTURE_EVALUATION.md` — §14 R5,
  §15 M5.5, gap G9 ("`TelemetryMetric` — zero code usage").
- `docs/architecture/MEMORY_RECONCILIATION_REPORT.md` — item 21 and finding 8.
- Zero-rows verification: Prisma count query against the sandbox database,
  recorded in `worklog.md` under Task ID `r3-honest-metrics`.
