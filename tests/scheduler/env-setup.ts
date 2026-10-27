/**
 * Test environment setup for Phase 4.4A scheduler tests.
 * Imported FIRST so its side effects run before any store module loads.
 *
 * Isolation strategy: DATABASE_URL points at a per-run COPY of the real
 * SQLite database (schema included, data snapshotted at copy time). Every
 * best-effort prisma write from the suite then lands in the copy — never in
 * the dev database — while any authoritative-mode path still finds its tables.
 * (A bare `delete` of DATABASE_URL does not hold under Bun's env overlay, and
 * a tableless throwaway DB breaks authoritative paths that pass SELECT 1.)
 *
 * When another suite imports prisma FIRST in a combined run, the shared client
 * may cache the REAL URL instead; the suite's afterAll purges exactly its own
 * artifacts from the real DB in that case.
 */
import { copyFileSync, rmSync, existsSync } from "fs";
import path from "path";
import os from "os";
import { beforeEach } from "bun:test";
import { SpendSettingsManager } from "../../src/lib/server/sophia/spend-settings";
import { CompanyMemoryStore, INITIAL_COMPANY_MEMORIES } from "../../src/lib/server/memory/memory-store";

const repoRoot = process.env.SAMJUNIORS_TEST_REPO_ROOT || process.cwd();
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('/tmp/')) {
  const candidates = [
    path.join(repoRoot, "prisma", "db", "custom.db"),
    path.join(repoRoot, "db", "custom.db"),
    path.resolve("prisma", "db", "custom.db"),
    path.resolve("db", "custom.db"),
  ];
  const sourceDb = candidates.find((p) => existsSync(p));
  const testDb = path.join(os.tmpdir(), "samjuniors-4a-scheduler-test.db");
  try {
    rmSync(testDb, { force: true });
    if (sourceDb) {
      copyFileSync(sourceDb, testDb);
    }
  } catch {
    // Source db missing — fall through with whatever the copy left us.
  }
  process.env.DATABASE_URL = `file:${testDb.replace(/\\/g, '/')}`;
}
delete process.env.DATABASE_MODE;
(process.env as Record<string, string | undefined>).NODE_ENV = "test";

// In scheduler test suites, ensure autonomous spend cap and canonical seed memories are restored
beforeEach(() => {
  SpendSettingsManager.getInstance().resetForTest({
    dailySpendCapUsd: 1000,
    currentDailySpendUsd: 0,
  });
  CompanyMemoryStore.getInstance().setMemories([...INITIAL_COMPANY_MEMORIES]);
});

export {};
