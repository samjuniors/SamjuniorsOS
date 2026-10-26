import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { InMemoryAuditStore } from '../../src/lib/server/authorization/approval-store';
import { LegacyAuditHistoryError, verifyAuditChain } from '../../src/lib/server/authorization/audit-integrity';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';
import type { SideEffectAuditRecord } from '../../src/types/authorization';

async function main(): Promise<void> {
  const store = InMemoryAuditStore.getInstance();
  const fileStore = DurableFileStore.getInstance();
  const auditFile = path.join(fileStore.getDataDir(), 'audits.json');
  const initializedMarker = `${auditFile}.initialized`;
  const originalBytes = fs.existsSync(auditFile) ? fs.readFileSync(auditFile) : null;
  const markerExisted = fs.existsSync(initializedMarker);
  const originalCache = new Map(store.audits);

  const fixture = (id: string): SideEffectAuditRecord => ({
    id,
    timestamp: new Date().toISOString(),
    requestId: `request-${id}`,
    employeeRole: 'system',
    requestedBy: 'founder-g3-6',
    actionClassification: 'internal_mutation',
    actionName: 'audit-integrity-test',
    decision: 'denied',
    reasonCode: 'APPROVAL_REQUIRED_STEP_POLICY',
    reason: `fixture:${id}`,
    executed: false,
  });

  try {
    const writes = await Promise.all(
      Array.from({ length: 8 }, (_, index) => store.record(fixture(`g36-chain-${index}`)))
    );
    const chain = await store.list();
    assert.equal(chain.length, 8, 'concurrent local appends all persist');
    assert.deepEqual(
      chain.map((record) => record.chainSequence).sort((a, b) => (a ?? 0) - (b ?? 0)),
      [1, 2, 3, 4, 5, 6, 7, 8],
      'concurrent appends receive one contiguous sequence without forking'
    );
    assert.ok(writes.every((record) => record.previousHash && record.recordHash), 'each persisted record has chain hashes');
    assert.ok(chain.some((record) => record.id === writes[7].id), 'a valid persisted chain reloads and verifies');

    const persisted = fileStore.readCollection<SideEffectAuditRecord>('audits');
    persisted['g36-chain-0'].reason = 'tampered reason';
    fs.writeFileSync(auditFile, JSON.stringify(persisted), 'utf8');
    await assert.rejects(() => store.list(), /Audit record hash mismatch/);

    const legacy = fixture('legacy-unsealed');
    assert.throws(() => verifyAuditChain([legacy]), LegacyAuditHistoryError, 'legacy audit history is never silently resealed');
    assert.equal(legacy.recordHash, undefined, 'legacy verification does not mutate the historical record');
  } finally {
    if (originalBytes) fs.writeFileSync(auditFile, originalBytes);
    else if (fs.existsSync(auditFile)) fs.unlinkSync(auditFile);
    if (!markerExisted && fs.existsSync(initializedMarker)) fs.unlinkSync(initializedMarker);
    store.audits.clear();
    for (const [id, record] of originalCache) store.audits.set(id, record);
  }

  console.log('G3.6 audit chain tamper test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
