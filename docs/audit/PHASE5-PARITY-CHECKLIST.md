# Phase 5 — Parity Checklist: SofiaUI Voice Experience in SamJuniorsOS

**Type:** Parity validation of the integrated voice path (Phases 2–4, branch
`feat/sofiaui-voice-integration`) against the agreed SofiaUI voice-experience
requirements, followed by the retirement decision for the old voice path.
**Baseline reviewed:** `650caf3` (Phase 4 HEAD). Phase 5 changes are committed on top.
**Method:** every checklist area below is pinned by (a) automated contract tests
(deterministic — injected executor + mock STT + stubbed browser audio APIs,
exactly the Phase 3/4 honesty standard) and/or (b) manual browser verification
in the sandbox (rendering, permission UX, state wiring, cleanup, a11y,
responsive). What is **not** verifiable in this sandbox is stated explicitly.

## Environment capability notes (honest limits, fixed for this report)

- **No microphone hardware / no real speech input** in the headless sandbox.
  Live STT additionally requires `DEEPGRAM_API_KEY` (absent). Real
  speech→transcription therefore cannot be exercised here; it is covered at
  contract level (mock STT through the real gateway) and flagged for human
  verification on a supported machine.
- **No audible speaker output** (headless). The spoken-reply path is verified
  through the playback engine's real scheduling/drain/settle contracts with a
  stubbed `AudioContext`, plus a real `/api/sofia/tts` fetch (the keyless z-ai
  link) returning real audio bytes.
- The OLD path (SOFIA tab) is subject to the same physical limits in this
  sandbox — parity here is judged against the *agreed requirements* (the 13
  areas below), not against untestable hardware behavior.

## Defects found by this checklist and fixed in Phase 5

- **P5-D1 (mic-permission UX defect, new path):** `LiveCompanionBridge.connect()`
  swallowed a connect-time `startMicrophone()` failure — it set the honest
  error and then **cleared it** (`error: null`) on the very next line while
  registering the client anyway. Result: a "healthy" idle voice session that
  could never capture, whose retry no-op'd (a client was already registered)
  and which never triggered the Phase 2 permission modal via the transport
  path. **Fix:** a connect-time capture failure now destroys the transport and
  throws the honest error; `toggleVoice` settles `enabled:false, status:'error'`
  with a `/microphone/i`-matching message — the modal's recovery loop works and
  retry reconnects cleanly. Companion client fix: `startMicrophone()` now
  *throws* on the unsupported-`mediaDevices` path (it already threw on the
  worklet-failure path) so fatal acquisition failures can never be mistaken
  for success. Pinned by suite sections G1–G3.
- **P5-D2 (unmount settle defect, new path):** a mid-speech `detach()` left
  the client-owned `'speaking'` store status stuck forever — the server never
  enters SPEAKING (trailing IDLE is gate-held during playback) and the drain
  callback dies with the engine, so nothing else could settle it. **Fix:**
  `detach()` settles a stuck overlay to `idle` (session alive) or
  `disconnected`. Pinned by suite E1-mid.
- **P5-D3 (reconnect-cancel defect, new path):** the runtime's store watcher
  cancelled the reconnect timer whenever *any* store write landed while the
  status was still `'disconnected'` — including the honest disconnect-error
  write that immediately follows the transport loss. The armed reconnect was
  silently killed and session recovery never ran. **Fix:** only intentional
  stop signals (voice off, barge-in interrupt) cancel reconnect; transport
  loss still cuts playback but no longer cancels recovery. Pinned by suite F1.

All three are new-path defects found by this checklist, fixed, and
regression-pinned in `tests/sophia/phase5_voice_parity.test.ts`.

## The checklist

