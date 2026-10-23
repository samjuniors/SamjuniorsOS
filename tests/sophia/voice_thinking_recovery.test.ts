/** Regression: provider-side LISTENING must recover from THINKING.
 * Run with: npx tsx tests/sophia/voice_thinking_recovery.test.ts
 */
import assert from 'node:assert/strict';
import { SophiaState } from '../../src/sofia/sophia/SophiaState';

const state = new SophiaState();
state.setState('listening');
state.handleVoiceEvent('thinking', { source: 'elevenlabs' });
assert.equal(state.current, 'thinking', 'a provider may enter Thinking during a request');

state.handleVoiceEvent('listening', { source: 'elevenlabs' });
assert.equal(state.current, 'listening', 'a provider can rearm without a spoken reply');
assert.equal(state.cognitiveState, 'listening');

state.setState('thinking');
state.handleVoiceEvent('response_finished', { source: 'gemini-live' });
assert.equal(state.current, 'completed', 'a silent completed turn settles');

state.setState('thinking');
state.handleVoiceEvent('audio_started', { source: 'gemini-live' });
assert.equal(state.current, 'speaking');
state.handleVoiceEvent('response_finished', { source: 'gemini-live' });
assert.equal(state.current, 'speaking', 'do not settle while playback is active');
state.handleVoiceEvent('playback_finished', { source: 'gemini-live' });
assert.equal(state.current, 'completed');

console.log('PASS: voice Thinking recovery and playback-drain guards');
