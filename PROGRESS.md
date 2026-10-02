# PROGRESS.md — Running Ledger

> Written to continuously during work, not just at session end. This file — not chat history — is the source of truth for what's done, what's in progress, and what's next. Chat disappears on a cleared context; this doesn't.

## Now
Architecture source-of-truth reconciliation complete: `AGENTS.md`, `ARCHITECTURE.md`, and `docs/architecture/ADR-001-realtime-sophia-interface.md` established as binding engineering guardrails. Working tree contains Phase 4C-B streaming STT implementation (58/58 test assertions passing, Deepgram Flux STT provider, `executeSophiaTurn` cognitive ingress).

## Next (queued, in order)
- Founder review of Phase 4C-B streaming STT implementation report and working tree
- Formal commit and working tree reconciliation for Phase 4C-B
- Review of ADR-001 (Realtime Sophia Interface & LiveKit/Gemini Live direction)
- Next architectural milestone planning: LiveKit/WebRTC prototype vs. Phase 4D (TTS response playback)

## Completed
- [2026-09-21] Architecture Source-of-Truth Update — established `AGENTS.md`, `ARCHITECTURE.md`, and `docs/architecture/ADR-001-realtime-sophia-interface.md`. Aligned product boundaries, core principles, 24/7 operating model, realtime interface doctrine, graph read-model authority, security invariants, and failure recovery.
- [2026-09-17] Phase 4C-B Streaming STT Adapter — implemented provider-neutral STT architecture (`STTProvider`), Deepgram Flux streaming adapter (`DeepgramFluxProvider`), 80ms audio aggregation, 128ms client pre-roll ring buffer, turn finalization idempotency, and unified cognitive ingress (`executeSophiaTurn`). 58/58 test assertions passing.
- [2026-09-16] Phase 4B Client VAD & Audio Ingress (commit `6a01bb2`) — implemented AudioWorklet 16kHz PCM resampler, deterministic Silero VAD acoustic heuristic, PTT audio gating, binary frame streaming, and server frame validation. 42/42 assertions passing.
- [2026-09-16] Phase 4A Companion Live Session Foundation (commit `ee64dcb`) — implemented companion WebSocket server on port 3001, ephemeral single-use ticket auth (`/api/auth/ws-ticket`), single-tenant connection locking, PTT state framing, and 60-second session resume window. 27/27 assertions passing.
- [2026-09-15] Phase 3.1 Conversation Persistence Closure (commit `2732f2c`) — implemented durable multi-turn `ConversationStore` and chat message persistence. 15/15 assertions passing.
- [2026-09-14] Canonical Visual Language & Workflow Components (commits `77621d1`, `0312d7a`) — replaced legacy workflow styling with Canonical Visual Language, canonical node primitives, and BrandLogos.
- [2026-09-13] Phase 4.5 Spatial Depth & Specimen Instrumentation (commit `59df2b0`) — quantized depth of field, spring camera, comet trail refinement, and laboratory specimens.
- [2026-09-12] Phase 4.4A–E Automation, Epistemic & Activity Projections (commits `df3cb2b`, `eaacc0f`, `62c7da9`) — implemented `SchedulerHeartbeat`, per-occurrence approval binding, server-authoritative Activity projection (`/api/activity`), and epistemic closing loop with evidence lineage.
- [2026-09-11] Phase 3.4 Real Runtime Wiring (commit `d92e8d8`) — wired root UI to real backend endpoints (`/api/orchestrate`, `/api/agent-chat`, `/api/agents/runs`, `/api/workflow/approvals`), eliminating simulated responses and fake progress.
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