| # | Area | Requirement (agreed) | Old path (SOFIA tab) | New path (integrated) | Automated evidence | Manual/browser evidence | Verdict |
|---|------|----------------------|----------------------|-----------------------|--------------------|--------------------------|---------|
| 1 | Microphone permission & denial | Denial surfaces an actionable permission UX with a working retry; grant proceeds | Own ignition flow + mic capture with browser prompt | Phase 2 permission modal (probe-only) + `useVoicePresence.micDenied` (Permissions API **or** transport mic error) + P5-D1 fix | P5 suite G1–G3 (denial → honest error + retry; device-loss teardown; devicechange backstop) | Headless browser: getUserMedia denial → modal + retry affordance rendered | see Results |
| 2 | Start/stop listening | Explicit start/stop with visible state | Wake-word/clap loop | PTT via bridge (`voice_turn_*` ids), state LISTENING↔THINKING | P5 suite E2–E3; 30-suite C; phase4c_c ribbon | Browser: mic toggle → real ws-ticket POST → real WS upgrade (gateway :3001) | see Results |
| 3 | Transcription & final-turn handling | Interims for the active turn only; finals drive the canonical turn | Blob POST `/api/sofia/stt` chain | Streaming STT → final → `executeSophiaTurn` (canonical) | P5 suite E3–E4; 30-suite B3, D; phase4c adapter suite | Real Deepgram STT: not exercisable in sandbox (no key, no mic) — human verification required | see Results |
| 4 | Audio response playback | Replies are spoken; provider failure degrades honestly | Own speaker (`lib/tts.ts`) | Runtime speaks replies via `/api/sofia/tts` ladder + engine; per-sentence `speechSynthesis` fallback | P5 suite E3, E5–E7 (schedule, drain→settle, fallback, total-failure honesty) | `/api/sofia/tts` real fetch returns audio bytes (z-ai keyless); audible output: human verification required | see Results |
| 5 | Interruption during listening / reasoning / playback | One interruption seam cuts capture, in-flight work, and playback | Barge-in loop | Runtime `interrupt()`: stop playback + bridge INTERRUPT → server aborts in-flight turn | listening: P5 E8; reasoning: 30-suite B1; playback: P5 E5 | Browser: interrupt control present, disabled when not interruptible | see Results |
| 6 | Cancellation & stale-response handling | Cancelled turns never deliver stale replies; late frames can't execute | (no server cancellation) | AbortSignal checkpoints, cancelled-marker persistence, late-final suppression, cancelled replay honesty | 30-suite A1–A3, B1–B2; phase4 G3, G4 | — (contract-pinned) | see Results |
| 7 | Reconnects & session recovery | Unintended transport loss recovers; intentional close doesn't | (SSE retry only) | Close-code-aware reconnect (1200ms ×2, max 3), supersession-aware | P5 suite F1–F4 (reconnect success on new port; exhausted → honest error; intentional close → none; 4409 → none) | Browser: gateway process restart → client reconnects (where exercisable) | see Results |
| 8 | Provider failure & fallback | Provider errors degrade honestly, never wedge a reply | TTS fallback chain in `lib/tts.ts` | STT init fatal routing (phase4 G5); TTS per-sentence fallback → `speechSynthesis`; total failure → honest text settle | P5 suite E6–E7; phase4 G5 | `/api/sofia/tts` ladder: keyless default link returns real audio | see Results |
| 9 | Duplicate submissions & turn idempotency | Same turnId never executes/speaks twice | (per-request, no idempotency) | Server `processedTurnIds` (founder-scoped) + executor idempotency + runtime spoken-turn guard | P5 suite E4; 30-suite A3; m0_idempotency_expiry | — (contract-pinned) | see Results |
| 10 | Authentication & conversation isolation | Every endpoint + WS upgrade fail closed; founder isolation | Founder-gated routes | Phase 4-verified auth matrix + ticket auth + ownership fail-closed | r0_route_auth, r01, phase4 G1, m3/m1 suites (re-run this phase) | Browser: ws-ticket issuance (single-use, 60s TTL) re-verified | see Results |
| 11 | Permission checks & governed actions | Voice-driven actions ride the gated pipeline | (no governed actions) | Both ingresses converge on policy evaluator + approval gate + payload binding + audit | realtime_governance_audit, phase4 (§1 row 6) re-run | — (contract-pinned) | see Results |
| 12 | UI responsiveness & accessibility | Responsive widget; keyboard, SR announcements, reduced-motion | Full-screen surface, own a11y | Phase 2 widget: responsive, sr-only live region, Escape, reduced-motion, WebGL fallback | design-system suite re-run; tsc/lint | Browser: 375/768/1440 viewports; aria labels; sr-only region; Escape; focus trap in modal | see Results |
| 13 | Cleanup after navigation & unmounting | No leaks after unmount/navigation | (page-long-lived mount) | Runtime `detach()` contract: stop playback, abort TTS fetches, remove listeners, clear timers, destroy engine; bridge survives | P5 suite E1 (idempotent attach/detach; post-detach no speak; aborts in-flight fetch) | Browser: tab switches + route navigation; console clean; no pending requests | see Results |

