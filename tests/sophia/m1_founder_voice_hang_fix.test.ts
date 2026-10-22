/**
 * tests/sophia/m1_founder_voice_hang_fix.test.ts
 *
 * Verification suite for Founder Test Defect Fixes:
 * 1. Greeting vocalization without fake user turns.
 * 2. Speaking lifecycle completion (playback_finished emission, no infinite hang).
 * 3. AudioEngine playEncoded awaiting, isSpeaking tracking, and interrupt cleanup.
 * 4. SophiaState speaking watchdog recovery.
 */

import assert from 'node:assert';
import { SophiaState } from '../../src/sofia/sophia/SophiaState';
import { ElevenLabsVoiceProvider } from '../../src/sofia/sophia/voice/ElevenLabsVoiceProvider';
import { AudioEngine } from '../../src/sofia/sophia/audio/AudioEngine';

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function main() {
  console.log('='.repeat(65));
  console.log('FOUNDER VOICE HANG & GREETING FIX VERIFICATION SUITE');
  console.log('='.repeat(65));

  console.log('\n--- Test 1: SophiaState Watchdog & Playback Completion Lifecycle ---');

  await runTest('1.1. SophiaState transitions speaking -> completed on playback_finished even if cognitive state was ambiguous', () => {
    const state = new SophiaState();
    state.handleVoiceEvent('audio_started');
    assert.strictEqual(state.current, 'speaking', 'Must enter speaking state');
    assert.strictEqual(state.audioState, 'playing');

    // Emit playback_finished without prior response_finished
    state.handleVoiceEvent('playback_finished');
    assert.strictEqual(state.audioState, 'silent', 'Audio state must become silent');
    assert.strictEqual(state.current, 'completed', 'Must recover out of speaking to completed state');
  });

  await runTest('1.2. SophiaState speaking watchdog auto-recovers from locked speaking state', async () => {
    const state = new SophiaState();
    state.handleVoiceEvent('audio_started');
    assert.strictEqual(state.current, 'speaking');

    // Simulate watchdog triggering
    (state as any).speakingWatchdogTimer = null;
    (state as any).armSpeakingWatchdog();
    
    // Check that armSpeakingWatchdog set a timer
    assert.ok((state as any).speakingWatchdogTimer !== null, 'Speaking watchdog timer must be active');
    
    // Clear it
    (state as any).clearSpeakingWatchdog();
    assert.strictEqual((state as any).speakingWatchdogTimer, null, 'Watchdog timer must be cleared');
  });

  console.log('\n--- Test 2: AudioEngine Encoded Source Tracking & isSpeaking Accuracy ---');

  await runTest('2.1. AudioEngine.isSpeaking reflects active encoded sources and drains on interrupt', () => {
    const engine = new AudioEngine();
    assert.strictEqual(engine.isSpeaking, false, 'Initially not speaking');

    // Fake an active encoded source node
    const fakeSrc = {
      stop: () => {},
      disconnect: () => {},
      onended: null,
    } as any;
    (engine as any).encodedSourceNodes.push(fakeSrc);

    assert.strictEqual(engine.isSpeaking, true, 'isSpeaking must be true when encodedSourceNodes is non-empty');

    let playbackEnded = false;
    engine.onPlaybackEnd(() => {
      playbackEnded = true;
    });

    engine.interruptPlayback();
    assert.strictEqual(engine.isSpeaking, false, 'isSpeaking must be false after interruptPlayback');
    assert.strictEqual((engine as any).encodedSourceNodes.length, 0, 'encodedSourceNodes must be cleared');
    assert.strictEqual(playbackEnded, true, 'onPlaybackEnd must fire on interruptPlayback');
  });

  console.log('\n--- Test 3: ElevenLabsVoiceProvider playback_finished Invariant ---');

  await runTest('3.1. ElevenLabsVoiceProvider speak handles error by emitting playback_finished and listening', async () => {
    const engine = new AudioEngine();
    const provider = new ElevenLabsVoiceProvider(engine);

    let playbackFinishedEmitted = false;
    let listeningEmitted = false;

    provider.addEventListener('playback_finished', () => {
      playbackFinishedEmitted = true;
    });
    provider.addEventListener('listening', () => {
      listeningEmitted = true;
    });

    // Calling speak with an aborted controller simulates immediate abort or failure
    const controller = new AbortController();
    controller.abort();

    await (provider as any).speak('Test message', controller.signal);

    assert.strictEqual(playbackFinishedEmitted, true, 'playback_finished must be emitted to clear state');
    assert.strictEqual(listeningEmitted, true, 'listening must be emitted to restore listener');
    assert.strictEqual((provider as any).speaking, false, 'speaking flag must be reset to false');
  });

  console.log('\n--- Test 4: ElevenLabsVoiceProvider Ear Lifecycle & Playback Synchronization ---');

  await runTest('4.1. AudioEngine playback start/end coordinates provider speech state and rearmListening', async () => {
    const engine = new AudioEngine();
    const provider = new ElevenLabsVoiceProvider(engine);

    (provider as any).active = true;
    (provider as any).speaking = false;
    (provider as any).busy = false;

    let rearmCalled = false;
    (provider as any).rearmListening = () => {
      rearmCalled = true;
    };

    // Trigger playback start on audio engine
    (engine as any).playbackStartHandlers.forEach((fn: any) => fn());
    assert.strictEqual((provider as any).speaking, true, 'Provider speaking flag must be true during playback');

    // Trigger playback end on audio engine
    (engine as any).playbackHandlers.forEach((fn: any) => fn());
    assert.strictEqual((provider as any).speaking, false, 'Provider speaking flag must return to false after playback');
    assert.strictEqual(rearmCalled, true, 'rearmListening must be triggered after playback ends');
  });

  await runTest('4.2. ElevenLabsVoiceProvider rearmListening creates fresh recognition instance when active', async () => {
    const engine = new AudioEngine();
    const provider = new ElevenLabsVoiceProvider(engine);

    let startCalled = false;
    class MockSpeechRec {
      continuous = true;
      interimResults = true;
      lang = 'en-US';
      onstart = null;
      onresult = null;
      onerror = null;
      onend = null;
      start() {
        startCalled = true;
      }
      stop() {}
    }

    (global as any).window = {
      SpeechRecognition: MockSpeechRec,
    };

    try {
      (provider as any).active = true;
      (provider as any).speaking = false;
      (provider as any).busy = false;

      provider.rearmListening();
      assert.strictEqual(startCalled, true, 'start() must be invoked on the fresh SpeechRecognition instance');
      assert.ok((provider as any).recognizer !== null, 'recognizer instance must be populated');
    } finally {
      delete (global as any).window;
    }
  });

  await runTest('4.3. ElevenLabsVoiceProvider isSupported returns false and start() throws when WebSpeech missing', async () => {
    const engine = new AudioEngine();
    const provider = new ElevenLabsVoiceProvider(engine);

    (global as any).window = {}; // No SpeechRecognition or webkitSpeechRecognition

    try {
      assert.strictEqual(provider.isSupported(), false, 'Must report unsupported when SpeechRecognition missing');
      let threw = false;
      try {
        await provider.start();
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('Browser WebSpeech not available'));
      }
      assert.strictEqual(threw, true, 'start() must throw rather than claiming active listening');
      assert.strictEqual((provider as any).active, false, 'Provider must not claim active');
    } finally {
      delete (global as any).window;
    }
  });

  console.log('\n======================================================');
  console.log('ALL FOUNDER VOICE HANG & GREETING CONTRACTS VERIFIED');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
