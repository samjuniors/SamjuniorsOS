/**
 * Test Suite: G2.3 Store Migration Parity & Rollback Rehearsal Test
 *
 * Verifies Gate G2.3 exit criteria:
 * 1. Parity tests old vs new across all 4 file-backed domains:
 *    - decisions
 *    - council deliberations
 *    - conversations & chat messages
 *    - personal memories
 * 2. Rollback rehearsed: database exported back to file store with zero data loss.
 * 3. Verified parity on both synthetic seeded dataset and live repository .data/.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import {
  migrateFileStoresToSqlite,
  verifyMigrationParity,
  rehearseRollback,
} from '../../scripts/migrate-file-stores-to-sqlite';

const repoRoot = path.resolve(__dirname, '../../');
const fixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'g2_3_seed');
const exportDir = path.join(repoRoot, 'tests', 'fixtures', 'g2_3_export');
const testDbName = `test_parity_${Date.now()}.db`;
const testDbPath = path.join(repoRoot, 'prisma', 'db', testDbName);
const testDbUrl = `file:${testDbPath.replace(/\\/g, '/')}`;

async function runParitySuite() {
  console.log('--- [Test Suite] G2.3 Store Migration Parity & Rollback Rehearsal ---');

  // 1. Setup isolated test database with versioned migrations
  console.log('1. Setting up fresh test SQLite database with prisma migrate deploy...');
  mkdirSync(path.join(repoRoot, 'prisma', 'db'), { recursive: true });
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  execSync('npx prisma migrate deploy', {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'ignore',
  });
  console.log('   ✓ Database deployed with versioned migrations');

  const prisma = new PrismaClient({
    datasources: { db: { url: testDbUrl } },
  });

  try {
    // 2. Create rich seeded dataset
    console.log('2. Generating rich seeded dataset for decisions, council, conversations, and memories...');
    mkdirSync(fixtureDir, { recursive: true });

    const seedDecisions = {
      'seed-dec-101': {
        decisionId: 'seed-dec-101',
        creationRequestId: 'req-101',
        stateVersion: 2,
        title: 'Adopt Hybrid Vector & Relational Storage',
        problemStatement: 'Search latency requires relational indexing alongside vector memory.',
        proposedAction: 'Deploy SQLite relational schema with JSON indices.',
        category: 'architectural',
        proposer: 'coo',
        accountableOwner: 'founder',
        createdAt: '2026-10-01T12:00:00.000Z',
        evidenceFactIds: ['fact-1', 'fact-2'],
        assumptions: ['SQLite handles 100k queries/sec'],
        uncertainty: { level: 'low', description: 'Empirically tested in staging' },
        impact: 'high',
        reversibility: 'reversible',
        status: 'approved',
        approvalRequired: true,
        decidedBy: 'founder',
        decidedAt: '2026-10-01T14:00:00.000Z',
        decisionReason: 'Passed architectural review',
        approvedPayloadHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        transitions: [
          {
            transitionId: 'tr-1',
            fromStatus: 'proposed',
            toStatus: 'approved',
            actor: 'founder',
            timestamp: '2026-10-01T14:00:00.000Z',
            reason: 'Approved',
            stateVersion: 2,
          },
        ],
      },
      'seed-dec-102': {
        decisionId: 'seed-dec-102',
        creationRequestId: 'req-102',
        stateVersion: 1,
        title: 'Expand Staging Automated Health Checks',
        problemStatement: 'Need instant verification of DB latency.',
        proposedAction: 'Add /api/health with SELECT 1 check.',
        category: 'operational',
        proposer: 'pm',
        accountableOwner: 'founder',
        createdAt: '2026-10-02T09:00:00.000Z',
        evidenceFactIds: [],
        assumptions: [],
        uncertainty: { level: 'low', description: 'Standard health pattern' },
        impact: 'medium',
        reversibility: 'reversible',
        status: 'proposed',
        approvalRequired: true,
        transitions: [],
      },
    };
    writeFileSync(path.join(fixtureDir, 'decisions.json'), JSON.stringify(seedDecisions, null, 2));

    const seedCouncil = {
      'delib-seed-201': {
        id: 'delib-seed-201',
        deliberationId: 'delib-seed-201',
        idempotencyKey: 'idemp-seed-201',
        leaseStatus: 'completed',
        claimedByPid: 4242,
        claimedAt: '2026-10-02T10:00:00.000Z',
        expiresAt: '2026-10-02T10:05:00.000Z',
        fingerprint: 'fp-201-sha256',
        directive: 'Review Q4 growth strategy',
        status: 'consensus_achieved',
        verdict: 'Approved with high feasibility',
        result: {
          deliberationId: 'delib-seed-201',
          directive: 'Review Q4 growth strategy',
          round: 1,
          maxRounds: 1,
          status: 'consensus_achieved',
          verdict: 'Approved with high feasibility',
          cooRuling: 'Proceed to implementation',
          specialistCritiques: [
            {
              agentId: 'researcher',
              agentName: 'Dr. Aris Thorne',
              role: 'researcher',
              status: 'passed',
              summary: 'Empirically grounded',
              critiqueMarkdown: '# Feasibility\nLooks solid.',
              keyFindings: ['Finding A'],
              risksOrFrictions: [],
              recommendations: [],
              provenance: { source: 'research' },
            },
          ],
          frictions: [],
          recommendedNextActions: ['Action 1'],
          startedAt: '2026-10-02T10:00:00.000Z',
          completedAt: '2026-10-02T10:00:05.000Z',
          totalCalls: 2,
          durationMs: 5000,
          verificationPassed: true,
        },
        orphanedProviderCalls: [],
      },
    };
    writeFileSync(path.join(fixtureDir, 'council_deliberations.json'), JSON.stringify(seedCouncil, null, 2));

    const seedConversations = {
      'conv-seed-301': {
        id: 'conv-seed-301',
        founderId: 'founder-1',
        title: 'Weekly Sync',
        agentId: 'sophia',
        status: 'active',
        metadata: { tags: ['weekly'] },
        createdAt: '2026-10-03T11:00:00.000Z',
        updatedAt: '2026-10-03T11:05:00.000Z',
      },
    };
    writeFileSync(path.join(fixtureDir, 'conversations.json'), JSON.stringify(seedConversations, null, 2));

    const seedChatMessages = {
      'msg-seed-401': {
        id: 'msg-seed-401',
        conversationId: 'conv-seed-301',
        sender: 'founder',
        role: 'user',
        content: 'Sophia, review our current burn rate.',
        intent: 'financial_query',
        confidence: 0.98,
        createdAt: '2026-10-03T11:00:10.000Z',
      },
      'msg-seed-402': {
        id: 'msg-seed-402',
        conversationId: 'conv-seed-301',
        sender: 'assistant',
        role: 'assistant',
        content: 'Gross margin is holding above 83.9% with compute burn well below budget.',
        intent: 'informational_reply',
        confidence: 0.95,
        createdAt: '2026-10-03T11:00:15.000Z',
      },
    };
    writeFileSync(path.join(fixtureDir, 'chat_messages.json'), JSON.stringify(seedChatMessages, null, 2));

    const seedMemories = {
      'mem-seed-501': {
        id: 'mem-seed-501',
        founderId: 'founder-1',
        memoryType: 'INTERACTION_PREFERENCE',
        content: 'Prefers concise bullet points in morning briefing.',
        provenance: 'founder_direct',
        confidence: 0.9,
        active: true,
        lifecycleState: 'ACTIVE',
        createdAt: '2026-10-03T08:00:00.000Z',
        updatedAt: '2026-10-03T08:00:00.000Z',
      },
    };
    writeFileSync(path.join(fixtureDir, 'sophia_memories.json'), JSON.stringify(seedMemories, null, 2));
    console.log('   ✓ Seed dataset generated');

    // 3. Run migration on seeded dataset
    console.log('3. Running migration on seeded dataset...');
    const result = await migrateFileStoresToSqlite({
      prisma,
      dataDir: fixtureDir,
      log: (msg) => console.log(`   ${msg}`),
    });

    if (!result.parity.passed) {
      throw new Error(`Seeded migration parity check failed: ${result.parity.discrepancies.join(', ')}`);
    }
    console.log('   ✓ Seeded migration achieved 100% semantic parity across all domains');

    // 4. Test detailed entity field parity
    console.log('4. Asserting deep semantic field parity (hashes, JSON arrays, states)...');
    const migratedDec = await (prisma as any).companyDecision.findUnique({
      where: { decisionId: 'seed-dec-101' },
    });
    if (!migratedDec) throw new Error('migratedDec not found in database');
    if (migratedDec.approvedPayloadHash !== seedDecisions['seed-dec-101'].approvedPayloadHash) {
      throw new Error('approvedPayloadHash was not preserved during migration');
    }
    if (migratedDec.transitions.length !== 1 || migratedDec.transitions[0].actor !== 'founder') {
      throw new Error('Transitions array was corrupted during migration');
    }

    const migratedCouncil = await (prisma as any).councilDeliberation.findUnique({
      where: { idempotencyKey: 'idemp-seed-201' },
    });
    if (!migratedCouncil) throw new Error('migratedCouncil not found in database');
    if (migratedCouncil.result?.specialistCritiques?.[0]?.agentName !== 'Dr. Aris Thorne') {
      throw new Error('Specialist critique was corrupted during council migration');
    }

    const migratedMessages = await (prisma as any).chatMessage.findMany({
      where: { conversationId: 'conv-seed-301' },
    });
    if (migratedMessages.length !== 2) {
      throw new Error(`Expected 2 chat messages, found ${migratedMessages.length}`);
    }
    console.log('   ✓ Deep semantic integrity verified');

    // 5. Rehearse Rollback
    console.log('5. Rehearsing rollback (database export back to JSON & fidelity check)...');
    const rollback = await rehearseRollback(prisma, exportDir);
    if (!rollback.passed) {
      throw new Error(`Rollback rehearsal failed: ${rollback.fidelityDiscrepancies.join(', ')}`);
    }
    const exportedDec = JSON.parse(readFileSync(path.join(exportDir, 'decisions.json'), 'utf8'));
    if (!exportedDec['seed-dec-101'] || exportedDec['seed-dec-101'].title !== seedDecisions['seed-dec-101'].title) {
      throw new Error('Rollback fidelity check failed on decision record export');
    }
    console.log('   ✓ Rollback rehearsal PASSED: 100% export fidelity with zero data loss');

    // 6. Test migration of live repository .data/
    console.log('6. Validating migration against live repository .data/ directory...');
    const liveDataDir = path.join(repoRoot, '.data');
    if (existsSync(liveDataDir)) {
      const liveResult = await migrateFileStoresToSqlite({
        prisma,
        dataDir: liveDataDir,
        log: (msg) => console.log(`   ${msg}`),
      });

      if (!liveResult.parity.passed) {
        throw new Error(`Live .data migration parity failed: ${liveResult.parity.discrepancies.join(', ')}`);
      }
      console.log(`   ✓ Live .data migrated cleanly with ${liveResult.counts.decisions} decisions, ${liveResult.counts.councilDeliberations} deliberations, ${liveResult.counts.chatMessages} messages, ${liveResult.counts.sophiaMemories} memories`);
    }

    console.log('\nAll G2.3 parity, rollback, and migration tests PASSED cleanly.\n');
  } finally {
    await prisma.$disconnect();
    // Cleanup temporary fixtures and database
    if (existsSync(fixtureDir)) rmSync(fixtureDir, { recursive: true, force: true });
    if (existsSync(exportDir)) rmSync(exportDir, { recursive: true, force: true });
    if (existsSync(testDbPath)) {
      try { unlinkSync(testDbPath); } catch {}
    }
  }
}

runParitySuite().catch((err) => {
  console.error('\nFAILED: G2.3 Test Suite error:', err);
  process.exit(1);
});
