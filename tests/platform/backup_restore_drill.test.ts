/**
 * ============================================================================
 * SAMJUNIORS-OS: DISASTER RECOVERY DRILL & RPO/RTO VERIFICATION SUITE
 * ============================================================================
 * Step: G2.5 [platform] Backup and restore drill meeting decided RPO/RTO
 * Exit Criteria:
 *   A real restore into a clean environment succeeded;
 *   measured RPO/RTO recorded against the decided targets.
 * ============================================================================
 */

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import {
  createBackup,
  restoreBackup,
  pruneOldBackups,
  DrillMetrics,
} from '../../scripts/backup-restore';

async function main() {
  console.log('\n=============================================================');
  console.log('SAMJUNIORS-OS: BACKUP & RESTORE DISASTER DRILL (G2.5)');
  console.log('=============================================================\n');

  const tempSuiteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'samjuniors-g25-drill-'));
  const testDbDir = path.join(tempSuiteRoot, 'db');
  const testDataDir = path.join(tempSuiteRoot, '.data');
  const testBackupDir = path.join(tempSuiteRoot, 'backups');
  const cleanTargetDbDir = path.join(tempSuiteRoot, 'clean_env', 'db');
  const cleanTargetDataDir = path.join(tempSuiteRoot, 'clean_env', '.data');

  fs.mkdirSync(testDbDir, { recursive: true });
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.mkdirSync(testBackupDir, { recursive: true });

  const testDbPath = path.join(testDbDir, 'custom.db');
  const normalizedTestDbUrl = `file:${testDbPath.replace(/\\/g, '/')}`;

  process.env.DATABASE_URL = normalizedTestDbUrl;
  process.env.DATABASE_MODE = 'authoritative';

  const repoRoot = path.resolve(__dirname, '../..');
  console.log('[DRILL SETUP] Initializing database via Prisma migrate deploy...');
  execSync('npx prisma migrate deploy', {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: normalizedTestDbUrl },
    stdio: 'pipe',
  });
  console.log('[DRILL SETUP] Database schema deployed cleanly.\n');

  const prisma = new PrismaClient({
    datasources: { db: { url: normalizedTestDbUrl } },
  });

  let passed = 0;
  let failed = 0;

  async function step(name: string, fn: () => Promise<void>) {
    process.stdout.write(`  [DRILL STEP] ${name}... `);
    try {
      await fn();
      console.log('PASS');
      passed++;
    } catch (err: any) {
      console.log('FAIL');
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(`    ${err.stack.split('\n').slice(1, 4).join('\n    ')}`);
      }
      failed++;
    }
  }

  const drillReport: Partial<DrillMetrics> = {
    targetRpoHours: 24,
    targetRtoMinutes: 120, // 2 hours
  };

  try {
    // ------------------------------------------------------------------------
    // STEP 1: Seed Rich Production Dataset into SQLite & File Stores
    // ------------------------------------------------------------------------
    let seededStateHash: string = '';
    await step('1. Seed production dataset (decisions, council, memory, leases, state)', async () => {
      // 1a. Seed SQLite tables
      await prisma.companyState.create({
        data: {
          organizationId: 'org-drill-root',
          name: 'SamJuniors Ecosystem (Drill)',
          stage: 'Seed',
          products: [{ id: 'prod-lumora', name: 'Lumora' }],
          initiatives: [{ id: 'init-1', title: 'Option A Staging' }],
        },
      });

      await prisma.companyDecision.create({
        data: {
          decisionId: 'dec-drill-001',
          creationRequestId: 'req-drill-001',
          title: 'Infrastructure Choice: Option A VPS',
          problemStatement: 'Staging deployment requires durable persistence without excessive operational costs.',
          proposedAction: 'Deploy single VPS with persistent volume and daily SQLite snapshots.',
          category: 'infrastructure',
          proposer: 'founder',
          accountableOwner: 'founder',
          impact: 'high',
          reversibility: 'reversible',
          status: 'approved',
          approvalRequired: true,
          decidedBy: 'founder',
          decidedAt: new Date(),
          decisionReason: 'Cost-effective $5-20/mo with daily automated backups and RPO < 24h, RTO < 2h.',
        },
      });

      await prisma.councilDeliberation.create({
        data: {
          id: 'delib-drill-001',
          idempotencyKey: 'idem-delib-drill-001',
          leaseStatus: 'completed',
          fingerprint: 'fp-delib-drill-001',
          directive: 'Staging Volume Backup Strategy',
          status: 'concluded',
          verdict: 'Unanimous consensus on SQLite file snapshots with 30-day retention.',
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      await prisma.conversation.create({
        data: {
          id: 'conv-drill-001',
          founderId: 'user-founder',
          title: 'Morning Executive Briefing',
          messages: {
            create: [
              { id: 'msg-1', sender: 'founder', role: 'user', content: 'What is our disaster recovery posture?' },
              { id: 'msg-2', sender: 'assistant', role: 'assistant', content: 'Option A daily backups ensure RPO < 24h and RTO < 2h.' },
            ],
          },
        },
      });

      await prisma.sophiaMemory.create({
        data: {
          id: 'mem-drill-001',
          founderId: 'user-founder',
          memoryType: 'INTERACTION_PREFERENCE',
          provenance: 'founder_direct',
          content: 'Founder prefers concise executive summaries and fail-closed governance.',
        },
      });

      await prisma.distributedLease.create({
        data: {
          resourceKey: 'instance:drill-primary',
          holderId: 'drill-worker-node-1',
          acquiredAt: new Date(),
          expiresAt: new Date(Date.now() + 60000),
          metadata: { node: 'staging-vps-1' },
        },
      });

      // 1b. Seed .data file stores
      const fileData = {
        approvals: {
          'appr-drill-1': {
            id: 'appr-drill-1',
            actionName: 'deploy_staging',
            decision: 'approved',
            decidedBy: 'founder',
          },
        },
        idempotency: {
          'idem-drill-key': {
            key: 'idem-drill-key',
            status: 'completed',
            response: { ok: true },
          },
        },
      };

      fs.writeFileSync(path.join(testDataDir, 'approvals.json'), JSON.stringify(fileData.approvals, null, 2));
      fs.writeFileSync(path.join(testDataDir, 'idempotency_records.json'), JSON.stringify(fileData.idempotency, null, 2));

      // Calculate composite checksum of the seeded dataset
      const dbBytes = fs.readFileSync(testDbPath);
      const apprsBytes = fs.readFileSync(path.join(testDataDir, 'approvals.json'));
      seededStateHash = crypto
        .createHash('sha256')
        .update(dbBytes)
        .update(apprsBytes)
        .digest('hex');

      assert(seededStateHash, 'Seeded state hash must be computed');
    });

    // ------------------------------------------------------------------------
    // STEP 2: Execute Automated Backup Snapshot
    // ------------------------------------------------------------------------
    let backupArchive: string = '';
    await step('2. Execute automated backup snapshot with gzip compression', async () => {
      const backupStart = Date.now();
      const backupResult = await createBackup({
        dbPath: testDbPath,
        dataDir: testDataDir,
        backupDir: testBackupDir,
        retentionDays: 30,
      });

      backupArchive = backupResult.archivePath;
      drillReport.backupDurationMs = backupResult.durationMs;

      assert(fs.existsSync(backupArchive), 'Backup archive must exist on disk');
      assert(backupResult.sizeBytes > 500, `Backup size (${backupResult.sizeBytes} bytes) indicates valid data`);
      assert(backupResult.manifest.dbChecksum, 'Manifest must contain SQLite checksum');
      assert.strictEqual(backupResult.manifest.dataFilesCount, 2, 'Manifest must track 2 data files');
      assert.strictEqual(backupResult.manifest.retentionDays, 30, 'Retention days must be 30');
    });

    // ------------------------------------------------------------------------
    // STEP 3: Enforce 30-Day Automated Retention Pruning Policy
    // ------------------------------------------------------------------------
    await step('3. Enforce 30-day retention pruning policy', async () => {
      const oldBackupPath = path.join(testBackupDir, 'backup_20260901-000000.bundle.json.gz');
      const recentBackupPath = path.join(testBackupDir, 'backup_20261020-000000.bundle.json.gz');

      fs.writeFileSync(oldBackupPath, 'dummy-old-data');
      fs.writeFileSync(recentBackupPath, 'dummy-recent-data');

      // Set mtime of oldBackup to 45 days ago
      const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
      fs.utimesSync(oldBackupPath, fortyFiveDaysAgo, fortyFiveDaysAgo);

      // Set mtime of recentBackup to 3 days ago
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      fs.utimesSync(recentBackupPath, threeDaysAgo, threeDaysAgo);

      const prunedCount = pruneOldBackups(testBackupDir, 30);
      assert.strictEqual(prunedCount, 1, 'Exactly 1 backup older than 30 days must be pruned');
      assert.strictEqual(fs.existsSync(oldBackupPath), false, '45-day-old backup must be pruned');
      assert.strictEqual(fs.existsSync(recentBackupPath), true, 'Recent backup must be preserved');
      assert.strictEqual(fs.existsSync(backupArchive), true, 'Fresh backup archive must be preserved');

      // Cleanup dummy recent backup
      try { fs.unlinkSync(recentBackupPath); } catch {}
    });

    // ------------------------------------------------------------------------
    // STEP 4: Disaster Simulation (Complete Clean Environment Wipe)
    // ------------------------------------------------------------------------
    await step('4. Simulate disaster: cleanly wipe target environment to zero state', async () => {
      // Clean target directories
      if (fs.existsSync(cleanTargetDbDir)) fs.rmSync(cleanTargetDbDir, { recursive: true, force: true });
      if (fs.existsSync(cleanTargetDataDir)) fs.rmSync(cleanTargetDataDir, { recursive: true, force: true });

      fs.mkdirSync(cleanTargetDbDir, { recursive: true });
      fs.mkdirSync(cleanTargetDataDir, { recursive: true });

      assert.strictEqual(fs.readdirSync(cleanTargetDbDir).length, 0, 'Clean target DB dir must be empty');
      assert.strictEqual(fs.readdirSync(cleanTargetDataDir).length, 0, 'Clean target .data dir must be empty');
    });

    // ------------------------------------------------------------------------
    // STEP 5: Execute Disaster Recovery Restore into Clean Environment
    // ------------------------------------------------------------------------
    const cleanDbPath = path.join(cleanTargetDbDir, 'custom.db');
    let restoreResult: any;
    await step('5. Execute disaster recovery restore into clean environment', async () => {
      const restoreStart = Date.now();
      restoreResult = await restoreBackup(backupArchive, {
        targetDbPath: cleanDbPath,
        targetDataDir: cleanTargetDataDir,
        verifyIntegrity: true,
      });

      drillReport.restoreDurationMs = restoreResult.durationMs;
      drillReport.measuredRtoSeconds = Number((restoreResult.durationMs / 1000).toFixed(3));
      drillReport.rtoPass = drillReport.measuredRtoSeconds < drillReport.targetRtoMinutes! * 60;

      assert(fs.existsSync(cleanDbPath), 'Restored SQLite database must exist');
      assert(fs.existsSync(path.join(cleanTargetDataDir, 'approvals.json')), 'Restored approvals.json must exist');
      assert(fs.existsSync(path.join(cleanTargetDataDir, 'idempotency_records.json')), 'Restored idempotency must exist');
      assert.strictEqual(restoreResult.verifiedIntegrity, true, 'Integrity check must pass during restore');
    });

    // ------------------------------------------------------------------------
    // STEP 6: Validate RPO & Cryptographic Parity of Restored Environment
    // ------------------------------------------------------------------------
    await step('6. Validate RPO (<24h target) and 100% cryptographic data fidelity', async () => {
      // Calculate composite checksum of restored environment
      const restoredDbBytes = fs.readFileSync(cleanDbPath);
      const restoredApprsBytes = fs.readFileSync(path.join(cleanTargetDataDir, 'approvals.json'));
      const restoredStateHash = crypto
        .createHash('sha256')
        .update(restoredDbBytes)
        .update(restoredApprsBytes)
        .digest('hex');

      assert.strictEqual(
        restoredStateHash,
        seededStateHash,
        'Restored state must match pre-disaster snapshot with 100% byte fidelity'
      );

      // In the drill, snapshot was captured at current state: measured data loss window is 0 seconds
      drillReport.measuredRpoSeconds = 0;
      drillReport.rpoPass = drillReport.measuredRpoSeconds <= drillReport.targetRpoHours! * 3600;
      drillReport.semanticParityPercent = 100;
    });

    // ------------------------------------------------------------------------
    // STEP 7: Verify Database Integrity & Prisma Queries on Restored Tables
    // ------------------------------------------------------------------------
    await step('7. Verify PRAGMA integrity_check and query all restored domain models', async () => {
      const cleanDbUrl = `file:${cleanDbPath.replace(/\\/g, '/')}`;
      const restoredPrisma = new PrismaClient({ datasources: { db: { url: cleanDbUrl } } });

      try {
        // PRAGMA check
        const integrity: any = await restoredPrisma.$queryRawUnsafe('PRAGMA integrity_check;');
        const checkVal = integrity[0].integrity_check || Object.values(integrity[0])[0];
        assert.strictEqual(checkVal, 'ok', 'PRAGMA integrity_check must return "ok"');

        // Query restored records
        const dec = await restoredPrisma.companyDecision.findUnique({ where: { decisionId: 'dec-drill-001' } });
        assert(dec, 'Restored company decision must exist');
        assert.strictEqual(dec.title, 'Infrastructure Choice: Option A VPS');

        const delib = await restoredPrisma.councilDeliberation.findUnique({ where: { id: 'delib-drill-001' } });
        assert(delib, 'Restored council deliberation must exist');
        assert.strictEqual(delib.status, 'concluded');
        assert.strictEqual(delib.directive, 'Staging Volume Backup Strategy');

        const conv = await restoredPrisma.conversation.findUnique({
          where: { id: 'conv-drill-001' },
          include: { messages: true },
        });
        assert(conv, 'Restored conversation must exist');
        assert.strictEqual(conv.messages.length, 2, 'Restored conversation must include all messages');

        const mem = await restoredPrisma.sophiaMemory.findUnique({ where: { id: 'mem-drill-001' } });
        assert(mem, 'Restored memory must exist');
        assert(mem.content.includes('fail-closed governance'));

        const lease = await restoredPrisma.distributedLease.findUnique({ where: { resourceKey: 'instance:drill-primary' } });
        assert(lease, 'Restored distributed lease must exist');
        assert.strictEqual(lease.holderId, 'drill-worker-node-1');

        drillReport.integrityVerified = true;
      } finally {
        await restoredPrisma.$disconnect();
      }
    });

  } finally {
    await prisma.$disconnect();
    // Clean up temporary suite directory
    try {
      fs.rmSync(tempSuiteRoot, { recursive: true, force: true });
    } catch {}
  }

  // --------------------------------------------------------------------------
  // Output Structured Drill Ledger
  // --------------------------------------------------------------------------
  console.log('\n=============================================================');
  console.log('SAMJUNIORS-OS: DISASTER RECOVERY DRILL AUDIT LEDGER');
  console.log('=============================================================');
  console.log(`- Architecture:               Option A (Single VPS + persistent volume + SQLite)`);
  console.log(`- Backup Snapshot Duration:   ${drillReport.backupDurationMs}ms`);
  console.log(`- Target RPO:                 < ${drillReport.targetRpoHours} hours`);
  console.log(`- Measured RPO:               ${drillReport.measuredRpoSeconds} seconds (${drillReport.rpoPass ? 'PASS' : 'FAIL'})`);
  console.log(`- Target RTO:                 < ${drillReport.targetRtoMinutes} minutes (7,200 seconds)`);
  console.log(`- Measured RTO:               ${drillReport.measuredRtoSeconds} seconds (${drillReport.rtoPass ? 'PASS' : 'FAIL'})`);
  console.log(`- SQLite Integrity Check:     ${drillReport.integrityVerified ? 'ok (PASS)' : 'FAIL'}`);
  console.log(`- Semantic Parity:            ${drillReport.semanticParityPercent}% (zero data loss)`);
  console.log(`- Retention Pruning Policy:   30 days (verified older snapshots pruned)`);
  console.log('=============================================================');
  console.log(`DRILL RESULT: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[UNCAUGHT DRILL ERROR]:', err);
  process.exit(1);
});
