import fs from 'fs';
import path from 'path';
import {
  DurableFileStore,
  CriticalCollectionCorruptionError,
  LockTimeoutError,
} from '../../src/lib/server/persistence/durable-file-store';

const command = process.argv[2];
const collection = process.argv[3];
const arg1 = process.argv[4];
const arg2 = process.argv[5];

const emit = (payload: any) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

// Route any regular logs to stderr so stdout remains clean JSON
console.log = (...args: unknown[]) => {
  console.error(...args);
};

const fileStore = DurableFileStore.getInstance();

switch (command) {
  case 'write_item': {
    const key = arg1;
    const value = JSON.parse(arg2);
    fileStore.saveItem(collection, key, value);
    emit({ success: true, key, pid: process.pid });
    process.exit(0);
    break;
  }

  case 'read_collection': {
    try {
      const data = fileStore.readCollection<any>(collection);
      emit({ success: true, data, count: Object.keys(data).length });
      process.exit(0);
    } catch (err: any) {
      emit({
        success: false,
        error: err.message,
        isCorruption: err instanceof CriticalCollectionCorruptionError,
      });
      process.exit(1);
    }
    break;
  }

  case 'crash_leaving_temp_and_lock': {
    const dataDir = fileStore.getDataDir();
    // 1. Create a lock file owned by this child
    const lockPath = path.join(dataDir, `${collection}.json.lock`);
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, createdAt: Date.now() }) + '\n');

    // 2. Create an orphaned temp file owned by this child
    const tempPath = path.join(dataDir, `${collection}.json.tmp.${process.pid}.${Date.now()}`);
    fs.writeFileSync(tempPath, 'partial write content that crashed\n');

    emit({ setup: true, pid: process.pid, lockPath, tempPath });
    // Abrupt termination
    process.exit(99);
    break;
  }

  case 'delete_with_tombstone': {
    const targetId = arg1;
    // Write item first
    fileStore.saveItem(collection, targetId, { id: targetId, content: 'active before deletion' });

    // Write tombstone
    const tombstoneCollection = `${collection}_tombstones`;
    fileStore.saveItem(tombstoneCollection, targetId, {
      id: targetId,
      tombstoneId: `tomb-${targetId}`,
      deletedAt: new Date().toISOString(),
      prismaReconciled: true,
    });

    // Delete item
    fileStore.deleteItem(collection, targetId);

    emit({ success: true, deleted: targetId });
    process.exit(0);
    break;
  }

  case 'attempt_resurrect': {
    const targetId = arg1;
    const tombstoneCollection = `${collection}_tombstones`;
    const tombstones = fileStore.readCollection<any>(tombstoneCollection);

    if (tombstones[targetId]) {
      emit({ resurrected: false, shielded: true, reason: 'Tombstone shield active' });
      process.exit(0);
    } else {
      fileStore.saveItem(collection, targetId, { id: targetId, resurrected: true });
      emit({ resurrected: true, shielded: false });
      process.exit(0);
    }
    break;
  }

  default: {
    console.error(`Unknown worker command: ${command}`);
    process.exit(1);
  }
}
