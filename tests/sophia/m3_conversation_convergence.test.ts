import assert from 'assert';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { POST as sofiaAskPostHandler } from '../../src/app/api/sofia/ask/route';
import { POST as agentChatPostHandler } from '../../src/app/api/agent-chat/route';
import {
  ConversationStore,
  ConversationSecurityError,
} from '../../src/lib/server/conversation';
import { executeSophiaTurn } from '../../src/lib/server/sophia';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';

/**
 * ============================================================================
 * M3 (K-1) CONVERSATION AUTHORITY CONVERGENCE — TEST SUITE
 * ============================================================================
 *
 * Proves the SOFIA surface (/api/sofia/ask) is now a governed ingress over
 * the ONE canonical server-side conversation authority (ConversationStore +
 * executeSophiaTurn), that browser-supplied history is untrusted and can
 * never overwrite or inject canonical records, and that ownership,
 * idempotency, the SSE response contract, and process-restart durability all
 * hold.
 *
 * Scenarios (per the M3 K-1 directive):
 *  1. Sofia ask delegates to the canonical ConversationStore path
 *  2. Existing SSE response contract preserved for current callers
 *  3. Server-issued conversationId is authoritative and continuous
 *  4. Bogus conversationId provisions a fresh conversation (executor behavior)
 *  5. Cross-surface idempotent replay (sofia ask → agent-chat same turnId)
 *  6. SECURITY: fabricated history cannot overwrite canonical history
 *  7. SECURITY: fabricated history cannot inject authoritative records
 *  8. SECURITY: durable store contains no fabricated records (file level)
 *  9. SECURITY: conversation ownership is founder-scoped and fail-closed
 * 10. Idempotent replay on the same surface (same turnId twice)
 * 11. Process-restart durability (genuine bun child processes)
 * 12. Unauthenticated requests fail closed (401, production semantics)
 * 13. No second conversation persistence path (route delegates; no runAsk)
 * 14. executeSophiaTurn direct behavior does not regress
 */

function askRequest(body: Record<string, unknown>, founderId: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/sofia/ask', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-samjuniors-user-id': founderId,
      'x-samjuniors-role': 'FOUNDER',
    },
    body: JSON.stringify(body),
  });
}

function agentChatRequest(body: Record<string, unknown>, founderId: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/agent-chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-samjuniors-user-id': founderId,
      'x-samjuniors-role': 'FOUNDER',
    },
    body: JSON.stringify(body),
  });
}

/** Consume the SSE response into parsed frames (mirrors the browser client). */
async function readSseFrames(res: Response): Promise<any[]> {
  const frames: any[] = [];
  if (!res.body) return frames;
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        frames.push(JSON.parse(data));
      } catch {
        /* torn line — ignore */
      }
    }
  }
  return frames;
}

async function runAsk(body: Record<string, unknown>, founderId: string) {
  const res = await sofiaAskPostHandler(askRequest(body, founderId));
  const frames = await readSseFrames(res);
  return {
    status: res.status,
    frames,
    ready: frames.find((f) => f.type === 'ready'),
    done: frames.find((f) => f.type === 'done'),
    error: frames.find((f) => f.type === 'error'),
  };
}

