import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SideEffectAuditRecord } from '@/types/authorization';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';

export const AUDIT_CHAIN_GENESIS = '0'.repeat(64);

export class AuditIntegrityError extends Error {
  constructor(message = 'Audit integrity verification failed; refusing to read or append audit records.') {
    super(message);
    this.name = 'AuditIntegrityError';
  }
}

export class LegacyAuditHistoryError extends AuditIntegrityError {
  constructor(recordId: string) {
    super(
      `Legacy audit record "${recordId}" has no cryptographic chain anchor. History is preserved and no automatic resealing is allowed; restore a trusted anchored copy or perform a founder-reviewed recovery before reopening the ledger.`
    );
    this.name = 'LegacyAuditHistoryError';
  }
}

export class AuditAnchorMismatchError extends AuditIntegrityError {
  constructor(message: string) {
    super(`Audit chain anchor verification failed: ${message}`);
    this.name = 'AuditAnchorMismatchError';
  }
}

export interface AuditCheckpoint {
  ledgerId: string;
  formatVersion: number;
  sequence: number;
  recordHash: string;
  previousHash: string;
  timestamp: string;
}

export interface IAuditAnchorProvider {
  publishCheckpoint(checkpoint: AuditCheckpoint): Promise<void>;
  getLatestCheckpoint(): Promise<AuditCheckpoint | null>;
  getCheckpoint(sequence: number): Promise<AuditCheckpoint | null>;
  listCheckpoints(): Promise<AuditCheckpoint[]>;
  verifyHead(headRecord: SideEffectAuditRecord | null): Promise<void>;
  verifyHeadSync(headRecord: SideEffectAuditRecord | null): void;
  clearForTest?(): void;
}

export function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) result[key] = canonicalize(entry);
    }
    return result;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

export function hashRecord(record: SideEffectAuditRecord): string {
  const { recordHash: _recordHash, ...material } = record;
  return createHash('sha256').update(JSON.stringify(canonicalize(material)), 'utf8').digest('hex');
}

export function hashesMatch(expected: string, actual: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expected) || !/^[a-f0-9]{64}$/i.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}

/**
 * In-memory anchor provider for tests and ephemeral environments.
 * Implements strict create-if-absent and append-only semantics.
 */
export class InMemoryAuditAnchorProvider implements IAuditAnchorProvider {
  private checkpoints: Map<number, AuditCheckpoint> = new Map();

  public async publishCheckpoint(checkpoint: AuditCheckpoint): Promise<void> {
    this.publishCheckpointSync(checkpoint);
  }

  public publishCheckpointSync(checkpoint: AuditCheckpoint): void {
    const existing = this.checkpoints.get(checkpoint.sequence);
    if (existing) {
      if (
        existing.recordHash === checkpoint.recordHash &&
        existing.previousHash === checkpoint.previousHash
      ) {
        return; // Idempotent duplicate
      }
      throw new AuditAnchorMismatchError(
        `Anchor checkpoint sequence ${checkpoint.sequence} already exists with different hash; mutation of immutable anchor prohibited.`
      );
    }

    const latest = this.getLatestCheckpointSync();
    const expectedSeq = (latest?.sequence ?? 0) + 1;
    if (checkpoint.sequence !== expectedSeq) {
      throw new AuditAnchorMismatchError(
        `Anchor sequence gap: expected sequence ${expectedSeq}, received ${checkpoint.sequence}.`
      );
    }

    if (latest && !hashesMatch(latest.recordHash, checkpoint.previousHash)) {
      throw new AuditAnchorMismatchError(
        `Anchor predecessor mismatch: checkpoint sequence ${checkpoint.sequence} previousHash does not match latest anchor hash.`
      );
    }

    this.checkpoints.set(checkpoint.sequence, JSON.parse(JSON.stringify(checkpoint)));
  }

  public async getLatestCheckpoint(): Promise<AuditCheckpoint | null> {
    return this.getLatestCheckpointSync();
  }

