# Voice Presence — Phase 2 Port Notes

Port of the SofiaUI voice-agent UI into SamJuniorsOS, branch
`feat/sofiaui-voice-integration` (base: `development` @ `a020cab`).
Reference source: SofiaUI default branch (`main` @ `9e88dee`) — read-only,
kept as an independent repository.

## Phase 3 — Voice runtime (this section added by the runtime phase)

Phase 3 integrated the voice runtime behind the Phase 2 UI. The architectural
boundary (per the approved migration plan and the phase requirements):
SofiaUI provides the voice *interaction experience*; SamJuniorsOS remains
authoritative for reasoning, conversations, memory, tools, permissions and
execution. The canonical path is unchanged end-to-end: bridge →
SophiaLiveClient (WS :3001, ticket auth) → DeepgramFlux STT →
`executeSophiaTurn` (conversation store, turn IDs, idempotency, founder
identity) → SOPHIA_RESPONSE → **the runtime speaks the reply**.

### What was added / adapted

| This tree | SofiaUI source | Status |
|---|---|---|
| `src/os/lib/voiceRuntime.ts` | `src/sophia/SophiaOS.ts` (lifecycle, cleanup sequencing, reconnect cadence, fixed system-voice level), `src/sophia/audio/AudioEngine.ts:248` (mic EMA) | adapted facade — the clearly-defined interface |
| `src/os/lib/voicePlayback.ts` | `src/core/AudioOutput.ts` | adapted: graph/EMA/drain-debounce/stopImmediately kept; input is decoded per-sentence audio (wav/mpeg) instead of 24kHz PCM chunks |
| worklet `mic_level` messages | `AudioEngine.ts` worklet RMS math | adapted into the existing resampler worklet (`audio-worklet-processor.ts`) |
| `turn-executor.ts` `signal` + checkpoints + cancelled marker | — | new (canonical-path cancellation contract) |
| `live/server.ts` INTERRUPT cancellation + late-final guard + executor seam | — | new server wiring |
| `live-client.ts` turnId param + retained id + disconnect/device events | — | new client contracts (fixes the pinned interim-caption defect) |
| `liveCompanionBridge.ts` event bus + speaking gate + reconnect | — | additive bridge surface |
| `tests/sophia/sofiaui_voice_runtime.test.ts` | — | 30 contract assertions (A/B/C/D) |

### Providers (reuse, no duplicates)

- **STT**: the existing DeepgramFlux streaming path — untouched.
- **TTS**: the existing founder-gated `POST /api/sofia/tts` ladder
  (ElevenLabs → local server → z-ai neural, cached, keyless default), spoken
  sentence-at-a-time; per-sentence failure falls back to the browser's
  speechSynthesis — the route's own designed degradation. Secrets stay on
  the server; no provider key reaches the browser. SofiaUI's provider
  failover chain and all four providers were NOT ported.

### Deliberate adaptations (temporary or permanent, with reasons)

1. **Client-owned SPEAKING overlay.** The live server never enters SPEAKING
   (it emits a trailing IDLE after SOPHIA_RESPONSE). The runtime drives the
   store's `speaking` status itself and holds off the server's trailing IDLE
   via a speaking gate in the bridge while audio plays; the engine's 350ms
   drain settles it back to `idle` (Phase 2 mapping turns that into
   `response_finished`). Stopping playback never cancels completed server
   work — "stop playback" ≠ "cancel server work", by design.
2. **Cancellation granularity.** INTERRUPT aborts the in-flight
   `executeSophiaTurn` via AbortSignal; the executor stops at stage
   boundaries and settles `cancelled: true`. In-flight provider calls inside
   `SophiaServerGateway.process` run to completion and their result is
   discarded (documented limitation — threading the signal into the
   gateway/tool layer is a separate change). A cancelled turn with a
   persisted founder message gets a `(turn interrupted)` assistant marker
   under the standard `${turnId}:assistant` idempotency key, so retries
   replay the cancellation instead of re-executing.
3. **Late-final race closed server-side**: INTERRUPT marks the interrupted
   turnId as processed; a racing Deepgram ForceEndTurn final after close is
   dropped by the existing idempotency guard (plus a belt-and-braces
   INTERRUPTED-state guard).
4. **Reconnect semantics**: 1200ms base ×2 backoff, max 3 attempts (SofiaUI
   cadence), suppressed for intentional close (1000) and supersession
   (4409). Reconnect re-authenticates and re-acquires the mic; conversation
   continuity is the durable conversationId. Limitation: an in-flight turn's
   response delivery does not survive a drop (response delivery is
   per-socket); `RESUME_SESSION` is not exercised by the runtime.
5. **Mic path**: capture stays owned by the existing live client; the runtime
   only consumes worklet metering. Device loss is detected via track `ended`
   (fatal capture error) plus a `devicechange` enumeration backstop; both
   route to explicit teardown (stop playback, close session, honest error)
   and the Phase 2 permission modal owns recovery.
6. **Duplicate events**: one utterance per turnId (spoken-set guard); server
   side keeps the existing `processedTurnIds` suppression.

### Known limitations / open items for later phases

- **Cross-process ticket auth (pre-existing, out of scope)**: the WS ticket
  store is in-memory; when the gateway (`:3001`) runs as a separate process
  from Next.js, the ticket issued by `/api/auth/ws-ticket` cannot be
  consumed by the gateway — browser voice sessions cannot authenticate in
  split-process deployments. Verified in the smoke test (ticket POST 200 →
  WS upgrade rejected); the gateway itself accepts browser connections via
  the dev fallback. Fixing this (file/redis-backed ticket store, or a
  shared process) is an infrastructure decision for the Founder.