function runChild(args: string[], env: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    // @ts-ignore — Bun global exists when the suite runs under bun
    const proc = Bun.spawn(['bun', 'tests/sophia/m3-conversation-child.ts', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, ...env },
    });
    new Response(proc.stdout)
      .text()
      .then((out) =>
        proc.exited.then((code) => {
          if (code !== 0) {
            return new Response(proc.stderr)
              .text()
              .then((errText) =>
                reject(
                  new Error(
                    `child (${args.join(' ')}) exited ${code}; stderr: ${errText.slice(0, 500)}`
                  )
                )
            );
          }
          try {
            // The child's stdout is a single JSON line by contract; be
            // tolerant of any stray library output by taking the LAST line
            // that parses as JSON.
            const lines = out.trim().split('\n').filter(Boolean);
            let parsed: any = null;
            for (const line of lines) {
              try {
                const candidate = JSON.parse(line);
                if (candidate && typeof candidate === 'object') parsed = candidate;
              } catch {
                /* not a JSON line — skip */
              }
            }
            if (!parsed) throw new Error('no JSON line found');
            resolve(parsed);
          } catch {
            reject(
              new Error(
                `child (${args.join(' ')}) emitted non-JSON output: ${out.trim().slice(0, 300)}`
              )
            );
          }
        })
      )
      .catch(reject);
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('STARTING M3 (K-1) CONVERSATION CONVERGENCE SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;
  const convStore = ConversationStore.getInstance();
  const founderA = `founder_m3_a_${randomUUID().slice(0, 8)}`;
  const founderB = `founder_m3_b_${randomUUID().slice(0, 8)}`;

  // --------------------------------------------------------------------------
  // 1. Sofia ask delegates to the canonical ConversationStore path
  // --------------------------------------------------------------------------
  let conv1: string | undefined;
  try {
    const turnId = `m3-t1-${randomUUID().slice(0, 8)}`;
    const { status, ready, done, error, frames } = await runAsk(
      { text: 'What is our current monthly recurring revenue?', turnId },
      founderA
    );
    assert.strictEqual(status, 200, 'Ask must answer 200');
    assert.ok(!error, `Turn must not error (got: ${error?.message})`);
    assert.ok(done?.conversationId, 'Done frame must carry the canonical conversationId');
    conv1 = done.conversationId;
    assert.ok(conv1, 'conversationId captured');

    const messages = await convStore.getMessages(conv1, founderA);
    assert.strictEqual(messages.length, 2, 'Exactly founder + assistant messages must be persisted');
    assert.strictEqual(messages[0].sender, 'founder');
    assert.strictEqual(messages[0].content, 'What is our current monthly recurring revenue?');
    assert.strictEqual(messages[0].idempotencyKey, turnId, 'Founder message carries the turnId key');
    assert.strictEqual(messages[1].sender, 'assistant');
    assert.ok(messages[1].content.length > 0, 'Assistant reply must be persisted');
    assert.strictEqual(messages[1].idempotencyKey, `${turnId}:assistant`, 'Assistant message carries the :assistant key');
    const assistantMeta = (messages[1].metadata as any) || {};
    assert.strictEqual(assistantMeta.ingress, 'sofia_ask', 'Assistant record must be tagged with the soﬁa_ask ingress (proof of the canonical executor)');
    assert.strictEqual(assistantMeta.voiceIngress, false, 'Typed ask must not claim voice ingress');

    // The turn must have gone through the governed pipeline: the assembled
    // context (informational reply) is served by the gateway, and the
    // stream carried only frames the browser knows.
    const frameTypes = new Set(frames.map((f) => f.type));
    for (const t of frameTypes) {
      assert.ok(
        ['ready', 'text', 'tool', 'panel', 'blade', 'ui', 'provider', 'done', 'error'].includes(t),
        `Unknown frame type emitted: ${t}`
      );
    }
    assert.ok(ready?.brain, 'Ready frame still announces the brain');
    console.log('  [PASS] 1. Sofia ask delegates to the canonical ConversationStore path');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 1:', err.message);
    failed++;
  }

  // --------------------------------------------------------------------------
  // 2. Existing SSE response contract preserved for current callers
  // --------------------------------------------------------------------------
  try {
    const { frames, done } = await runAsk(
      { text: 'Give me a status update on active workstreams.', turnId: `m3-t2-${randomUUID().slice(0, 8)}` },
      founderA
    );
    assert.ok(frames.length >= 3, 'Stream must contain ready + text + done at minimum');
    assert.strictEqual(frames[0].type, 'ready', 'First frame is ready');
    const textFrames = frames.filter((f) => f.type === 'text');
    assert.ok(textFrames.length >= 1, 'Reply streams as text deltas');
    const joined = textFrames.map((f) => f.delta ?? '').join('');
    assert.strictEqual(joined, done.text, 'Concatenated deltas must equal the done text');
    assert.strictEqual(frames[frames.length - 1].type, 'done', 'Last frame is done');
    console.log('  [PASS] 2. Existing SSE response contract preserved');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 2:', err.message);
    failed++;
  }

  // --------------------------------------------------------------------------
  // 3. Server-issued conversationId is authoritative and continuous
  // --------------------------------------------------------------------------
  try {
    const turnId = `m3-t3-${randomUUID().slice(0, 8)}`;
    const first = await runAsk({ text: 'What is our runway?', turnId }, founderA);
    const second = await runAsk(
      { text: 'And the gross margin?', conversationId: first.done.conversationId, turnId: `${turnId}-b` },
      founderA
    );
    assert.strictEqual(second.done.conversationId, first.done.conversationId, 'Threaded conversationId keeps the same canonical conversation');
    const messages = await convStore.getMessages(first.done.conversationId, founderA);
    assert.strictEqual(messages.length, 4, 'Two turns = 4 canonical messages');
    assert.strictEqual(messages[2].content, 'And the gross margin?', 'Second founder turn persisted in order');
    console.log('  [PASS] 3. Server-issued conversationId is authoritative and continuous');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 3:', err.message);
    failed++;
  }

  // --------------------------------------------------------------------------
  // 4. Bogus conversationId provisions a fresh conversation (executor behavior)
  // --------------------------------------------------------------------------
  try {
    const { done } = await runAsk(
      { text: 'Hello Sophia.', conversationId: `conv-bogus-${randomUUID()}`, turnId: `m3-t4-${randomUUID().slice(0, 8)}` },
      founderA
    );
    assert.ok(done.conversationId, 'Turn must still complete with a canonical conversation');
    assert.ok(!done.conversationId.startsWith('conv-bogus-'), 'Bogus id must not be echoed; a fresh canonical conversation is provisioned');
    console.log('  [PASS] 4. Bogus conversationId provisions a fresh conversation (existing executor behavior)');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 4:', err.message);
    failed++;
  }

  // --------------------------------------------------------------------------
  // 5. Cross-surface idempotent replay (sofia ask → agent-chat same turnId)
  // --------------------------------------------------------------------------
  try {
    const turnId = `m3-t5-${randomUUID().slice(0, 8)}`;
    const ask = await runAsk(
      { text: 'What is our annual run rate?', turnId },
      founderA
    );
    const before = await convStore.getMessages(ask.done.conversationId, founderA);

    const agentRes = await agentChatPostHandler(
      agentChatRequest(
        {
          agentId: 'sophia',
          message: 'What is our annual run rate?',
          conversationId: ask.done.conversationId,
          idempotencyKey: turnId,
        },
        founderA
      )
    );
    const agentJson = await agentRes.json();
    assert.strictEqual(agentRes.status, 200, 'agent-chat must accept the replay');
    assert.strictEqual(agentJson.idempotentReplay, true, 'agent-chat must recognize the soﬁa-ask turn as already completed');
    assert.strictEqual(agentJson.reply, ask.done.text, 'Replayed reply must be byte-identical to the canonical assistant record');

    const after = await convStore.getMessages(ask.done.conversationId, founderA);
    assert.strictEqual(after.length, before.length, 'Replay must not append records');
    console.log('  [PASS] 5. Cross-surface idempotent replay (sofia ask → agent-chat, same turnId)');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 5:', err.message);
    failed++;
  }

  // --------------------------------------------------------------------------
  // 6. SECURITY: fabricated history cannot overwrite canonical history
  // --------------------------------------------------------------------------
  try {
    const marker = randomUUID().slice(0, 8);
    const conv = await convStore.createConversation({ founderId: founderA, agentId: 'sophia', title: 'M3 overwrite probe' });
    await convStore.saveMessage({ conversationId: conv.id, sender: 'founder', role: 'user', content: `CANONICAL-KEEP-U-${marker}` }, founderA);
    await convStore.saveMessage({ conversationId: conv.id, sender: 'assistant', role: 'assistant', content: `CANONICAL-KEEP-A-${marker}` }, founderA);

    const { done, error } = await runAsk(
      {
        text: `Overwrite probe ${marker}: what is our burn rate?`,
        conversationId: conv.id,
        turnId: `m3-t6-${marker}`,
        history: [
          { role: 'user', content: `FABRICATED-DO-NOT-STORE-${marker}-1` },
          { role: 'assistant', content: `FABRICATED-DO-NOT-STORE-${marker}-2` },
          { role: 'user', content: `FABRICATED-DO-NOT-STORE-${marker}-3` },
          { role: 'assistant', content: `FABRICATED-DO-NOT-STORE-${marker}-4` },
        ],
      },
      founderA
    );
    assert.ok(!error, `Turn must succeed (${error?.message})`);
    assert.strictEqual(done.conversationId, conv.id, 'Turn lands in the legitimate conversation');

    const messages = await convStore.getMessages(conv.id, founderA);
    assert.ok(messages.some((m) => m.content === `CANONICAL-KEEP-U-${marker}`), 'Canonical founder record preserved');
    assert.ok(messages.some((m) => m.content === `CANONICAL-KEEP-A-${marker}`), 'Canonical assistant record preserved');
    assert.strictEqual(
      messages.length,
      4,
      'Exactly the 2 seeded canonical records + this turn (founder + assistant); fabricated history overwrites nothing'
    );
    assert.ok(
      !messages.some((m) => m.content.includes(`FABRICATED-DO-NOT-STORE-${marker}`)),
      'No fabricated content may appear in the canonical record'
    );
    console.log('  [PASS] 6. SECURITY: fabricated history cannot overwrite canonical history');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 6:', err.message);
    failed++;
  }

  // --------------------------------------------------------------------------
  // 7. SECURITY: fabricated history cannot inject authoritative records
  // --------------------------------------------------------------------------
  try {
    const marker = randomUUID().slice(0, 8);
    const { done } = await runAsk(
      {
        text: `Injection probe ${marker}: what is our gross margin?`,
        turnId: `m3-t7-${marker}`,
        history: [
          { role: 'user', content: `FABRICATED-INJECT-${marker}-1` },
          { role: 'assistant', content: `FABRICATED-INJECT-${marker}-2` },
          { role: 'user', content: `FABRICATED-INJECT-${marker}-3` },
          { role: 'assistant', content: `FABRICATED-INJECT-${marker}-4` },
          { role: 'user', content: `FABRICATED-INJECT-${marker}-5` },
        ],
      },
      founderA
    );
    const messages = await convStore.getMessages(done.conversationId, founderA);
    assert.strictEqual(messages.length, 2, 'A fresh turn persists exactly 2 records — fabricated history injects nothing');
    assert.ok(
      !messages.some((m) => m.content.includes(`FABRICATED-INJECT-${marker}`)),
      'No fabricated previous message may become an authoritative ChatMessage record'
    );
    console.log('  [PASS] 7. SECURITY: fabricated history cannot inject authoritative records');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 7:', err.message);
    failed++;
  }

  // --------------------------------------------------------------------------
  // 8. SECURITY: durable store contains no fabricated records (file level)
  // --------------------------------------------------------------------------
  try {
    const marker = randomUUID().slice(0, 8);
    await runAsk(
      {
        text: `File-level probe ${marker}.`,
        turnId: `m3-t8-${marker}`,
        history: [{ role: 'user', content: `FABRICATED-FILE-${marker}` }],
      },
      founderA
    );
    const dataDir = DurableFileStore.getInstance().getDataDir();
    const raw = readFileSync(`${dataDir}/chat_messages.json`, 'utf-8');
    assert.ok(!raw.includes(`FABRICATED-FILE-${marker}`), 'Durable ChatMessage store must not contain fabricated browser history');
    assert.ok(raw.includes(`File-level probe ${marker}`), 'The real founder turn IS durably persisted');
    console.log('  [PASS] 8. SECURITY: durable store contains no fabricated records (file level)');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 8:', err.message);
    failed++;
  }

  // --------------------------------------------------------------------------
  // 9. SECURITY: conversation ownership is founder-scoped and fail-closed
  // --------------------------------------------------------------------------
  try {
    const marker = randomUUID().slice(0, 8);
    const conv = await convStore.createConversation({ founderId: founderA, agentId: 'sophia', title: 'M3 ownership probe' });
    await convStore.saveMessage({ conversationId: conv.id, sender: 'founder', role: 'user', content: `OWNER-A-${marker}` }, founderA);
    const before = await convStore.getMessages(conv.id, founderA);

    // Founder B attempts to speak into Founder A's conversation.
    const { error, done } = await runAsk(
      { text: `Intruder probe ${marker}`, conversationId: conv.id, turnId: `m3-t9-${marker}` },
      founderB
    );
    assert.ok(error, 'Cross-founder turn must fail closed');
    assert.ok(String(error.message).includes('Forbidden'), 'Failure must be an explicit Forbidden');
    const after = await convStore.getMessages(conv.id, founderA);
    assert.strictEqual(after.length, before.length, 'The victim conversation must be unchanged');

    // And the ConversationStore itself still throws for cross-founder reads.
    let threw = false;
    try {
      await convStore.getConversation(founderB, conv.id);
    } catch (err) {
      threw = err instanceof ConversationSecurityError;
    }
    assert.ok(threw, 'ConversationStore still enforces ConversationSecurityError on ownership mismatch');
    void done;
    console.log('  [PASS] 9. SECURITY: conversation ownership is founder-scoped and fail-closed');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 9:', err.message);
    failed++;
  }

  // --------------------------------------------------------------------------
  // 10. Idempotent replay on the same surface (same turnId twice)
  // --------------------------------------------------------------------------
  try {
    const turnId = `m3-t10-${randomUUID().slice(0, 8)}`;
    const first = await runAsk({ text: 'What is our total headcount plan?', turnId }, founderA);
    const second = await runAsk(
      { text: 'What is our total headcount plan?', conversationId: first.done.conversationId, turnId },
      founderA
    );
    assert.strictEqual(second.done.idempotentReplay, true, 'Second identical turn must replay');
    assert.strictEqual(second.done.text, first.done.text, 'Replayed text is the canonical assistant record');
    const messages = await convStore.getMessages(first.done.conversationId, founderA);
    assert.strictEqual(messages.length, 2, 'Replay appends nothing');
    console.log('  [PASS] 10. Idempotent replay on the same surface (same turnId twice)');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 10:', err.message);
    failed++;
  }

  // --------------------------------------------------------------------------
  // 11. Process-restart durability (genuine bun child processes)
  // --------------------------------------------------------------------------
  try {
    const marker = randomUUID().slice(0, 8);
    const founderId = `founder_m3_restart_${marker}`;

    // Child A: a fresh process runs one ask.
    const askOut = await runChild(['ask', founderId, marker]);
    assert.ok(askOut.ok, `Child ask must succeed (${JSON.stringify(askOut).slice(0, 200)})`);
    assert.strictEqual(askOut.httpStatus, 200);
    assert.ok(askOut.conversationId, 'Child must report the canonical conversationId');
    assert.strictEqual(askOut.persistedCount, 2, 'Child turn persists founder + assistant');
    assert.strictEqual(askOut.assistantIngress, 'sofia_ask', 'Child turn ran the canonical executor');

    // Child B: a FRESH process (restart) verifies the canonical store.
    const verifyOut = await runChild(['verify', founderId, askOut.conversationId]);
    assert.strictEqual(verifyOut.conversationId, askOut.conversationId);
    assert.strictEqual(verifyOut.count, 2, 'Canonical messages survive the process restart');
    assert.ok(verifyOut.contents.some((c: string) => c.includes(marker)), 'The founder turn content survived');
    assert.ok(verifyOut.senders[0] === 'founder' && verifyOut.senders[1] === 'assistant', 'Ordering preserved');

    // Child C: another fresh process continues the SAME conversation — with a
    // fabricated history payload that must be ignored.
    const againOut = await runChild(['ask-again', founderId, askOut.conversationId, marker]);
    assert.ok(againOut.ok, `Continuation ask must succeed (${JSON.stringify(againOut).slice(0, 200)})`);
    assert.strictEqual(againOut.sameConversation, true, 'Continuation lands in the same canonical conversation');
    assert.strictEqual(againOut.persistedCount, 4, 'Two turns across two processes = 4 canonical records');
    assert.strictEqual(againOut.fabricatedLeak, false, 'Fabricated history never reached the canonical store, even across restarts');
    console.log('  [PASS] 11. Process-restart durability (genuine child processes; continuity + no fabrication)');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 11:', err.message);
    failed++;
  }

  // --------------------------------------------------------------------------
  // 12. Unauthenticated requests fail closed (401, production semantics)
  // --------------------------------------------------------------------------
  try {
    const out = await runChild(['ask-unauth'], { NODE_ENV: 'production' });
    assert.strictEqual(out.status, 401, `Unauthenticated ask must 401 (got ${out.status})`);
    assert.ok(String(out.body).includes('Unauthorized'), '401 body explains the session requirement');
    console.log('  [PASS] 12. Unauthenticated requests fail closed (401 under production semantics)');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 12:', err.message);
    failed++;
  }

  // --------------------------------------------------------------------------
  // 13. No second conversation persistence path (route delegates; no runAsk)
  // --------------------------------------------------------------------------
  try {
    const routeSource = readFileSync('src/app/api/sofia/ask/route.ts', 'utf-8');
    assert.ok(routeSource.includes('executeSophiaTurn'), 'Route must delegate to the canonical turn executor');
    assert.ok(!routeSource.includes('runAsk'), 'Route must not run the independent brain loop any more');
    assert.ok(!routeSource.includes('saveMessage'), 'Route must not persist messages itself — only the canonical executor persists');
    assert.ok(routeSource.includes('getAuthenticatedFounder'), 'Route must authenticate through the shared session contract');

    const clientSource = readFileSync('src/sofia/lib/api.ts', 'utf-8');
    assert.ok(!clientSource.includes('history.slice(-40)'), 'Browser client must not upload its transcript any more');
    assert.ok(clientSource.includes('conversationId'), 'Browser client threads the server-issued conversationId');
    console.log('  [PASS] 13. No second conversation persistence path (source-level delegation proof)');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 13:', err.message);
    failed++;
  }

  // --------------------------------------------------------------------------
  // 14. executeSophiaTurn direct behavior does not regress
  // --------------------------------------------------------------------------
  try {
    const founderId = `founder_m3_direct_${randomUUID().slice(0, 8)}`;
    const turnId = `m3-direct-${randomUUID().slice(0, 8)}`;
    const result = await executeSophiaTurn({
      message: 'What is our runway?',
      founderId,
      turnId,
    });
    assert.strictEqual(result.success, true, 'Direct executor turn succeeds');
    assert.ok(result.conversationId, 'Direct executor establishes a canonical conversation');
    const messages = await convStore.getMessages(result.conversationId, founderId);
    assert.strictEqual(messages.length, 2, 'Direct executor persists founder + assistant');
    assert.strictEqual((messages[1].metadata as any)?.ingress, 'live_voice', 'Default ingress label preserved for non-soﬁa callers');

    const replay = await executeSophiaTurn({ message: 'What is our runway?', founderId, conversationId: result.conversationId, turnId });
    assert.strictEqual(replay.idempotentReplay, true, 'Direct executor idempotency intact');
    console.log('  [PASS] 14. executeSophiaTurn direct behavior does not regress');
    passed++;
  } catch (err: any) {
    console.error('  [FAIL] 14:', err.message);
    failed++;
  }

  console.log('\n======================================================');
  console.log(`M3 K-1 SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('M3 K-1 suite crashed:', err);
  process.exit(1);
});
