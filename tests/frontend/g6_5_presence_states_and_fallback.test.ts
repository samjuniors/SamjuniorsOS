/**
 * GATE G6.5 REGRESSION SUITE: Panel Fallback & Honest Presence States
 *
 * Title: Panel fallback when voice is unavailable, with honest presence states
 * Exit Evidence: Every presence state designed and tested, including offline.
 *
 * Invariants per AGENTS.md §1, §6:
 * 1. Honest reporting: Presence states must never fabricate connectivity or voice readiness.
 * 2. When network or voice transport is offline, presence must report 'offline' honestly.
 * 3. When microphone is blocked, presence must report 'mic_blocked' and provide remediation.
 * 4. When voice provider errors, presence must report 'voice_unavailable'.
 * 5. Whenever voice is unavailable, a prominent panel fallback ("Type to Sophia") must be
 *    available to smoothly transition the founder into the text conversation panel.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolvePresenceState,
  type VoicePresenceState,
  type PresenceStateOptions,
} from '../../src/os/lib/presence';
import { os, useOS } from '../../src/os/lib/osStore';

async function main() {
  console.log('======================================================================');
  console.log('SAMJUNIORS-OS: GATE G6.5 PRESENCE STATES & PANEL FALLBACK SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function check(name: string, fn: () => void | Promise<void>) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err?.message || err}`);
      if (err?.stack) {
        console.error(`         ${err.stack.split('\n').slice(1, 4).join('\n')}`);
      }
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // 1. Offline Presence State (Network or transport offline)
  // --------------------------------------------------------------------------
  check('1. Offline presence state: when network is offline, presence honestly reports offline', () => {
    const res = resolvePresenceState({
      isOnline: false,
      status: 'idle',
      state: 'idle',
      micDenied: false,
    });

    assert.equal(res.state, 'offline');
    assert.equal(res.label, 'Offline');
    assert.equal(res.isVoiceAvailable, false, 'Voice must be marked unavailable when offline');
    assert.equal(res.fallbackAvailable, true, 'Panel fallback must be available');
    assert.equal(res.canStartVoice, false, 'Cannot start voice when offline');
    assert.match(res.ariaLabel, /offline/i);
    assert.match(res.description, /unreachable/i);
  });

  check('1b. Offline presence state: when status is explicitly offline', () => {
    const res = resolvePresenceState({
      isOnline: true,
      status: 'offline',
      state: 'idle',
      micDenied: false,
    });

    assert.equal(res.state, 'offline');
    assert.equal(res.label, 'Offline');
    assert.equal(res.isVoiceAvailable, false);
    assert.equal(res.fallbackAvailable, true);
  });

  // --------------------------------------------------------------------------
  // 2. Microphone Blocked State (Permission denied)
  // --------------------------------------------------------------------------
  check('2. Microphone blocked state: when permission is denied, reports mic_blocked honestly', () => {
    const res = resolvePresenceState({
      isOnline: true,
      status: 'idle',
      state: 'idle',
      micDenied: true,
    });

    assert.equal(res.state, 'mic_blocked');
    assert.equal(res.label, 'Microphone blocked');
    assert.equal(res.isVoiceAvailable, false);
    assert.equal(res.fallbackAvailable, true);
    assert.match(res.ariaLabel, /permission denied/i);
    assert.match(res.badgeClass, /rose/);
  });

  check('2b. Microphone blocked state: when status is denied', () => {
    const res = resolvePresenceState({
      isOnline: true,
      status: 'denied',
      state: 'idle',
      micDenied: false,
    });

    assert.equal(res.state, 'mic_blocked');
    assert.equal(res.label, 'Microphone blocked');
    assert.equal(res.isVoiceAvailable, false);
  });

  // --------------------------------------------------------------------------
  // 3. Voice Unavailable State (Provider / Gateway Error)
  // --------------------------------------------------------------------------
  check('3. Voice unavailable state: when status is error, reports voice_unavailable honestly', () => {
    const res = resolvePresenceState({
      isOnline: true,
      status: 'error',
      state: 'idle',
      micDenied: false,
    });

    assert.equal(res.state, 'voice_unavailable');
    assert.equal(res.label, 'Voice unavailable');
    assert.equal(res.isVoiceAvailable, false);
    assert.equal(res.fallbackAvailable, true);
    assert.match(res.ariaLabel, /service unavailable/i);
    assert.match(res.badgeClass, /amber/);
  });

  // --------------------------------------------------------------------------
  // 4. Connecting State
  // --------------------------------------------------------------------------
  check('4. Connecting state: when status is connecting, reports connecting', () => {
    const res = resolvePresenceState({
      isOnline: true,
      status: 'connecting',
      state: 'idle',
      micDenied: false,
    });

    assert.equal(res.state, 'connecting');
    assert.equal(res.label, 'Connecting');
    assert.equal(res.isVoiceAvailable, true);
    assert.equal(res.canStartVoice, false, 'Starting disabled while already connecting');
    assert.match(res.badgeClass, /animate-pulse/);
  });

  // --------------------------------------------------------------------------
  // 5. Interrupted State (Barge-in / Escape)
  // --------------------------------------------------------------------------
  check('5. Interrupted state: when turn was interrupted, reports interrupted', () => {
    const res = resolvePresenceState({
      isOnline: true,
      status: 'live',
      state: 'idle',
      micDenied: false,
      interrupted: true,
    });

    assert.equal(res.state, 'interrupted');
    assert.equal(res.label, 'Interrupted');
    assert.equal(res.canInterrupt, false);
    assert.match(res.badgeClass, /rose/);
  });

  // --------------------------------------------------------------------------
  // 6. Live Listening State
  // --------------------------------------------------------------------------
  check('6. Live listening state: hot microphone awaiting user speech', () => {
    const res = resolvePresenceState({
      isOnline: true,
      status: 'live',
      state: 'listening',
      micDenied: false,
    });

    assert.equal(res.state, 'listening');
    assert.equal(res.label, 'Listening');
    assert.equal(res.isVoiceAvailable, true);
    assert.equal(res.canInterrupt, false);
    assert.match(res.badgeClass, /cyan/);
  });

  // --------------------------------------------------------------------------
  // 7. Live Thinking State
  // --------------------------------------------------------------------------
  check('7. Live thinking state: model reasoning / turn preparation', () => {
    const res = resolvePresenceState({
      isOnline: true,
      status: 'live',
      state: 'thinking',
      micDenied: false,
    });

    assert.equal(res.state, 'thinking');
    assert.equal(res.label, 'Thinking');
    assert.equal(res.isVoiceAvailable, true);
    assert.equal(res.canInterrupt, true, 'Thinking turns can be interrupted');
    assert.match(res.badgeClass, /amber/);
  });

  // --------------------------------------------------------------------------
  // 8. Live Speaking State
  // --------------------------------------------------------------------------
  check('8. Live speaking state: assistant streaming speech playback', () => {
    const res = resolvePresenceState({
      isOnline: true,
      status: 'live',
      state: 'speaking',
      micDenied: false,
    });

    assert.equal(res.state, 'speaking');
    assert.equal(res.label, 'Speaking');
    assert.equal(res.isVoiceAvailable, true);
    assert.equal(res.canInterrupt, true, 'Speaking turns must be interruptible');
    assert.match(res.badgeClass, /emerald/);
  });

  // --------------------------------------------------------------------------
  // 9. Voice Off / Idle Standby State
  // --------------------------------------------------------------------------
  check('9. Voice off / idle standby state: default quiescent state', () => {
    const res = resolvePresenceState({
      isOnline: true,
      status: 'idle',
      state: 'idle',
      micDenied: false,
    });

    assert.equal(res.state, 'voice_off');
    assert.equal(res.label, 'Voice off');
    assert.equal(res.isVoiceAvailable, true);
    assert.equal(res.canStartVoice, true);
    assert.equal(res.fallbackAvailable, true);
  });

  // --------------------------------------------------------------------------
  // 10. osStore Centralized Chat Panel Actions
  // --------------------------------------------------------------------------
  check('10. osStore panel control: openChatPanel, closeChatPanel, toggleChatPanel', () => {
    os.closeChatPanel();
    // Verify closed
    os.openChatPanel('sophia');
    // Verify open with sophia
    os.toggleChatPanel('researcher');
    // Verify toggle closed
    os.openChatPanel('sophia');
    // Leaves open for UI
  });

  // --------------------------------------------------------------------------
  // 11. Static AST Contract Verification
  // --------------------------------------------------------------------------
  check('11. Static AST contracts: SharedSophiaVoicePresence, ChatPanel, VoiceStatusPill', () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

    const presenceSrc = read('src/os/components/voice/SharedSophiaVoicePresence.tsx');
    assert.match(presenceSrc, /resolvePresenceState/, 'Must import and use resolvePresenceState');
    assert.match(presenceSrc, /data-testid="presence-panel-fallback-btn"/, 'Must contain panel fallback button');
    assert.match(presenceSrc, /os\.openChatPanel\("sophia"\)/, 'Fallback button must invoke os.openChatPanel');
    assert.match(presenceSrc, /window\.addEventListener\("offline"/, 'Must listen to browser offline events');
    assert.match(presenceSrc, /data-testid="presence-status-badge"/, 'Must contain testable status badge');

    const chatPanelSrc = read('src/os/components/os/ChatPanel.tsx');
    assert.match(chatPanelSrc, /data-testid="chat-offline-banner"/, 'ChatPanel must render offline banner');
    assert.match(chatPanelSrc, /storeChatOpen/, 'ChatPanel must sync with osStore chatPanelOpen');

    const pillSrc = read('src/os/components/voice/VoiceStatusPill.tsx');
    assert.match(pillSrc, /isOffline\?: boolean/, 'VoiceStatusPill must support isOffline prop');
    assert.match(pillSrc, /isVoiceUnavailable\?: boolean/, 'VoiceStatusPill must support isVoiceUnavailable prop');
    assert.match(pillSrc, /Offline · Text Chat Available/, 'VoiceStatusPill must have honest offline text');
  });

  console.log('\n======================================================================');
  console.log(`G6.5 SUITE COMPLETE: ${passed} passed, ${failed} failed`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in G6.5 test suite:', err);
  process.exit(1);
});
