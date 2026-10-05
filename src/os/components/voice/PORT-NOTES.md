# Voice Presence — Phase 2 Port Notes

Port of the SofiaUI voice-agent UI into SamJuniorsOS, branch
`feat/sofiaui-voice-integration` (base: `development` @ `a020cab`).
Reference source: SofiaUI default branch (`main` @ `9e88dee`) — read-only,
kept as an independent repository.

## What was ported

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