## Results (execution record, 2026-10-05)

**Automated:** `bun run tests/sophia/phase5_voice_parity.test.ts` → **57 PASSED, 0
FAILED, exit 0** (sections E/F/G/H as mapped above). Regression battery re-run
green: sofiaui_voice_runtime 30/0, phase4_governance_hardening 29/0,
r0_route_auth 81/0, m0 7/0, m3_convergence 14/0, phase3_persistence 15/0,
production_response_path 4/0, phase4a/4b/4c/4c_c + realtime_lab_provider +
realtime_governance_audit exit 0 (zero FAIL lines). `bun run lint` 0 problems.
`tsc --noEmit`: 156 errors = position-normalized IDENTICAL to the pristine
Phase-4-HEAD baseline (zero new diagnostics, zero in changed files).

**Browser (agent-browser, worktree scratch server :3211 + real gateway :3001):**

- Flag off: no SOFIA tab in the switcher; boot lands on the SamJuniorsOS
  desktop with the full canonical experience (workflow canvas, attention,
  company graph — all intact); VoicePresence + ChatPanel + LiveTranscriptRibbon
  present as unconditional OS chrome.
- Voice toggle: real `POST /api/auth/ws-ticket` → 200 (single-use ticket
  issued); WS upgrade attempt against the real gateway fails honestly with
  the documented §3.3 cross-process-ticket limitation (in-memory ticket store
  cannot be shared across the Next :3211 and gateway :3001 processes —
  unchanged, a Founder infrastructure decision); no reconnect loop; zero
  console/page errors. The deeper WS-session behavior is pinned in-process by
  the 57-assertion suite.
- Responsive: widget at 375×667 (bottom-left, inside the safe area) and
  1440×900; pill legible at both.
