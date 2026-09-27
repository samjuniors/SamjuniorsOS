/**
 * M4-A C8 child — DEFAULT production extractor path (receiver-intact pin).
 *
 * Runs the REAL static SophiaMemoryExtractor.extract end-to-end (the capture
 * stage's DEFAULT seam, with NO options.extract injected) against a fake
 * z-ai SDK chat completion registered at module level BEFORE any src import
 * via a Bun transpiler plugin. Everything else is REAL: the zai-client
 * wrapping, the receiver-sensitive parseCandidates sanitizer, the
 * deterministic MemoryGate, and the SophiaMemoryStore persistence.
 *
 * Regression pin (post-M4-A-audit): the capture stage's default seam was
 * once assigned the static method as a bare, DETACHED reference — extract()
 * internally calls this.parseCandidates(...), so detached it threw on every
 * LIVE capture AFTER paying the model call. On that bug this child reports
 * {"status":"failed","reason":"EXTRACTION_FAILED"} and persists nothing.
 *
 * Output contract: exactly one JSON line on stdout; non-zero exit on crash.
 */
import { SophiaMemoryStore } from '../../src/lib/server/sophia/personal-memory-store';
import { captureSophiaMemoryCandidates } from '../../src/lib/server/sophia/memory-capture-stage';

// ---------------------------------------------------------------------------
// Module-level SDK fake — registered BEFORE the src imports above execute
// their first dynamic import of 'z-ai-web-dev-sdk' (the zai-client lazily
// imports it inside getAIClient, so registering in this file's prologue is
// sufficient; the plugin hook intercepts the resolution whenever it fires).
// ---------------------------------------------------------------------------
const FAKE_MODEL_COMPLETION = JSON.stringify({
  candidates: [
    {
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: 'Founder prefers concise, direct responses in every review.',
      confidence: 0.9,
      reason: 'The founder explicitly asked for concise, direct responses.',
    },
  ],
});

// @ts-ignore — Bun global exists when the suite runs under bun
Bun.plugin({
  name: 'zai-sdk-fake-for-c8',
  setup(builder) {
    builder.onLoad({ filter: /z-ai-web-dev-sdk/ }, () => ({
      exports: {
        create: async () => ({
          chat: {
            completions: {
              create: async () => ({
                choices: [{ message: { content: FAKE_MODEL_COMPLETION } }],
              }),
            },
          },
        }),
      },
      loader: 'object',
    }));
  },
});

const emit = (payload: Record<string, unknown>) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};
// Keep stdout to the single report line (capture-stage events go to stderr).
console.log = (...args: unknown[]) => {
  console.error(...args);
};

async function main() {
  const founderId = process.argv[2] || `founder_m4a_c8_${Date.now()}`;
  const conversationId = `conv-c8-${Date.now()}`;
  const turnId = `turn-c8-${Date.now()}`;

  const outcome = await captureSophiaMemoryCandidates({
    founderId,
    conversationId,
    founderMessageId: `fm-${turnId}`,
    assistantMessageId: `am-${turnId}`,
    turnId,
    founderMessage: 'I always want concise, direct responses in every review.',
    assistantReply: 'Understood — I will keep every response concise and direct.',
    ingress: 'm4a-c8-child',
    // DELIBERATELY NO options.extract — the DEFAULT production extractor
    // (the real static SophiaMemoryExtractor.extract with its class receiver)
    // must run. This is the exact seam the detached-method bug broke.
  } as any);

  const store = SophiaMemoryStore.getInstance();
  const mine = await store.listMemories(founderId, { limit: 50 });
  const candidate = mine.find((m) => (m.idempotencyKey || '').startsWith(`m4cap:${conversationId}:`));

  emit({
    status: outcome.status,
    persisted: outcome.persisted,
    storeCount: mine.length,
    memoryActive: candidate ? candidate.active : null,
    lifecycleState: candidate ? candidate.lifecycleState : null,
    captureStatus: candidate?.metadata?.captureStatus ?? null,
    captureSource: candidate?.metadata?.captureSource ?? null,
    memoryType: candidate?.memoryType ?? null,
    content: candidate?.content ?? null,
    idempotencyKey: candidate?.idempotencyKey ?? null,
  });
}

main().catch((err) => {
  console.error('c8 child crashed:', err);
  process.exit(1);
});
