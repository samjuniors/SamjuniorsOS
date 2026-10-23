# MX.1 Documentation Reconciliation: Preservation Audit

**Audit:** 2026-10-23 · **Repository:** `samjuniors/SamjuniorsOS` · **Read-only source baseline:** `step/MX.1` at `46fc97409d30d5b89a31beeb624bb78126259024` · **Working branch:** `docs/mx1-audit-reconciliation-20261023`.

## Authority and safety gate

- This is a **non-main documentation-only** intervention. No merge, runtime changes, generated milestone edits, deployment or permanent deletion is authorized by this audit.
- `AGENTS.md`, `PRODUCT.md`, `ARCHITECTURE.md`, `PROGRESS.md` and the accepted `doc/adr/` decisions remain in established locations. [ADR 0007](../../doc/adr/0007-stack-migration-vite-react-express.md) accepts the stack-migration **plan**, not a claim that MX.2–MX.7 verification is finished.
- `.agent/product-kit/MILESTONES.md` is generated; source workflow/receipts are left unchanged. `doc/ROADMAP.md` already labels itself a historical SAM-5 roadmap, superseded by the [product kit](../../.agent/product-kit/MILESTONES.md). It stays put to preserve linked references.
- The historical report relocation reuses the original Git blob SHA for each destination, with an original-path redirect instead of removal. No historical report content is deleted.

## Evidence inspected

A complete, non-truncated Git tree for `step/MX.1` contained **1,278 entries** and **211 Markdown/related text documentation files**. Inspected headers and content from the 12 September 7 audits, the September 15 live-voice research report and September 16 Sophia/Jarvis audit. All 14 complete sources have **zero relative Markdown links** of the form `[label](relative-file)`. Inspected key canonical index, setup, product, architecture, roadmap, ADR 0007 and product-kit master-prompt files.

This is **not** a full semantic review of all 211 documents, a local-worktree audit, or a complete backlink search across all code. Those checks remain pending.

## Classification and reconciliation findings

| Category | Evidence | Decision |
| --- | --- | --- |
| **Canonical founder/engineering policy** | Root `AGENTS.md`, `PRODUCT.md`, `ARCHITECTURE.md`, accepted ADRs | **Retain** paths and substantive decisions. Add migration-transition notice only to root Product/Architecture. |
| **Current milestone state** | `.agent/product-kit/`, `PROGRESS.md` | **Retain** without rewriting source receipts or generator outputs; verify MX gates using current code. |
| **Outdated instructions** | `README.md` and `docs/SETUP.md` describe the Next.js baseline, while ADR 0007 accepts Vite/Express | **Annotate**, not blindly rewrite commands. New tested clean-clone instructions are gated on MX acceptance. |
| **Historical phase plan** | `doc/ROADMAP.md` expressly superseded by product-kit milestones | **Mark as historical by existing banner; retain path** due cross references. |
| **Historical strategic/technical audits** | `doc/AUDIT 00–11` dated 2026-09-07 | **Relocate originals byte-for-byte** to `archive/audits/2026-09/`; leave redirects. |
| **Historical voice audit** | `doc/SOPHIA_JARVIS_AUDIT.md` dated 2026-09-16, early implementation assumptions | **Archive unchanged** with redirect. |
| **Historical voice research** | `doc/RESEARCH_REPORT.md` dated 2026-09-15 and marked research/pre-implementation | **Archive unchanged** to `archive/research/2026-09/` with redirect. |
| **Potential duplicate authority** | `GSD-STYLE.md`, `PROJECT_RULES.md`, `.agent/workflows/` alongside binding `AGENTS.md` and product-kit protocol | **HOLD** any move/deletion until adapter and workflow references are audited. |
| **Mixed time horizons** | `docs/architecture/`, `docs/research/`, `docs/audit/`, `benchmark/`, voice port notes | **HOLD** bulk relocation until per-file incoming links and current relevance are verified. |
| **Legacy voice patch notes** | `docs/voice/SHARED-SOFIA-VOICE-PATCH.md` applies to the older Next.js voice-unification work | **Retain as implementation history**, not proof of modern browser QA. |

## Exact relocation manifest

Original full-text files are **preserved in Git as their original blobs**. All former paths now contain redirects.

