# Phase 4 — Voice-Path Governance, Interruption & Security Review

**Type:** Focused security + execution-governance review of the integrated voice path, with targeted fixes and regression tests.
**Branch:** `feat/sofiaui-voice-integration` (review target: Phase 3 HEAD `1b8de39`; fixes committed on top).
**Method:** Three parallel read-only code audits — (a) endpoint + WebSocket-upgrade auth/ownership inventory, (b) turn-execution governance mechanics (idempotency / cancellation / duplicate-submission matrix), (c) sensitive-logging / desktop-control / client-XSS scan — with every claim re-verified file:line against the tree before acting, then a deterministic 29-assertion regression suite (`tests/sophia/phase4_governance_hardening.test.ts`). No live provider calls, no production credentials, no weakening of any existing control.
**Review scope:** the integrated voice path — companion WS gateway (`:3001`) → DeepgramFlux STT → `executeSophiaTurn` → `SOPHIA_RESPONSE` → runtime playback; the SOFIA typed surface (`POST /api/sofia/ask`); and voice-adjacent surfaces the review touched (TTS ladder, ws-ticket issuance, `/api/browser/read`, the orphaned `/api/realtime/turn`).

---

## 1. Verdicts on the nine requested review areas

| # | Area | Verdict | Key evidence |
|---|---|---|---|
| 1 | **Auth/authz on every voice endpoint + WS upgrade** | **Verified OK** (one deployment-mode exception, §3.2) | Every voice-path HTTP endpoint fails closed (401/403) before business logic; WS upgrade authenticates before `handleConnection`; founder identity never originates from frames or bodies. |
| 2 | **Conversation ownership / session isolation** | **Verified OK** | `ConversationStore.getConversation` throws `ConversationSecurityError` on founder mismatch; the executor returns Forbidden *before* the provisioning fallback; memory store founder-scoped; WS sessions keyed by upgrade-time founder. Pinned by m3/m1 suites. |
| 3 | **Barge-in stops playback, aborts client requests, cancels server work** | **Working as designed; one granularity gap documented** | Client: runtime `interrupt()` stops playback immediately + aborts SSE/TTS fetches. Server: INTERRUPT aborts the in-flight `executeSophiaTurn` via per-socket AbortController; executor settles at stage boundaries with `cancelled:true`. In-flight provider calls inside `SophiaServerGateway.process` run to completion (result discarded) — documented PORT-NOTES limitation, unchanged this phase. |
| 4 | **Late STT/provider frames executing cancelled/completed turns** | **Verified closed** (+ hardened this phase) | Three guards: `processedTurnIds` marking at INTERRUPT, INTERRUPTED-state belt, register-before-await. This phase additionally made the suppression map **founder-scoped** and added turnId validation (§2.1/§2.2), closing a cross-founder poisoning vector in the same guard. |
| 5 | **Duplicate turn submission / idempotency under reconnect & retry** | **Verified OK in-process; cross-process and crash windows documented (§3.1)** | Same turnId+conversation → cached replay (marker replay now honest on the ask surface, §2.4); duplicate provider finals suppressed; in-flight lock shares one promise; reconnect (60s RESUME) reattaches; per-socket abort registry keyed correctly. |
| 6 | **Voice-driven actions via policy evaluator / approval gate / payload binding / audit** | **Verified OK** | Both ingresses (WS, ask) converge on the same gated pipeline: server-derived FOUNDER principal → gateway field-stripping → founder-only directive execution → approval corroboration → `SideEffectAuthorizationGate.executeWithGate` (policy evaluation, SHA-256 payload binding, durable idempotency claim, audit). No second path exists. |
| 7 | **Untrusted transcripts / webpage content bypassing permission checks** | **Verified OK** (+ one adjacent SSRF defect fixed) | Transcripts enter as data through the identical pipeline; gateway strips 11 identity/credential fields; untrusted approval IDs need founder-message corroboration; tool/web content sanitized + quarantined. `/api/browser/read`'s weak inline guard was a confirmed adjacent SSRF defect — **fixed** (§2.8). |
| 8 | **Audio/session resource cleanup, connection limits, timeouts, failure recovery** | **Mostly verified; fixes applied; limits documented** | Heartbeat 30s + terminate; STT closed on close/error/INTERRUPT/RESUME/shutdown; in-flight executions aborted at shutdown; session sweeper; audio frame bounds; ticket TTL 60s single-use. This phase fixed the fatal-flag downgrade + zombie entry (§2.5), the turn-settling stomp (§2.3), and the rapid-tap lost turn (§2.7). No per-founder rate limits — documented (§3.4). |
| 9 | **Logging of sensitive transcripts / audio / credentials / personal data** | **One confirmed defect fixed, rest verified clean** | Full logging inventory: no transcripts, audio, replies, ticket values or key material anywhere in voice-path logs. The Gemini **API key in URL query** (two sites — lands in proxies/access logs) was the confirmed credentials-exposure defect — **fixed** via `x-goog-api-key` header (§2.6). |

