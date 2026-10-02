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
import { copyFileSync, rmSync } from "fs";

const TEST_DB = "/tmp/samjuniors-4a-scheduler-test.db";
try {
  rmSync(TEST_DB, { force: true });
  copyFileSync("db/custom.db", TEST_DB);
} catch {
  // Source db missing — fall through with whatever the copy left us.
}
process.env.DATABASE_URL = `file:${TEST_DB}`;
delete process.env.DATABASE_MODE;
(process.env as Record<string, string | undefined>).NODE_ENV = "test";

export {};
