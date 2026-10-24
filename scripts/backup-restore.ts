/**
 * ============================================================================
 * SamJuniorsOS — Cross-Platform SQLite & File Store Backup & Restore Manager
 * ============================================================================
 * Implements Option A disaster recovery per G0.3 & G2.5:
 *   - Daily automated backup snapshot with 30-day retention
 *   - Disaster Recovery Drill meeting:
 *       RPO target: < 24 hours (measured data loss window)
 *       RTO target: < 2 hours (measured recovery time to healthy state)
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';

export interface BackupManifest {
  version: string;
  timestamp: string;
  dbChecksum: string | null;
  dbSizeBytes: number;
  dataFilesCount: number;
  dataFilesChecksums: Record<string, string>;
  totalSizeBytes: number;
  retentionDays: number;
}

export interface BackupResult {
  archivePath: string;
  manifest: BackupManifest;
  durationMs: number;
  sizeBytes: number;
}

export interface RestoreResult {
  archivePath: string;
  targetDbPath: string;
  targetDataDir: string;
  durationMs: number;
  verifiedIntegrity: boolean;
  manifest: BackupManifest;
}

export interface DrillMetrics {
  targetRpoHours: number;
  measuredRpoSeconds: number;
  rpoPass: boolean;
  targetRtoMinutes: number;
  measuredRtoSeconds: number;
  rtoPass: boolean;
  backupDurationMs: number;
  restoreDurationMs: number;
  integrityVerified: boolean;
  semanticParityPercent: number;
}

function computeFileSha256(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Creates a compressed backup bundle containing the SQLite database and all file stores.
 */
export async function createBackup(options?: {
  dbPath?: string;
  dataDir?: string;
  backupDir?: string;
  retentionDays?: number;
}): Promise<BackupResult> {
  const startTime = Date.now();
  const repoRoot = process.cwd();
  const dbPath = options?.dbPath || path.join(repoRoot, 'prisma', 'db', 'custom.db');
  const dataDir = options?.dataDir || path.join(repoRoot, '.data');
  const backupDir = options?.backupDir || path.join(repoRoot, 'backups');
  const retentionDays = options?.retentionDays ?? 30;

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(backupDir, `backup_${timestamp}.bundle.json.gz`);

  // 1. Read SQLite DB (if exists)
  let dbBase64: string | null = null;
  let dbChecksum: string | null = null;
  let dbSizeBytes = 0;
  if (fs.existsSync(dbPath)) {
    const dbBuf = fs.readFileSync(dbPath);
    dbSizeBytes = dbBuf.length;
    dbChecksum = crypto.createHash('sha256').update(dbBuf).digest('hex');
    dbBase64 = dbBuf.toString('base64');
  }

  // 2. Read .data directory files
  const dataFiles: Record<string, string> = {};
  const dataChecksums: Record<string, string> = {};
  if (fs.existsSync(dataDir)) {
    const entries = fs.readdirSync(dataDir);
    for (const file of entries) {
      const fullPath = path.join(dataDir, file);
      if (fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath, 'utf8');
        dataFiles[file] = content;
        dataChecksums[file] = crypto.createHash('sha256').update(content).digest('hex');
      }
    }
  }

  const manifest: BackupManifest = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    dbChecksum,
    dbSizeBytes,
    dataFilesCount: Object.keys(dataFiles).length,
    dataFilesChecksums: dataChecksums,
    totalSizeBytes: 0,
    retentionDays,
  };

  const payload = JSON.stringify({
    manifest,
    db: dbBase64,
    data: dataFiles,
  });

  const compressed = zlib.gzipSync(Buffer.from(payload, 'utf8'));
  fs.writeFileSync(archivePath, compressed);

  const archiveSize = compressed.length;
  manifest.totalSizeBytes = archiveSize;

  // 3. Prune backups older than retentionDays
  pruneOldBackups(backupDir, retentionDays);

  const durationMs = Date.now() - startTime;
  return {
    archivePath,
    manifest,
    durationMs,
    sizeBytes: archiveSize,
  };
}

/**
 * Restores the SQLite database and .data file stores from a backup bundle into clean targets.
 */
