/**
 * M4-A default-extractor binding regression child (capture-stage seam).
 *
 * PURPOSE: pin the CRITICAL post-M4-A defect where the capture stage's
 * default extraction seam was assigned the STATIC method as a bare,
 * detached reference:
 *
 *     const extractor = options.extract ?? SophiaMemoryExtractor.extract;
 *
 * extract() internally calls this.parseCandidates(raw). Detached from the
 * class, `this` is undefined in strict mode, so EVERY live capture threw a
 * TypeError after the model call had already been paid for. The 41-test M4-A
 * suite never saw it because pipeline tests inject options.extract.
 *
 * This child runs the REAL DEFAULT production path with NO injected
 * extractor — only the z-ai SDK's chat completion (the network boundary) is
 * faked via Bun's module mock, registered BEFORE any src import:
 *
 *   captureSophiaMemoryCandidates(input)   <- NO options
 *     -> SophiaMemoryExtractor.extract    (REAL, receiver-sensitive:
 *                                          internally calls this.parseCandidates)
 *     -> zai-client generateText          (REAL, incl. system+data-tag wrapping)
 *     -> parseCandidates                  (REAL fixed-shape sanitizer)
 *     -> MemoryGate                       (REAL deterministic evaluation)
 *     -> SophiaMemoryStore.createMemory   (REAL inactive persistence)
 *
 * With the detached-method bug the outcome is {"status":"failed",
 * "reason":"EXTRACTION_FAILED"} and nothing persists. With the binding fix
 * the outcome is {"status":"captured"} with one INACTIVE pending candidate
 * whose content equals the fixed model reply — proving the candidate flowed
 * through the REAL parseCandidates/gate/store, not around them.
 *
 * Output contract: exactly one JSON line on stdout; non-zero exit on crash.
 */
import { randomUUID } from 'crypto';
import { mock } from 'bun:test';

/** What the (faked) model provider returns for the extraction request. */
const FIXED_MODEL_REPLY = JSON.stringify({
  candidates: [
    {
      memoryType: 'COMMUNICATION_PREFERENCE',
      content: 'Founder prefers concise, direct responses in every review.',
      confidence: 0.9,
      reason: 'founder stated the preference explicitly',
    },
  ],
});

// Mock ONLY the provider SDK — and BEFORE importing anything from src.
// zai-client lazily `await import('z-ai-web-dev-sdk')` at first generateText
// call, so the mock intercepts the live module resolution.
mock.module('z-ai-web-dev-sdk', () => ({
  default: {
    create: async () => ({
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: FIXED_MODEL_REPLY } }],
          }),
        },
      },
    }),
  },
}));

// Keep stdout pure for the one-line JSON output contract: any library log
// (capture events, provider probes) goes to stderr instead.
const emit = (payload: Record<string, unknown>) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};
console.log = (...args: unknown[]) => {
  console.error(...args);
};

async function main() {
  const founderId = process.argv[2] || `founder_m4a_c8_${randomUUID().slice(0, 8)}`;

  // Imports resolve AFTER the mock registration above.
  const { captureSophiaMemoryCandidates } = await import(
    '../../src/lib/server/sophia/memory-capture-stage'
  );
  const { SophiaMemoryStore } = await import(
    '../../src/lib/server/sophia/personal-memory-store'
  );

  // A completed, non-trivial turn — and NO capture options: the DEFAULT
  // production extractor seam must run.
  const outcome = await captureSophiaMemoryCandidates({
    founderId,
    conversationId: `conv-m4a-c8-${randomUUID().slice(0, 8)}`,
    founderMessageId: `msg-c8-f-${randomUUID().slice(0, 8)}`,
    assistantMessageId: `msg-c8-a-${randomUUID().slice(0, 8)}`,
    turnId: `turn-c8-${randomUUID().slice(0, 8)}`,
    founderMessage: 'Please keep your answers concise and direct.',
    assistantReply: 'Understood — I will keep answers concise and direct.',
    ingress: 'm4a_default_extractor_child',
  });

  const store = SophiaMemoryStore.getInstance();
  const memories = await store.listMemories(founderId, { limit: 10 });
  const record = memories[0];

  emit({
    status: outcome.status,
    reason: outcome.reason ?? null,
    persisted: outcome.persisted,
    storeCount: memories.length,
    memoryActive: record?.active ?? null,
    captureStatus: (record?.metadata as Record<string, unknown> | undefined)?.captureStatus ?? null,
    captureSource: (record?.metadata as Record<string, unknown> | undefined)?.captureSource ?? null,
    memoryType: record?.memoryType ?? null,
    content: record?.content ?? null,
    idempotencyKey: record?.idempotencyKey ?? null,
  });
}

main().catch((err) => {
  console.error('m4a default-extractor child crashed:', err);
  process.exit(1);
});
