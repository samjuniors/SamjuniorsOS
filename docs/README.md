# SamJuniorsOS Documentation Index & Map

> [!IMPORTANT]
> **Non-main MX.1 documentation reconciliation (2026-10-23):** See the [audit and full disposition ledger](audit/2026-10-23-mx1-documentation-reconciliation.md), [September technical audit archive](../archive/audits/2026-09/README.md) and [historical voice research archive](../archive/research/2026-09/README.md). [ADR 0007](../doc/adr/0007-stack-migration-vite-react-express.md) is an accepted migration decision, **not** proof that every implementation step has passed. Older Next.js topologies must be read as snapshots.


This document serves as the master navigation guide across all specifications, architectural decision records, domain manuals, and historical records for SamJuniorsOS.

---

## 1. Hierarchy of Authority (Source of Truth)

Per [`AGENTS.md`](../AGENTS.md) §1, all contributors and AI agents must follow this strict hierarchy:

1. **Active Working Code:** Active code in `src/`, `prisma/`, `scripts/`, `tests/`
2. **Current Architecture Documentation:** [`AGENTS.md`](../AGENTS.md), [`ARCHITECTURE.md`](../ARCHITECTURE.md), [`doc/adr/`](../doc/adr/), [`docs/architecture/`](architecture/)
3. **Product Kit Roadmap & Protocol:** [`.agent/product-kit/`](../.agent/product-kit/)
4. **Primary External Documentation:** Official SDK, Next.js, Prisma specs
5. **Runtime Evidence & Automated Tests:** `tests/` verifiable execution

---

## 2. Document Map

### A. Root Canonical Specs & Invariants
- [`AGENTS.md`](../AGENTS.md) — Canonical engineering guardrails, governance invariants, and non-negotiable rules.
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — System architecture, 8 layers, 11 invariants, and realtime target architecture.
- [`PRODUCT.md`](../PRODUCT.md) — Explicit entity boundaries (SamJuniors vs Lumora vs SamJuniorsOS), single-founder focus.
- [`PROGRESS.md`](../PROGRESS.md) — Append-only chronological ledger of completed and verified steps.
- [`CONTINUE.md`](../CONTINUE.md) — Standard resume protocol for agent sessions.
- [`WORKLOG.md`](../WORKLOG.md) — Active operational engineering log.

### B. Execution Engine & Roadmap (`.agent/product-kit/`)
- [`.agent/product-kit/MASTER_PROMPT.md`](../.agent/product-kit/MASTER_PROMPT.md) — Authoritative session prompt (milestones decide work; gates are bookkeeping).
- [`.agent/product-kit/MILESTONES.md`](../.agent/product-kit/MILESTONES.md) — The 12 product milestones (M0 through M11).
- [`.agent/product-kit/GATES.md`](../.agent/product-kit/GATES.md) — Bookkeeping gates and step dependencies.
- [`.agent/product-kit/PROTOCOL.md`](../.agent/product-kit/PROTOCOL.md) — Multi-agent workflow, claims, worktree isolation, checkpointing, and landing protocol.
- [`.agent/product-kit/QUALITY_BAR.md`](../.agent/product-kit/QUALITY_BAR.md) — Non-negotiable quality checks (TypeScript, UX, a11y, telemetry, security).

### C. Architecture Decision Records (`doc/adr/`)
- [`doc/adr/README.md`](../doc/adr/README.md) — Master index of all formal ADRs:
  - `ADR-0001`: Replace Legacy Design System with Canonical Visual Language
  - `ADR-0002`: Sophia Durable Conversation Persistence
  - `ADR-0003`: Sophia Live Interaction Architecture
  - `ADR-0004`: Provider-Agnostic Streaming STT Architecture
  - `ADR-0005`: TelemetryMetric Model Disposition
  - `ADR-0006`: Scale-Later Seams

### D. Subsystem & Domain Specifications (`docs/`)
- **Architecture & Authority (`docs/architecture/`):**
  - [`PHASE_2_3A_COMPANY_BRAIN_AUTHORITY_AUDIT.md`](architecture/PHASE_2_3A_COMPANY_BRAIN_AUTHORITY_AUDIT.md) — Company brain authority baseline.
  - [`PHASE_2_3B_PERSISTENCE_AUTHORITY_AND_PRODUCTION_ARCHITECTURE.md`](architecture/PHASE_2_3B_PERSISTENCE_AUTHORITY_AND_PRODUCTION_ARCHITECTURE.md) — Persistence authority specification.
  - [`SOPHIA_MEMORY_ARCHITECTURE.md`](architecture/SOPHIA_MEMORY_ARCHITECTURE.md) — Institutional memory and epistemic schemas.
  - [`ADR-001-realtime-sophia-interface.md`](architecture/ADR-001-realtime-sophia-interface.md) — Target design for WebRTC, multimodal vision, and sensory boundaries.
- **Voice & Realtime Gateway (`docs/voice/`):**
  - [`SHARED-SOFIA-VOICE-PATCH.md`](voice/SHARED-SOFIA-VOICE-PATCH.md) — Unified floating voice presence, companion server, and WebSocket ticket store contracts.
- **Security & Hygiene (`docs/security/`):**
  - [`OWASP_AGENTIC_AND_LLM_THREAT_MODEL.md`](security/OWASP_AGENTIC_AND_LLM_THREAT_MODEL.md) — Threat model and fail-closed security gates.
  - [`PRODUCTION_SECRETS_HANDLING_AND_ROTATION.md`](security/PRODUCTION_SECRETS_HANDLING_AND_ROTATION.md) — Production credentials management.
- **Research & Reference Studies (`docs/research/`):**
  - [`COMPANY_BRAIN_JEV_REFERENCE_STUDY.md`](research/COMPANY_BRAIN_JEV_REFERENCE_STUDY.md) — JEV architecture comparison.
  - [`memory-and-honcho-assessment.md`](research/memory-and-honcho-assessment.md) — State-of-the-art memory assessments.
- **Audit & Verification (`docs/audit/`):**
  - [`TASK-6-SOFIA-VOICE-DESKTOP-CAPABILITY-VALIDATION.md`](audit/TASK-6-SOFIA-VOICE-DESKTOP-CAPABILITY-VALIDATION.md) — Voice desktop validation.
  - [`TASK6-REAUDIT-POST-VOICE-INTEGRATION.md`](audit/TASK6-REAUDIT-POST-VOICE-INTEGRATION.md) — Post-voice integration audit.

### E. Archive & Historical Context (`archive/`, `doc/`, `old/`)
- [`archive/worklogs/`](../archive/worklogs/) — Historical pre-reconciliation and sandbox session worklogs:
  - `worklog-migration.md`
  - `worklog-sandbox-r0-r3.md`
- [`doc/ROADMAP.md`](../doc/ROADMAP.md) — Historical SAM-5 phase roadmap (superseded by product kit milestones).
- [`doc/AUDIT 00` through `11`](../doc/) — Foundational October 2026 audits inspecting codebase reality, frontier research, and governance.
- [`old/`](../old/) — Legacy UI, early prototypes, and initial wireframes.
