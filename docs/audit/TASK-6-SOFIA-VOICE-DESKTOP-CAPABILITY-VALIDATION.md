# Task 6 — End-to-End SOFIA Voice and Desktop Capability Validation

**Type:** Capability audit, targeted testing, and documentation
**Base:** `development` @ `a020cab4a75385f4f94d820dd2945f9d9f168e55` (branch `audit/sofia-voice-desktop-capability-validation`)
**Method:** Source-grounded tracing (current `development` tree is authoritative; comments were never trusted over code), existing + newly added deterministic tests, isolated test database. No merge, no deploy, no production-code changes.
**Scope note:** No in-repo roadmap file defines "Task 6" (searched the full tree; the only task-numbered plan is `docs/plan/jev-inspired-decision-layer.md`, which defines Phase 0–5, not Task 6). The Founder's task text of record is this audit's scope definition.

---

## 1. What "SOFIA" actually is on `development` (three voice-capable surfaces, one canonical brain)

The root route (`src/app/page.tsx`) renders `src/os/App.tsx` with **three tabs**; the **default tab is `sofia`** — the full-screen SOFIA voice assistant (`src/sofia/App.tsx`, dynamically imported, kept mounted while other tabs are visible so her microphone keeps running).

| Surface | Entry | Voice in | Voice out | Status |
|---|---|---|---|---|
| **SOFIA scene** (default) | `src/sofia/App.tsx` | Wake-word loop: browser VAD → `/api/sofia/stt` chain, or browser `SpeechRecognition` | TTS: browser `speechSynthesis` + `/api/sofia/tts` (ElevenLabs → z-ai neural → local) | **Real, wired, default-on** |
| **OS voice ribbon** | `LiveTranscriptRibbon` + `liveCompanionBridge` → `SophiaLiveClient` → companion WS server `:3001` → `DeepgramFluxProvider` | PTT (Space hold / mic button) → streaming STT | **Text only** — no TTS on this path; `SPEAKING` state is never set server-side | **Real, wired, but requires `bun run dev:ws` (separate process); live interim captions broken by a turnId defect (§5, §7-R2)** |
| **"Realtime Lab"** | `/api/realtime/turn` (759-line route; deterministic HUD/browser/persona/voice "actuator" branches, camera/audio payloads, orchestrator dispatch, image/web-search tools) | HTTP POST | JSON action objects for a client to apply | **Orphaned — zero frontend callers** (grep-verified; no UI invokes it) |

All three converge on one canonical cognitive ingress: `executeSophiaTurn` (`src/lib/server/sophia/turn-executor.ts`) → `ConversationStore` → `SophiaContextAssembler` → `SophiaIntentClassifier` → `SophiaServerGateway`. There is no second Sophia.

## 2. Verified execution path (call sequence)

### 2a. SOFIA scene (the default voice experience)

```
[user gesture: ignition click]                    src/sofia/App.tsx ignite()
  ├─ sfx/music AudioContext unlock (browser)
  ├─ warm() → GET /api/sofia/health               engine capability probe (llm/stt/tts chains)
  ├─ probeCapabilities()                          src/sofia/lib/capabilities.ts (typed-at-border)
  └─ startVoice(h)                                src/sofia/lib/voice.ts — ONE recognizer for page life
       ├─ engine pick: caps().stt ? server : browser
       ├─ SERVER ENGINE: startVad() (client energy gate) → speech segments queued (nothing dropped:
       │    single-flight drain preserves order)
       │    → POST /api/sofia/stt (Founder-session-gated, 25MB cap, <1200B = silence)
       │      → transcribeAnywhere(): Deepgram → ElevenLabs Scribe → z-ai ASR → local whisper
       │    → echo filter (isEcho word-bag vs speakingNow) → wake-word regex (persona)
       │    → assembler (holdFor: SETTLE 250ms / CONTINUE 1600ms / MAX_HOLD 6000ms)
       │    → h.onUtterance(text)
       ├─ BROWSER ENGINE: SpeechRecognition (en-GB, continuous, interim), 900ms endpointing,
       │    15s-silence heartbeat restart
       └─ 4 consecutive chain failures → degradeToBrowser() mid-session
  respond(said)                                   src/sofia/App.tsx
  └─ ask() → POST /api/sofia/ask (SSE)            src/sofia/lib/api.ts
       → executeSophiaTurn({message, founderId(session), conversationId?, turnId `sofia-<uuid>`,
                            executeDirective:true, ingress:'sofia_ask'})
            → ConversationStore.getOrCreateConversation (ownership fail-closed; KNOWN ISSUE:
              nonexistent conversationId provisions a fresh conversation — pinned in source + ADR 0002 addendum)
            → idempotency: `${turnId}:assistant` lookup → replay returns cached reply
            → in-flight lock `${founderId}:${conversation}:${turnId}`
            → saveMessage(founder) → ContextAssembler → IntentClassifier (deterministic pre-class +
              fail-closed shape gate) → ServerGateway (FOUNDER session, policy, approval gates)
            → saveMessage(assistant, `${turnId}:assistant`) → scheduleSophiaMemoryCapture (fire-and-forget)
       ← SSE: ready / text (sentence chunks — post-completion, synthetic streaming) / done / error
  speaker.push(delta) → tts.ts per-sentence queue (speechSynthesis or /api/sofia/tts)
```

