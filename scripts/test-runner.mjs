#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

function cleanupDataDir() {
  const dataDir = path.join(rootDir, '.data');
  if (!fs.existsSync(dataDir)) return;
  try {
    const files = fs.readdirSync(dataDir);
    for (const f of files) {
      const full = path.join(dataDir, f);
      // Clean up corruption quarantine snapshots created during recovery testing
      if (f.includes('.corrupt.') || f.endsWith('.tmp')) {
        try { fs.unlinkSync(full); } catch {}
      }
      // Clean up orphan .initialized markers where the collection JSON does not exist
      if (f.endsWith('.json.initialized')) {
        const jsonFile = f.slice(0, -'.initialized'.length);
        if (!fs.existsSync(path.join(dataDir, jsonFile))) {
          try { fs.unlinkSync(full); } catch {}
        }
      }
      // Clean up stale cross-process lock files
      if (f === 'instance.lock') {
        try { fs.unlinkSync(full); } catch {}
      }
    }
  } catch {}
}

// Initial clean
cleanupDataDir();

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

const results = {
  passed: [],
  failed: [],
  bunSkipped: [],
};

const startTime = Date.now();

for (const relPath of testFiles) {
  // Ensure fresh state isolation prior to running suite
  cleanupDataDir();

  const fullPath = path.join(rootDir, relPath);
  const content = fs.readFileSync(fullPath, 'utf8');

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
    env: { ...process.env, NODE_ENV: 'test' },
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

// Final post-run cleanup
cleanupDataDir();

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
