# Repository hygiene and quality follow-up — kit/integration (2026-10-23)

**Project:** SamjuniorsOS only. **Source lineage:** `kit/integration` → `docs/kit-integration-reconciliation-2026-10-23` → `chore/kit-integration-repo-hygiene-2026-10-23`. This work did **not** use the default branch as its audit or modification base; the standalone Orbit plugin is entirely separate.

**Status:** PARTIALLY IMPLEMENTED / RELEASE GATE HOLD. All changes are on an isolated Git branch. Nothing has been merged, deployed, or permanently deleted. A remote CI runner is evidence for its exact commit only, not for unpushed user changes.

## Completed hygiene changes

1. Added a read-only Markdown link validator (`scripts/check-doc-links.mjs`), corresponding Node regression tests (`tests/docs/check-doc-links.test.mjs`) and reproducible npm commands: `docs:links`, `docs:links:all`, `test:docs`.
2. Added branch-scoped `.github/workflows/ci-kit-integration.yml` using the actual Express/Vite build script. The older default-branch CI and staging deployment workflows were not changed. Branch CI uses a **frozen Bun lockfile**, tests, documentation link checks, Gitleaks scanning, TypeScript lint/typecheck, Vite build, and dependency security audit.
3. Reconciled `bun.lock` to the current Express/Vite dependencies **using a CI Bun 1.3.14 package resolution** rather than manually editing transitive dependency records. Its contents have a reviewed Git commit. Regeneration was repeated for the added ESLint parser dependency.
4. Updated `dompurify` minimum compatible version to `3.4.17` in `package.json`. This responds to GitHub advisory `GHSA-cg2g-xh64-v4q7` (patched from 3.4.17). The dependency audit remains a mandatory gate and has not been waived.
5. Corrected the ESLint flat configuration to parse TypeScript and TSX with `@typescript-eslint/parser`. This fixes the initial 66 parser errors caused by treating TypeScript as plain JavaScript. Preexisting lint rule choices were not relaxed to hide failures.
6. Repaired **55 wrong relative hyperlinks** in `docs/architecture/PHASE_2_3B_PERSISTENCE_AUTHORITY_AND_PRODUCTION_ARCHITECTURE.md` after confirming every intended source path exists. No accepted architectural conclusion was edited. Replaced one stale `GSD-STYLE.md` link to an uncommitted document with an explicit statement about existing guidance.
7. Retained all original architecture, product, research and completed milestone evidence. Previous documentation reconciliation, relocation and archival pointers remain intact.

## Verified observations from CI

| Check | Observation and provenance | Status |
| --- | --- | --- |
| Frozen `bun.lock` installation | Passed after the first resolved lockfile commit (integration CI run on commit `fcb31d1`); a new parser resolution was subsequently committed. | PASS for cited commit; final tip needs recheck |
| Maintained Markdown links | 11 maintained documents; 118 relative targets checked; **0 missing** at observed CI commit | PASS |
| Historical/all-document link inventory | 213 Markdown documents; 192 relative targets; **57 reported missing** in the pre-link-repair run. Most were source-file URLs incorrectly relative to `docs/architecture/`. 55 have now been corrected. | HISTORICAL REPORT; rerun required |
| Gitleaks | GitHub Actions full-history scan reported **no leaks found** | PASS for cited run |
| ESLint | Initial 66 TypeScript parsing errors; after adding the parser, the next observed workflow reached past lint/typecheck successfully. | PASS for `e8c51a1` CI run |
| TypeScript typecheck | Same observed workflow reached Vite build and tests | PASS for `e8c51a1` CI run |
| Vite production asset build | Same observed workflow advanced to full test suite | PASS for `e8c51a1` CI run |
| Full test suite | **99 discovered, 59 passed, 39 failed, 1 skipped**. Not a release pass. | FAIL |
| Dependency vulnerability audit | Initially flagged the critical DOMPurify advisory. Updated manifest and installed Bun package version were reported as 3.4.17, but the npm audit path still reported the advisory on an earlier workflow. More diagnostic reporting added; no exception granted. | FAIL / INVESTIGATE |
| Local end-to-end deployment and real voice | No local checkout, UI, microphone, or staging deployment was run by this chat. | NOT RUN |