**Asynchronous boundaries:** every transition is event-driven; the turn counter (`turn.current++`) makes any superseded turn's late continuations no-ops (`stale()` checks after every await).

### 2b. OS voice ribbon (companion WebSocket)

```
toggleVoice → fetchWsTicket → POST /api/auth/ws-ticket (Founder-gated) → single-use 60s ticket
  → SophiaLiveClient.connect (ws://host:3001?ticket=…) → authenticateUpgrade (ticket consumed /
    production dev-as+secret timing-safe / dev FOUNDER-only) → SESSION_READY
  → startMicrophone (getUserMedia + AudioWorklet 16kHz PCM 512-sample frames)
  → startPtt (client generates its own `turn_*` id) → START_PTT → server: LISTENING + startSttSession
    (DeepgramFluxProvider: 2560-byte/80ms aggregation, fail-closed on missing key)
  → binary frames → server validation: size ∈ [2, 32768]B, state must be LISTENING (late frames
    dropped + counted) → provider.sendAudio
  → stopPtt → STOP_PTT → THINKING + provider.endTurn() (flush + ForceEndTurn)
  → Deepgram EndOfTurn → final_transcript → handleFinalTranscript:
      processedTurnIds guard → TRANSCRIPT_FINAL → (empty → IDLE, done)
      → THINKING → executeSophiaTurn (same canonical path as 2a) → SOPHIA_RESPONSE → IDLE
  → LiveTranscriptRibbon renders final text + reply (interim captions broken — §5)
```

**Session/resume:** single connection per founder (older socket closed 4409); 60s `RESUME_SESSION` window reattaches state (fresh session if expired); heartbeat 30s ping/terminate; server close → STT sessions closed, GOING_AWAY.

## 3. Capability matrix

Legend: **V** verified (source + passing tests) · **P** partially verified (source-verified, runtime conditional or not exercised) · **SIM** simulated/presentation-only · **U** unavailable (honestly declared) · **UN** unverified (not exercised in this audit) · **ORPH** orphaned (implemented server-side, zero UI callers)

### Voice input

| Capability | Verdict | Evidence |
|---|---|---|
| Wake-word loop ("Sofia", persona-driven, mishearing-tolerant) | **V** | `src/sofia/lib/voice.ts` (WAKE regex, 1500ms debounce, alternates) |
| VAD-gated segment capture (client) | **V** | `src/sofia/lib/vad.ts`, `audio.ts`; tests `phase4b` |
| Server STT chain Deepgram→ElevenLabs Scribe→z-ai ASR→local whisper | **P** (code verified; which link answers depends on env keys; live runtime **UN**) | `src/lib/server/providers.ts` `STT_CHAIN`, `/api/sofia/stt` |
| Browser SpeechRecognition fallback + auto-degrade after 4 chain fails + 15s heartbeat restart | **V** (source); live browser behavior **UN** | `voice.ts` `degradeToBrowser`, health interval |
| PTT streaming STT via Deepgram Flux (OS ribbon) | **V** (adapter contract, aggregation, normalization, fail-closed key); end-to-end with real Deepgram **UN** | `deepgram-flux-provider.ts`; tests `phase4c_streaming_stt_adapter` |
| Multi-segment utterance assembly (pause ≠ turn end) | **V** | `voice.ts` `makeAssembler`/`holdFor` |
| 128ms client pre-roll ring buffer | **V** | `live-client.ts`; tests `phase4c` suite 2 |
| 80ms server-side audio aggregation | **V** | `deepgram-flux-provider.ts` `sendAudio`; tests `phase4c` suite 1 |
| Audio frame bounds/state validation, late-frame drop | **V** | `server.ts` `handleBinaryAudioFrame`; tests `phase4b` |

