# Kit/integration — documentation audit and preservation register

**Date:** 2026-10-23  
**Repository:** samjuniors/SamjuniorsOS only. Orbit plugin/Core and SofiaUI remain separate products.  
**Audited branch:** kit/integration  
**Pinned source commit:** d209f67b4414b4e211ef25291d5782c615ea7930  
**Audit branch:** docs/kit-integration-audit-reconcile-20261023 (created from that commit)  
**Method:** Remote GitHub recursive tree + selective branch-specific file reads. Local workspace, live app, CI, and exhaustive link validator NOT ACCESSED.

## Audit verdict

**Triage audit: COMPLETE. Physical relocation and deletion: HOLD.**

The selected branch contains 1,274 tree entries (tree not truncated), including **208 Markdown files** spanning active policy, dated research, decision records, product-kit execution data, operational history, benchmarks and archived receipts. A newer Vite/Express runtime is documented by the code, while active reader-facing setup guides still describe the earlier Next.js/two-port arrangement.

The audit does not claim that GitHub matches uncommitted local changes.

## Findings and preservation decisions

| ID | Severity | Source-backed finding | Disposition |
| --- | --- | --- | --- |
| A1 | HIGH | package.json runs dev/start via tsx server.ts and builds via vite build. server.ts creates Express and a WebSocket endpoint at /api/live-ws on the configured server port (default 3000). | Treat this as the current kit/integration code baseline. |
| A2 | HIGH | README.md and docs/SETUP.md instruct running Next.js and npm run dev:ws on port 3001. The selected branch package.json has no dev:ws script. | Publish branch-specific setup. Preserve older instructions as historical evidence, not current installation steps. |
| A3 | HIGH | docs/voice/SHARED-SOFIA-VOICE-PATCH.md references earlier Next.js and separate voice gateway patching. src/sofia/App.tsx renders src/components/SofiaVoiceCompanion.tsx, while src/os/App.tsx retains SharedSophiaVoicePresence on the OS tab. | Index the current voice source separately from historical patch instructions. Real audio behavior NOT TESTED. |
| A4 | HIGH | doc/ROADMAP.md explicitly says superseded by product-kit milestones, but .agent/product-kit/README.md says ROADMAP wins if documents disagree. | Document conflict; do not silently change accepted governance or treat a historical plan as the active milestone ledger. |
| A5 | MEDIUM | ARCHITECTURE.md and PRODUCT.md cite earlier reconciliation commit 1c86599; doc/PRODUCT_ARCHITECTURE.md cites much older commit 8524908. | Preserve durable principles; label implementation snapshots as dated, not current runtime proof. |
| A6 | MEDIUM | doc/AUDIT 00 through 11, doc/RESEARCH_REPORT.md and doc/SOPHIA_JARVIS_AUDIT.md contain dated evidence or older design assumptions. | Archive candidates, not deletable duplicates. Preserve decision provenance and author review status. |
| A7 | MEDIUM | Formal ADRs in doc/adr and later docs/architecture/ADR-001 overlap in domain but describe different decisions and dates. | Keep original IDs and paths until explicit decision-by-decision supersession mapping is reviewed. |
| A8 | LOW | Three memory benchmark runs (benchmark/memory-retrieval/results/run-a1.md, run-a2.md, run-a2b.md) have the same blob SHA c439e9680d8d9c2803f0890c23b62e07cbfe86 in the branch tree. | Byte-identical Git contents are indicated, but preserve distinct experiment filenames pending provenance review. |
| A9 | MEDIUM | .agent/product-kit/MILESTONES.md says it is generated from milestones.json; kit archive retains step evidence. | Never move or hand-edit generated milestone output and accepted receipts during generic docs cleanup. |
| A10 | MEDIUM | docs/README.md currently lacks a branch-specific runtime and archived/superseded classification. | Add navigation with pointers to branch-specific setup, voice guide and this audit. |

## Document system-of-record map

- **Active policy and product identity — KEEP:** AGENTS.md, PROJECT_RULES.md, PRODUCT.md, ARCHITECTURE.md, CLAUDE.md, DESIGN.md. Code in the audited branch governs observable implementation reality, and explicit founder decisions remain authoritative.
- **Operational ledger — KEEP:** PROGRESS.md, CONTINUE.md, WORKLOG.md; do not rewrite historical checkpoints or cherry-pick statuses without evidence.
- **Execution machinery — KEEP:** .agent/product-kit including machine-readable milestone data, generated files, verified receipts and archive. Resolve old roadmap precedence text separately; no automatic edits to kit generator output.
- **Ratified decisions — KEEP:** doc/adr and docs/architecture/ADR-001. Maintain original keys and source chronology.
- **Current branch setup — NEW:** docs/setup/KIT_INTEGRATION.md, pinned to current branch code.
- **Voice/architecture browsing — NEW INDEX:** docs/voice/README.md, differentiating current implementation from older migration instructions.
- **Historical research — ARCHIVE CANDIDATE ONLY:** doc/AUDIT 00–11, doc/RESEARCH_REPORT.md, doc/SOPHIA_JARVIS_AUDIT.md. Proposed later locations: archive/audits/2026-09-foundation/ and docs/research/history/ after reference review.
- **Historical roadmap — KEEP pointer:** doc/ROADMAP.md. Proposed optional later copy to archive/roadmaps/SAM-5.md once backlinks are reconciled.
- **Benchmark/evaluation reports — KEEP evidence paths:** benchmark/* and dated M5_ reports; inspect citations and experiment provenance before regrouping.
- **Legacy voice patch guide — KEEP historical:** docs/voice/SHARED-SOFIA-VOICE-PATCH.md.
- **Existing old/archive — KEEP:** old/ and archive/ already express historic classification.

## Stage gates (no silent destructive action)

**Gate A — Audit: PASS (triage only).** Inventory and primary documentation/source disagreements captured. Full automatic in-repo link scan, cross-language path references and local tree inspection were NOT RUN.

**Gate B — Non-destructive reconciliation: approved scope in this audit branch.** Create new setup, voice and preservation indexes and add links from docs/README.md. Existing files and paths remain intact. Read back all new files.

**Gate C — Actual moves: HOLD.** Before path removal: enumerate all incoming Markdown links and code references, obtain a source SHA / destination SHA mapping, preserve full content byte-for-byte, verify relative links and citations, and submit an explicit move manifest for review.

**Gate D — Permanent deletion: HOLD, explicit owner approval required.** No old file is deletable based only on date, subject duplication, size, or being superseded. Require a specific path list, backup, reference check, retention review and rollback plan.

## Risks and checks not run

No source code changed; no voice functionality asserted as passing. The branch includes large historical documents and README links whose full reference closure was not computed in this triage. No npm build, lint, typecheck, CI, physical file move, merge, force-push or delete was attempted. No cross-project Orbit memory is stored in SamjuniorsOS.

## Evidence pointers

Branch commit: https://github.com/samjuniors/SamjuniorsOS/tree/d209f67b4414b4e211ef25291d5782c615ea7930

Inspect: package.json, server.ts, src/App.tsx, src/os/App.tsx, src/sofia/App.tsx, src/components/SofiaVoiceCompanion.tsx, README.md, docs/SETUP.md, docs/voice/SHARED-SOFIA-VOICE-PATCH.md, doc/ROADMAP.md, .agent/product-kit/README.md and docs/README.md.
