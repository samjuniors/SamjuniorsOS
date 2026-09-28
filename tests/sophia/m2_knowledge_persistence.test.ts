import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import {
  CompanyKnowledgeStore,
  CANONICAL_COMPANY_KNOWLEDGE,
  computeKnowledgeContentHash,
  isKnowledgeContentUnchanged,
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
 * Pre-M3 correction pass (Founder directive) adds:
 *   6. restart does NOT overwrite an edited canonical document (local mode)
 *   7. hash comparison distinguishes unchanged from changed content
 *   8. authoritative Prisma mode: fresh db seeds are created (A) and an
 *      edited canonical document survives a restart (B) — bootstrap-only
 *      seeding, code constants never overwrite persisted rows.
 *
 * All other tests run in local mode (DurableFileStore primary per ADR 0002);
 * test 8 exercises authoritative mode against a throwaway SQLite database.
 */

const DATA_DIR = path.resolve(process.cwd(), '.data');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'company_knowledge.json');
// Throwaway database for the authoritative-mode test (absolute path — Prisma
// resolves relative SQLite paths against prisma/).
const AUTHORITY_DB = `/tmp/m2-knowledge-authority-${process.pid}.db`;

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

function runChild(mode: string): Promise<{ restartMarker?: boolean; poisonMarker?: boolean; total: number; canonicalSeedCount?: number; editedContentSurvived?: boolean; editedVersionSurvived?: boolean; contentPreview?: string | null }> {
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

function runAuthorityChild(mode: string): Promise<{
  total?: number;
  canonicalSeedCount?: number;
  servedContentHasEdit?: boolean;
  servedVersion?: string | null;
  rowHash?: string | null;
  rowHashMatchesEditedContent?: boolean | null;
  rowHashDiffersFromSeedConstant?: boolean;
}> {
  return new Promise((resolve, reject) => {
    // @ts-ignore — Bun global exists when the suite runs under `bun`
    const proc = Bun.spawn(['bun', 'tests/sophia/m2-knowledge-authority-child.ts', mode], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        DATABASE_MODE: 'authoritative',
        DATABASE_URL: `file:${AUTHORITY_DB}`,
      },
    });
    new Response(proc.stdout)
      .text()
      .then((out) =>
        proc.exited.then(() => {
          try {
            resolve(JSON.parse(out.trim()));
          } catch (e: any) {
            reject(new Error(`authority child (${mode}) emitted non-JSON output: ${out.trim().slice(0, 300)}`));
          }
        })
      )
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

    // ------------------------------------------------------------------
    // 6. PRE-M3 CORRECTION (Issue 1, local mode): restart does NOT overwrite
    //    an edited canonical document — the persisted edit wins over the
    //    code constant (bootstrap-only seeds, durable overlay authority).
    // ------------------------------------------------------------------
    await test('6. Restart does NOT overwrite an edited canonical document (local durable overlay)', async () => {
      // Edit know-sop-001 (same id, changed content) in a child process.
      await runChild('edit-canonical');

      // GENUINE restart: a fresh process re-hydrates from the durable file;
      // the persisted edit must overlay the canonical seed constant.
      const afterRestart = await runChild('verify-edit');
      assert.strictEqual(
        afterRestart.editedContentSurvived,
        true,
        `The edited canonical document must survive a restart; got: ${afterRestart.contentPreview}`
      );
      assert.strictEqual(
        afterRestart.editedVersionSurvived,
        true,
        'The edited version (9.9.9) must survive the restart, not the seed constant version'
      );

      // The durable file itself holds the edit (saveItem replaces by id — no
      // duplicate-id entries).
      const persisted = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf-8'));
      assert.ok(
        persisted['know-sop-001']?.content?.includes('M2-EDIT-PROBE'),
        'The durable file must hold the edited document'
      );
      assert.strictEqual(
        Object.values(persisted).filter((k: any) => k.id === 'know-sop-001').length,
        1,
        'Exactly one know-sop-001 entry may exist (replace-by-id, no duplicates)'
      );

      // Restore the canonical seed set for subsequent tests.
      await runChild('cleanup');
    });

    // ------------------------------------------------------------------
    // 7. PRE-M3 CORRECTION (Issue 2): hash comparison distinguishes
    //    unchanged content from changed content (minimal contract).
    // ------------------------------------------------------------------
    await test('7. isKnowledgeContentUnchanged distinguishes unchanged from changed content', async () => {
      const content = 'SOP-001 body text for the change-detection contract probe.';
      const recorded = computeKnowledgeContentHash(content);
      assert.strictEqual(
        isKnowledgeContentUnchanged(recorded, content),
        true,
        'Identical content must compare as unchanged'
      );
      assert.strictEqual(
        isKnowledgeContentUnchanged(recorded, content + ' (edited)'),
        false,
        'Changed content must compare as changed'
      );
      assert.strictEqual(
        isKnowledgeContentUnchanged(undefined, content),
        false,
        'A missing/blank stored hash must never claim unchanged'
      );
    });

    // ------------------------------------------------------------------
    // 8. PRE-M3 CORRECTION (Issue 1, authoritative Prisma mode): fresh
    //    database → canonical seeds created (A); restart after an edit →
    //    the edited row is preserved, never overwritten by the constants (B).
    //    Runs against a throwaway SQLite database in authoritative mode.
    // ------------------------------------------------------------------
    await test('8. Authoritative mode: seeds bootstrap a fresh db; a restart never overwrites an edited document', async () => {
      // Fresh throwaway database (remove any stale file from an earlier run).
      fs.rmSync(AUTHORITY_DB, { force: true });
      execFileSync(
        'bunx',
        ['prisma', 'db', 'push', '--schema', 'prisma/schema.prisma', '--accept-data-loss', '--skip-generate'],
        {
          env: { ...process.env, DATABASE_URL: `file:${AUTHORITY_DB}` },
          stdio: 'pipe',
          timeout: 120_000,
        }
      );
      try {
        // A. Fresh database: the first store usage bootstraps the 8 seeds.
        const seeded = await runAuthorityChild('seed-count');
        assert.strictEqual(
          seeded.canonicalSeedCount,
          CANONICAL_COMPANY_KNOWLEDGE.length,
          `A fresh authoritative db must be bootstrapped with all ${CANONICAL_COMPANY_KNOWLEDGE.length} canonical seeds, got ${seeded.canonicalSeedCount}`
        );

        // Edit know-sop-001 through the explicit write path.
        await runAuthorityChild('edit-canonical');

        // B. GENUINE restart: a fresh process re-runs ensurePrismaSeeded —
        // the edited row must be preserved, not overwritten.
        const afterRestart = await runAuthorityChild('read-canonical');
        assert.strictEqual(
          afterRestart.servedContentHasEdit,
          true,
          'The edited canonical document must survive an authoritative-mode restart'
        );
        assert.strictEqual(
          afterRestart.servedVersion,
          '9.9.9',
          'The served document must be the edited version, not the seed constant'
        );
        assert.strictEqual(
          afterRestart.rowHashDiffersFromSeedConstant,
          true,
          'The persisted row hash must reflect the EDITED content (not the code constant)'
        );
        assert.strictEqual(
          afterRestart.rowHashMatchesEditedContent,
          true,
          'The persisted row hash must equal SHA-256 of its own content'
        );
      } finally {
        fs.rmSync(AUTHORITY_DB, { force: true });
      }
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
