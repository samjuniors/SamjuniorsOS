/**
 * Phase 3 Step 4 Regression Test Suite:
 * Wake-Word Ownership, Microphone Coordination, Bounded Recovery & PTT Preservation
 *
 * Verifies:
 * 1. MicrophoneCoordinator single-owner determinism and strict priority preemption.
 * 2. WakeWordSpotter suspension when conversation or push-to-talk holds the mic.
 * 3. Bounded recovery for recognizer errors (prevents infinite restart loops).
 * 4. Permission denial (not-allowed) and unblock semantics.
 * 5. Manual push-to-talk preservation when wake detection is unavailable or blocked.
 * 6. AudioEngine device loss handling (track.onended).
 * 7. Multi-cycle wake/conversation transitions and barge-in preemption.
 */

import { MicrophoneCoordinator, type MicOwner } from '../../src/sofia/sophia/audio/MicrophoneCoordinator';
import { WakeWordSpotter } from '../../src/sofia/sophia/voice/wake';
import { AudioEngine } from '../../src/sofia/sophia/audio/AudioEngine';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runStep4Tests() {
  console.log('\n--- STARTING PHASE 3 STEP 4: WAKE-WORD & MIC COORDINATION SUITE ---');

  // ==========================================================================
  // SECTION 1: Microphone Coordinator Determinism & Priority Preemption
  // ==========================================================================
  console.log('\nSECTION 1: Microphone Coordinator Determinism & Priority Preemption');
  {
    const coordinator = new MicrophoneCoordinator();
    assert(coordinator.currentOwner === 'idle', 'Initial mic owner is idle');

    // 1A. Wake word acquires idle lock
    const wakeAcquired = coordinator.requestOwnership('wake_word', 'start-spotting');
    assert(wakeAcquired === true, 'wake_word acquires ownership from idle');
    assert(coordinator.currentOwner === 'wake_word', 'Current owner is wake_word');

    // 1B. Conversation preempts wake_word
    let wakePreempted = false;
    coordinator.registerPreemptHook('wake_word', (by) => {
      if (by === 'conversation') wakePreempted = true;
    });

    const convAcquired = coordinator.requestOwnership('conversation', 'session-started');
    assert(convAcquired === true, 'conversation preempts wake_word');
    assert(wakePreempted === true, 'wake_word preempt hook was executed');
    assert(coordinator.currentOwner === 'conversation', 'Current owner is conversation');

    // 1C. Wake word CANNOT compete with active conversation
    const wakeRecompete = coordinator.requestOwnership('wake_word', 'try-compete');
    assert(wakeRecompete === false, 'wake_word request is REJECTED while conversation is active');
    assert(coordinator.currentOwner === 'conversation', 'Owner remains conversation');

    // 1D. PTT preempts conversation
    let convPreempted = false;
    coordinator.registerPreemptHook('conversation', (by) => {
      if (by === 'ptt') convPreempted = true;
    });

    const pttAcquired = coordinator.requestOwnership('ptt', 'ptt-button-down');
    assert(pttAcquired === true, 'ptt preempts active conversation');
    assert(convPreempted === true, 'conversation preempt hook was executed');
    assert(coordinator.currentOwner === 'ptt', 'Current owner is ptt');

    // 1E. Wake word CANNOT compete with active PTT
    assert(coordinator.requestOwnership('wake_word') === false, 'wake_word is REJECTED while PTT is active');

    // 1F. PTT release restores conversation
    coordinator.releaseOwnership('ptt', 'ptt-button-up');
    assert(coordinator.currentOwner === 'conversation', 'Releasing PTT restores conversation owner');

    // 1G. Conversation release restores idle
    coordinator.releaseOwnership('conversation', 'session-ended');
    assert(coordinator.currentOwner === 'idle', 'Releasing conversation restores idle owner');

    // 1H. Wake word can now acquire from idle
    assert(coordinator.requestOwnership('wake_word') === true, 'wake_word can now acquire ownership from idle');
    coordinator.releaseOwnership('wake_word');
    assert(coordinator.currentOwner === 'idle', 'Releasing wake_word returns to idle');
  }

  // ==========================================================================
  // SECTION 2: WakeWordSpotter Lifecycle Guarding & Preemption
  // ==========================================================================
  console.log('\nSECTION 2: WakeWordSpotter Lifecycle Guarding & Preemption');
  {
    // Mock SpeechRecognition environment
    class MockSpeechRecognition {
      continuous = true;
      interimResults = true;
      lang = 'en-US';
      maxAlternatives = 3;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      started = false;
      aborted = false;

      start() {
        if (this.started) throw new Error('Already started');
        this.started = true;
      }
      stop() {
        this.started = false;
        this.onend?.();
      }
      abort() {
        this.started = false;
        this.aborted = true;
        this.onend?.();
      }
    }

    const originalSpeechRecognition = (globalThis as any).SpeechRecognition;
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      SpeechRecognition: MockSpeechRecognition,
    };

    try {
      const coordinator = new MicrophoneCoordinator();
      let wakeFired = false;
      const spotter = new WakeWordSpotter(() => { wakeFired = true; }, ['hey sofia'], coordinator);

      // 2A. Normal start claims mic
      spotter.start();
      assert(coordinator.currentOwner === 'wake_word', 'Starting spotter claims wake_word mic ownership');
      assert(spotter.status === 'listening', 'Spotter status is listening');

      // 2B. External conversation preempts spotter
      coordinator.requestOwnership('conversation', 'external-call');
      assert(spotter.status === 'paused', 'Spotter automatically pauses when preempted by conversation');

      // 2C. Conversation finishes -> spotter auto-resumes
      coordinator.releaseOwnership('conversation');
      // Wait for scheduleRestart backoff (150ms)
      await new Promise((r) => setTimeout(r, 200));
      assert(coordinator.currentOwner === 'wake_word', 'Spotter automatically reclaims mic when conversation ends');
      assert(spotter.status === 'listening', 'Spotter status returns to listening');

      // 2D. Wake phrase recognition triggers onWake and yields lock
      const rec = (spotter as any).rec as MockSpeechRecognition;
      assert(rec !== null, 'Recognition instance is active');
      rec.onresult?.({
        resultIndex: 0,
        results: [[{ transcript: 'Hey Sofia' }]],
      });

      assert(wakeFired === true, 'onWake callback fired on phrase detection');
      assert(coordinator.currentOwner === 'idle', 'Spotter yielded mic ownership upon wake detection');
      assert(spotter.status === 'paused', 'Spotter paused upon wake detection');

      spotter.destroy();
    } finally {
      (globalThis as any).SpeechRecognition = originalSpeechRecognition;
      (globalThis as any).window = originalWindow;
    }
  }

  // ==========================================================================
  // SECTION 3: Bounded Error Recovery & Unexpected Termination
  // ==========================================================================
  console.log('\nSECTION 3: Bounded Error Recovery & Unexpected Termination');
  {
    class ErrorProneRecognition {
      continuous = true;
      interimResults = true;
      lang = 'en-US';
      maxAlternatives = 3;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;

      start() {}
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }

    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      SpeechRecognition: ErrorProneRecognition,
    };

    try {
      const coordinator = new MicrophoneCoordinator();
      const spotter = new WakeWordSpotter(() => {}, ['hey sofia'], coordinator);

      // 3A. Normal Chromium no-speech timeout resets errors
      spotter.start();
      const rec1 = (spotter as any).rec as ErrorProneRecognition;
      rec1.onerror?.({ error: 'no-speech' });
      assert(spotter.consecutiveErrors === 0, 'no-speech timeout does NOT count as an error');
      assert(spotter.status === 'listening', 'Status remains listening on no-speech');

      // 3B. Transient hardware/network errors trigger bounded backoff
      rec1.onerror?.({ error: 'audio-capture' });
      assert(spotter.consecutiveErrors === 1, 'audio-capture error increments consecutiveErrors to 1');

      // Trigger 4 more errors to reach max (5)
      for (let i = 2; i <= 5; i++) {
        const currentRec = (spotter as any).rec || rec1;
        currentRec.onerror?.({ error: 'audio-capture' });
      }

      assert(spotter.consecutiveErrors === 5, 'consecutiveErrors reached 5');
      assert(spotter.status === 'error', 'Spotter entered bounded error state');
      assert(coordinator.currentOwner === 'idle', 'Spotter released mic coordinator lock upon error limit');

      // 3C. Error state pauses automatic 200ms restarts
      const preTimer = (spotter as any).restartTimer;
      (spotter as any).rec?.onend?.();
      assert(spotter.status === 'error', 'Does NOT restart automatically while in error state');

      // 3D. Explicit recovery resets error state
      spotter.resetRecovery();
      assert(spotter.consecutiveErrors === 0, 'resetRecovery resets consecutiveErrors to 0');
      assert(spotter.status === 'listening', 'resetRecovery re-arms listening state');

      // 3E. Permission denial (not-allowed) halts restarts immediately
      const rec2 = (spotter as any).rec as ErrorProneRecognition;
      rec2.onerror?.({ error: 'not-allowed' });
      assert(spotter.blocked === true, 'not-allowed error sets blocked = true');
      assert(spotter.status === 'blocked', 'Status becomes blocked');
      assert(coordinator.currentOwner === 'idle', 'Mic lock released upon permission denial');

      // 3F. Unblock restores spotter
      spotter.unblock();
      assert(spotter.blocked === false, 'unblock clears blocked flag');
      assert(spotter.status === 'listening', 'unblock resumes listening');

      spotter.destroy();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  }

  // ==========================================================================
  // SECTION 4: Push-to-Talk Preservation When Wake Detection Unavailable
  // ==========================================================================
  console.log('\nSECTION 4: Push-to-Talk Preservation When Wake Detection Unavailable');
  {
    const originalWindow = (globalThis as any).window;
    // Environment where SpeechRecognition is NOT supported (e.g. Firefox/Node)
    (globalThis as any).window = {};

    try {
      const coordinator = new MicrophoneCoordinator();
      const spotter = new WakeWordSpotter(() => {}, ['hey sofia'], coordinator);

      spotter.start();
      assert(spotter.available === false, 'Spotter recognizes SpeechRecognition is unavailable');
      assert(coordinator.currentOwner === 'idle', 'Mic is not held by unavailable spotter');

      // PTT must be completely unblocked and functional
      const pttGranted = coordinator.requestOwnership('ptt', 'manual-ptt');
      assert(pttGranted === true, 'PTT successfully acquires microphone even without wake detection');
      assert(coordinator.currentOwner === 'ptt', 'Owner is ptt');

      coordinator.releaseOwnership('ptt');
      assert(coordinator.currentOwner === 'idle', 'PTT released back to idle');

      spotter.destroy();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  }

  // ==========================================================================
  // SECTION 5: AudioEngine Device Loss Detection
  // ==========================================================================
  console.log('\nSECTION 5: AudioEngine Device Loss Detection');
  {
    const originalNav = globalThis.navigator;
    const originalAudioContext = (globalThis as any).AudioContext;

    let trackEndedCallback: (() => void) | null = null;
    const mockTrack = {
      kind: 'audio',
      stop: () => {},
      set onended(fn: () => void) { trackEndedCallback = fn; },
      get onended() { return trackEndedCallback; },
    };

    const mockStream = {
      getTracks: () => [mockTrack],
      getAudioTracks: () => [mockTrack],
    };

    (globalThis as any).navigator = {
      mediaDevices: {
        getUserMedia: async () => mockStream,
      },
    };

    class MockAudioContext {
      state = 'running';
      sampleRate = 48000;
      destination = {};
      createMediaStreamSource() { return { connect: () => {} }; }
      createGain() { return { gain: { value: 0 }, connect: () => {} }; }
      createScriptProcessor() {
        return {
          onaudioprocess: null,
          connect: () => {},
          disconnect: () => {},
        };
      }
      async resume() {}
      async close() {}
    }
    (globalThis as any).AudioContext = MockAudioContext;

    try {
      const audio = new AudioEngine();
      let reportedStatus = '';
      let reportedError = '';

      audio.onMicStatus((status, err) => {
        reportedStatus = status;
        if (err) reportedError = err;
      });

      await audio.startCapture();
      assert(audio.capturing === true, 'AudioEngine started capture');
      assert(reportedStatus === 'capturing', 'Reported status is capturing');
      assert(trackEndedCallback !== null, 'Attached onended handler to audio track');

      // Simulate device loss / unplug
      if (trackEndedCallback) {
        (trackEndedCallback as () => void)();
      }

      assert(audio.capturing === false, 'AudioEngine stopped capture on device loss');
      assert(reportedStatus === 'error', 'Reported mic status is error on device loss');
      assert(reportedError.includes('disconnected'), 'Reported honest device loss error message');
    } finally {
      (globalThis as any).navigator = originalNav;
      (globalThis as any).AudioContext = originalAudioContext;
    }
  }
  // ==========================================================================
  // SECTION 6: Multi-Cycle Wake/Conversation Transitions & Barge-in Preemption
  // ==========================================================================
  console.log('\nSECTION 6: Multi-Cycle Wake/Conversation Transitions & Barge-in Preemption');
  {
    class CycleSpeechRecognition {
      continuous = true;
      interimResults = true;
      lang = 'en-US';
      maxAlternatives = 3;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {}
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }

    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = { SpeechRecognition: CycleSpeechRecognition };

    try {
      const coordinator = new MicrophoneCoordinator();
      let wakesCount = 0;
      const spotter = new WakeWordSpotter(() => { wakesCount++; }, ['hey sofia'], coordinator);

      // Cycle 1: Standby -> Wake -> Conversation -> End -> Back to Standby
      spotter.start();
      assert(coordinator.currentOwner === 'wake_word', 'Cycle 1: Spotter acquired mic in standby');

      // Wake word heard
      const rec1 = (spotter as any).rec;
      rec1.onresult?.({ resultIndex: 0, results: [[{ transcript: 'Hey Sofia' }]] });
      assert(wakesCount === 1, 'Cycle 1: Wake fired');
      assert(coordinator.currentOwner === 'idle', 'Cycle 1: Spotter yielded mic lock');

      // System starts active conversation
      const convGranted1 = coordinator.requestOwnership('conversation', 'voice-turn');
      assert(convGranted1 === true, 'Cycle 1: Conversation acquired mic');
      assert(coordinator.currentOwner === 'conversation', 'Cycle 1: Current owner is conversation');

      // Conversation ends
      coordinator.releaseOwnership('conversation');
      assert(coordinator.currentOwner === 'idle', 'Cycle 1: Conversation released to idle');

      // Spotter automatically resumes
      await new Promise((r) => setTimeout(r, 200));
      assert(coordinator.currentOwner === 'wake_word', 'Cycle 1: Spotter cleanly resumed to wake_word');

      // Cycle 2: Barge-in via PTT during active playback/conversation
      (spotter as any).lastFire = 0; // reset 1.8s cooldown to simulate elapsed time
      const rec2 = (spotter as any).rec;
      rec2.onresult?.({ resultIndex: 0, results: [[{ transcript: 'Hey Sofia' }]] });
      assert(wakesCount === 2, 'Cycle 2: Second wake fired');

      coordinator.requestOwnership('conversation', 'turn-2');
      assert(coordinator.currentOwner === 'conversation', 'Cycle 2: Conversation acquired mic');

      // User presses PTT barge-in
      coordinator.requestOwnership('ptt', 'ptt-barge-in');
      assert(coordinator.currentOwner === 'ptt', 'Cycle 2: PTT preempted conversation');

      // User releases PTT
      coordinator.releaseOwnership('ptt');
      assert(coordinator.currentOwner === 'conversation', 'Cycle 2: Mic restored to conversation after PTT release');

      // Conversation deactivates
      coordinator.releaseOwnership('conversation');
      await new Promise((r) => setTimeout(r, 200));
      assert(coordinator.currentOwner === 'wake_word', 'Cycle 2: Spotter cleanly returned to standby');

      spotter.destroy();
      assert(coordinator.currentOwner === 'idle', 'Clean teardown leaves coordinator in idle state');
    } finally {
      (globalThis as any).window = originalWindow;
    }
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n==================================================');
  console.log(`PHASE 3 STEP 4 SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runStep4Tests().catch((err) => {
  console.error('Fatal error in Step 4 test suite:', err);
  process.exit(1);
});