export async function restoreBackup(
  archivePath: string,
  options?: {
    targetDbPath?: string;
    targetDataDir?: string;
    verifyIntegrity?: boolean;
  }
): Promise<RestoreResult> {
  const startTime = Date.now();
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Backup archive not found at ${archivePath}`);
  }

  const compressed = fs.readFileSync(archivePath);
  const decompressed = zlib.gunzipSync(compressed).toString('utf8');
  const bundle = JSON.parse(decompressed);

  const manifest: BackupManifest = bundle.manifest;
  const targetDbPath = options?.targetDbPath || path.join(process.cwd(), 'prisma', 'db', 'custom.db');
  const targetDataDir = options?.targetDataDir || path.join(process.cwd(), '.data');

  // Ensure directories exist
  const dbDir = path.dirname(targetDbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(targetDataDir)) fs.mkdirSync(targetDataDir, { recursive: true });

  // 1. Restore SQLite database
  if (bundle.db) {
    const dbBuf = Buffer.from(bundle.db, 'base64');
    fs.writeFileSync(targetDbPath, dbBuf);

    if (manifest.dbChecksum) {
      const restoredChecksum = crypto.createHash('sha256').update(dbBuf).digest('hex');
      if (restoredChecksum !== manifest.dbChecksum) {
        throw new Error(
          `Checksum mismatch on restored database: expected ${manifest.dbChecksum}, got ${restoredChecksum}`
        );
      }
    }
  }

  // 2. Restore .data file stores
  if (bundle.data) {
    for (const [filename, content] of Object.entries(bundle.data)) {
      const destPath = path.join(targetDataDir, filename);
      fs.writeFileSync(destPath, content as string, 'utf8');

      if (manifest.dataFilesChecksums && manifest.dataFilesChecksums[filename]) {
        const restoredHash = crypto.createHash('sha256').update(content as string).digest('hex');
        if (restoredHash !== manifest.dataFilesChecksums[filename]) {
          throw new Error(`Checksum mismatch on restored data file ${filename}`);
        }
      }
    }
  }

  // 3. Optional SQLite integrity verification
  let verifiedIntegrity = true;
  if (options?.verifyIntegrity !== false && fs.existsSync(targetDbPath)) {
    const normalizedUrl = `file:${targetDbPath.replace(/\\/g, '/')}`;
    const prisma = new PrismaClient({ datasources: { db: { url: normalizedUrl } } });
    try {
      const checkResult: any = await prisma.$queryRawUnsafe('PRAGMA integrity_check;');
      if (Array.isArray(checkResult) && checkResult.length > 0) {
        const val = checkResult[0].integrity_check || Object.values(checkResult[0])[0];
        if (val !== 'ok') {
          verifiedIntegrity = false;
          throw new Error(`PRAGMA integrity_check failed: ${val}`);
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  const durationMs = Date.now() - startTime;
  return {
    archivePath,
    targetDbPath,
    targetDataDir,
    durationMs,
    verifiedIntegrity,
    manifest,
  };
}

/**
 * Prunes backups older than the retention window.
 */
export function pruneOldBackups(backupDir: string, retentionDays: number = 30): number {
  if (!fs.existsSync(backupDir)) return 0;
  const files = fs.readdirSync(backupDir);
  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  let pruned = 0;

  for (const file of files) {
    if (!file.startsWith('backup_')) continue;
    const fullPath = path.join(backupDir, file);
    try {
      const stat = fs.statSync(fullPath);
      const ageMs = now - stat.mtimeMs;
      if (ageMs > maxAgeMs) {
        fs.unlinkSync(fullPath);
        pruned++;
      }
    } catch {}
  }
  return pruned;
}

/**
 * CLI Entrypoint
 */
async function cli() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  if (command === 'backup') {
    console.log('[backup] Initiating automated backup...');
    const result = await createBackup();
    console.log(`[backup] Archive created: ${result.archivePath}`);
    console.log(`[backup] Size: ${(result.sizeBytes / 1024).toFixed(2)} KB, Duration: ${result.durationMs}ms`);
  } else if (command === 'restore') {
    const archivePath = args[1];
    if (!archivePath) {
      console.error('Error: specify path to archive: tsx scripts/backup-restore.ts restore <archivePath>');
      process.exit(1);
    }
    console.log(`[restore] Restoring from ${archivePath}...`);
    const result = await restoreBackup(archivePath);
    console.log(`[restore] Restored successfully in ${result.durationMs}ms`);
  } else {
    console.log('Usage:');
    console.log('  tsx scripts/backup-restore.ts backup');
    console.log('  tsx scripts/backup-restore.ts restore <path-to-archive>');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}
