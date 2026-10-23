# SamJuniorsOS documentation map

**Documentation reconciliation: 2026-10-23 — based on the non-default `kit/integration` branch (`d209f67`).** This is a navigation map, not a claim that tests, deployment, voice or every historical architecture statement have been revalidated. See the [branch documentation audit](audit/2026-10-23-kit-integration-documentation-audit.md) for scope, evidence, dispositions and remaining gates.

## Start here — what is current?

| Need | Start with | Authority / caveat |
| --- | --- | --- |
| Install and run this branch | [Local setup](SETUP.md) | `package.json` runs `tsx server.ts` and `vite build`; the historical Next.js setup is archived |
| Product definition and founder boundaries | [PRODUCT.md](../PRODUCT.md) | Canonical product intent; dated implementation descriptions still require code check |
| Engineering guardrails | [AGENTS.md](../AGENTS.md) | Binding engineering and security requirements |
| Actual implementation | [Source tree](../src/), [server entry](../server.ts), [package scripts](../package.json) | Always verify the checked-out branch and local changes |
| System architecture | [ARCHITECTURE.md](../ARCHITECTURE.md) | Architecture intent and invariants; older status annotations are not live code evidence |
| Formal design decisions | [ADR index](../doc/adr/README.md) | Accepted decisions; no automatic supersession merely because implementation evolves |
| Executable milestone status | [Product-kit milestones](../.agent/product-kit/MILESTONES.md), [status ledger](../PROGRESS.md) | `MILESTONES.md` is generated from `milestones.json`; test milestones against code before trusting receipts |
| Historical milestones | [Old phase roadmap](../doc/ROADMAP.md) | **SUPERSEDED** by the product kit; preserved for provenance |
| Resume work | [CONTINUE.md](../CONTINUE.md), [product-kit entry](../.agent/product-kit/README.md) | Use project-specific instructions; keep old worklogs as evidence, not current status |

**Priority rule:** Confirm behavior from the working checkout and tests; use `AGENTS.md` and accepted ADRs for guardrails, `PRODUCT.md` for intent, product-kit data for planned steps, and research/audits for dated evidence. A superseded implementation snapshot does not automatically rescind an accepted design decision.

## Active documentation by domain

### Product, architecture and decisions
- [Canonical architecture](../ARCHITECTURE.md), [product](../PRODUCT.md), [design](../DESIGN.md), [capability registry](../CAPABILITY_REGISTRY.md).
- [ADR-0001 through ADR-0006](../doc/adr/README.md) — formal decision records.
- [Company brain authority audit](architecture/PHASE_2_3A_COMPANY_BRAIN_AUTHORITY_AUDIT.md) and [persistence architecture design](architecture/PHASE_2_3B_PERSISTENCE_AUTHORITY_AND_PRODUCTION_ARCHITECTURE.md) — bounded historic/approved reports; verify implementation claims against code.
- [Sophia memory architecture](architecture/SOPHIA_MEMORY_ARCHITECTURE.md) and [realtime interface target](architecture/ADR-001-realtime-sophia-interface.md).
- [Memory/decision capability contracts](architecture/agent-memory-decision-capability-contracts.md).

### Execution and milestone evidence
- [Product-kit README](../.agent/product-kit/README.md), [master prompt](../.agent/product-kit/MASTER_PROMPT.md), [protocol](../.agent/product-kit/PROTOCOL.md), [quality bar](../.agent/product-kit/QUALITY_BAR.md) and [gates](../.agent/product-kit/GATES.md).
- [Milestones](../.agent/product-kit/MILESTONES.md) and [completion evidence](../.agent/product-kit/archive/).
- [Running ledger](../PROGRESS.md), [engineering worklog](../WORKLOG.md). Preserve worklogs as historical sequences instead of promoting each entry to current truth.

### Voice, security and current verification
- [Shared Sofia voice migration note](voice/SHARED-SOFIA-VOICE-PATCH.md) — **historical patch procedure; do not reapply** to the `kit/integration` baseline.
- [Voice parity checklist](audit/PHASE5-PARITY-CHECKLIST.md) and [post-integration voice re-audit](audit/TASK6-REAUDIT-POST-VOICE-INTEGRATION.md) — dated evidence, not current microphone test results.
- [Threat model](security/OWASP_AGENTIC_AND_LLM_THREAT_MODEL.md), [secrets handling](security/PRODUCTION_SECRETS_HANDLING_AND_ROTATION.md).

### Research and reference
- [Research index](research/README.md) — provider choices, STT, company brain, memory, AI decision literature.
- [Phase 4C STT benchmark and architecture](research/phase4c_stt_benchmark_and_architecture.md) — moved here from `doc/research/`; the old path retains a pointer.
- [Memory evaluation](architecture/M5_MEMORY_AGENT_ARCHITECTURE_EVALUATION.md) and [retrieval experiment](architecture/M5_3_POSTGRES_RETRIEVAL_EXPERIMENT.md) — experiments, not blanket runtime claims.

## Historical and archived material

- [Archive index](archive/README.md) — previous setup snapshot, older system-wide audits, worklogs and prototype locations.
- [Legacy SAM-5 phase roadmap](../doc/ROADMAP.md): already superseded by the product-kit milestone order.
- [AUDIT 00–11 foundational series](../doc/): dated **September 2026** and kept at original paths to preserve links and decisions. Historic implementation descriptions must be reevaluated.
- [Earlier product architecture](../doc/PRODUCT_ARCHITECTURE.md), [Sophia live research](../doc/RESEARCH_REPORT.md), [Jarvis audit](../doc/SOPHIA_JARVIS_AUDIT.md): references, not current deployment attestations.
- [Previous setup guide](archive/legacy-setup-nextjs-2026-10-23.md): archived in full before correcting active instructions.
- [Archived worklogs](../archive/worklogs/), [old prototypes](../old/), [benchmark evidence](../benchmark/): retained with provenance.

## How to change these documents

Review the [audit ledger](audit/2026-10-23-kit-integration-documentation-audit.md) before marking something superseded, moving a cited file, or pruning a duplicate. Record origin/current location/status in the index, use compatibility pointers for moves, keep accepted design decisions separate from implementation snapshots, and never permanently delete evidence without a reviewed retention and link-impact decision.

**NOT VERIFIED:** full-tree link crawler, local unpushed changes, CI, lint, typecheck, deployment, and real microphone/speaker behavior. These require the actual checkout and test environment.