  public getLatestCheckpointSync(): AuditCheckpoint | null {
    if (this.checkpoints.size === 0) return null;
    const sequences = Array.from(this.checkpoints.keys()).sort((a, b) => a - b);
    const highest = sequences[sequences.length - 1];
    return JSON.parse(JSON.stringify(this.checkpoints.get(highest)!));
  }

  public async getCheckpoint(sequence: number): Promise<AuditCheckpoint | null> {
    const cp = this.checkpoints.get(sequence);
    return cp ? JSON.parse(JSON.stringify(cp)) : null;
  }

  public async listCheckpoints(): Promise<AuditCheckpoint[]> {
    return Array.from(this.checkpoints.values())
      .sort((a, b) => a.sequence - b.sequence)
      .map((cp) => JSON.parse(JSON.stringify(cp)));
  }

  public async verifyHead(headRecord: SideEffectAuditRecord | null): Promise<void> {
    this.verifyHeadSync(headRecord);
  }

  public verifyHeadSync(headRecord: SideEffectAuditRecord | null): void {
    const latest = this.getLatestCheckpointSync();
    if (headRecord === null) {
      if (latest !== null) {
        throw new AuditAnchorMismatchError(
          `Ledger is empty but trusted anchor contains sequence ${latest.sequence}; tail truncation or ledger wipe detected.`
        );
      }
      return;
    }

    if (latest === null) {
      throw new AuditAnchorMismatchError(
        `Ledger has head record with sequence ${headRecord.chainSequence} but no trusted anchor checkpoint exists.`
      );
    }

    if (headRecord.chainSequence! < latest.sequence) {
      throw new AuditAnchorMismatchError(
        `Tail truncation detected: ledger head sequence (${headRecord.chainSequence}) is behind trusted anchor sequence (${latest.sequence}).`
      );
    }

    if (headRecord.chainSequence! > latest.sequence) {
      throw new AuditAnchorMismatchError(
        `Ledger head sequence (${headRecord.chainSequence}) is ahead of trusted anchor sequence (${latest.sequence}).`
      );
    }

    if (!hashesMatch(latest.recordHash, headRecord.recordHash!)) {
      throw new AuditAnchorMismatchError(
        `Head record hash (${headRecord.recordHash}) does not match trusted anchor checkpoint hash (${latest.recordHash}).`
      );
    }

    if (!hashesMatch(latest.previousHash, headRecord.previousHash!)) {
      throw new AuditAnchorMismatchError(
        `Head record previousHash (${headRecord.previousHash}) does not match trusted anchor checkpoint (${latest.previousHash}).`
      );
    }
  }

  public clearForTest(): void {
    this.checkpoints.clear();
  }
}

/**
 * File-backed anchor provider for persistent single-VPS / local environments.
 * Checkpoints are saved in an independent directory as immutable JSON files.
 * Create-if-absent (O_EXCL | O_CREAT) ensures no existing checkpoint can be overwritten.
 */
export class FileAuditAnchorProvider implements IAuditAnchorProvider {
  private customDir?: string;

  constructor(customDir?: string) {
    this.customDir = customDir;
    const dir = this.anchorDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public get anchorDir(): string {
    return this.customDir ?? path.join(DurableFileStore.getInstance().getDataDir(), 'audit_anchors');
  }

  private getFilePath(sequence: number): string {
    const dir = this.anchorDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, `${String(sequence).padStart(10, '0')}.json`);
  }

  public async publishCheckpoint(checkpoint: AuditCheckpoint): Promise<void> {
    this.publishCheckpointSync(checkpoint);
  }

