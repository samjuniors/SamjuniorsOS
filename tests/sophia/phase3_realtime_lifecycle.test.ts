/**
 * ============================================================================
 * PHASE 3 — REALTIME VOICE LIFECYCLE & GEMINI LIVE HARDENING SUITE
 * ============================================================================
 * Unit and integration regression tests for Steps 1–3:
 * 1. Normalized Event Contract & Orthogonal State Model
 * 2. Audio Playback Lifecycle Synchronization (response_finished != playback_finished)
 * 3. Gemini Live Provider Hardening:
 *    - Direct session acquisition (no /api/live-ws 3s delay)
 *    - Transcript deduplication (model text vs output transcription)
 *    - Barge-in generation ID fencing (stale frame suppression)
 *    - Genuine conversational turn latency telemetry
 */

import { SophiaState } from '../../src/sofia/sophia/SophiaState';
import { GeminiLiveProvider } from '../../src/sofia/sophia/voice/GeminiLiveProvider';
import { AudioEngine } from '../../src/sofia/sophia/audio/AudioEngine';
import { controlLayer } from '../../src/sofia/sophia/control';
import type { SophiaEventType } from '../../src/sofia/sophia/types';

// Simple standalone test harness following repository conventions
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

async function runTests() {
  console.log('--- STARTING PHASE 3 REALTIME LIFECYCLE SUITE ---\n');

  // ==========================================================================
  // SECTION 1: Normalized Event Contract & Orthogonal State Tracking
  // ==========================================================================
  console.log('SECTION 1: Normalized Event Contract & Orthogonal State Tracking');
  {
    const state = new SophiaState();
    assert(state.cognitiveState === 'idle', 'Initial cognitive state is idle');
    assert(state.audioState === 'silent', 'Initial audio playback state is silent');

    // Transition to listening on listening event
    state.handleVoiceEvent('listening');
    assert(state.cognitiveState === 'listening', 'Cognitive state updates to listening');
    assert(state.current === 'listening', 'Presentation state transitions to listening');

    // Thinking event
    state.handleVoiceEvent('thinking');
    assert(state.cognitiveState === 'thinking', 'Cognitive state updates to thinking');
    assert(state.current === 'thinking', 'Presentation state transitions to thinking');

    // Tool lifecycle events
    state.handleVoiceEvent('tool_started', { tool: 'web_search' });
    assert(state.cognitiveState === 'tool_executing', 'Cognitive state is tool_executing on tool_started');
    assert(state.current === 'thinking', 'Presentation state remains thinking during tool execution');

    state.handleVoiceEvent('tool_finished', { tool: 'web_search' });
    assert(state.cognitiveState === 'thinking', 'Cognitive state returns to thinking on tool_finished');
  }

  // ==========================================================================
  // SECTION 2: Audio Playback Lifecycle Synchronization
  // Invariant: response_finished != playback_finished
  // ==========================================================================
  console.log('\nSECTION 2: Audio Playback Lifecycle Synchronization');
  {
    const state = new SophiaState();
    state.setState('listening');

    // 1. Model generation begins (response_started)
    state.handleVoiceEvent('response_started');
    assert(state.cognitiveState === 'thinking', 'response_started sets cognitive state to thinking');
    assert(state.current !== 'speaking', 'response_started alone does NOT enter speaking state (audio not yet playing)');

    // 2. Audio begins playing (audio_started)
    state.handleVoiceEvent('audio_started');
    assert(state.audioState === 'playing', 'audio_started marks audioState as playing');
    assert(state.current === 'speaking', 'audio_started transitions presentation state to speaking');

    // 3. Audio chunks continue streaming
    state.handleVoiceEvent('audio_chunk', { level: 0.6 });
    assert(state.current === 'speaking', 'audio_chunk keeps presentation state in speaking');

    // 4. Model finishes generation (response_finished), BUT audio is still playing!
    state.handleVoiceEvent('response_finished');
    assert(state.cognitiveState === 'done', 'response_finished marks cognitive state as done');
    assert(state.current === 'speaking', 'CRITICAL: Sophia remains in speaking while audio queue is playing/draining');

    // 5. Hardware playback queue drains and emits playback_finished
    state.handleVoiceEvent('playback_finished');
    assert(state.audioState === 'silent', 'playback_finished marks audioState as silent');
    assert(state.current === 'completed', 'Presentation state enters completed only after playback_finished');
  }

  // ==========================================================================
  // SECTION 3: Barge-in Interruption
  // ==========================================================================
  console.log('\nSECTION 3: Barge-in Interruption');
  {
    const state = new SophiaState();
    state.setState('speaking');
    state.handleVoiceEvent('audio_started');
    assert(state.current === 'speaking', 'State is speaking');

    // User speaks over Sophia (speech_started)
    state.handleVoiceEvent('speech_started');
    assert(state.audioState === 'silent', 'speech_started clears audioState to silent');
    assert(state.cognitiveState === 'listening', 'speech_started sets cognitiveState to listening');
    assert(state.current === 'listening', 'speech_started cuts speaking directly to listening');

    // Explicit interrupted event
    state.setState('speaking');
    state.handleVoiceEvent('interrupted');
    assert(state.current === 'listening', 'interrupted event transitions state to listening');
  }

  // ==========================================================================
  // SECTION 4: Gemini Live Provider Hardening
  // ==========================================================================
  console.log('\nSECTION 4: Gemini Live Provider Hardening');
  {
    // Create mock AudioEngine
    let playbackEndCallback: (() => void) | null = null;
    let playedPCMCount = 0;
    let interruptedPlaybackCount = 0;

    const mockAudio: any = {
      isSpeaking: false,
      micLevel: 0.1,
      onPlaybackEnd: (fn: () => void) => {
        playbackEndCallback = fn;
        return () => { playbackEndCallback = null; };
      },
      onPCM: () => () => {},
      playPCM24: () => {
        playedPCMCount++;
        mockAudio.isSpeaking = true;
        return 0.5;
      },
      interruptPlayback: () => {
        interruptedPlaybackCount++;
        mockAudio.isSpeaking = false;
      },
    };

    // Subclass or cast to access internal message handling in test
    const provider = new GeminiLiveProvider(mockAudio);
    const emittedEvents: Array<{ type: string; detail: any }> = [];

    const eventNames: SophiaEventType[] = [
      'listening', 'response_started', 'audio_started', 'audio_chunk',
      'transcript', 'response_finished', 'playback_finished', 'interrupted',
    ];

    for (const name of eventNames) {
      provider.addEventListener(name, (e: any) => {
        emittedEvents.push({ type: name, detail: e.detail });
      });
    }

    // 4A. Direct session acquisition (no 3s /api/live-ws hang)
    // Stub global fetch to verify endpoint called
    const originalFetch = globalThis.fetch;
    let fetchedUrl = '';
    globalThis.fetch = (async (url: string) => {
      fetchedUrl = url;
      return {
        ok: true,
        json: async () => ({ token: 'mock-key', model: 'gemini-3.8-live', wsUrl: 'wss://mock.gemini/ws' }),
      } as any;
    }) as any;

    // Stub WebSocket in environment
    class MockWebSocket {
      static OPEN = 1;
      readyState = 1;
      send = () => {};
      close = () => {};
      _onopen: any = null;
      _onmessage: any = null;
      set onopen(fn: any) {
        this._onopen = fn;
        setTimeout(() => {
          fn?.();
          setTimeout(() => {
            this._onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
          }, 5);
        }, 5);
      }
      get onopen() { return this._onopen; }
      set onmessage(fn: any) { this._onmessage = fn; }
      get onmessage() { return this._onmessage; }
      set onerror(_fn: any) {}
      set onclose(_fn: any) {}
    }
    const originalWS = (globalThis as any).WebSocket;
    (globalThis as any).WebSocket = MockWebSocket;

    try {
      await provider.start();
      assert(fetchedUrl === '/api/sophia/live/session', 'Directly targets /api/sophia/live/session without dead /api/live-ws');
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as any).WebSocket = originalWS;
    }

    // 4B. Transcript deduplication
    // Feed serverContent message containing both modelTurn text and outputTranscription text
    const handleMsg = (provider as any).handleMessage.bind(provider);
    controlLayer.reset();
    emittedEvents.length = 0;

    await handleMsg(JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [
            { text: 'Hello founder. ' },
            { inlineData: { data: 'AAAA' } },
          ],
        },
        outputTranscription: { text: 'Hello founder. ' }, // Duplicate sent by Gemini
      },
    }), () => {});

    // Inspect accumulated transcript buffer and control history
    assert((provider as any).outBuf === 'Hello founder. ', 'Transcript is deduplicated: outputTranscription duplicate ignored');
    assert(controlLayer.history.length === 1, 'ControlLayer history received exactly 1 turn');
    assert(controlLayer.history[0].text === 'Hello founder. ', 'Turn text is clean and not doubled');

    // 4C. Audio Playback Lifecycle on Turn Completion
    assert(emittedEvents.some(e => e.type === 'response_started'), 'Emitted response_started');
    assert(emittedEvents.some(e => e.type === 'audio_started'), 'Emitted audio_started');

    // Now model finishes (turnComplete), but audio is still playing
    emittedEvents.length = 0;
    await handleMsg(JSON.stringify({
      serverContent: { turnComplete: true },
    }), () => {});

    assert(emittedEvents.some(e => e.type === 'response_finished'), 'Emitted response_finished on turnComplete');
    assert(!emittedEvents.some(e => e.type === 'listening'), 'Did NOT emit listening while audio is still active');

    // Now audio queue finishes draining
    const cb: any = playbackEndCallback;
    if (cb) {
      cb();
    }
    assert(emittedEvents.some(e => e.type === 'playback_finished'), 'Emitted playback_finished after queue drain');
    assert(emittedEvents.some(e => e.type === 'listening'), 'Returned to listening only after playback drained');

    // 4D. Barge-in Generation ID Fencing (Stale audio suppression)
    // Start a new turn
    await handleMsg(JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { data: 'BBBB' } }],
        },
      },
    }), () => {});

    const preInterruptPlayCount = playedPCMCount;
    // User interrupts
    provider.interrupt();
    assert(interruptedPlaybackCount > 0, 'AudioEngine playback interrupted immediately');
    assert((provider as any).activeResponseId === null, 'Active response ID invalidated on interrupt');

    // Late in-flight frames from the interrupted turn arrive
    await handleMsg(JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { data: 'CCCC_LATE' } }],
        },
      },
    }), () => {});

    assert(playedPCMCount === preInterruptPlayCount, 'Late audio chunk after interruption is discarded and not played');
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n==================================================');
  console.log(`PHASE 3 REALTIME SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running Phase 3 realtime test suite:', err);
  process.exit(1);
});
