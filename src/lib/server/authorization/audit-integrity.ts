import { createHash, timingSafeEqual } from 'node:crypto';
import type { SideEffectAuditRecord } from '@/types/authorization';

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

function canonicalize(value: unknown): unknown {
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

function hashRecord(record: SideEffectAuditRecord): string {
  const { recordHash: _recordHash, ...material } = record;
  return createHash('sha256').update(JSON.stringify(canonicalize(material)), 'utf8').digest('hex');
}

function hashesMatch(expected: string, actual: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expected) || !/^[a-f0-9]{64}$/i.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}

export function verifyAuditChain(records: Iterable<SideEffectAuditRecord>): SideEffectAuditRecord[] {
  const ordered = Array.from(records).sort((a, b) => (a.chainSequence ?? 0) - (b.chainSequence ?? 0));
  const legacy = ordered.find((record) => record.chainSequence === undefined && record.previousHash === undefined && record.recordHash === undefined);
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
  return ordered;
}

export function appendAuditChainRecord(
  audit: SideEffectAuditRecord,
  existing: Iterable<SideEffectAuditRecord>
): SideEffectAuditRecord {
  const chain = verifyAuditChain(existing);
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