---

## 2. Confirmed defects — fixed this phase, with regression tests

All fixes are on `feat/sofiaui-voice-integration`; each is pinned by `tests/sophia/phase4_governance_hardening.test.ts` (29/29 PASS, exit 0).

### 2.1 Cross-founder turn-suppression poisoning (integration defect — D1)
`processedTurnIds` was a process-global `Map` keyed by **bare client-supplied turnIds** (`live/server.ts:37`), and Phase 3's INTERRUPT handler began writing client input into it (`:238-242`). TurnIds are predictable (`voice_turn_<ms>_<counter>`), so a second authenticated socket could `INTERRUPT` with a *predicted* turnId of another founder and silently suppress that turn when its STT final arrived — no error frame, no audit trail. **Fix:** keys are now `${founderId}:${turnId}` — mark and lookup are scoped per founder by construction. **Test G1** proves a foreign INTERRUPT neither suppresses nor aborts the victim's turn.

### 2.2 No server-side turnId validation (D4)
START_PTT/INTERRUPT accepted any string as `turnId`; turnIds become durable idempotency keys (`${turnId}`, `${turnId}:assistant`) and suppression-map entries — a multi-megabyte turnId was accepted, held ≥5min in memory and persisted; `:`-carrying ids could alias another turn's keys. **Fix:** new `src/lib/server/live/turn-id.ts` (`[A-Za-z0-9_-]{1,128}`, `:` reserved); START_PTT/INTERRUPT reject malformed ids with `INVALID_TURN_ID` before touching state. Every minted format in the repo fits the validated space (verified). **Test G2.**