  public publishCheckpointSync(checkpoint: AuditCheckpoint): void {
    const filePath = this.getFilePath(checkpoint.sequence);
    const payload = JSON.stringify(checkpoint, null, 2);

    if (fs.existsSync(filePath)) {
      const existing: AuditCheckpoint = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (
        existing.recordHash === checkpoint.recordHash &&
        existing.previousHash === checkpoint.previousHash
      ) {
        return; // Idempotent
      }
      throw new AuditAnchorMismatchError(
        `Anchor checkpoint sequence ${checkpoint.sequence} already exists with different hash; mutation prohibited.`
      );
    }

    const latest = this.getLatestCheckpointSync();
    const expectedSeq = (latest?.sequence ?? 0) + 1;
    if (checkpoint.sequence !== expectedSeq) {
      throw new AuditAnchorMismatchError(
        `Anchor sequence gap: expected sequence ${expectedSeq}, received ${checkpoint.sequence}.`
      );
    }

    if (latest && !hashesMatch(latest.recordHash, checkpoint.previousHash)) {
      throw new AuditAnchorMismatchError(
        `Anchor predecessor mismatch: checkpoint sequence ${checkpoint.sequence} previousHash does not match latest anchor hash.`
      );
    }

    // Write with exclusive create flag 'wx'
    fs.writeFileSync(filePath, payload, { encoding: 'utf8', flag: 'wx' });

    // Read back to confirm exact match
    const readBack = fs.readFileSync(filePath, 'utf8');
    if (readBack !== payload) {
      throw new AuditAnchorMismatchError(
        `Anchor verification failed: read-back payload for sequence ${checkpoint.sequence} differs from written checkpoint.`
      );
    }
  }

  public async getLatestCheckpoint(): Promise<AuditCheckpoint | null> {
    return this.getLatestCheckpointSync();
  }

  public getLatestCheckpointSync(): AuditCheckpoint | null {
    if (!fs.existsSync(this.anchorDir)) return null;
    const files = fs.readdirSync(this.anchorDir).filter((f) => f.endsWith('.json')).sort();
    if (files.length === 0) return null;

    // Verify no sequence gaps in the anchor files
    let expectedSeq = 1;
    for (const file of files) {
      const seq = parseInt(file.replace('.json', ''), 10);
      if (seq !== expectedSeq) {
        throw new AuditAnchorMismatchError(`Anchor sequence gap detected at file "${file}".`);
      }
      expectedSeq++;
    }

    const latestFile = files[files.length - 1];
    const content = fs.readFileSync(path.join(this.anchorDir, latestFile), 'utf8');
    return JSON.parse(content) as AuditCheckpoint;
  }

  public async getCheckpoint(sequence: number): Promise<AuditCheckpoint | null> {
    const filePath = this.getFilePath(sequence);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as AuditCheckpoint;
  }

  public async listCheckpoints(): Promise<AuditCheckpoint[]> {
    if (!fs.existsSync(this.anchorDir)) return [];
    const files = fs.readdirSync(this.anchorDir).filter((f) => f.endsWith('.json')).sort();
    return files.map((f) => JSON.parse(fs.readFileSync(path.join(this.anchorDir, f), 'utf8')) as AuditCheckpoint);
  }

  public async verifyHead(headRecord: SideEffectAuditRecord | null): Promise<void> {
    this.verifyHeadSync(headRecord);
  }

  public verifyHeadSync(headRecord: SideEffectAuditRecord | null): void {
    const latest = this.getLatestCheckpointSync();
    if (headRecord === null) {
      if (latest !== null) {
        throw new AuditAnchorMismatchError(
          `Ledger is empty but trusted anchor contains sequence ${latest.sequence}; tail truncation or ledger wipe detected.`
        );
      }
      return;
    }

    if (latest === null) {
      throw new AuditAnchorMismatchError(
        `Ledger has head record with sequence ${headRecord.chainSequence} but no trusted anchor checkpoint exists.`
      );
    }

    if (headRecord.chainSequence! < latest.sequence) {
      throw new AuditAnchorMismatchError(
        `Tail truncation detected: ledger head sequence (${headRecord.chainSequence}) is behind trusted anchor sequence (${latest.sequence}).`
      );
    }

    if (headRecord.chainSequence! > latest.sequence) {
      throw new AuditAnchorMismatchError(
        `Ledger head sequence (${headRecord.chainSequence}) is ahead of trusted anchor sequence (${latest.sequence}).`
      );
    }

    if (!hashesMatch(latest.recordHash, headRecord.recordHash!)) {
      throw new AuditAnchorMismatchError(
        `Head record hash (${headRecord.recordHash}) does not match trusted anchor checkpoint hash (${latest.recordHash}).`
      );
    }

    if (!hashesMatch(latest.previousHash, headRecord.previousHash!)) {
      throw new AuditAnchorMismatchError(
        `Head record previousHash (${headRecord.previousHash}) does not match trusted anchor checkpoint (${latest.previousHash}).`
      );
    }
  }

