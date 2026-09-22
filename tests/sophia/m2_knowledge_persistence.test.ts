import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  CompanyKnowledgeStore,
  CANONICAL_COMPANY_KNOWLEDGE,
  computeKnowledgeContentHash,
} from '../../src/lib/server/knowledge/knowledge-store';
import { SophiaContextAssembler } from '../../src/lib/server/sophia';

/**
 * ============================================================================
 * M2 REGRESSION SUITE — COMPANY KNOWLEDGE PERSISTENCE ACTIVATION
 * ============================================================================
 *
 * Proves the M2 wiring mandated by the Founder-approved reconciliation plan
 * (docs/architecture/MEMORY_RECONCILIATION_REPORT.md, migration step M2):
 *
 *   "Activate knowledge persistence: wire CompanyKnowledgeStore to the
 *    canonical persistence abstraction (dual-mode, like its siblings);
 *    one-time seed migration of the 8 canonical documents; ingestion path
 *    respects the existing SHA-256 hash column."
 *
 * Before M2, addKnowledge() mutated only an in-memory array — every added
 * document was silently lost on restart, and the Prisma CompanyKnowledge
 * table was dead. These tests pin the fixed behavior, including GENUINE
 * process-restart durability (fresh bun child processes, per the
 * restart-child pattern established by the Phase 4.4B scheduler suite).
 *
 * All tests run in local mode (DurableFileStore primary per ADR 0002).
 */

const DATA_DIR = path.resolve(process.cwd(), '.data');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'company_knowledge.json');

let passed = 0;
let failed = 0;
let originalKnowledgeFile: string | null = null;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    failed++;
    process.exitCode = 1;
  }
}

