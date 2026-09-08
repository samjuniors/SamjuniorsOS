import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { isDatabaseAvailable, requireDatabase } from '../lib/server/db/prisma';

/**
 * ============================================================================
 * SAMJUNIORS OS — PHASE 2.1 DATABASE FOUNDATION TEST SUITE
 * ============================================================================
 * 
 * Validates:
 * 1. Prisma schema completeness and syntactic correctness (npx prisma validate)
 * 2. Deterministic baseline migration generation & DDL coverage
 * 3. Required constraints (primary keys, unique keys, foreign keys)
 * 4. Required indexes for high-frequency queries, payload hashes, and idempotency
 * 5. Epistemic provenance and workflow-approval relations
 * 6. Database availability and fail-closed security semantics
 * ============================================================================
 */

async function runDatabaseFoundationSuite() {
  console.log('================================================================');
  console.log('📦 SAMJUNIORS OS — PHASE 2.1 DATABASE FOUNDATION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function recordPass(testName: string) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  }

  function recordFail(testName: string, error: any) {
    console.error(`  ✗ FAIL: ${testName}`);
    console.error(`    ${error?.message || error}`);
    failed++;
  }

  // --- Group 1: Prisma Schema Validation ---
  console.log('--- Group 1: Prisma Schema Validation & Model Registry ---');
  try {
    const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
    assert(fs.existsSync(schemaPath), 'prisma/schema.prisma must exist');
    recordPass('prisma/schema.prisma file exists');

    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

    // Validate using Prisma CLI
    const validateOutput = execSync('npx prisma validate', {
      encoding: 'utf-8',
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/test?schema=public',
        DIRECT_URL: process.env.DIRECT_URL || 'postgresql://postgres:postgres@localhost:5432/test?schema=public',
      },
    });
    assert(validateOutput.includes('is valid'), 'npx prisma validate must confirm valid schema');
    recordPass('npx prisma validate succeeds with exit code 0');

    // Verify all 18 models are declared
    const expectedModels = [
      'User',
      'CompanyState',
      'CompanyKnowledge',
      'CompanyMemory',
      'WorkflowDefinition',
      'WorkflowInstance',
      'ScheduledWorkItem',
      'ApprovalRecord',
      'SideEffectAudit',
      'TelemetryMetric',
      'AgentRun',
      'EpistemicSource',
      'EpistemicSignal',
      'EpistemicClaim',
      'EpistemicVerification',
      'CanonicalFact',
      'IdempotencyRecord',
      'DistributedLease',
    ];

    for (const model of expectedModels) {
      assert(
        schemaContent.includes(`model ${model}`),
        `Model ${model} must be defined in schema.prisma`
      );
    }
    recordPass(`All 18 core models present in schema (${expectedModels.length}/${expectedModels.length})`);
  } catch (err) {
    recordFail('Prisma schema validation', err);
  }

  // --- Group 2: Migration Script & DDL Verification ---
  console.log('\n--- Group 2: Baseline Migration Script & DDL Verification ---');
  try {
    const migrationDir = path.resolve(process.cwd(), 'prisma/migrations/20260908100000_phase2_1_foundation');
    assert(fs.existsSync(migrationDir), 'Baseline migration directory must exist');
    recordPass('Baseline migration directory exists');

    const migrationSqlPath = path.join(migrationDir, 'migration.sql');
    assert(fs.existsSync(migrationSqlPath), 'migration.sql must exist');
    recordPass('migration.sql file exists');

    const sql = fs.readFileSync(migrationSqlPath, 'utf-8');

    // Check all expected tables are created in SQL
    const expectedTables = [
      'users',
      'company_state',
      'company_knowledge',
      'company_memories',
      'workflow_definitions',
      'workflow_instances',
      'scheduled_work_items',
      'approval_records',
      'side_effect_audits',
      'telemetry_metrics',
      'agent_runs',
      'epistemic_sources',
      'epistemic_signals',
      'epistemic_claims',
      'epistemic_verifications',
      'canonical_facts',
      'idempotency_records',
      'distributed_leases',
    ];

    for (const table of expectedTables) {
      assert(
        sql.includes(`CREATE TABLE "${table}"`),
        `migration.sql must contain CREATE TABLE "${table}"`
      );
    }
    recordPass(`migration.sql contains all 18 table DDL definitions (${expectedTables.length}/${expectedTables.length})`);

    // Verify migration_lock.toml exists
    const lockPath = path.resolve(process.cwd(), 'prisma/migrations/migration_lock.toml');
    assert(fs.existsSync(lockPath), 'migration_lock.toml must exist');
    assert(fs.readFileSync(lockPath, 'utf-8').includes('provider = "postgresql"'), 'migration_lock.toml must specify postgresql');
    recordPass('migration_lock.toml specifies postgresql provider');
  } catch (err) {
    recordFail('Migration DDL verification', err);
  }

  // --- Group 3: Unique Constraints & Key Integrity ---
  console.log('\n--- Group 3: Unique Constraints & Key Integrity ---');
  try {
    const sql = fs.readFileSync(
      path.resolve(process.cwd(), 'prisma/migrations/20260908100000_phase2_1_foundation/migration.sql'),
      'utf-8'
    );

    // Verify idempotency key unique constraint
    assert(
      sql.includes('CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key")'),
      'Idempotency key must have a UNIQUE index'
    );
    recordPass('IdempotencyRecord has UNIQUE constraint on "key"');

    // Verify epistemic verification claim unique constraint (1:1 claim to verification)
    assert(
      sql.includes('CREATE UNIQUE INDEX "epistemic_verifications_claimId_key" ON "epistemic_verifications"("claimId")'),
      'Epistemic verification must enforce 1:1 relation per claim via UNIQUE index'
    );
    recordPass('EpistemicVerification has UNIQUE constraint on "claimId"');

    // Verify workflow definitions compound uniqueness (id + version)
    assert(
      sql.includes('CREATE UNIQUE INDEX "workflow_definitions_id_version_key" ON "workflow_definitions"("id", "version")'),
      'WorkflowDefinition must enforce compound uniqueness on (id, version)'
    );
    recordPass('WorkflowDefinition has UNIQUE constraint on (id, version)');

    // Verify distributed lease primary key
    assert(
      sql.includes('CONSTRAINT "distributed_leases_pkey" PRIMARY KEY ("resourceKey")'),
      'DistributedLease must use resourceKey as primary key'
    );
    recordPass('DistributedLease enforces primary key on "resourceKey"');
  } catch (err) {
    recordFail('Unique constraints verification', err);
  }

  // --- Group 4: Required Indexes for Performance & Safety ---
  console.log('\n--- Group 4: Required Indexes for High-Frequency Queries ---');
  try {
    const sql = fs.readFileSync(
      path.resolve(process.cwd(), 'prisma/migrations/20260908100000_phase2_1_foundation/migration.sql'),
      'utf-8'
    );

    // Approval payload hash index (mandatory for fast cryptographic binding lookup)
    assert(
      sql.includes('CREATE INDEX "approval_records_payloadHash_idx" ON "approval_records"("payloadHash")'),
      'approval_records must index payloadHash'
    );
    recordPass('ApprovalRecord has index on payloadHash');

    // Side effect audit requestId index
    assert(
      sql.includes('CREATE INDEX "side_effect_audits_requestId_idx" ON "side_effect_audits"("requestId")'),
      'side_effect_audits must index requestId'
    );
    recordPass('SideEffectAudit has index on requestId');

    // Scheduled work idempotency key index
    assert(
      sql.includes('CREATE INDEX "scheduled_work_items_idempotencyKey_idx" ON "scheduled_work_items"("idempotencyKey")'),
      'scheduled_work_items must index idempotencyKey'
    );
    recordPass('ScheduledWorkItem has index on idempotencyKey');

    // Agent run agentId + status + createdAt index
    assert(
      sql.includes('CREATE INDEX "agent_runs_agentId_status_createdAt_idx"'),
      'agent_runs must index (agentId, status, createdAt)'
    );
    recordPass('AgentRun has compound index on (agentId, status, createdAt)');

    // Canonical facts validityState + category index
    assert(
      sql.includes('CREATE INDEX "canonical_facts_validityState_category_idx"'),
      'canonical_facts must index (validityState, category)'
    );
    recordPass('CanonicalFact has compound index on (validityState, category)');

    // Distributed lease expiresAt index
    assert(
      sql.includes('CREATE INDEX "distributed_leases_expiresAt_idx" ON "distributed_leases"("expiresAt")'),
      'distributed_leases must index expiresAt'
    );
    recordPass('DistributedLease has index on expiresAt for lease expiry pruning');
  } catch (err) {
    recordFail('Index verification', err);
  }

  // --- Group 5: Foreign Keys & Relational Provenance ---
  console.log('\n--- Group 5: Foreign Keys & Relational Provenance ---');
  try {
    const sql = fs.readFileSync(
      path.resolve(process.cwd(), 'prisma/migrations/20260908100000_phase2_1_foundation/migration.sql'),
      'utf-8'
    );

    // Epistemic signal to source
    assert(
      sql.includes('ALTER TABLE "epistemic_signals" ADD CONSTRAINT "epistemic_signals_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "epistemic_sources"("id")'),
      'epistemic_signals must reference epistemic_sources'
    );
    recordPass('EpistemicSignal references EpistemicSource with FK');

    // Epistemic claim to source
    assert(
      sql.includes('ALTER TABLE "epistemic_claims" ADD CONSTRAINT "epistemic_claims_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "epistemic_sources"("id")'),
      'epistemic_claims must reference epistemic_sources'
    );
    recordPass('EpistemicClaim references EpistemicSource with FK');

    // Canonical fact to claim (RESTRICT deletion to preserve facts)
    assert(
      sql.includes('ALTER TABLE "canonical_facts" ADD CONSTRAINT "canonical_facts_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "epistemic_claims"("id") ON DELETE RESTRICT'),
      'canonical_facts must reference epistemic_claims with ON DELETE RESTRICT'
    );
    recordPass('CanonicalFact references EpistemicClaim with ON DELETE RESTRICT to protect truth lineage');

    // Approval records to workflow instances (CASCADE delete when workflow instance deleted)
    assert(
      sql.includes('ALTER TABLE "approval_records" ADD CONSTRAINT "approval_records_workflowInstanceId_fkey"'),
      'approval_records must reference workflow_instances'
    );
    recordPass('ApprovalRecord references WorkflowInstance with FK');
  } catch (err) {
    recordFail('Foreign key verification', err);
  }

  // --- Group 6: Database Health & Fail-Closed Behavior ---
  console.log('\n--- Group 6: Database Availability & Fail-Closed Behavior ---');
  try {
    // In local environment without running Postgres:
    const available = await isDatabaseAvailable();
    // Since DATABASE_URL is not connected to a live server, should return false safely
    assert(typeof available === 'boolean', 'isDatabaseAvailable must return boolean');
    recordPass(`isDatabaseAvailable returned safely (current: ${available})`);

    // requireDatabase must throw with clear error when database is unreachable
    if (!available) {
      let threwExpected = false;
      try {
        await requireDatabase();
      } catch (err: any) {
        if (err.message.includes('PostgreSQL Database Unavailable')) {
          threwExpected = true;
        }
      }
      assert(threwExpected, 'requireDatabase must fail closed with explicit error when database is offline');
      recordPass('requireDatabase fails closed when PostgreSQL is unavailable');
    } else {
      const client = await requireDatabase();
      assert(typeof client !== 'undefined', 'requireDatabase returns Prisma client when available');
      recordPass('requireDatabase returned active PrismaClient');
    }
  } catch (err) {
    recordFail('Database availability & fail-closed behavior', err);
  }

  // --- Group 7: Environment & Tooling Configuration ---
  console.log('\n--- Group 7: Environment & Tooling Configuration ---');
  try {
    const envExample = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf-8');
    assert(envExample.includes('DATABASE_URL='), '.env.example must document DATABASE_URL');
    assert(envExample.includes('DIRECT_URL='), '.env.example must document DIRECT_URL');
    recordPass('.env.example documents DATABASE_URL and DIRECT_URL');

    const dockerComposePath = path.resolve(process.cwd(), 'docker-compose.yml');
    assert(fs.existsSync(dockerComposePath), 'docker-compose.yml must exist');
    const dockerContent = fs.readFileSync(dockerComposePath, 'utf-8');
    assert(dockerContent.includes('postgres:16'), 'docker-compose.yml must specify postgres:16');
    recordPass('docker-compose.yml configured with clean PostgreSQL 16 service');
  } catch (err) {
    recordFail('Environment and tooling configuration', err);
  }

  // --- Summary ---
  console.log('\n================================================================');
  console.log(`Phase 2.1 Database Foundation Suite Complete: ${passed}/${passed + failed} Passed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDatabaseFoundationSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
