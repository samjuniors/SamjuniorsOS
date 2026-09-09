# PROGRESS.md — Running Ledger

> Written to continuously during work, not just at session end. This file — not chat history — is the source of truth for what's done, what's in progress, and what's next. Chat disappears on a cleared context; this doesn't.

## Now
Phase 3 (Command Center) — two vertical slices complete: Phase 3.1 Founder Decision Loop Closure and Phase 3.2 Command Terminal → Real Orchestration (cockpit terminal now submits through the existing /api/orchestrate path with honest state display; see WORKLOG.md). Awaiting founder review before broadening the Command Center.

## Next (queued, in order)
- Replace Vitals Wall / Executive Stream demo data with authoritative reads
- Consider CAS guard for evaluateReadiness instance writes
- Consider fixing the blocked→running synthesis quirk in synthesizeOrchestrationRunFromWorkflow

## Completed
- [2026-09-09] Phase 3.2 — Command Terminal → Real Orchestration: cockpit terminal replaced the fake local dispatch with the real POST /api/orchestrate contract (client idempotency key, honest authoritative state display incl. unconfigured/awaiting-approval/failed, network-retry same-key, durable refresh re-read via GET /api/workflow/instances, approval integration into the existing Phase 3.1 inbox). Minimal backward-compatible route fix: idempotency claim errors now structured 409s. New suite 22/22; full offline regression green; browser E2E over live HTTP verified the terminal submission, durable re-read before/after approval, and the existing approval loop with zero console errors. See WORKLOG.md.
- [2026-09-09] Phase 3.1 — Founder Decision Loop Closure: approvals now reconcile into workflow execution (approve → resume → gate-mediated execution → durable result + audit → UI reflects; reject/revoke → fail-closed blocked). Fixed latent route bug (session email vs gate allowlist) via server-verified userContext contract. New suite 11/11 in both offline and authoritative-PG modes; full offline + online regression green; browser E2E verified both decision paths with zero console errors. See WORKLOG.md.
- [2026-09-09] AGENTS.md universal agent contract (commit `478b3e7`).
- [2026-09-09] Phase 2.6.1 — foundation cleanup & final Phase-2 certification (commit `305add8`): 39 tsc errors fixed, lease renewal wired + certified (12/12 real PG), phase 2.2 test redesign, real-PG CI, full regression green.
- [2026-09-09] Phase 2.6 — real-PostgreSQL concurrency certification (commit `8e21335`): 7 durability-blocking concurrency defects found & fixed.
- [2026-09-08] Phase 2.5 distributed scheduling & lease manager (commit `b12cc5b`).
- [2026-09-08] Security foundation hardening: fail-closed payload binding, authenticated fact promotion, founder allowlists (commits `02fc943`, `5e8ba9f`, `73af411`).
- [2026-09-07] Review & polish pass (commit `f73526f`) — fixed missing window title icons for messages/advisor, removed fabricated data badges (86% Margin, customer count 12), added prefers-reduced-motion a11y support, fixed z-index monotonic growth, committed previous session's unstaged fixes (AgentAvatar import, persona store re-export, openApp type widening, MessagesApp persona simplification). Build passes cleanly.
- [2026-09-07] Codebase audit & PRODUCT.md — audited 28-commit codebase, filled PRODUCT.md from code evidence. Build passes cleanly. All 13 apps, 14 OS components, 6 API route groups, 5 stores, 7 type definition files verified present.
- [pre-session] Full OS shell — window management, dock, top bar, spotlight, control center, calendar modal, notifications, context menus, voice calling
- [pre-session] All 13 app components built (Workforce, Advisor, Company, Customers, Research, Products, Finance, Settings, Terminal, Notes, Messages, PersonaConfig, SkillExplorer)
- [pre-session] Company HQ dashboard with 13 sub-components
- [pre-session] Backend API routes: advisor, agent-chat, agent-collab, orchestrate, communication (6 endpoints), workflow (5 endpoints)
- [pre-session] Collaboration store (32KB), governance store, notification center, persona store, system activity store
- [pre-session] Agent persona system with customizable archetypes and tones
- [pre-session] Voice calling interface
- [pre-session] Multi-agent collaboration workflows with authorization gate

## Audit Log
- [2026-09-07] Build audit — `next build` passes cleanly. 20 routes (1 static page, 1 not-found, 16 dynamic API routes, 2 static). No type errors. First Load JS: 326 kB for main page.
- [2026-09-07] Code quality audit — found 6 issues: 2 missing icon cases, 2 fabricated data badges, 1 a11y gap, 1 z-index growth bug. All fixed in commit `f73526f`.

## Blocked / Needs Founder Decision
- PRODUCT.md open questions (see file) — non-blocking for current work

## Notes for next session
- PRODUCT.md and other doc files (.claude/, CAPABILITY_REGISTRY.md, CLAUDE.md, CONTINUE.md) are still untracked in git. Commit when ready to version-control the project docs.
- The project uses `bun.lock` alongside `package-lock.json` — unclear which package manager is canonical. Should pick one.
- `.env.local` exists with Gemini API keys (922 bytes, same as `.env.example`).
- 6 subagents exist in `.claude/agents/`: architecture-reviewer, design-critic, production-hardening-reviewer, progress-auditor, qa-reviewer, security-reviewer.
- Browser automation (Playwright) failed to launch — visual verification must be done manually by the founder.
