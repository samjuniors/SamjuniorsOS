import path from 'node:path';

/** Return the isolated durable-store directory configured by the test runner. */
export function getTestDataDir(): string {
  const testRepoRoot = process.env.SAMJUNIORS_TEST_REPO_ROOT;
  const isTestRunnerRepoCwd = !!testRepoRoot && path.resolve(process.cwd()) === path.resolve(testRepoRoot);
  const configured = isTestRunnerRepoCwd ? process.env.SAMJUNIORS_TEST_DATA_DIR : undefined;
  return path.resolve(configured || path.join(process.cwd(), '.data'));
}