  public clearForTest(): void {
    if (fs.existsSync(this.anchorDir)) {
      for (const f of fs.readdirSync(this.anchorDir)) {
        try {
          fs.unlinkSync(path.join(this.anchorDir, f));
        } catch {}
      }
    }
  }
}

/**
 * Singleton registry for the active Audit Anchor Provider.
 */
export class AuditAnchorRegistry {
  private static instance: AuditAnchorRegistry;
  private provider: IAuditAnchorProvider;

  private constructor() {
    this.provider = new FileAuditAnchorProvider();
  }

  public static getInstance(): AuditAnchorRegistry {
    if (!AuditAnchorRegistry.instance) {
      AuditAnchorRegistry.instance = new AuditAnchorRegistry();
    }
    return AuditAnchorRegistry.instance;
  }

  public getProvider(): IAuditAnchorProvider {
    return this.provider;
  }

  public setProvider(provider: IAuditAnchorProvider): void {
    this.provider = provider;
  }
}

export interface VerifyAuditChainOptions {
  anchorProvider?: IAuditAnchorProvider;
  checkAnchor?: boolean;
}

export function verifyAuditChain(
  records: Iterable<SideEffectAuditRecord>,
  options?: VerifyAuditChainOptions
): SideEffectAuditRecord[] {
  const ordered = Array.from(records).sort((a, b) => (a.chainSequence ?? 0) - (b.chainSequence ?? 0));
  const legacy = ordered.find(
    (record) => record.chainSequence === undefined && record.previousHash === undefined && record.recordHash === undefined
  );
  if (legacy) throw new LegacyAuditHistoryError(legacy.id);
  let previousHash = AUDIT_CHAIN_GENESIS;
  ordered.forEach((record, index) => {
    if (record.chainSequence !== index + 1 || !record.previousHash || !record.recordHash) {
      throw new AuditIntegrityError(`Audit chain is incomplete or has a sequence gap at record "${record.id}".`);
    }
    if (!hashesMatch(previousHash, record.previousHash)) {
      throw new AuditIntegrityError(`Audit chain predecessor mismatch at record "${record.id}".`);
    }
    const calculated = hashRecord(record);
    if (!hashesMatch(record.recordHash, calculated)) {
      throw new AuditIntegrityError(`Audit record hash mismatch at record "${record.id}".`);
    }
    previousHash = record.recordHash;
  });

  if (options?.checkAnchor !== false) {
    const anchor = options?.anchorProvider ?? AuditAnchorRegistry.getInstance().getProvider();
    anchor.verifyHeadSync(ordered.at(-1) ?? null);
  }

  return ordered;
}

export function appendAuditChainRecord(
  audit: SideEffectAuditRecord,
  existing: Iterable<SideEffectAuditRecord>,
  options?: VerifyAuditChainOptions
): SideEffectAuditRecord {
  const chain = verifyAuditChain(existing, options);
  const previousHash = chain.at(-1)?.recordHash ?? AUDIT_CHAIN_GENESIS;
  const { chainSequence: _chainSequence, previousHash: _previousHash, recordHash: _recordHash, ...record } = audit;
  const sealed: SideEffectAuditRecord = {
    ...record,
    chainSequence: chain.length + 1,
    previousHash,
    recordHash: '',
  };
  sealed.recordHash = hashRecord(sealed);
  return sealed;
}

export function buildAuditCheckpoint(record: SideEffectAuditRecord): AuditCheckpoint {
  if (!record.chainSequence || !record.recordHash || !record.previousHash) {
    throw new AuditIntegrityError('Cannot build checkpoint from unsealed record');
  }
  return {
    ledgerId: 'samjuniors-side-effect-audit',
    formatVersion: 1,
    sequence: record.chainSequence,
    recordHash: record.recordHash,
    previousHash: record.previousHash,
    timestamp: record.timestamp,
  };
}
