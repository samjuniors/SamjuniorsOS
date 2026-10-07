/**
 * Sophia surface text-turn client — the canonical /api/sofia/ask SSE path.
 *
 * This replaces the legacy SOFIA client (src/sofia/lib/api.ts, removed with
 * the legacy JARVIS surface). It keeps the same governance shape the
 * convergence suite pins at the source level:
 *   - the client threads ONLY the server-issued conversationId (captured
 *     from ready/done frames — it never invents one);
 *   - the client never uploads its local transcript (no history window is
 *     sent at all — the server owns conversation continuity);
 *   - every request carries a fresh caller-minted turnId, which the route
 *     validates before any streaming or persistence happens.
 *
 * Request:  POST { text, conversationId?, turnId? }
 * Frames:   {type:'ready', brain, conversationId?}
 *           {type:'text',  delta}
 *           {type:'done',  text, conversationId, idempotentReplay?, cancelled?}
 *           {type:'error', message}
 */

export interface AskHandlers {
  onReady?: (brain: string) => void;
  onText?: (delta: string) => void;
}

export interface AskResult {
  text: string;
  conversationId?: string;
  idempotentReplay?: boolean;
  cancelled?: boolean;
}

/** Caller-minted turn id — the durable idempotency key for one text turn. */
export function freshTurnId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `sofia-${rand}`;
}

/** The server-issued conversation this surface is threaded into (if any). */
let conversationId: string | null = null;

export function getConversationId(): string | null {
  return conversationId;
}

/** Adopt a server-issued conversation id (ready/done frames carry it). */
function adoptConversationId(raw: unknown): void {
  if (typeof raw === 'string' && raw.trim()) conversationId = raw;
}

type Frame =
  | { type: 'ready'; brain?: string; conversationId?: string }
  | { type: 'text'; delta?: string }
  | { type: 'done'; text?: string; conversationId?: string; idempotentReplay?: boolean; cancelled?: boolean }
  | { type: 'error'; message?: string };

/**
 * Send one text turn to Sophia over the canonical ask route and stream the
 * reply. Resolves with the full reply (empty text + cancelled:true when the
 * turn was interrupted server-side). Rejects on transport/HTTP failure —
 * the caller renders honest errors; nothing is simulated.
 */
export async function ask(text: string, handlers: AskHandlers = {}, signal?: AbortSignal): Promise<AskResult> {
  const res = await fetch('/api/sofia/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      text,
      conversationId: conversationId ?? undefined,
      turnId: freshTurnId(),
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `The server answered ${res.status}.`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let out = '';
  let result: AskResult = { text: '' };

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
      if (!data || data === '[DONE]') continue;
      let msg: Frame;
      try {
        msg = JSON.parse(data) as Frame;
      } catch {
        continue; // a torn line — the next chunk completes it
      }
      switch (msg.type) {
        case 'ready':
          adoptConversationId(msg.conversationId);
          if (msg.brain) handlers.onReady?.(msg.brain);
          break;
        case 'text':
          out += msg.delta ?? '';
          handlers.onText?.(msg.delta ?? '');
          break;
        case 'done':
          adoptConversationId(msg.conversationId);
          result = {
            text: msg.text ?? out,
            conversationId: conversationId ?? undefined,
            idempotentReplay: msg.idempotentReplay,
            cancelled: msg.cancelled,
          };
          break;
        case 'error':
          throw new Error(msg.message || 'The Sophia turn failed on the server.');
      }
    }
  }

  return result;
}
