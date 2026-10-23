# Documentation preservation and archive staging

**Target:** kit/integration only (source commit d209f67, 2026-10-23).  
**Status:** Proposed classification — NOT a physical migration record.

Read [the audit and move gates](../audit/KIT_INTEGRATION_DOCUMENT_RECONCILIATION_2026-10-23.md) before archiving. Nothing in this folder grants approval to delete or relocate a document.

## Keep immutable or in its current governed location

- AGENTS.md, PRODUCT.md, ARCHITECTURE.md, CLAUDE.md, PROJECT_RULES.md: policy/product/architecture roots
- PROGRESS.md and WORKLOG.md: running history, never silently flattened
- .agent/product-kit/ source metadata, generated milestones and archived verification receipts
- doc/adr/ ratified decisions and docs/architecture/ADR-001-* pending conflict assessment
- benchmark/ results: distinct run paths preserve provenance even if blobs match

## Archive candidates — not moved

| Current source | Candidate category | Reason for HOLD |
| --- | --- | --- |
| doc/AUDIT 00 through 11 | archive/audits/2026-09-foundation | Ratified or cited cross-project research; link and decision provenance audit required |
| doc/ROADMAP.md | archive/roadmaps/SAM-5 | Historical/superseded roadmap, still referenced by live product-kit docs |
| doc/RESEARCH_REPORT.md and doc/SOPHIA_JARVIS_AUDIT.md | docs/research/history | Dated reports with potentially obsolete implementation statements |
| docs/voice/SHARED-SOFIA-VOICE-PATCH.md | archive/voice | Next.js-era migration procedure; active code uses Vite/Express |
| docs/architecture/M5_* evaluations | docs/research/memory or docs/audit/memory | Experiments and acceptance evidence deserve provenance, not blanket reclassification |

## Required move protocol

1. Enumerate every incoming repository link/reference to each proposed old path, including tooling and markdown.
2. Read and record exact source file blob SHA, verified destination path and category.
3. Make a copy with identical bytes, verify the destination SHA, and update incoming links and navigation.
4. Obtain review for removing the old path; Git moves require removal of the original file from the target tree.
5. Preserve Git history and add redirects or stable crosslinks where external paths were published.
6. Only after a separate explicit request may permanent removal even be considered.

**As of this index:** No old file has been moved or deleted. The above is a review queue, not a completed migration.
