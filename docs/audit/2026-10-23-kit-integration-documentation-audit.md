# Documentation audit — `kit/integration` (2026-10-23)

**Status:** AUDIT COMPLETED FOR RECONCILIATION PLANNING; runtime verification NOT RUN.
**Target and sole source branch:** `kit/integration` at `d209f67b4414b4e211ef25291d5782c615ea7930` (2026-10-23 11:30:39 UTC). This review did **not** use `main` as its working baseline.
**Change branch:** `docs/audit-reconcile-kit-integration-20261023`, created directly from the target commit.
**Safety rule:** No permanent deletion, no merging, no code deployment, no changes in SofiaUI or Orbit. Archives preserve original full text at its original Git blob SHA; legacy paths retain a pointer or a revised setup guide. Do not clean up source documents before this inventory and link review.

## Audited implementation facts (from `kit/integration` only)

- `package.json`: `dev` and `start` are `tsx server.ts`; `build` is `vite build`; `typecheck` is `tsc --noEmit`. No `dev:ws` or `scan:secrets` package script is declared in this branch.
- `server.ts`: Express HTTP listener binds `PORT` (default 3000); integrated WebSocket server listens on `/api/live-ws` using that same port; Vite middleware serves development assets and `dist/` is used for production static assets. `GET /api/status` and `POST /api/chat` are registered there; `src/server/api.ts` mounts the existing modular API adapters at `/api`.
- `vite.config.ts`, `src/App.tsx`, `src/os/App.tsx`: Vite entry routes to the OS shell with Sofia tab and OS desktop; the OS shell imports `SharedSophiaVoicePresence`. A newly added `src/components/SofiaVoiceCompanion.tsx` also exists, but the inspected `src/App.tsx` does not mount it directly; do not describe it as the definitive production surface without a component-reference audit.
- `scripts/dev.mjs` and `docs/SETUP.md` still describe the previous Next.js subprocess runner, although `package.json` no longer selects that script. `server.ts` imports a legacy LiveInteractionServer but the visible integrated socket uses `/api/live-ws`; verify the exact gateway pathway before promising voice parity.
- `AGENTS.md` remains the binding engineering policy. `.agent/product-kit/MILESTONES.md` is **generated** from `milestones.json`; do not hand-edit. `doc/ROADMAP.md` explicitly calls itself a historical superseded baseline.

## Findings and disposition

| ID | Severity | Path / topic | Evidence and risk | Decision |
|---|---|---|---|---|
| DOC-01 | HIGH | `README.md` | Instructs Next.js dev/build and separate `dev:ws` at port 3001; neither command matches the current branch package scripts. | RECONCILE current quickstart, scripts and port description. |
| DOC-02 | HIGH | `docs/SETUP.md` | Calls `scripts/dev.mjs` and `npm run dev:ws`; includes prior branch-specific verification claims and Next SWC guidance. | ARCHIVE exact prior setup; replace canonical guide with branch-scoped instructions and NOT VERIFIED QA status. |
| DOC-03 | HIGH | `ARCHITECTURE.md` | Claims authoritative current repository structure while describing Next.js App Router, standalone gateway and old page entry. | PRESERVE architecture principles; flag implementation-layout sections as un-reconciled to Vite/Express; defer careful full rewrite. |
| DOC-04 | MEDIUM | `PRODUCT.md`, `PROGRESS.md` | Current-repository-state snapshots and historical milestone receipts coexist. | PRESERVE locked product choices and ledger; mark old implementation snapshots as historical, without changing accepted decisions. |
| DOC-05 | MEDIUM | `doc/ROADMAP.md` and `.agent/product-kit/README.md` | Roadmap says it is superseded by milestone plan; kit README says old roadmap wins on conflict. | RETAIN roadmap for provenance; correct kit README precedence for execution order; generated milestones remain untouched. |
| DOC-06 | MEDIUM | `docs/voice/SHARED-SOFIA-VOICE-PATCH.md` | Has historical patch application instructions against a different branch/server stack. | ARCHIVE original; leave old-path pointer. |
| DOC-07 | MEDIUM | `doc/RESEARCH_REPORT.md`, `doc/SOPHIA_JARVIS_AUDIT.md` | September pre-implementation and \"no live voice\" statements are old evidence, not current implementation claims. | ARCHIVE original research/audit; preserve source references via old-path pointers. |
| DOC-08 | LOW | `docs/MERGE_PROMPT.md` | Reusable old fallback-merge prompt hardcodes Next.js file locations and retired routes. | ARCHIVE as historical reference prompt; old path points to retained file. |
| DOC-09 | MEDIUM | `docs/README.md`, `doc/`, `docs/`, root | Four navigation areas mix active setup, history, research, and generated work instructions. | CONSOLIDATE canonical navigation into `docs/README.md`; separate current, architecture/ADRs, audits, archived records, and agent-generated artifacts. |
| DOC-10 | MEDIUM | `doc/AUDIT 00`–`11`, `docs/architecture/` | Historical multi-repo evidence still informs decisions; embedded references and heading anchors may be cited externally. | RETAIN IN PLACE; classify as historical in index. No mass move without full reference/anchor audit. |
| DOC-11 | MEDIUM | `.env.example` | Comments refer to Next.js loading and legacy separate gateway/port, despite integrated Express server. | Flag comments for small correction; do not remove environment variables or change secret policy. |
| DOC-12 | MEDIUM | CI and runtime claims | GitHub file audit cannot prove local branch checkout state, installation, unit tests, deployment, real microphone or successful production build. | Gate stays **HOLD — NOT RUN** until a current branch worktree runs tests, lint, typecheck and application smoke. |

