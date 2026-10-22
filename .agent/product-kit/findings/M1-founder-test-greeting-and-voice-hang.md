# Finding: M1 Founder Testing — Greeting Missing and Voice Turn Hang

**Date:** 2026-10-22  
**Reporter:** Founder  
**Milestone:** M1 ("First Sofia you can talk to")  
**Severity:** Blocker for M1 Sign-off  

## Symptoms Reported by Founder
1. **No Greeting on Startup:** "she donot greet when i start"
   - When the user opens the Sofia screen or boots the interface, Sofia does not provide an audible greeting or speak upon initialization.
2. **Turn Stalling / Stuck in Speaking State:** "also at first time she answer but aftre that she donot respond and stuck into speaking state but i cannot hear any thing in ui it say speaking or listening but nothing responsd"
   - On the first turn, Sofia may answer or generate text, but on subsequent turns Sofia stops responding.
   - Sofia gets stuck in the `'speaking'` state (or flips between speaking/listening with no audio output).
   - Audio cannot be heard and user input is blocked or ignored because the system believes playback is ongoing or state machine has locked.

## Root Cause Hypotheses to Investigate & Fix
1. **Greeting Audio Execution:**
   - In `src/sofia/App.tsx`, greeting fetch adds text turn into transcript via `controlLayer.addSophiaTurn`, but does not invoke speech synthesis or audio playback when unlocked.
   - Browser audio policies require a user gesture to resume `AudioContext`. If the user has clicked/interacted, greeting audio needs to be synthesized via `/api/sophia/mouth/speak` or voice provider and played through `AudioEngine`.
2. **Voice Turn Hang & State Machine Deadlock:**
   - In `LiveGatewayVoiceProvider` or `SophiaOS.ts`, if audio playback ends, errors, returns empty chunks, or if `AudioEngine` finishes without firing `playback_finished`, `SophiaState` remains permanently in `speaking`.
   - While `this.state.is('speaking')`, subsequent microphone inputs or incoming turns are blocked or interrupted.
   - Missing watchdog/timeout: If `speaking` state is active but no audio is actually rendering after a safety threshold, it should automatically drain and transition back to `listening`/`idle`.
   - Provider fallback / selection: If `gemini-live` or WebSocket connection encounters an issue or drains silently, failure to reset `isSpeaking = false` in a `finally` block locks the loop.

## Resolution Plan
1. Inspect `src/sofia/App.tsx`, `src/sofia/sophia/SophiaOS.ts`, `src/sofia/providers/LiveGatewayVoiceProvider.ts`, `src/sofia/audio/AudioEngine.ts`, and `src/sofia/providers/GeminiLiveProvider.ts`.
2. Ensure greeting speaks aloud when user interacts or audio context unlocks.
3. Fix the state transition and playback completion lifecycle with robust error handling and watchdog timer.
4. Verify with automated tests and local dev server.
