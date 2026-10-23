# Documentation and repository audit — kit/integration (2026-10-23)

**Scope:** `samjuniors/SamjuniorsOS`, **non-default branch `kit/integration` at `d209f67b4414b4e211ef25291d5782c615ea7930`**.
**Audit method:** GitHub branch tree, selected live branch files, accepted ADRs, product-kit indexes and documentation; remote read-only inspection before changes. **The default branch was not the audit target or change base.** No local working-tree, runtime, CI, microphone, link-crawler or deployed-system verification is claimed.
**Decision:** RECONCILE IN AN ISOLATED BRANCH. Preserve historical content; do not delete original knowledge or rewrite accepted ADR decisions without a separate review. This file is an evidence ledger, not a release certificate.

## Inventory

- **1,274 tracked tree entries; 208 Markdown/text documents** in the inspected tree (including workflow and benchmark evidence).
- Documentation is spread across `docs/` (37), `doc/` (24), `.agent/` (106), `benchmark/` (17), `archive/` (2), root-level guides and other directories.
- The historical AUDIT 00–11 series lives in `doc/`, alongside a separate product architecture document, legacy roadmap and voice research. These are preserved as **historical evidence**, not fresh implementation verification.
- Three retrieval benchmark result files (`benchmark/memory-retrieval/results/run-a1.md`, `run-a2.md`, `run-a2b.md`) have **identical Git blob hashes** on this branch. Do not remove or consolidate without confirming run provenance.
- Existing `archive/worklogs/` files and `.agent/product-kit/archive/` are already archival evidence. Retain their history and existing paths.

## Evidence-backed findings

| Severity | Finding | Evidence | Treatment |
| --- | --- | --- | --- |
| HIGH | Onboarding is out of sync with this branch's runtime | `package.json`: `dev=tsx server.ts`, `build=vite build`, `start=tsx server.ts`; `server.ts` mounts Express, Vite and `/api/live-ws`. `README.md` still describes Next.js and a `dev:ws` command that is absent from this branch's scripts. | Rewrite active setup and scripts guidance. Archive the old setup verbatim. |
| HIGH | Voice patch application instructions refer to a different implementation baseline | `docs/voice/SHARED-SOFIA-VOICE-PATCH.md` says to apply a patch on another branch; `kit/integration` already has `src/os/components/voice/SharedSophiaVoicePresence` and a different server entry. | Mark the patch note HISTORICAL / DO NOT REAPPLY, retain its security caveats. |
| MEDIUM | Confusing documentation authority and historical snapshots | Root `ARCHITECTURE.md` and `PRODUCT.md` contain dated reconciliation claims; `doc/ROADMAP.md` already says superseded by `.agent/product-kit/MILESTONES.md`. September 2026 audits describe older systems. | Keep original decisions, label temporal status; distinguish active code, ADRs, milestones, audit snapshots. |
| MEDIUM | Two research roots increase discovery cost | `doc/research/phase4c_stt_benchmark_and_architecture.md` is a completed research report, while other research is indexed under `docs/research/`. ADR 0003 and 0004 reference its old path. | Relocate original text to `docs/research/`; leave a backward-compatible link at the old location. |
| MEDIUM | Documentation index understates archive status | `docs/README.md` calls historic AUDIT 00–11 October 2026 documents, while the inspected Audit 00 and Audit 11 metadata date them September 7, 2026. | Clarify catalog and avoid treating research findings as current code facts. |
| LOW | Large historical logs consume navigation space | `WORKLOG.md` and `archive/worklogs/` are large, intentional audit trails. | Leave untouched; link them from archive catalog. |
| INVESTIGATE | Dev runner still contains Next-specific paths despite Vite/Express package scripts | `scripts/dev.mjs` imports `@next/env` and Next binary, while `package.json` does not invoke this script for `dev`. | Flag as possible dead/legacy operational path; do not remove code during documentation cleanup. |

## Authority and preservation rules

1. **Live implementation:** inspected branch `package.json`, `server.ts`, `src/`, `tests/` override older descriptive claims about what currently runs.
2. **Engineering policy:** `AGENTS.md`; accepted ADRs remain decisions unless explicitly amended.
3. **Product intent:** `PRODUCT.md`; separate implemented, planned, and historical claims.
4. **Executable roadmap:** `.agent/product-kit/milestones.json` and the generated `.agent/product-kit/MILESTONES.md`; `doc/ROADMAP.md` is a preserved historic baseline.
5. **Research and evidence:** `docs/research/`, `docs/audit/`, historic `doc/AUDIT 00–11`; findings are dated and must be revalidated before use as code facts.
6. **Archive:** `docs/archive/`, `archive/worklogs/`, `.agent/product-kit/archive/`, and `old/`. Archiving means preservation and demotion, not deletion.

## Document dispositions

| Current document/group | Disposition | Reason |
| --- | --- | --- |
| `AGENTS.md`, `PRODUCT.md`, `ARCHITECTURE.md`, `doc/adr/` | KEEP IN PLACE; dated claims require later code reconciliation | Canonical contracts or accepted decisions with existing backlinks |
| `.agent/product-kit/` | KEEP IN PLACE | Operational milestone protocol and archived completion evidence; generated files should not be hand-edited |
| `docs/SETUP.md` | RECONCILE; archive exact previous version in `docs/archive/` | Active install instructions must match this branch's package scripts |
| `docs/voice/SHARED-SOFIA-VOICE-PATCH.md` | MARK HISTORICAL / SUPERSEDED FOR APPLY INSTRUCTIONS | Maintains useful test/security provenance but patch is not a repeatable branch-specific installer |
| `doc/ROADMAP.md` | ALREADY SUPERSEDED; KEEP LINKED | Existing document explicitly names its successor |
| `doc/AUDIT 00–11`, `doc/RESEARCH_REPORT.md`, `doc/PRODUCT_ARCHITECTURE.md`, `doc/SOPHIA_JARVIS_AUDIT.md` | HISTORICAL, RETAIN PATHS | Extensive quoted/backlinked snapshots; mass migration deferred until an all-reference audit |
| `doc/research/phase4c_stt_benchmark_and_architecture.md` | RELOCATE CONTENT TO `docs/research/`; LEAVE POINTER | Single controlled move with compatible path and zero source-text loss |
| `WORKLOG.md`, `archive/worklogs/`, `benchmark/` | KEEP ALL EVIDENCE | No provenance or retention approval for consolidation |
| Other documentation | RETAIN; classify through the index | Bulk edits are deferred until link and owner review |

## Safety, verification and next gate

- **No permanent document deletion, history rewrite, merge or deployment.**
- Replaced setup material is preserved under `docs/archive/`; relocated research retains an old-path pointer.
- Verify all rewritten relative links from the changed documents on this branch, `npm run typecheck`/`npm run lint` if local tooling is available, and check active setup on a fresh checkout.
- A full repository-wide internal/external link crawler, local diff against any unpushed user changes, and runtime install verification have **NOT RUN** in this connector-only audit.
- **Gate: HOLD before mass archiving, deleting source files, removing code, or changing ratified architecture.** Obtain actual reference scan and content owners' review, then propose a second reversible batch with a rollback list.