- `rendering` / `transforming` orb states remain untriggered: the live path
  emits no tool-lifecycle events (SOPHIA_RESPONSE is the only turn event).
  The bridge event surface is the natural hook when a turn-event stream
  exists.
- AudioWorklet metering is verified by typecheck/lint/smoke only (the
  worklet cannot execute under bun); the browser mic/speaker paths were not
  exercised with real hardware in this environment (contract tests +
  render/state smoke instead — same honesty standard as Task 6).
- The `bun test` harness truncates self-reporting suites mid-run in this
  sandbox session (existing suites like phase4a/4c are affected
  identically); the reliable runner is `bun run <suite>` with true exit
  codes, which is what this phase used and reported.

## Phase 2 — what was ported

| Ported file (this tree) | SofiaUI source | Status |
|---|---|---|
| `orb/gl/shaders.ts` | `src/sophia/gl/shaders.ts` | verbatim (GLSL constants) |
| `orb/types.ts` | `src/sophia/types.ts` | verbatim |
| `orb/SophiaState.ts` | `src/sophia/SophiaState.ts` | verbatim (13-state machine) |
| `orb/ShapeGenerator.ts` | `src/sophia/ShapeGenerator.ts` | verbatim |
| `orb/VisualDirector.ts` | `src/sophia/VisualDirector.ts` | verbatim |
| `orb/ParticleRenderer.ts` | `src/sophia/ParticleRenderer.ts` | verbatim (WebGL2) |
| `orb/layout.ts` | `src/sophia/layout.ts` | adapted: centre `0.5h` (widget is its own square stage; no HUD line below the orb) |
| `voice-presence.css` | `src/styles.css` (subset) | adapted: scoped under `.voice-presence` |
| `VoiceStatusPill.tsx` | `src/ui/SofiaStatusPill.tsx` | adapted (see header) |
| `VoicePermissionModal.tsx` | `src/ui/MicPermissionModal.tsx` | adapted onto shadcn `Dialog` |
| `useVoicePresence.ts` | `src/App.tsx` + minimal parts of `src/sophia/SophiaOS.ts` | adapted glue |
| `VoicePresence.tsx` | `src/App.tsx` + `src/ui/Hud.tsx` (Dock mic button) | adapted widget |

The only change to an existing file: `src/os/App.tsx` (+7 lines: one import,
one guarded render line, comments).

## Deliberate adaptations (temporary or permanent, with reasons)

1. **Widget, not full-screen.** SofiaUI's orb is the whole application; here
   it is additive chrome (`fixed bottom-left`), mounted only when
   `tab !== "sofia"`, exactly like the existing `ChatPanel` and
   `LiveTranscriptRibbon`. The SOFIA tab keeps its own full-screen voice
   surface; nothing existing was removed or replaced.

2. **State source.** The ported state machine is driven by the destination's
   existing `osStore.liveVoice` (the live-companion transport), not by
   SofiaUI's VoiceProvider events. Mapping table in `useVoicePresence.ts`.

3. **No audio engine (TEMPORARY).** Nothing here captures or plays audio.
   The orb animates on SofiaUI's designed procedural envelopes
   (`VisualDirector.frame` substitutes mock amplitude when hardware levels
   are absent). Real amplitude wiring arrives with the voice-runtime phase.
   The permission modal performs only a *probe* (`getUserMedia` + immediate
   track stop) — sustained capture stays owned by the existing live client.
   **No duplicate audio engine ships with this port.**

4. **Interruption via the existing seam (TEMPORARY limitation).**
   Interrupt routes through `liveBridge.interrupt()` (live-client
   `INTERRUPT`). The known pre-existing defect — the server's INTERRUPT
   handler is state-only and `executeSophiaTurn` work is NOT cancelled — is
   unchanged and scheduled for the cancellation phase. This port adds honest
   visual feedback (interrupted state + flash + announcement) without
   pretending server-side cancellation exists.

5. **Keyboard layer.** Only `Escape` (interrupt, guarded against typing and
   open dialogs) is added. SofiaUI's Space/M/P layer is NOT ported: the
   destination's `LiveTranscriptRibbon` already owns Space (push-to-talk).
   No competing global event systems.

6. **Orb click = interrupt** (SofiaUI: substance click = pause/resume). The
   destination's live voice is a PTT session without a pause concept;
   interrupt is the honest equivalent.

7. **Pill copy/colours** follow the destination's voice language (PTT idiom,
   ribbon colour semantics) instead of SofiaUI's wake-word idiom.

8. **Permission modal on shadcn `Dialog`** — gains focus trap/restore/ESC
   close that SofiaUI's hand-rolled modal lacks. "Text & AI Voice" fallback
   is replaced by closing the modal: the destination's ChatPanel is already
   a first-class text surface on the same tabs.

## Known limitations / open items for later phases

- Amplitude is procedural (see 3). Speaking-state playback level is not yet
  real because no TTS playback engine exists on this surface yet.
- `rendering` / `transforming` states and shape morphs exist in the ported
  engine but have no trigger on the live-companion path yet (they will map
  to tool-call lifecycle events in the runtime phase).
- No mic *device* selection exists in SofiaUI (verified) — none ported.
- WebGL2 context-loss is handled the way SofiaUI handles it: renderer stops,
  CSS fallback sphere shows.
- SofiaUI's per-user motion override (Settings) is not ported; the OS-level
  `prefers-reduced-motion` is honored (engine + CSS).

## Excluded by design (per the approved migration plan)

Companion daemon, desktop control, screen vision, browser panels,
terminal, settings sheet, chat panel, wake word, company memory,
voiceprint layers, `src/core` dead cluster.
