/**
 * Test Suite: G2.2 Versioned Migrations & 2.3B Schema Integrity Test
 *
 * Verifies Gate G2.2 exit criteria:
 * 1. prisma/migrations exists and contains versioned migration SQL.
 * 2. prisma/migrations/migration_lock.toml pins the sqlite provider per Option A (G0.3 / AUTH-2.3C).
 * 3. All Phase 2.3B schema models exist in prisma/schema.prisma.
 * 4. Migrations apply cleanly to an empty database via prisma migrate deploy.
 * 5. Tables and indices are verifiable in the freshly migrated database.
 */

import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const repoRoot = path.resolve(__dirname, '../../');
const prismaDir = path.join(repoRoot, 'prisma');
const migrationsDir = path.join(prismaDir, 'migrations');
const schemaFile = path.join(prismaDir, 'schema.prisma');
const lockFile = path.join(migrationsDir, 'migration_lock.toml');

async function runSuite() {
  console.log('--- [Test Suite] G2.2 Versioned Migrations & 2.3B Schema Integrity ---');

  // 1. Verify prisma/migrations directory exists
  console.log('1. Checking prisma/migrations structure...');
  if (!existsSync(migrationsDir)) {
    throw new Error(`prisma/migrations does not exist at ${migrationsDir}`);
  }
  const migrationEntries = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (migrationEntries.length === 0) {
    throw new Error('No migration subdirectories found in prisma/migrations');
  }

  for (const dirName of migrationEntries) {
    const sqlPath = path.join(migrationsDir, dirName, 'migration.sql');
    if (!existsSync(sqlPath)) {
      throw new Error(`migration.sql missing in migration folder ${dirName}`);
    }
    const sql = readFileSync(sqlPath, 'utf8');
    if (!sql.includes('CREATE TABLE') || sql.length < 500) {
      throw new Error(`migration.sql in ${dirName} appears invalid or empty`);
    }
  }
  console.log(`   ✓ Found ${migrationEntries.length} versioned migration(s): ${migrationEntries.join(', ')}`);

  // 2. Verify migration_lock.toml
  console.log('2. Validating migration_lock.toml provider...');
  if (!existsSync(lockFile)) {
    throw new Error(`migration_lock.toml missing at ${lockFile}`);
  }
  const lockContent = readFileSync(lockFile, 'utf8');
  if (!lockContent.includes('provider = "sqlite"')) {
    throw new Error(`migration_lock.toml must specify provider = "sqlite" per Option A decision. Found:\n${lockContent}`);
  }
  console.log('   ✓ migration_lock.toml pins provider = "sqlite"');

  // 3. Verify Phase 2.3B schema models in schema.prisma
  console.log('3. Validating Phase 2.3B domain models in schema.prisma...');
  const schemaContent = readFileSync(schemaFile, 'utf8');
  const requiredModels = [
    'User',
    'CompanyState',
    'CompanyKnowledge',
    'CompanyMemory',
    'WorkflowDefinition',
    'WorkflowInstance',
    'ScheduledWorkItem',
    'SchedulerHeartbeat',
    'ApprovalRecord',
    'SideEffectAudit',
    'TelemetryMetric',
    'AgentRun',
    'EpistemicSource',
    'EpistemicSignal',
    'EpistemicClaim',
    'EpistemicVerification',
    'CanonicalFact',
    'DependencyRelation',
    'IdempotencyRecord',
    'DistributedLease',
    'Conversation',
    'ChatMessage',
    'SophiaMemory',
    'CompanyDecision',
    'CouncilDeliberation',
    'CommunicationContact',
    'CommunicationOrganization',
    'CommunicationMessage',
    'CommunicationWebhookEvent',
  ];

  for (const model of requiredModels) {
    const re = new RegExp(`model\\s+${model}\\s+{`);
    if (!re.test(schemaContent)) {
      throw new Error(`Missing required Phase 2.3B model "${model}" in schema.prisma`);
    }
  }
  console.log(`   ✓ All ${requiredModels.length} Phase 2.3B models verified in schema.prisma`);

  // 4. Test clean migration against an empty database
  console.log('4. Testing prisma migrate deploy against an empty database...');
  const testDbName = `test_g2_2_${Date.now()}.db`;
  const testDbPath = path.join(prismaDir, 'db', testDbName);
  const testDbUrl = `file:${testDbPath.replace(/\\/g, '/')}`;

  try {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    const deployOutput = execSync(`npx prisma migrate deploy`, {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: testDbUrl },
      encoding: 'utf8',
    });

    if (!deployOutput.includes('All migrations have been successfully applied') && !deployOutput.includes('No pending migrations')) {
      throw new Error(`prisma migrate deploy unexpected output: ${deployOutput}`);
    }
    console.log('   ✓ Migration applied cleanly to empty database');

    // 5. Verify database connectivity and schema integrity using query on new tables
    console.log('5. Querying freshly migrated database tables...');
    const prisma = new PrismaClient({
      datasources: {
        db: { url: testDbUrl },
      },
    });

    try {
      // Test querying CompanyDecision table
      const decisions = await prisma.$queryRawUnsafe<any[]>('SELECT name FROM sqlite_master WHERE type="table" AND name="company_decisions"');
      if (decisions.length === 0) {
        throw new Error('Table company_decisions was not found in sqlite_master');
      }

      // Test querying CouncilDeliberation table
      const council = await prisma.$queryRawUnsafe<any[]>('SELECT name FROM sqlite_master WHERE type="table" AND name="council_deliberations"');
      if (council.length === 0) {
        throw new Error('Table council_deliberations was not found in sqlite_master');
      }

      // Count total user tables
      const tables = await prisma.$queryRawUnsafe<any[]>('SELECT count(*) as count FROM sqlite_master WHERE type="table" AND name NOT LIKE "sqlite_%" AND name != "_prisma_migrations"');
      console.log(`   ✓ Database initialized with ${tables[0].count} application tables`);
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    // Clean up temporary database
    if (existsSync(testDbPath)) {
      try {
        unlinkSync(testDbPath);
      } catch {
        // file lock may release slightly later
      }
    }
  }

  console.log('\nAll G2.2 versioned migration and schema integrity tests PASSED cleanly.\n');
}

runSuite().catch((err) => {
  console.error('\nFAILED: G2.2 Test Suite error:', err);
  process.exit(1);
});
