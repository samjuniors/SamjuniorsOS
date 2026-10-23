/** Regression check: both tabs use one SofiaOS conversation/audio runtime. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LiveTicketStore } from '../../src/lib/server/live/ticket-store';
import type { AuthenticatedFounder } from '../../src/lib/server/auth/session';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const shell = read('src/os/App.tsx');
const shared = read('src/os/components/voice/SharedSophiaVoicePresence.tsx');
const sofiaApp = read('src/sofia/App.tsx');

assert.match(shell, /<SharedSophiaVoicePresence\s*\/>/);
assert.doesNotMatch(shell, /<LiveTranscriptRibbon\s*\/>/);
assert.doesNotMatch(shell, /<VoicePresence\s*\/>/);
assert.match(shared, /getSophiaOS\(\)/);
assert.match(shared, /enterSession\("mic-button"\)/);
assert.doesNotMatch(shared, /new SophiaLiveClient|startPtt\(|stopPtt\(/);
assert.doesNotMatch(sofiaApp, /if \(!os\.hasVoiceRecognition\)/);

const founder: AuthenticatedFounder = {
  userId: 'voice-test-founder', email: 'founder@example.test',
  name: 'Founder', role: 'FOUNDER', isVerified: true,
};
const store = LiveTicketStore.getInstance();
const oldSecret = process.env.LIVE_WS_TICKET_SECRET;
try {
  process.env.LIVE_WS_TICKET_SECRET = 'a-unique-32-byte-test-secret-for-websockets';
  store.clear();
  const ticket = store.issueTicket(founder, 'conv-1');
  assert.match(ticket, /^ws_live_v2\./);
  assert.deepEqual(store.consumeTicket(ticket), { founder, conversationId: 'conv-1' });
  assert.equal(store.consumeTicket(ticket), null, 'signed ticket must be single-use');
  const tampered = ticket.slice(0, -2) + (ticket.endsWith('A') ? 'B' : 'A') + ticket.slice(-1);
  assert.equal(store.consumeTicket(tampered), null, 'signed ticket must reject tampering');
  const another = store.issueTicket(founder);
  process.env.LIVE_WS_TICKET_SECRET = 'another-32-byte-test-secret-for-websockets';
  assert.equal(store.consumeTicket(another), null, 'wrong signing key must fail');
  delete process.env.LIVE_WS_TICKET_SECRET;
  const legacy = store.issueTicket(founder);
  assert.deepEqual(store.consumeTicket(legacy), { founder, conversationId: undefined });
  assert.equal(store.consumeTicket(legacy), null);
} finally {
  store.clear();
  if (oldSecret === undefined) delete process.env.LIVE_WS_TICKET_SECRET;
  else process.env.LIVE_WS_TICKET_SECRET = oldSecret;
}
console.log('Shared SofiaOS voice and WS ticket contract: PASS');