## Reconciliation hierarchy

1. **Actual code and tests in the specific target branch** govern implemented behavior; do not infer local uncommitted state from GitHub.
2. `AGENTS.md` and founder-locked `PRODUCT.md` retain policy/product authority; code discrepancies must be documented, not silently treated as permission to weaken rules.
3. `docs/current/STACK-AND-RUN.md` and revised `docs/SETUP.md` describe *this branch's* observed invocation and endpoints, not a production certification.
4. `.agent/product-kit/milestones.json` is the milestone source; `MILESTONES.md` is generated from it. `PROGRESS.md` is a historical running ledger, not proof by itself.
5. `doc/ROADMAP.md`, September audit series, retired implementation reports, and older patch instructions are **historical evidence**, not competing current stack instructions.

## Archive/move control

- Snapshot full content **byte-for-byte** by reusing Git blob SHA at new `docs/archive/` path. A blob copy is preferable to a copy/paste or summary.
- After copy, replace old **non-normative** locations with short Markdown pointers to the archive. This keeps path-level navigation. **Heading-deep-links to old locations may still need dedicated follow-up**, so do not apply this pattern to normative ADRs or the entire audit series.
- Preserve the old `docs/SETUP.md` as an archive and put the new setup at the same canonical path.
- Do not remove `doc/ROADMAP.md`, any root contract, any agent skill/workflow, or any generated milestone. For the 12 old `doc/AUDIT` reports, retain intact pending a comprehensive inbound-link/anchor review.
- No `git rm`, branch deletion, history rewriting, permanent deletion, repository migration, environment-key removal or deployment in this operation.

## Quality gate / follow-up

- **Audit evidence:** GitHub tree for the target commit; `package.json`, `server.ts`, `src/server/api.ts`, `src/App.tsx`, `src/os/App.tsx`, `vite.config.ts`, `README.md`, `docs/SETUP.md`, `docs/README.md`, `doc/ROADMAP.md`, `.agent/product-kit/README.md`, `docs/voice/SHARED-SOFIA-VOICE-PATCH.md`, named September reports.
- **Checks required after doc changes:** new branch tree/read-back; archive blob SHA equality; Markdown target paths exist; `git diff --check` in local checkout; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; local `GET /api/status` and real voice test. All are **NOT RUN** during remote documentation audit.
- **Release gate:** HOLD until review of audit and actual branch CI / local execution. No automatic merge.