### 2.3 Turn-settling `finally` stomps a newer turn (D5 — amplified by the interruption UX)
`handleFinalTranscript`'s finally unconditionally forced IDLE and closed the socket's STT session. After INTERRUPT → immediate START_PTT (the natural barge-in-and-speak-again flow), the interrupted turn's settle would kill the *new* turn's LISTENING state and STT provider — silent dead-end. **Fix:** settle (and the empty-transcript cleanup) is now conditional on the turn still owning the session (`activeTurnId` cleared by INTERRUPT, or still this turn's id). **Test G3** proves T2 keeps LISTENING, provider alive, audio flowing.

### 2.4 Cancelled-marker replay presented as a live answer on the typed surface (D6 — Phase 3 behavior surfaced dishonestly)
`/api/sofia/ask` ignored `result.cancelled` and streamed the persisted `'(turn interrupted)'` marker text as the assistant answer on replay. **Fix:** cancelled turns (direct or replay) settle with an honest empty `done` frame carrying `cancelled:true`; no text frames. UI clients mint fresh turnIds per ask, so the affected callers were non-UI clients; the fix restores contract honesty either way. **Test G4** (real route handler, real session primitive).

### 2.5 STT init-failure `fatal` flag downgrade + zombie session entry (D8)
`startSttSession`'s catch re-sent the provider's init failure as `fatal:false` — a permanently broken Deepgram key reported as *recoverable*, defeating the runtime's fatal-capture teardown routing into the permission-modal recovery loop; the failed provider entry also lingered in `activeSttSessions`. **Fix:** init failures are fatal by construction; the zombie entry is closed. **Test G5.**

### 2.6 Gemini API key in URL query string (R5 — credentials exposure, two sites)
`src/app/api/realtime/turn/route.ts:147` and `src/lib/server/live/providers/gemini-provider.ts:134` built `…?key=<API key>` URLs — query strings persist in proxies, access logs and error reporters (the repo-wide `?key=` grep finds exactly these two sites). **Fix:** both use the documented `x-goog-api-key` **header**. **Test G6** (fetch capture: no key in URL, key in header) + source-level tripwires on both files.

### 2.7 Rapid PTT tap loses the turn (D7)
`endTurn()` early-returned while the Deepgram socket was still CONNECTING, so a fast press-release never sent `ForceEndTurn`: the session sat in THINKING forever — no final, no error. **Fix:** `pendingEndTurn` flag honored on socket open (audio buffered meanwhile is flushed then). **Test G7** (real `ws` server, real provider handshake).

### 2.8 `/api/browser/read` SSRF + unbounded read (pre-existing, adjacent surface)
The inline guard blocked only three metadata hostnames: `localhost`, `127.0.0.1`, `::1`, RFC1918, CGNAT and `0.0.0.0` all passed; redirects were auto-followed unvetted; the response body was read unbounded. Founder-gated and orphaned (zero callers), but a confirmed SSRF surface reachable by direct HTTP. **Fix:** the route now rides the hardened `net.ts` pipeline (`vetTarget` + rebinding-safe `guardedLookup` + re-vetted redirects + 2 MB cap) — the same pipeline as `/api/sofia/page|img|media`. Response contract shape preserved.

---

## 3. Confirmed risks — documented, deliberately not fixed (Founder decisions required)

### 3.1 Exactly-once does not span processes or process death (D2/D3)
The in-flight lock (`inFlightTurns`) and `processedTurnIds` are process memory; the executor never claims a key in the durable idempotency store. Two windows remain: (a) a crash between founder-persist and assistant-persist → retry re-executes (external side effects re-fire — the gate derives fresh keys from the new run); (b) the deployment is split (gateway `:3001` process + Next `:3000` process), so the *same* turnId submitted concurrently via WS and `/api/sofia/ask` can execute twice — the store's save-dedupe is check-then-act across two lock acquisitions. A malicious founder could trigger (b) deliberately (self-directed double-commissioning; all side effects still pass gates). **Recommended design:** claim/complete a durable key (`sophia_turn:${turnId}`) through the existing idempotency store at executor start, or wrap founder+assistant saves in `withCollectionLock`. Architectural change to the canonical path — out of review-phase scope.

### 3.2 WS gateway is fail-open when its process lacks `NODE_ENV=production` (deployment hardening decision)
`live/auth.ts` grants a FOUNDER session (with client-supplied `x-samjuniors-user-id`) to any upgrade when `NODE_ENV !== 'production'`; `scripts/live-gateway.ts` never sets it; the gateway binds all interfaces. Production deployments must run the gateway with `NODE_ENV=production` + the ticket store (or the documented dev-secret path). Making the dev fallback opt-in (e.g. `SAMJUNIORS_DEV_GATEWAY=1`) would break the current sandbox voice flow, which relies on the fallback because of §3.3 — an infrastructure decision recorded for the Founder.

### 3.3 Cross-process ticket store (pre-existing, documented in PORT-NOTES)
In-memory `LiveTicketStore` cannot validate Next-issued tickets in the split-process deployment; browser voice sessions authenticate via the dev fallback today. Fix requires a shared store (file/redis) or a single process — infrastructure decision.

### 3.4 No rate limits / caps on some inputs
No per-founder rate limiting on any voice-path endpoint; no length cap on `/api/sofia/ask` `text`, `/api/agent-chat` `message`, `/api/tts/elevenlabs` `text`; no upstream timeout on the ElevenLabs route; no cap on WS JSON control frames (relies on the `ws` default maxPayload). Founder-gated everywhere → cost/DoS exposure, not privilege escalation. Infra-level decision.

### 3.5 `/api/sofia/health` is unauthenticated (low)
Discloses the provider-configuration inventory (env-var *names*, chain health, voice roster — no key values). The SOFIA boot probe (`sofia/lib/api.ts warmServer`) relies on it pre-auth. Gating it changes the boot flow — Founder call.

### 3.6 Dev-only role-gate inconsistency (low)
`/api/sofia/ask`, `/api/sofia/memory`, `/api/agent-chat` accept any authenticated dev session while sibling voice routes require `role==='FOUNDER'`. Unreachable in production (`session.ts` only returns FOUNDER or null there). Impact confined to the dev sandbox.

---

## 4. Theoretical risks (documented; not confirmed exploitable as-deployed)

- **Abort after checkpoint 4** can deliver a fully persisted reply after INTERRUPTED_ACK (ack-then-reply cosmetic inconsistency; persistence correct).
- **Single-connection supersession race**: a CONNECTING old socket is neither closed nor unregistered — needs precise upgrade interleaving; same-founder impact only.
- **Executor hang** (gateway/LLM call never settling) would retain the in-flight lock + a dead-socket reference; no timeout wraps `SophiaServerGateway.process`.
- **WS ticket in the URL query** (`?ticket=`) would be captured by any future access-logging proxy in front of `:3001` (none exists today; 60s single-use TTL limits value). A first-frame or subprotocol auth would be tighter.
- **`/api/sofia/file` TOCTOU** between `realpath` and `readFile`, and the deliberately broad tmpdir image root (founder-gated, image-extension allowlist).
- **Gateway plain-HTTP `/health`** discloses `activeClients` count unauthenticated.
- **Client error bodies echo internal `err.message`** (provider error text) on founder-only surfaces — no secrets observed in any message path.

---

## 5. Desktop-control restriction — verified

**No desktop machine-control exists anywhere in the repo, and nothing was connected to the voice agent during this migration** (verified, not inferred):
- No `robotjs`/`nut.js`/`xdotool`/`koffi`/`ffi-napi`/`node-pty`/computer-use primitives in `package.json` or any import; `playwright` is devDependency-only (screenshot/test tooling); `child_process` appears only in test harnesses.
- The 23-file integration diff (a020cab → Phase 3 HEAD) is voice-only: orb rendering, voice components, runtime, playback, bridge events, cancellation wiring. None of SofiaUI's local companion / browser-control / file-operation / OS-action code was ported or connected (PORT-NOTES "Excluded by design" matches the diff).
- `liveCompanionBridge` is voice-only (STT/turn events; no daemon commands).
- `/api/realtime/turn`'s actuator branches (`open_browser`, `close_panel`, …) remain **orphaned** — zero frontend callers on this branch (grep-verified); the acting branches (image gen, web search) pass the `SideEffectAuthorizationGate`.
- The voice runtime's only outbound calls are the founder-gated `/api/sofia/tts` and the ticketed WS connect.

Any future computer-control integration requires separate explicit authorization and safety design, per the phase brief.

---

## 6. Verified clean (explicit)

- Founder auth fail-closed before business logic on every voice endpoint; identity never from bodies/frames.
- Ownership fail-closed before provisioning; Forbidden can never fall into the fresh-conversation fork.
- Ticket semantics: single-use-before-validate, 60s TTL, sweeper, FOUNDER role required, invalid never falls back; timing-safe secret compares throughout.
- Secrets stay server-side: Deepgram `Token` header, ElevenLabs `xi-api-key` header, z-ai keyless SDK; no `NEXT_PUBLIC` secrets; no key material in any Phase 2/3 client file.
- 4409 supersession enforced server-side, respected client-side; reconnect suppressed for intentional close.
- Untrusted content: transcripts enter as data; gateway strips identity/credential fields; approval IDs need corroboration; tool/web output sanitized + injection-quarantined; SSRF pipeline hardened on page/img/media (and now browser/read).
- XSS: every voice-path component renders untrusted text as React text nodes; the only `dangerouslySetInnerHTML` sinks are DOMPurify-sanitized (Panels/Blades) or static-trusted.
- Logging: no transcripts, audio, replies, tickets, founder personal-memory content, or API keys in any server or client log statement (full inventory audited; memory-capture content-exclusion verified at every call site).

---

## 7. Verification record (commands, outcomes)

| Command (in `/home/z/sofiaui-voice-wt`) | Outcome |
|---|---|
| `bun run tests/sophia/phase4_governance_hardening.test.ts` (NEW) | **29 passed, 0 failed**, exit 0 (G1–G7) |
| `bun run tests/sophia/sofiaui_voice_runtime.test.ts` | 30/0, exit 0 (Phase 3 contract intact) |
| phase4a / phase4b / phase4c / phase4c_c suites | exit 0, zero `[FAIL]` lines |
| `realtime_lab_provider` / `realtime_governance_audit` | exit 0, zero `[FAIL]` lines |
| `m0_idempotency_expiry` / `m3_conversation_convergence` | exit 0 / 14 passed |
| `phase3_conversation_persistence` / `production_response_path_regression` | exit 0 / 4 passed |
| `bun run lint` | **0 problems** |
| `tsc --noEmit` | **152 errors — position-normalized set diff vs pristine Phase-3 HEAD baseline: IDENTICAL** (zero new diagnostics; zero in all changed files) |
| `next build` | not run (no builds in this sandbox — tsc-vs-baseline is the established substitute, same standard as prior phases) |

**Honest limitations:** no real microphone/speaker hardware, no live Deepgram/ElevenLabs/Gemini calls, no live split-process gateway deployment were exercised — the cancellation/poisoning/races are pinned by deterministic contract tests (injected executor + mock STT), and the Gemini header fix by a captured fetch. Same honesty standard as Task 6 and Phase 3.
