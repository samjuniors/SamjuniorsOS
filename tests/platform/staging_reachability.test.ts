import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { resolveSqliteDatabaseUrl } from '@/lib/server/db/database-url';
import { getTestDatabaseDir, toSchemaRelativeSqliteUrl } from '../helpers/test-database';

const projectRoot = process.cwd();
const schemaDirectory = path.join(projectRoot, 'prisma');
const relativeUrl = resolveSqliteDatabaseUrl('file:./db/custom.db', schemaDirectory);
assert.strictEqual(
  relativeUrl,
  `file:${path.resolve(schemaDirectory, 'db/custom.db').replace(/\\/g, '/')}`,
  'Relative SQLite URLs must resolve from the Prisma schema directory',
);
assert.strictEqual(
  resolveSqliteDatabaseUrl('file:./db/custom.db?connection_limit=1', schemaDirectory),
  `file:${path.resolve(schemaDirectory, 'db/custom.db').replace(/\\/g, '/')}?connection_limit=1`,
  'SQLite URL parameters must survive path resolution',
);
assert.strictEqual(
  resolveSqliteDatabaseUrl('postgresql://localhost:5432/samjuniors', projectRoot),
  'postgresql://localhost:5432/samjuniors',
  'Non-SQLite URLs must remain unchanged',
);
const absoluteUrl = `file:${path.resolve(schemaDirectory, 'db/absolute.db').replace(/\\/g, '/')}`;
assert.strictEqual(
  resolveSqliteDatabaseUrl(absoluteUrl, schemaDirectory),
  absoluteUrl,
  'Absolute SQLite URLs must remain unchanged',
);

const dbPath = path.join(getTestDatabaseDir(), 'custom.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = toSchemaRelativeSqliteUrl(dbPath);
}
import { GET as healthHandler } from '@/app/api/health/route';

async function runTests() {
  console.log('--- [Test Suite] Staging Reachability & Configuration Verification (G2.1) ---');

  // Test 1: Healthcheck API reachability and contract
  console.log('1. Testing /api/health endpoint execution & contract...');
  const response = await healthHandler();
  assert.strictEqual(response.status, 200, `Expected HTTP 200, got ${response.status}`);

  const body = await response.json();
  assert.strictEqual(body.status, 'healthy', 'Expected status to be "healthy"');
  assert.ok(body.timestamp, 'Expected ISO timestamp in response');
  assert.ok(typeof body.uptime === 'number', 'Expected numeric uptime in response');
  assert.strictEqual(body.database.status, 'connected', 'Expected database.status to be "connected"');
  assert.ok(typeof body.database.latencyMs === 'number', 'Expected database.latencyMs to be numeric');
  assert.ok(body.database.latencyMs < 2000, 'Expected database latency to be well under 2000ms');
  console.log(`   ✓ Healthcheck returned 200 OK (DB latency: ${body.database.latencyMs}ms, mode: ${body.database.mode})`);

  // Test 2: Zero-Secret Configuration Audit in staging files
  console.log('2. Auditing staging files for zero secret leakage...');
  const rootDir = process.cwd();
  const stagingEnv = fs.readFileSync(path.join(rootDir, '.env.staging.example'), 'utf8');
  const compose = fs.readFileSync(path.join(rootDir, 'docker-compose.staging.yml'), 'utf8');

  const SECRET_REGEX = /(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35})/i;
  assert.strictEqual(SECRET_REGEX.test(stagingEnv), false, 'Found hardcoded secret in .env.staging.example');
  assert.strictEqual(SECRET_REGEX.test(compose), false, 'Found hardcoded secret in docker-compose.staging.yml');

  // Verify placeholder values
  assert.ok(stagingEnv.includes('replace_with_staging_founder_secret'), 'Expected founder secret placeholder');
  assert.ok(stagingEnv.includes('replace_with_staging_cron_trigger_secret'), 'Expected cron trigger secret placeholder');
  console.log('   ✓ Staging configuration contains zero live secrets');

  // Test 3: Option A Persistent Volume & Backup Retention Contract
  console.log('3. Validating Option A persistent volume mounts and 30-day backup policy...');
  assert.ok(compose.includes('./db:/app/db'), 'Missing persistent SQLite volume mount');
  assert.ok(compose.includes('./.data:/app/.data'), 'Missing persistent .data volume mount');
  assert.ok(compose.includes('./backups:/app/backups'), 'Missing persistent backups volume mount');

  const backupScript = fs.readFileSync(path.join(rootDir, 'scripts', 'backup-sqlite.sh'), 'utf8');
  assert.ok(backupScript.includes('RETENTION_DAYS=30'), 'Expected 30-day retention in backup-sqlite.sh per G0.3');
  assert.ok(backupScript.includes('-mtime +${RETENTION_DAYS}'), 'Expected mtime pruning in backup-sqlite.sh');
  console.log('   ✓ Persistent volume mounts and 30-day backup retention verified');

  // Test 4: Container ports and live companion gateway configuration
  console.log('4. Validating staging container network exposure...');
  assert.ok(compose.includes('"3000:3000"'), 'Port 3000 (Next.js) must be exposed');
  assert.ok(compose.includes('"3001:3001"'), 'Port 3001 (Live Gateway) must be exposed');
  assert.ok(fs.existsSync(path.join(rootDir, 'scripts', 'live-gateway.ts')), 'live-gateway.ts must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'scripts', 'start-staging.mjs')), 'start-staging.mjs supervisor must exist');
  console.log('   ✓ Container ports (3000/3001) and service supervisors verified');

  console.log('\nAll staging reachability and configuration contract tests PASSED cleanly.');
}

runTests().catch((err) => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
