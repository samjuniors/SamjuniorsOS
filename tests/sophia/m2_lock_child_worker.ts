import fs from 'fs';
import path from 'path';
import { DurableFileStore } from '../../src/lib/server/persistence/durable-file-store';

const command = process.argv[2];
const collection = process.argv[3];
const arg1 = process.argv[4];
const arg2 = process.argv[5];

const fileStore = DurableFileStore.getInstance();

switch (command) {
  case 'hold_lock': {
    const durationMs = parseInt(arg1, 10);
    fileStore.withCollectionLock(collection, () => {
      // Signal ready by writing or printing
      if (process.send) process.send({ type: 'LOCK_ACQUIRED', pid: process.pid });
      console.log(`CHILD_LOCK_ACQUIRED:${process.pid}`);
      const deadline = Date.now() + durationMs;
      while (Date.now() < deadline) {
        // Synchronous hold
      }
    });
    if (process.send) process.send({ type: 'LOCK_RELEASED', pid: process.pid });
    console.log(`CHILD_LOCK_RELEASED:${process.pid}`);
    process.exit(0);
    break;
  }

  case 'crash_holding_lock': {
    // Acquire lock directly and exit abruptly without releasing
    const lockPath = path.join(fileStore.getDataDir(), `${collection}.json.lock`);
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }) + '\n');
    fs.closeSync(fd);
    console.log(`CHILD_CRASHING_WITH_LOCK:${process.pid}`);
    if (process.send) process.send({ type: 'CRASHING', pid: process.pid });
    // Terminate abruptly without executing finally or exit handlers
    process.exit(99);
    break;
  }

  case 'write_items': {
    const prefix = arg1;
    const count = parseInt(arg2, 10);
    for (let i = 0; i < count; i++) {
      fileStore.saveItem(collection, `${prefix}_${i}`, {
        id: `${prefix}_${i}`,
        writerPid: process.pid,
        index: i,
        timestamp: Date.now(),
      });
    }
    console.log(`CHILD_WRITES_COMPLETED:${process.pid}:${count}`);
    process.exit(0);
    break;
  }

  default: {
    console.error(`Unknown child command: ${command}`);
    process.exit(1);
  }
}