| Source (compatibility redirect) | Archived original | Verified original blob SHA |
| --- | --- | --- |
| `doc/AUDIT 00 — Master Controller.md` | `archive/audits/2026-09/AUDIT 00 — Master Controller.md` | `bb8278a49c0c594847195d17ec67fb53fb7a9199` |
| `doc/AUDIT 01 — Current GitHub Codebase.md` | `archive/audits/2026-09/AUDIT 01 — Current GitHub Codebase.md` | `504d8dcbc07c2502742f2d1f1a68c590204d8883` |
| `doc/AUDIT 02 — Swarm and Multi-Agent Research.md` | `archive/audits/2026-09/AUDIT 02 — Swarm and Multi-Agent Research.md` | `47020342d89b1c0ee10ee7daba4534048ef4c6b2` |
| `doc/AUDIT 03 — Open-Source Reference Lab.md` | `archive/audits/2026-09/AUDIT 03 — Open-Source Reference Lab.md` | `0498c73396631f7d8b91c6bdbfa581a1b3b26164` |
| `doc/AUDIT 04 — Current AI Frontier Research.md` | `archive/audits/2026-09/AUDIT 04 — Current AI Frontier Research.md` | `40dc7153ad07c29d3975f008ac5a1b12799ea8a5` |
| `doc/AUDIT 05 — AI Skills, Context, and Memory.md` | `archive/audits/2026-09/AUDIT 05 — AI Skills, Context, and Memory.md` | `e55a3d0b5754a91afe28c97108cea75c369a8d9c` |
| `doc/AUDIT 06 — Workflow and Multi-Agent Runtime.md` | `archive/audits/2026-09/AUDIT 06 — Workflow and Multi-Agent Runtime.md` | `f163e19197832ac415d841b8b09288cc88012216` |
| `doc/AUDIT 07 — Security, Governance, and Failure Analysis.md` | `archive/audits/2026-09/AUDIT 07 — Security, Governance, and Failure Analysis.md` | `95507c6889ff2fadc949afbc9975ac7e6e77fbe8` |
| `doc/AUDIT 08 — Build vs Buy and Integration Strategy.md` | `archive/audits/2026-09/AUDIT 08 — Build vs Buy and Integration Strategy.md` | `e8093fef171a648ceaae0ddfe6c5a3ffeadb2f80` |
| `doc/AUDIT 09 — Product, Market, and Real-World Validation.md` | `archive/audits/2026-09/AUDIT 09 — Product, Market, and Real-World Validation.md` | `3a93efaac30b4b20713e7ef4a0f3792f3c302927` |
| `doc/AUDIT 10 — Evaluation and Continuous Learning.md` | `archive/audits/2026-09/AUDIT 10 — Evaluation and Continuous Learning.md` | `ce4baa5648e2cf850de24fd42dbcc1e1c272305d` |
| `doc/AUDIT 11 — Final Decision Gate.md` | `archive/audits/2026-09/AUDIT 11 — Final Decision Gate.md` | `bf9385a47474f02148975bdc4522bdb4ed782048` |
| `doc/SOPHIA_JARVIS_AUDIT.md` | `archive/audits/2026-09/SOPHIA_JARVIS_AUDIT.md` | `a939be50c517c0fa452207616f8b9ad7083c4477` |
| `doc/RESEARCH_REPORT.md` | `archive/research/2026-09/RESEARCH_REPORT.md` | `35c43190b8f61e9b2a3e0924057c9939db9e2398` |

## Verification and next gate

**Read audit:** PASS (verified non-main source paths/hashes and historical classification).  
**Archive identity / zero removed paths:** PASS — read-back confirmed all 14 archive destinations have precisely the original Git blob SHA; all 14 old paths remain present as redirects; initial branch comparison reported 0 removed files and only Markdown changes.  
**Local typecheck, lint, tests, browser microphone QA, full reference scan:** NOT RUN (local checkout unavailable).  
**Deletion / merge / production migration:** HOLD pending explicit path-scoped consent and acceptance evidence.

**Next:** confirm exact archived SHA identities and redirect targets on the new branch, validate diff contains no removed paths, run a full non-Markdown/code-link audit from a local clone, and revise setup commands only after MX migration tests pass.
