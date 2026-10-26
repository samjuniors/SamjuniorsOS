#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const prismaSchemaDir = path.join(rootDir, 'prisma');
const testDatabaseRoot = path.join(rootDir, 'prisma', 'db');
fs.mkdirSync(testDatabaseRoot, { recursive: true });
const testRunDir = fs.mkdtempSync(path.join(testDatabaseRoot, `.test-run-${process.pid}-`));
const testDatabasePath = path.join(testRunDir, 'integration.db');
const testDataDir = path.join(testRunDir, '.data');
const sourceDataDir = path.join(rootDir, '.data');
const toSchemaRelativeSqliteUrl = (filePath) => `file:./${path.relative(prismaSchemaDir, filePath).replace(/\\/g, '/')}`;
const testDatabaseUrl = toSchemaRelativeSqliteUrl(testDatabasePath);
process.env.DATABASE_URL = testDatabaseUrl;

if (fs.existsSync(sourceDataDir)) {
  fs.cpSync(sourceDataDir, testDataDir, {
    recursive: true,
    filter: (source) => {
      const name = path.basename(source);
      return name !== 'instance.lock' && !name.endsWith('.lock');
    },
  });
}

const sourceDatabasePath = path.join(prismaSchemaDir, 'db', 'custom.db');
const sourceDatabaseSidecars = ['-journal', '-wal', '-shm'].map((suffix) => `${sourceDatabasePath}${suffix}`);
const canSeedFromLocalDatabase = fs.existsSync(sourceDatabasePath) && !sourceDatabaseSidecars.some((file) => fs.existsSync(file));
if (canSeedFromLocalDatabase) {
  fs.copyFileSync(sourceDatabasePath, testDatabasePath);
  console.log('Seeded the disposable integration database from prisma/db/custom.db.');
}

async function getAvailablePort(excluded = new Set()) {
  while (true) {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (!excluded.has(port)) return port;
  }
}

function cleanupTestDataDir() {
  if (!fs.existsSync(testDataDir)) return;
  for (const file of fs.readdirSync(testDataDir)) {
    const fullPath = path.join(testDataDir, file);
    if (file.includes('.corrupt.') || file.endsWith('.tmp') || file === 'instance.lock') {
      try { fs.unlinkSync(fullPath); } catch {}
    }
    if (file.endsWith('.json.initialized')) {
      const dataFile = file.slice(0, -'.initialized'.length);
      if (!fs.existsSync(path.join(testDataDir, dataFile))) {
        try { fs.unlinkSync(fullPath); } catch {}
      }
    }
  }
}

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function checkCommand(cmd) {
  const isWin = process.platform === 'win32';
  const checkCmd = isWin ? 'where' : 'which';
  const res = spawnSync(checkCmd, [cmd], { stdio: 'ignore' });
  return res.status === 0;
}

const hasBun = checkCommand('bun');

// Discover all test files under tests/
const allFiles = walk(path.join(rootDir, 'tests'))
  .map((f) => path.relative(rootDir, f).replace(/\\/g, '/'))
  .filter((f) => f.includes('.test.'));

// Filter if CLI args provided
const filter = process.argv[2]?.toLowerCase();
const testFiles = filter
  ? allFiles.filter((f) => f.toLowerCase().includes(filter))
  : allFiles;

console.log('='.repeat(70));
console.log('SamJuniorsOS Canonical Test Runner');
console.log(`Discovered ${allFiles.length} test suites under tests/ (Filter: ${filter || 'none'})`);
console.log(`Runtime Environment: Node.js ${process.version} on ${process.platform} (Bun available: ${hasBun})`);
console.log('='.repeat(70) + '\n');

const prismaCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
if (!canSeedFromLocalDatabase) {
  const schemaSetup = spawnSync(prismaCommand, ['prisma', 'db', 'push', '--skip-generate'], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    shell: process.platform === 'win32',
    timeout: 90_000,
  });
  if (schemaSetup.status !== 0) {
    console.error('Unable to initialize the disposable test database.');
    console.error(`Prisma setup exited with status ${schemaSetup.status ?? 'null'}${schemaSetup.signal ? ` (signal ${schemaSetup.signal})` : ''}.`);
    if (schemaSetup.error) console.error(schemaSetup.error);
    if (schemaSetup.stdout) console.error(schemaSetup.stdout);
    if (schemaSetup.stderr) console.error(schemaSetup.stderr);
    process.exitCode = 1;
    try { fs.rmSync(testRunDir, { recursive: true, force: true }); } catch {}
    process.exit();
  }
}

const results = {
  passed: [],
  failed: [],
  bunSkipped: [],
};

const deploySuite = 'tests/platform/deploy_pipeline_verification.test.ts';
const deployPorts = testFiles.includes(deploySuite) ? new Set() : null;
if (deployPorts) {
  deployPorts.add(await getAvailablePort(deployPorts));
  deployPorts.add(await getAvailablePort(deployPorts));
}

const startTime = Date.now();