### Voice output

| Capability | Verdict | Evidence |
|---|---|---|
| TTS on SOFIA scene (speechSynthesis default; `/api/sofia/tts` ladder) | **P** (code + routes verified; not auditioned in this audit) | `src/sofia/lib/tts.ts`, `/api/sofia/tts`, `/api/tts/elevenlabs` |
| Sentence-queue, engine fallback, watchdog/keepalive, barge-in cancel | **V** | `tts-speaker.ts` (dead-imported, §6), `sofia/lib/tts.ts` |
| TTS on OS ribbon | **U — does not exist**; reply is text-only; `SPEAKING` never set server-side | `server.ts`, `liveCompanionBridge.ts` |
| Server-pushed audio streaming to client | **U — not implemented** (ADR-001 target state) | — |

### Interruption / cancellation / idempotency / recovery

| Contract | Verdict | Evidence |
|---|---|---|
| Barge-in cuts TTS instantly (client) | **V** | `sofia/App.tsx` `onSpeechStart` → `silence()`; `tts.ts` cancel |
| Barge-in aborts SSE fetch; partial text kept; stale-turn guard | **V** | `sofia/lib/api.ts` `cancel()`, `App.tsx` `turn.current` |
| Interruption cancels downstream cognitive work | **U — false by design**: no cancellation token exists; WS INTERRUPT is state-only; SOFIA abort stops rendering, not execution (route comment: "the canonical turn still completes and persists server-side") | source + **new test A1** |
| Response exactly-once under interruption | **V** | **new test A1** |
| Duplicate STT finalization suppressed | **V** | `processedTurnIds` + `${turnId}:assistant`; tests `phase4c` 3.6, `m0` 7/7 |
| Late final after INTERRUPT suppressed | **U — NO**: the turn still executes (provider race window open) | **new test A2** |
| Repeated request, same turnId (same conversation) | **V** idempotent replay returns cached reply | `turn-executor.ts`; `m0`/`m3` suites |
| Retry with stale/nonexistent conversationId | **P** — fails safe (fresh founder-bound conversation) but **re-executes the turn** (idempotency is conversation-scoped); pinned in source as deliberate KNOWN ISSUE | `turn-executor.ts` header note |
| Ownership mismatch (another founder's conversation) | **V** fail-closed Forbidden before provisioning | `turn-executor.ts`; `m3_authority_hardening` 10/10 |
| WS disconnect → 60s resume; STT disarmed on resume | **V** | tests `phase4a`, `phase4c` reconnect case |
| Empty transcript → IDLE, no LLM call | **V** | `server.ts`; test `phase4c` 3.7 |
| Provider errors surfaced (ERROR frames, fatal flag); init failure non-fatal | **V** | `server.ts` `STT_INIT_FAILED`; tests `phase4c_c` suite 7 |

### Authorization & governance

| Contract | Verdict | Evidence |
|---|---|---|
| Founder identity established server-side on every voice/text ingress | **V** | `/api/auth/ws-ticket`, `live/auth.ts`, `/api/sofia/*`, `/api/agent-chat`, `/api/realtime/turn`, `/api/tts/elevenlabs`, `/api/browser/read` — all `getAuthenticatedFounder`-gated |
| Tickets single-use, 60s TTL, FOUNDER-only | **V** | `ticket-store.ts`; tests `phase4a` 3 |
| Production upgrade path rejects role override; timing-safe secret | **V** | `live/auth.ts` |
| Model output / transcripts cannot grant permissions | **V** | Gateway sanitization + untrusted-ID corroboration (`ce7d1c3`); tests `realtime_governance_audit` 11/11, `r0_route_auth` 81/0 |
| Voice cannot bypass approval gates | **V** | `turn-executor` → gateway `executeDirective`; tests `r0_realtime_gate` 6/6, `realtime_governance_audit` |
| Replayed requests cannot execute side effects twice | **V** (turn idempotency + SHA-256 payload-bound approvals) | `m0` 7/7, `phase4_4a` 11/11 |
| Tool results / retrieved content untrusted (sanitized, quarantined, SSRF-guarded) | **V** | `tools/verification.ts`, `sanitizeUntrustedExternalText`, `web_research.ts` URL-grounding |
| Unconfigured providers degrade honestly (no synthetic evidence) | **V** | `composio.ts` `not_executed`; `connector-registry.ts` |

### Tools & "desktop"

| Capability | Verdict | Evidence |
|---|---|---|
| `web_research` (z-ai live search, grounded claims, injection quarantine) | **V** logic; live provider not dialed in this audit | `tools/providers/web_research.ts` |
| GitHub read intelligence (Composio allowlisted read-only actions) | **P** (requires `COMPOSIO_API_KEY` + `@composio/core` + connected account; honest `not_executed` otherwise) | `tools/providers/{github,composio}.ts` |
| `finance_transfer` | **U — honestly declared not wired** ("DECLARED, NOT WIRED"; selector skips `unconfigured`) | `orchestrator.ts` registry |
| `github_issue_create` | **U — declared, not wired** (same honest pattern) | `orchestrator.ts` registry |
| AI image generation | **P/SIM** — returns a Pollinations **URL** only; no fetch/storage; sole consumer is the orphaned realtime route | `tools/image-generator.ts` |
| `searchLiveWeb` (DuckDuckGo HTML scrape) | **P** — real; sole consumer is the orphaned realtime route | `tools/web-search.ts` |
| **Desktop control of the founder's machine** | **U — none exists.** No robotjs/nut.js/xdotool/computer-use anywhere; no OS-level mouse/keyboard/window/clipboard control; no native daemon. "Desktop" = the browser-rendered OS shell (dock, spotlight, popovers — `DesktopOS.tsx`) | grep-verified across `src/`, `package.json` |
| SOFIA camera blade / hand tracking / clap-to-wake | **P** (client `getUserMedia` + MediaPipe; browser-local; frames never leave machine except an explicit tool return) | `src/sofia/lib/camera.ts`, `hands.ts`, `clap.ts` |
| In-OS browser (read pages inside the OS) | **ORPH** — `/api/browser/read` + `/api/sofia/page` exist (Founder-gated, SSRF-guarded), zero active UI consumers; the open/close-browser actuator lives only in the orphaned realtime route | §6 |
| Scheduler heartbeat mini-service | **V** (out of voice scope; noted for completeness) | `mini-services/scheduler-heartbeat`, tests 11/11 |

## 4. Verification record (commands, outcomes, limitations)

All runs on the audit branch in `/home/z/audit-wt` with an isolated database (`DATABASE_URL=file:./.data/audit-t6-test.db`, fresh `prisma db push`); no shared dev data, no production credentials, no external mutations, no live provider calls (deterministic injection-classified messages only).

| Command | Outcome |
|---|---|
| `bun tests/sophia/t6_voice_capability_audit.test.ts` (NEW) | **15 passed, 0 failed** (A0–A4, true exit code 0) |
| `bun tests/sophia/phase4a_live_session_foundation.test.ts` | exit 0 (all PASS) |
| `bun tests/sophia/phase4b_audio_ingress_vad.test.ts` | exit 0 |
| `bun tests/sophia/phase4c_streaming_stt_adapter.test.ts` | exit 0 (incl. prompt-injection bypass + reconnect disarm) |
| `bun tests/sophia/phase4c_c_live_stt_ribbon.test.ts` | exit 0 |
| `bun tests/sophia/realtime_governance_audit.test.ts` | **11/11 passed** |
| `bun tests/sophia/realtime_lab_provider.test.ts` | 5/5 passed |
| `bun tests/sophia/r0_realtime_gate.test.ts` | 6/6 passed |
| `bun tests/sophia/m3_conversation_convergence.test.ts` | exit 0 (live 429s from memory-extractor absorbed — fire-and-forget by design) |
| `bun tests/sophia/m0_idempotency_expiry.test.ts` | **7/7 passed** |
| `bun tests/sophia/production_response_path_regression.test.ts` | **4/4 passed** |
| `tsc --noEmit` | **153 errors — byte-identical set to the `development` baseline** (diff empty); the new test file contributes zero diagnostics |
| `eslint` (new test file) | tests are inside the repo's ignore patterns (same as all existing suites); 0 errors |

**Environment limitations (honest):** no browser, microphone, hardware, or live provider was exercised — Deepgram/ElevenLabs/z-ai chains, speechSynthesis audition, VAD acoustics, and the SOFIA scene's live boot are **UNVERIFIED at runtime** by this audit and marked so in §3. `next build` was not run (no builds in this sandbox; tsc comparison against the baseline performed instead, per instructions).

## 5. Interruption, cancellation, idempotency — consolidated findings

1. **Interruption never cancels downstream work — on any surface.** No `AbortSignal`/cancellation token is threaded into `executeSophiaTurn`. WS `INTERRUPT` changes session state and kills the STT provider; the SOFIA barge-in aborts the SSE fetch and stops TTS/rendering. The cognitive turn, its persistence, and any already-dispatched gated work run to completion. **Pinned by test A1** (response still delivered exactly once, state recovers IDLE). Durable canonical turns are a deliberate architectural shape — but "interruption stops the turn" is *not* what the code does, and the `sofia/lib/api.ts` `cancel()` comment ("the turn stops generating") misstates it (see R3).
2. **Post-interrupt late-final race (WS path).** `DeepgramFluxProvider.interrupt()` sends `ForceEndTurn` and the server immediately closes the provider; a final transcript that wins that race is **not suppressed** — the interrupted turn still executes. **Pinned by test A2** as a documented risk (narrow window; single-founder tenant; consequence is a duplicate-intent turn, not a governance bypass — all side effects still pass gates).
3. **Idempotency is turn-scoped and conversation-scoped.** Same `turnId` in the same conversation → cached replay (V). Duplicate provider finals → suppressed (V). New `turnId` per retry → new turn (expected). Stale/unknown `conversationId` → fresh conversation + **re-execution** (pinned in source as a deliberate KNOWN ISSUE; ADR-0002 §7 divergence, awaiting Founder alignment decision).
4. **In-flight dedup is per-process** (`inFlightTurns`, `processedTurnIds`, ticket store, session records are in-memory) — a companion-server restart wipes them; persistence-level keys (`${turnId}:assistant`) survive restarts. Acceptable single-tenant; noted for any multi-instance future.

## 6. Explicitly unimplemented / misleadingly declared capabilities

1. **Desktop control of any real machine — does not exist.** Nothing in `src/` or `package.json` can move a mouse, press a key, manage a native window, read a clipboard, or launch an OS app. All "desktop" semantics are browser-internal (the simulated OS shell). ARCHITECTURE.md §12/§18 correctly list desktop-adjacent items as TARGET/NOT IMPLEMENTED — **the docs are honest here; nothing overclaims.**
2. **`/api/realtime/turn` "Realtime Lab" is orphaned**: deterministic HUD-panel/browser/persona/voice actuator branches, camera-snapshot and audio-recording ingestion, a "Gemini realtime" provider that actually wraps plain `generateText`, image-generation and live web-search tool branches — **no UI calls any of it.** Its action vocabulary (`open_browser`, `close_panel`, …) is the closest thing to desktop control in the repo, and it is dead code reachable only by direct HTTP.
3. **`/api/browser/read` + `/api/sofia/page` (in-OS browser)** — implemented, Founder-gated, SSRF-guarded… and **consumed by nothing** on the active surfaces.
4. **SOFIA HUD tool badges / panels / blades / ui-redressing streams are vestigial**: `/api/sofia/ask` never emits `tool`/`panel`/`blade`/`ui` SSE frames; the client watchers (`sofia/lib/api.ts`, `App.tsx`) can never fire in this build; the `tooling` phase is unreachable.
5. **`src/lib/client/live/tts-speaker.ts` + `browser-stt.ts`** — a full dual-engine sentence-queued TTS client and a browser-STT adapter **imported by nothing** (the ribbon path is text-out; the SOFIA scene has its own `tts.ts`). Dead-but-maintained code.
6. **`finance_transfer`, `github_issue_create`** — declared in the tool registry, explicitly not-wired/unconfigured; the selector can never pick them. Honest placeholders.
7. **CAPABILITY_REGISTRY.md** governs Claude-Code-side MCP tooling, not SOFIA runtime capabilities — not a product capability claim (kept distinct here).
8. **`SPEAKING` session state** is defined in the live protocol and mapped by the bridge/UI, but no server path ever sets it — the OS ribbon can never display "Sophia speaking" from server truth (the store sets `status: 'speaking'` locally on reply receipt only).

## 7. Security & reliability risks (ranked)

| # | Severity | Risk | Evidence |
|---|---|---|---|
| R1 | **Medium (reliability, governance-adjacent)** | Interruption does not cancel dispatched work; combined with the A2 race, a barge-in can still cause the interrupted utterance's turn to execute (and persist) moments later. No governance bypass (all side effects still gated), but user-visible "I stopped it, why did it do that?" behavior and duplicate-intent persistence. | A1, A2 pins; `server.ts` INTERRUPT; `deepgram-flux-provider.ts` interrupt |
| R2 | **Medium (UX correctness, production defect)** | OS voice ribbon interim captions can never display: `liveCompanionBridge.startPtt(turnId)` passes an id `SophiaLiveClient.startPtt()` ignores (baseline tsc **TS2554** at `liveCompanionBridge.ts:138`), so every interim is dropped by the store's turn-id guard. Final/reply display unaffected. | A3, A4 pins |
| R3 | **Low (doc/comment integrity)** | `sofia/lib/api.ts` `cancel()` comment claims "the turn stops generating" — false (the turn completes server-side; the ask route's own comment says so). Misleads future maintainers about cancellation semantics. | §5.1 |
| R4 | **Low (durability)** | WS-path idempotency locks, tickets, and session records are process-memory only; a companion-server restart during a turn loses the in-flight lock (persistence-level `${turnId}:assistant` key still prevents duplicate *completed* turns). | §5.4 |
| R5 | **Low (latent, cost/robustness)** | `/api/realtime/turn` accepts 5–10MB base64 media payloads and transcribes via Gemini with the API key in a URL query string (lands in server logs/proxies); Founder-gated and currently unreachable from the UI — re-evaluate if the surface is ever wired. | route.ts |
| R6 | **Informational** | `image-generator.ts` returns Pollinations URLs (unfetched); presenting its output as "generated by Sophia" overstates the capability; its only consumer is orphaned. | §6 |

**No authorization weaknesses found**: every voice and text ingress is Founder-session-gated server-side; production rejects dev headers; approvals are payload-bound and replay-proof; transcripts/tool output are untrusted data end-to-end (verified by the 11/11 adversarial audit and 81/0 route-auth suites re-run in this audit's environment).

## 8. Recommended next single task

**Fix the OS voice-ribbon interim-transcript defect (R2) — a one-signature production fix plus its test flip.**
Minimal fix: make `SophiaLiveClient.startPtt(turnId?: string)` honor a caller-supplied turn id (falling back to its generated one), keeping `liveCompanionBridge` as the single id authority; then invert audit pins A3/A4 into the positive contract (bridge id == wire id; interim displayed). Justification: it is the only *user-visible broken capability* on an active surface found by this audit; the compiler already flags it (baseline TS2554); the fix touches one function signature, requires no architectural change, and has a ready deterministic regression (this audit's A3/A4 sections become the pin). R1 (turn cancellation) is a larger, deliberate-architecture decision (AbortSignal threading through the executor + gateway) that deserves its own Founder-directed design pass — A1/A2 document the current contract for that discussion.

---

## Appendix: changed files on the audit branch

- `tests/sophia/t6_voice_capability_audit.test.ts` — NEW, 15 deterministic assertions (A0–A4), zero live network dependencies, isolated-db.
- `docs/audit/TASK-6-SOFIA-VOICE-DESKTOP-CAPABILITY-VALIDATION.md` — this report.
- `WORKLOG.md` — Task 6 operational history entry.

No production code was modified. No merge, no deploy.
