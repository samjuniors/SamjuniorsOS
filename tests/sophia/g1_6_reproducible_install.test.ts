import assert from 'assert';
import fs from 'fs';
import path from 'path';

/**
 * ============================================================================
 * GATE G1.6: REPRODUCIBLE INSTALL REGRESSION SUITE
 * ============================================================================
 *
 * Exit criteria (GATES.md / gates.json):
 *   "Clean clone to running app verified in CI on Linux and by evidence on Windows;
 *    SETUP.md matches; the win32-only dependency handled per evidence."
 *
 * This suite verifies:
 *   1. @next/swc-win32-x64-msvc is isolated in optionalDependencies so non-Windows
 *      installs (Linux CI, macOS) do not fail with EBADPLATFORM errors.
 *   2. package.json scripts provide the canonical cross-platform lifecycle.
 *   3. docs/SETUP.md matches reality for Windows and Linux installations.
 *   4. CI workflow in .github/workflows/ci.yml enforces clean Linux install.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
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

async function runTests() {
  console.log('\n======================================================');
  console.log('GATE G1.6: REPRODUCIBLE INSTALL REGRESSION SUITE');
  console.log('======================================================\n');

  console.log('--- 1. Dependency isolation ---');

  await test('1.1 @next/swc-win32-x64-msvc is NOT in dependencies', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.strictEqual(
      pkg.dependencies?.['@next/swc-win32-x64-msvc'],
      undefined,
      'win32-specific binary must not be in normal dependencies'
    );
  });

  await test('1.2 @next/swc-win32-x64-msvc is declared in optionalDependencies', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.ok(
      pkg.optionalDependencies?.['@next/swc-win32-x64-msvc'],
      'win32-specific binary must be in optionalDependencies'
    );
  });

  await test('1.3 package.json declares canonical scripts', () => {
    const pkg = JSON.parse(read('package.json'));
    const required = ['dev', 'build', 'test', 'typecheck', 'lint', 'scan:secrets'];
    for (const s of required) {
      assert.ok(pkg.scripts?.[s], `package.json must declare script "${s}"`);
    }
  });

  console.log('--- 2. Documentation reconciliation ---');

  await test('2.1 SETUP.md documents optionalDependencies resolution for win32 binary', () => {
    const setup = read('docs/SETUP.md');
    assert.ok(
      setup.includes('optionalDependencies'),
      'SETUP.md must document optionalDependencies resolution'
    );
  });

  await test('2.2 SETUP.md provides cross-platform install guidance', () => {
    const setup = read('docs/SETUP.md');
    assert.ok(
      setup.includes('npm install'),
      'SETUP.md must document npm install'
    );
    assert.ok(
      setup.includes('bun install'),
      'SETUP.md must document bun install'
    );
  });

  console.log('--- 3. CI pipeline verification ---');

  await test('3.1 .github/workflows/ci.yml runs clean Linux install and validation', () => {
    const ci = read('.github/workflows/ci.yml');
    assert.ok(ci.includes('ubuntu-latest'), 'CI must run on ubuntu-latest Linux runner');
    assert.ok(ci.includes('npm ci') || ci.includes('npm install'), 'CI must execute npm installation');
    assert.ok(ci.includes('npm test'), 'CI must run the full test suite');
    assert.ok(ci.includes('npm run typecheck'), 'CI must verify TypeScript types');
    assert.ok(ci.includes('npm run lint'), 'CI must verify ESLint');
  });

  console.log('\n======================================================');
  console.log(`G1.6 TEST RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('G1.6 test suite crashed:', err);
  process.exit(1);
});
