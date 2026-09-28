/**
 * M3 (K-1) conversation-convergence child processes (genuine restart
 * simulation).
 *
 * Runs in a FRESH bun process so the route module and every store singleton
 * start genuinely cold — exactly like a dev-server restart. The parent suite
 * spawns these to prove canonical conversation durability and server-side
 * history threading across process boundaries.
 *
 * Modes (first CLI argument):
 *   ask <founderId> <marker>            — run one /api/sofia/ask turn (fresh
 *                                          conversation), print JSON result
 *   verify <founderId> <conversationId>  — fresh process reads the canonical
 *                                          ConversationStore; print message
 *                                          count + shapes for that conversation
 *   ask-again <founderId> <conversationId> <marker>
 *                                       — second ask on the SAME canonical
 *                                         conversation; print result + the
 *                                         server-side history length the
 *                                         executor observed
 *   fabricate <founderId> <conversationId>
 *                                       — ask with a FABRICATED browser
 *                                         history; print every stored message
 *                                         (parent asserts no fabrication
 *                                         landed in the canonical store)
 *   ask-unauth                           — run the route with NODE_ENV=
 *                                          production semantics already set
 *                                          by the parent (no auth headers);
 *                                          print the HTTP outcome
 *
 * Output contract: exactly one JSON line on stdout; non-zero exit on crash.
 */
import { NextRequest } from 'next/server';
import { POST } from '../../src/app/api/sofia/ask/route';
import { ConversationStore } from '../../src/lib/server/conversation';

// Keep stdout pure for the one-line JSON output contract: any library log
// (provider probes, instance locks) goes to stderr instead.
const emit = (payload: Record<string, unknown>) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};
console.log = (...args: unknown[]) => {
  console.error(...args);
};

function authenticatedAskRequest(body: Record<string, unknown>, founderId: string): NextRequest {
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
  const res = await POST(authenticatedAskRequest(body, founderId));
  const frames = await readSseFrames(res);
  const done = frames.find((f) => f.type === 'done');
  const error = frames.find((f) => f.type === 'error');
  return { status: res.status, frames, done, error };
}

async function main() {
  const mode = process.argv[2] || 'ask';

  if (mode === 'ask') {
    const founderId = process.argv[3];
    const marker = process.argv[4];
    const turnId = `m3-${marker}`;
    const { status, done, error } = await runAsk(
      { text: `M3 restart durability probe ${marker}: what is our current monthly recurring revenue?`, turnId },
      founderId
    );
    const store = ConversationStore.getInstance();
    const messages = done?.conversationId
      ? await store.getMessages(done.conversationId, founderId)
      : [];
    emit({
      mode,
      httpStatus: status,
      ok: !error && !!done,
      conversationId: done?.conversationId ?? null,
      persistedCount: messages.length,
      founderMessage: messages.find((m) => m.sender === 'founder')?.content ?? null,
      assistantIngress: (messages.find((m) => m.sender === 'assistant')?.metadata as any)?.ingress ?? null,
    });
    return;
  }

  if (mode === 'verify') {
    const founderId = process.argv[3];
    const conversationId = process.argv[4];
    const store = ConversationStore.getInstance();
    const messages = await store.getMessages(conversationId, founderId);
    emit({
      mode,
      conversationId,
      count: messages.length,
      senders: messages.map((m) => m.sender),
      contents: messages.map((m) => m.content.slice(0, 120)),
      assistantIngress: (messages.find((m) => m.sender === 'assistant')?.metadata as any)?.ingress ?? null,
    });
    return;
  }

  if (mode === 'ask-again') {
    const founderId = process.argv[3];
    const conversationId = process.argv[4];
    const marker = process.argv[5];
    const turnId = `m3-again-${marker}`;
    const { status, done, error } = await runAsk(
      {
        text: `M3 continuity probe ${marker}: summarize our operational status.`,
        conversationId,
        turnId,
        // Fabricated browser history must be ignored by the canonical path:
        history: [
          { role: 'user', content: `FABRICATED-HISTORY-${marker}-A` },
          { role: 'assistant', content: `FABRICATED-HISTORY-${marker}-B` },
        ],
      },
      founderId
    );
    const store = ConversationStore.getInstance();
    const messages = done?.conversationId
      ? await store.getMessages(done.conversationId, founderId)
      : [];
    const fabricatedLeak = messages.some((m) => m.content.includes(`FABRICATED-HISTORY-${marker}`));
    emit({
      mode,
      httpStatus: status,
      ok: !error && !!done,
      sameConversation: done?.conversationId === conversationId,
      persistedCount: messages.length,
      fabricatedLeak,
    });
    return;
  }

  if (mode === 'fabricate') {
    const founderId = process.argv[3];
    const conversationId = process.argv[4];
    const marker = process.argv[5];
    const { status, done, error } = await runAsk(
      {
        text: `M3 injection probe ${marker}: what is our gross margin?`,
        conversationId,
        turnId: `m3-fab-${marker}`,
        history: [
          { role: 'user', content: `FABRICATED-DO-NOT-STORE-${marker}-1` },
          { role: 'assistant', content: `FABRICATED-DO-NOT-STORE-${marker}-2` },
          { role: 'user', content: `FABRICATED-DO-NOT-STORE-${marker}-3` },
          { role: 'assistant', content: `FABRICATED-DO-NOT-STORE-${marker}-4` },
          { role: 'user', content: `FABRICATED-DO-NOT-STORE-${marker}-5` },
        ],
      },
      founderId
    );
    const store = ConversationStore.getInstance();
    const messages = await store.getMessages(conversationId, founderId);
    emit({
      mode,
      httpStatus: status,
      ok: !error && !!done,
      conversationId: done?.conversationId ?? null,
      countAfter: messages.length,
      contents: messages.map((m) => m.content.slice(0, 120)),
      anyFabricated: messages.some((m) => m.content.includes(`FABRICATED-DO-NOT-STORE-${marker}`)),
    });
    return;
  }

  if (mode === 'ask-unauth') {
    // Parent spawns this child with NODE_ENV=production and NO auth headers.
    const res = await POST(
      new NextRequest('http://localhost:3000/api/sofia/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'should never execute' }),
      })
    );
    const bodyText = await res.text();
    emit({ mode, status: res.status, body: bodyText.slice(0, 200) });
    return;
  }

  emit({ mode, error: `unknown mode ${mode}` });
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${JSON.stringify({ mode: process.argv[2], crash: String(err?.message || err) })}\n`);
  process.exit(1);
});