for (const relPath of testFiles) {
  // Clean only the disposable data copy between suites, never repository .data.
  cleanupTestDataDir();

  const fullPath = path.join(rootDir, relPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const suiteDatabaseUrl = relPath === 'tests/platform/deploy_pipeline_verification.test.ts'
    ? toSchemaRelativeSqliteUrl(path.join(testRunDir, 'deploy-pipeline.db'))
    : relPath === 'tests/platform/staging_reachability.test.ts'
      ? toSchemaRelativeSqliteUrl(path.join(testRunDir, 'staging-reachability.db'))
      : testDatabaseUrl;
  const suiteEnv = {
    ...process.env,
    DATABASE_URL: suiteDatabaseUrl,
    NODE_ENV: 'test',
    SAMJUNIORS_TEST_DATA_DIR: testDataDir,
    SAMJUNIORS_TEST_DB_DIR: testRunDir,
    SAMJUNIORS_TEST_REPO_ROOT: rootDir,
  };
  if (relPath === deploySuite && deployPorts) {
    const [appPort, wsPort] = deployPorts;
    suiteEnv.APP_URL = `http://127.0.0.1:${appPort}`;
    suiteEnv.LIVE_WS_PORT = String(wsPort);
    suiteEnv.LIVE_WS_URL = `ws://127.0.0.1:${wsPort}`;
  }

  // Check for bun-only surface dependencies
  const isDirectBunTest =
    content.includes("from 'bun:test'") ||
    content.includes('from "bun:test"') ||
    content.includes("import('bun:test')") && !content.includes('try {');
  const usesBunSpawn =
    content.includes('Bun.spawn(') && !content.includes('typeof Bun');

  const requiresBun = isDirectBunTest || usesBunSpawn;

  if (requiresBun && !hasBun) {
    const reason = isDirectBunTest
      ? 'imports bun:test runner surface directly'
      : 'invokes Bun.spawn API directly';
    results.bunSkipped.push({
      file: relPath,
      reason: `${reason} (runner divergence documented in PROGRESS.md; Bun is not installed in current environment)`,
    });
    console.log(`[SKIP - BUN REQUIRED] ${relPath}`);
    continue;
  }

  const isBrowserTest = relPath.includes('.browser.test.');
  if (isBrowserTest && process.env.SKIP_BROWSER_TESTS !== 'false') {
    // E2E browser tests require running Next.js app & Playwright browser binaries
    results.bunSkipped.push({
      file: relPath,
      reason: 'E2E Playwright browser suite (requires running server; execute via e2e runner)',
    });
    console.log(`[SKIP - BROWSER E2E] ${relPath}`);
    continue;
  }

  const runnerCmd = requiresBun && hasBun ? 'bun' : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
  const runnerArgs = requiresBun && hasBun ? ['test', relPath] : ['tsx', relPath];

  process.stdout.write(`[RUNNING] ${relPath} ... `);
  const suiteStart = Date.now();
  const res = spawnSync(runnerCmd, runnerArgs, {
    cwd: rootDir,
    encoding: 'utf8',
    env: suiteEnv,
    shell: true,
    timeout: 90_000,
  });

  const duration = ((Date.now() - suiteStart) / 1000).toFixed(2);

  if (res.status === 0) {
    results.passed.push({ file: relPath, duration });
    console.log(`PASSED (${duration}s)`);
  } else {
    results.failed.push({
      file: relPath,
      duration,
      status: res.status,
      stdout: res.stdout,
      stderr: res.stderr,
    });
    console.log(`FAILED (exit code ${res.status}, ${duration}s)`);
    if (res.stdout) console.log(res.stdout);
    if (res.stderr) console.error(res.stderr);
  }
}

// Only remove the uniquely named scratch directory created for this run.
try {
  const resolvedDatabaseRoot = path.resolve(testDatabaseRoot);
  const resolvedRunDir = path.resolve(testRunDir);
  if (path.dirname(resolvedRunDir) === resolvedDatabaseRoot && path.basename(resolvedRunDir).startsWith(`.test-run-${process.pid}-`)) {
    fs.rmSync(resolvedRunDir, { recursive: true, force: true });
  }
} catch (error) {
  console.warn(`Could not remove disposable test data at ${testRunDir}: ${error.message}`);
}

const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

console.log('\n' + '='.repeat(70));
console.log('TEST RUN SUMMARY');
console.log('='.repeat(70));
console.log(`Total Suites Discovered: ${testFiles.length}`);
console.log(`Passed Suites:           ${results.passed.length}`);
console.log(`Failed Suites:           ${results.failed.length}`);
console.log(`Bun-Divergent Skipped:   ${results.bunSkipped.length}`);
console.log(`Total Time:              ${totalDuration}s`);

if (results.bunSkipped.length > 0) {
  console.log('\n--- Suites Requiring Bun (Runner Divergence per PROGRESS.md) ---');
  for (const s of results.bunSkipped) {
    console.log(`  - ${s.file}`);
    console.log(`    Reason: ${s.reason}`);
  }
}

if (results.failed.length > 0) {
  console.log('\n--- FAILED SUITES ---');
  for (const f of results.failed) {
    console.log(`  - ${f.file} (exit code ${f.status})`);
  }
  process.exit(1);
} else {
  console.log('\nAll executable test suites passed successfully.');
  process.exit(0);
}