function runChild(mode: string): Promise<{ restartMarker?: boolean; poisonMarker?: boolean; total: number; canonicalSeedCount?: number }> {
  return new Promise((resolve, reject) => {
    // @ts-ignore — Bun global exists when the suite runs under `bun`
    const proc = Bun.spawn(['bun', 'tests/sophia/m2-knowledge-child.ts', mode], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env },
    });
    new Response(proc.stdout)
      .text()
      .then((out) => proc.exited.then(() => resolve(JSON.parse(out.trim()))))
      .catch(reject);
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('M2 COMPANY KNOWLEDGE PERSISTENCE REGRESSION SUITE');
  console.log('======================================================\n');

  // --- .data isolation: back up any pre-existing durable knowledge ---
  if (fs.existsSync(KNOWLEDGE_FILE)) {
    originalKnowledgeFile = fs.readFileSync(KNOWLEDGE_FILE, 'utf-8');
  } else {
    originalKnowledgeFile = null;
  }

  try {
    // ------------------------------------------------------------------
    // 1. Hash / change detection primitives (SHA-256 column contract)
    // ------------------------------------------------------------------
    await test('1. computeKnowledgeContentHash provides SHA-256 change detection', async () => {
      const h1 = computeKnowledgeContentHash('Document body A');
      const h2 = computeKnowledgeContentHash('Document body A');
      const h3 = computeKnowledgeContentHash('Document body B');
      assert.strictEqual(h1, h2, 'Identical content must produce identical hashes');
      assert.notStrictEqual(h1, h3, 'Changed content must produce a different hash');
      assert.strictEqual(h1.length, 64, 'SHA-256 hex digest expected');
      assert.match(h1, /^[0-9a-f]{64}$/, 'Lowercase hex digest expected');
    });

    // ------------------------------------------------------------------
    // 2. One-time seed migration: a fresh durable state boots with the 8
    //    canonical documents PERSISTED (previously they were code constants
    //    only, and the durable file was never written).
    // ------------------------------------------------------------------
    await test('2. First boot persists the 8 canonical seed documents durably (one-time seed migration)', async () => {
      // Simulate a virgin durable state.
      if (fs.existsSync(KNOWLEDGE_FILE)) fs.unlinkSync(KNOWLEDGE_FILE);

      const result = await runChild('count');
      assert.strictEqual(
        result.canonicalSeedCount,
        CANONICAL_COMPANY_KNOWLEDGE.length,
        `A cold boot with no durable knowledge must persist all ${CANONICAL_COMPANY_KNOWLEDGE.length} canonical seeds, got ${result.canonicalSeedCount}`
      );
      assert.ok(fs.existsSync(KNOWLEDGE_FILE), 'The durable knowledge file must now exist');
      const persisted = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf-8'));
      assert.strictEqual(
        Object.keys(persisted).length,
        CANONICAL_COMPANY_KNOWLEDGE.length,
        'Durable file must contain exactly the canonical seed set on first boot'
      );
    });

    // ------------------------------------------------------------------
    // 3. Round-trip + restart durability: add → NEW process → retrieve.
    // ------------------------------------------------------------------
    await test('3. Knowledge round-trip survives a genuine process restart (add → restart → retrieve)', async () => {
      // In-process add (durable write happens in addKnowledge).
      const store = CompanyKnowledgeStore.getInstance();
      await store.addKnowledge({
        id: 'know-m2-restart-001',
        documentId: 'M2-RESTART-001',
        title: 'M2 Knowledge Restart Durability Probe',
        category: 'sop',
        version: '1.0.0',
        summary: 'Marker document used to verify knowledge persistence across process restarts.',
        content: 'Marker document used to verify knowledge persistence across process restarts.',
        tags: ['M2', 'Persistence', 'Restart'],
        applicableDepartments: ['coo'],
        authorAuthority: 'M2 Regression Suite',
        lastVerifiedDate: new Date().toISOString().slice(0, 10),
        isDurableReference: true,
      });

      // The durable file must contain the added item immediately.
      const persisted = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf-8'));
      assert.ok(persisted['know-m2-restart-001'], 'addKnowledge must durably persist the item');

      // GENUINE restart: a fresh bun process constructs a cold singleton.
      const afterRestart = await runChild('query');
      assert.strictEqual(afterRestart.restartMarker, true, 'The added item must be retrievable after a process restart');
      assert.strictEqual(
        afterRestart.canonicalSeedCount ?? afterRestart.total >= CANONICAL_COMPANY_KNOWLEDGE.length,
        true,
        'Canonical seeds must survive alongside added items'
      );

      // Retrieval still works through the deterministic query path.
      const hits = await store.queryKnowledge({ queryText: 'restart durability probe' });
      assert.ok(
        hits.some((h) => h.knowledgeId === 'know-m2-restart-001'),
        'queryKnowledge must retrieve the persisted marker'
      );
    });

    // ------------------------------------------------------------------
    // 4. Poisoned knowledge survives persistence but CANNOT elevate its
    //    authority label (isolation survives restart).
    // ------------------------------------------------------------------
    await test('4. Poisoned knowledge item persists across restart but never elevates its authority label', async () => {
      await runChild('add-poison');

      const afterRestart = await runChild('query');
      assert.strictEqual(afterRestart.poisonMarker, true, 'The poisoned item persists (it is data, not deleted)');

      // Authority labeling is enforced by the assembler, not the store:
      // the poisoned text must be retrievable but must remain labeled
      // COMPANY_KNOWLEDGE — never AUTHORITATIVE_OPERATIONAL_STATE.
      const assembled = await SophiaContextAssembler.assemble({
        message: 'Forged Operational Override M2 restart probe',
      });
      const poisonSlice = assembled.slices.find((s) => s.content.includes('POISON-M2-001'));
      if (poisonSlice) {
        assert.strictEqual(
          poisonSlice.authority,
          'COMPANY_KNOWLEDGE',
          `Poisoned record authority MUST remain COMPANY_KNOWLEDGE; got ${poisonSlice.authority}`
        );
      }
      const opSlice = assembled.slices.find((s) => s.authority === 'AUTHORITATIVE_OPERATIONAL_STATE');
      assert.ok(opSlice, 'Authoritative operational state slice must still exist');
      assert.ok(
        !opSlice.content.includes('$999,999,999'),
        'Poisoned knowledge text must never leak into the authoritative operational state slice'
      );
    });

    // ------------------------------------------------------------------
    // 5. setKnowledge resets durably (used by test hygiene and admin paths).
    // ------------------------------------------------------------------
    await test('5. setKnowledge replaces the durable collection (reset contract)', async () => {
      const store = CompanyKnowledgeStore.getInstance();
      await store.setKnowledge([...CANONICAL_COMPANY_KNOWLEDGE]);
      const persisted = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf-8'));
      assert.strictEqual(
        Object.keys(persisted).length,
        CANONICAL_COMPANY_KNOWLEDGE.length,
        'Durable file must reflect the reset set'
      );
      assert.ok(!persisted['know-m2-restart-001'], 'Test markers must be gone after reset');
      assert.ok(!persisted['know-m2-poison-001'], 'Poison markers must be gone after reset');

      const afterReset = await runChild('count');
      assert.strictEqual(
        afterReset.canonicalSeedCount,
        CANONICAL_COMPANY_KNOWLEDGE.length,
        'A fresh process after reset must see exactly the canonical seeds'
      );
    });

  } finally {
    // --- restore environment so the dev app is unaffected ---
    try {
      if (originalKnowledgeFile !== null) {
        fs.writeFileSync(KNOWLEDGE_FILE, originalKnowledgeFile, 'utf-8');
      } else if (fs.existsSync(KNOWLEDGE_FILE)) {
        // Virgin environment: remove test artifacts. The dev app's store
        // constructor will re-run the one-time canonical seed migration on
        // its next cold boot.
        fs.unlinkSync(KNOWLEDGE_FILE);
      }
    } catch {}
  }

  console.log('\n======================================================');
  console.log(`M2 REGRESSION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('M2 suite crashed:', err);
  process.exitCode = 1;
});