- A11y: `role=status` live region present; aria-labels on all three voice
  controls ("Voice presence", "Start live voice session", "Interrupt Sophia
  (stop speaking)"); Escape harmless when not interruptible.
- Cleanup: /design-system/workflow unmounts the widget; returning remounts it;
  zero console errors or page errors across navigation.
- Flag on (`SAMJUNIORS_VOICE_LEGACY=1`): the SOFIA tab button returns and the
  app boots into the SOFIA ignition screen — the old path restored verbatim.
- Screenshots: /tmp/p5-mobile.png, /tmp/p5-legacy-sofia.png (session-local).

**Verdicts per area:**

| # | Area | Verdict |
|---|------|---------|
| 1 | Mic permission & denial | **PASS** (after P5-D1; suite G1–G3; browser: ticket+WS path honest) |
| 2 | Start/stop listening | **PASS** (suite E2/E8; 30-suite C; browser toggle through the real seam) |
| 3 | Transcription & final-turn handling | **PASS at contract level** (suite E3/E4; 30-suite B3/D; phase4c adapter). Real Deepgram speech: NOT exercisable in sandbox (no key/mic) — **human verification outstanding** |
| 4 | Audio response playback | **PASS at contract level** (suite E3/E5–E7: schedule, drain settle, per-sentence fallback, total-failure honesty). Audible output: **human verification outstanding** |
| 5 | Interruption (listening/reasoning/playback) | **PASS** (suite E5/E8 + 30-suite B1; release-and-re-press after a held-PTT interrupt documented below) |
| 6 | Cancellation & stale-response | **PASS** (30-suite A/B; phase4 G3/G4) |
| 7 | Reconnects & session recovery | **PASS** (after P5-D3; suite F1–F4) |
| 8 | Provider failure & fallback | **PASS** (suite E6/E7 + phase4 G5; keyless z-ai link returns real audio) |
| 9 | Duplicate submissions & idempotency | **PASS** (suite E4; 30-suite A3; m0 suite) |
| 10 | Authentication & conversation isolation | **PASS** (r0_route_auth 81/0; phase4 G1; m3/m1) |
| 11 | Permission checks & governed actions | **PASS** (realtime_governance_audit + phase4 §1 row 6 re-run) |
| 12 | UI responsiveness & accessibility | **PASS** (browser: viewports, live region, aria-labels, Escape; design-system suite; reduced-motion verified at port-time by Phase 2) |
| 13 | Cleanup after navigation/unmount | **PASS** (after P5-D2; suite E1/E1-mid; browser navigation) |

**Documented residual (known limitation, not a regression):** an INTERRUPT
during a *held* PTT closes the server-side STT session; speaking again requires
releasing and re-pressing PTT (the orb's interrupted→listening visual invites
speech — a minor UX nuance vs SofiaUI's continuous barge-in, recorded as a
follow-up candidate; the server-side INTERRUPT→START_PTT path itself is pinned
green by phase4 G3).

**Physically-unverifiable residue (both paths equally affected in this
sandbox):** real microphone speech → live streaming transcription (needs
hardware + `DEEPGRAM_API_KEY`) and audible speaker output. These are the two
items the phase brief anticipates with "manually verify … where available".

## Old-path retirement decision

Per the phase brief: removal only after parity is demonstrated; otherwise
retain the old path or a reversible feature flag. Findings:

- Areas 2–13 are demonstrated at contract level (and browser level where the
  sandbox allows).
- Area 1 is demonstrated **after the P5-D1 fix**.
- The physically-unverifiable residue (real microphone speech → live
  transcription; audible speaker output) cannot be exercised in this sandbox
  for either path; a human verification on a supported machine remains
  outstanding.
- **Decision: reversible feature flag** (`SAMJUNIORS_VOICE_LEGACY=1` restores
  the SOFIA tab and its exclusive routes verbatim; default off). The old path
  is retired from the default experience, reversibly, until live-audio
  verification on real hardware closes the residue. The exact removal set is
  documented below for the follow-up commit after that verification.

## Removal set (prepared, NOT executed — pending live-audio verification)

Identified and dependency-verified by the Phase 5 recon (worklog Task 5-a):
`src/sofia/**` (35 files, 13,289 lines; sole importer `src/os/App.tsx`), the
`os/App.tsx` SOFIA wiring (~30 lines), exclusive routes `/api/sofia/{stt,health,
img,media,page,file}` + `src/lib/server/page.ts`, static assets
(`public/sofia/avatar-sofia.png`, `public/audio/*`), and the
`r0_route_auth`/`m3_convergence` references. **Must keep:** `/api/sofia/ask`
(canonical typed surface), `/api/sofia/tts` (new-path TTS), `/api/sofia/memory`,
`/api/auth/*`, the live gateway + `executeSophiaTurn` + all
company-context/memory/authorization/approval/audit infrastructure.
Out-of-scope orphans (`/api/realtime/turn`, `/api/tts/*`, `/api/browser/read`)
stay: pinned by their own test suites and governed as separate Founder
decisions (Phase 4 §5/§Risky).

## Capabilities retired with the old path (documented deltas, per approved plan)

The new path intentionally does not carry: wake word, clap-to-wake, hand-gesture
control, camera vision, persona/avatar switching sheet, ambient music, and the
3D holographic entity — all excluded by the approved migration plan (PORT-NOTES
"Excluded by design"). The 13 agreed requirements above do not include them;
the legacy flag restores the full experience while it exists.