CI evidence: [Integration Branch Quality workflow](https://github.com/samjuniors/SamjuniorsOS/actions/workflows/ci-kit-integration.yml), including the run for `e8c51a1` and later branch checks. Exact status may evolve on subsequent commits.

## Defects and migration debts found

| Severity | Affected area | Evidence | Next bounded fix |
| --- | --- | --- | --- |
| BLOCKER | Staging Docker/runtime mismatch | `Dockerfile` copies `.next/standalone` and `.next/static`; `scripts/start-staging.mjs` starts Next.js and a separate `scripts/live-gateway.ts`. This branch's `package.json` instead has `vite build` and `tsx server.ts`; `server.ts` already mounts `/api/live-ws` on its own port. | A separate reviewed staging-image migration, including durable SQLite volume and restore verification, should precede deployment. Do not repurpose old staging workflows without a rollout/rollback plan. |
| HIGH | Legacy test harness versus ESM/Vite | The 39 failing suites include `require`/`__dirname` in ESM, browser `WebSocket` not available on Node 20, Next middleware imports after Next removal, old route/port assumptions, and tests expecting former company-brain paths. | Split test corrections by cause, update mocks/contracts against inspected live code, then rerun full CI. **Do not blanket-skip or delete failing tests.** |
| HIGH | Dependency vulnerability gate | `npm run audit:deps` still surfaced `GHSA-cg2g-xh64-v4q7` after Bun resolved `dompurify@3.4.17`, the patch version specified by upstream. | Inspect installed version, generated npm package-lock, and npm advisory range; treat conflicting audit data as unresolved until checked, not a reason to suppress the gate. |
| MEDIUM | Old dev runner | `scripts/dev.mjs` invokes `node_modules/next/dist/bin/next`; no `dev` script references it on the inspected branch. `scripts/copy-standalone.mjs` also targets `.next`. | Leave in place pending complete invocation search and explicit legacy archive/cleanup review. |
| MEDIUM | Dated research and conceptual links | Older `doc/AUDIT 00–11` and accepted Phase 2.3B design include historical claims. Source links to current repo were repaired, but the implementation status of some decisions differs from the dated text. | Classify rather than silently rewrite; issue explicit ADR supersession only when ratified. |
| LOW | Old verification artifact relative path | Archived `.agent/product-kit/archive/M0/G1.3.md` refers to a security report with the wrong relative link path; the report exists at `docs/security/SECRET_SCAN_REPORT.md`. | Preserve historic evidence and amend only after deciding whether archived artifacts may be edited. |

## Proposed next gates

1. **GATE A — Dependency and security:** patched dependency installed, frozen lockfile reproducible, npm vulnerability output reconciled, no critical unmitigated advisories. **HOLD** until checked.
2. **GATE B — Test compatibility:** first fix Node/ESM harness issues, then old Next.js and Vite/Express route assertions, then verify all existing test semantics without broad exclusions. **REWORK** based on 39 failing suites.
3. **GATE C — Staging migration:** review Docker, backup/restore, ownership, runtime health and WebSocket auth before changing deployment scripts. **HOLD** — no production deployment authorized.
4. **GATE D — Documentation retention:** repair remaining real links after anchored/reachable path review, keep historical series at their current paths or with compatibility pointers. **HOLD before deletion.**

## Safe rollback

All modifications are on the isolated `chore/kit-integration-repo-hygiene-2026-10-23` branch. Review the diff against `docs/kit-integration-reconciliation-2026-10-23`; if a specific change causes a regression, revert that **specific commit** (no force reset, no branch deletion). A full local clone, dependency install, test pass and deploy rehearsal are still needed before promoting the branch.
