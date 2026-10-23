# Documentation map — SamJuniorsOS (`kit/integration`)

**Entry point for documentation.** Checked against the `kit/integration` source tree on 2026-10-23; **not a CI/runtime certification**. Use the [source-backed audit](audit/2026-10-23-kit-integration-documentation-audit.md) before promoting older reports to current truth.

## Binding scope and current developer guide

| Document | Authority / use |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Binding engineering, security and provenance policy. |
| [`PRODUCT.md`](../PRODUCT.md) | Founder-locked product boundary and requirements; dated implementation snapshots need fresh checks. |
| [Current stack map](current/STACK-AND-RUN.md) | **Branch-specific implemented entry points** (Vite / Express / port 3000), not a production QA result. |
| [Local setup](SETUP.md) | **Current** install/run/verification instructions for `kit/integration`. |
| [`README.md`](../README.md) | Public-facing overview and quickstart. |
| [`ARCHITECTURE.md`](../ARCHITECTURE.md) | Canonical architectural principles; **historical Next.js repository diagrams require reconciliation**. |
| [`CONTINUE.md`](../CONTINUE.md), [`PROGRESS.md`](../PROGRESS.md) | Resume protocol and append-only milestone history. |

## Active work and generated project-kit assets

- [Product kit overview](../.agent/product-kit/README.md), [execution prompt](../.agent/product-kit/MASTER_PROMPT.md) and [multi-agent protocol](../.agent/product-kit/PROTOCOL.md).
- [`milestones.json`](../.agent/product-kit/milestones.json) governs milestone data; [`MILESTONES.md`](../.agent/product-kit/MILESTONES.md) is **generated** — do not hand-edit.
- [`GATES.md`](../.agent/product-kit/GATES.md) and [`QUALITY_BAR.md`](../.agent/product-kit/QUALITY_BAR.md) record acceptance and verification conventions.
- [`VISION.md`](../.agent/product-kit/VISION.md) documents target vision, not by itself proof of delivered features.

## Architectural decisions and domain records

- [Formal ADR index](../doc/adr/README.md) and [ADR-0001 through ADR-0006](../doc/adr/) — historic decisions and decision rationale; verify implementation before treating a target as delivered.
- [Architecture and memory reports](architecture/) — design specifications, experiments and historical acceptance evidence.
- [Security and threat models](security/) — security-policy references and verification reports.
- [Audits and QA](audit/) — including [the current branch documentation audit](audit/2026-10-23-kit-integration-documentation-audit.md).
- [Research and provider evaluations](research/) — **reference material**, not installation instructions.
- [Benchmarks](../benchmark/) — experimental result records.

## Historical, superseded and archived records

- [Archive index](archive/README.md) — retained full text of prior setup, voice patch migration, September voice research and legacy reference prompt.
- [Historical SAM-5 roadmap](../doc/ROADMAP.md) — already marked superseded by the product-kit milestones; preserved due governance links.
- [Original AUDIT 00–11 series](../doc/) — September 2026 investigation/decision records; **kept in place** pending an inbound-link and heading-anchor audit. Old verdicts do not replace current code inspection.
- [Historical worklogs](../archive/worklogs/) and [legacy prototypes](../old/) — preserved as history; not active runtime entry points.
- [Prior voice patch location](voice/SHARED-SOFIA-VOICE-PATCH.md) — redirect to historical patch notes; **do not apply old patch commands** on `kit/integration`.

## Safe-document maintenance rule

Before changing or moving any document: identify its authority, inspect inbound references, preserve the original in git history or an archival blob copy, provide stable path-level pointers, and verify the new target. Never delete substantive content from a documentation cleanup without specific evidence and review.
