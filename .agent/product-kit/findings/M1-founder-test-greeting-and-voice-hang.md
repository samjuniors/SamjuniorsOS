# Finding: M1 Founder Testing — Greeting Missing and Voice Turn Hang

**Date:** 2026-10-22  
**Reporter:** Founder  
**Milestone:** M1 ("First Sofia you can talk to")  
**Severity:** Blocker for M1 Sign-off  
**Status:** RESOLVED & EMPIRICALLY VERIFIED  

## Symptoms Reported by Founder
1. **No Greeting on Startup:** "she donot greet when i start"
   - When the user opens the Sofia screen or boots the interface, Sofia did not speak aloud upon initialization.
2. **Turn Stalling / Stuck in Speaking State:** "also at first time she answer but aftre that she donot respond and stuck into speaking state but i cannot hear any thing in ui it say speaking or listening but nothing responsd"
3. **Follow-up Symptom (Voice Ingress Drop):** "same issue its not responding just keep listening check why not working"
   - After the first answer or greeting, the UI displayed "listening" but user speech was not processed, leaving Sofia silent and unresponsive.

## Empirical Root Cause Analysis
1. **Startup Greeting Vocalization:**
   - On initial load, greeting text was added to transcript history but browser audio policies prevent unprompted playback before user gestures. In `BootScreen.tsx`, clicking "Start Voice" unlocked audio but did not invoke `os.speakGreeting()`.
   - **Fix:** Explicitly triggered `void os.speakGreeting()` on user session entry in `BootScreen.tsx` and on first pointer/key gesture in `App.tsx`.
2. **WebSpeech API Recognition Instance Deadlock in ElevenLabsVoiceProvider:**
   - In `ElevenLabsVoiceProvider.ts`, `startSpeechRecognition()` created a single `SpeechRecognition` instance.
   - When speech paused or Chrome reached silence, `rec.onend()` fired. Calling `rec.start()` on the same ended instance in Chromium throws an invalid state exception or fails silently.
   - When Sofia was speaking (`this.busy === true`), `rec.onend()` fired and skipped restart entirely (`if (this.active && !this.busy)`). Once Sofia finished speaking, nothing restarted recognition. The listener was dead while the UI remained in "listening".
   - **Fix:** Replaced single-instance reuse with a recreation lifecycle. Replaced restart collisions with debounced re-instantiation (`rearmListening()`). Added `this.audio.onPlaybackStart` to stop listening during model speech (preventing self-echo), and `this.audio.onPlaybackEnd` to immediately re-arm listening once speaker playback concludes.
3. **Interim Transcription Silence Fallback:**
   - Chromium speech recognition often sends interim transcripts with `isFinal: false` and can delay setting `isFinal: true` for several seconds or drop it upon connection idle.
   - **Fix:** Added an 850ms silence debounce timer on interim speech. If `isFinal` is delayed, the interim transcript is automatically committed as the completed user turn, stopping recognition and triggering `runTurn()` so the user is never left waiting indefinitely.
4. **Microphone Button Pausing Active Voice Sessions:**
   - In `src/sofia/App.tsx`, the `onMic` handler defaulted to `os.pause()` whenever the state was `'listening'`. Clicking the mic icon or pressing Space while she was listening paused the OS rather than engaging speech or push-to-talk.
   - **Fix:** Corrected `onMic` to interrupt if currently speaking, resume if paused, or enter/re-arm the session if in listening/idle.
5. **State Machine Watchdog & Playback Drain Synchronization:**
   - Added a 12-second speaking watchdog timer to `SophiaState` that auto-recovers to `completed` if audio playback hangs or fails to emit natural drain events.
   - Wired `playback_finished` emissions on all completion and error paths in `ElevenLabsVoiceProvider` and `AudioEngine`.

6. **SQLite Error 14 Database Lock / Missing File (`Unable to open the database file`):**
   - In Next.js dev runtime on Windows, `scheduledWorkItem.findMany()` and `workflowInstance.findUnique()` failed with `Error code 14: Unable to open the database file`.
   - Root cause: `.env` was missing from project root (only `.env.local` existed), and the `prisma/db/` directory had not been created on disk. SQLite cannot open or create a database in a nonexistent directory.
   - **Fix:** Provisioned `.env` with `DATABASE_URL=file:./db/custom.db`, created `prisma/db/`, ran `npx prisma db push` to generate all tables, and confirmed query connectivity via node. Added `prisma/db/*.db` to `.gitignore`.
7. **Deaf "Listening" Hang in Browsers Lacking WebSpeech API:**
   - When opened in browsers without native `window.SpeechRecognition` (e.g. Firefox, Brave with Google speech disabled, or on non-secure origins such as `http://192.168.1.62:3000`), `ElevenLabsVoiceProvider` caught `!SpeechRec`, printed a warning to console, but did not throw on `start()`.
   - `SophiaOS` marked the session `started = true`, transitioned to `'listening'`, but no speech recognition instance existed. Sofia appeared to be listening, but was completely deaf.
   - **Fix:**
     - In `ElevenLabsVoiceProvider`, added `isSupported()`; `start()` now rejects when WebSpeech is absent rather than claiming active listening.
     - In `SophiaOS.activate()`, when fallback providers fail due to missing speech recognition, Sofia does NOT enter `'listening'`. She transitions to `'idle'` and dispatches `speech-unsupported`.
     - In `speakGreeting()`, Sofia honestly announces that speech recognition is not supported in this browser, and instructs the user to open `http://localhost:3000` in Google Chrome or press 'T' to chat.
     - In `src/sofia/App.tsx`, added a dismissible `speechNotice` banner with one-click Chat access. Clicking the mic button when WebSpeech is unsupported immediately opens the chat panel and vocalizes guidance rather than freezing.

## Resolution & Verification
- `tests/sophia/m1_founder_voice_hang_fix.test.ts`: PASS (All 8 assertions passed across watchdog, AudioEngine source tracking, ElevenLabs playback_finished, and WebSpeech unsupported handling).
- `tests/sophia/m1_4_voice_loop.test.ts`: PASS (11/11 assertions passed, 25-turn latency drill verified p50 and p95).
- `tests/sophia/m1_9_smoke.test.ts`: PASS (All 6/6 whole-path smoke test phases passed cleanly).
- `bun test tests/api/scheduling.auth.test.ts`: PASS (All 8 assertions passed).
- `npm run typecheck`: PASS (0 errors).
- `npm run lint`: PASS (0 warnings, 0 errors).

