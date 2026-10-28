import fs from 'node:fs';
import path from 'node:path';
import {
  verifyAuditChain,
  buildAuditCheckpoint,
  FileAuditAnchorProvider,
} from '../src/lib/server/authorization/audit-integrity';
import { DurableFileStore } from '../src/lib/server/persistence/durable-file-store';
import type { SideEffectAuditRecord } from '../src/types/authorization';

const dataDir = DurableFileStore.getInstance().getDataDir();
const auditsFile = path.join(dataDir, 'audits.json');
const anchorDir = path.join(dataDir, 'audit_anchors');

if (fs.existsSync(auditsFile)) {
  const content = fs.readFileSync(auditsFile, 'utf8');
  const audits = JSON.parse(content || '{}');
  const records = Object.values(audits) as SideEffectAuditRecord[];
  if (records.length > 0) {
    const chain = verifyAuditChain(records, { checkAnchor: false });
    console.log(`Found ${chain.length} existing audit records.`);
    const provider = new FileAuditAnchorProvider(anchorDir);
    for (const record of chain) {
      provider.publishCheckpointSync(buildAuditCheckpoint(record));
    }
    console.log(`Successfully anchored ${chain.length} audit records in ${anchorDir}`);
  } else {
    console.log('No existing audit records to anchor.');
  }
} else {
  console.log('No audits.json found.');
}
