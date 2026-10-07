import { spawn } from 'node:child_process';
import fs from 'node:fs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const nextBin = path.resolve(rootDir, 'node_modules/next/dist/bin/next');
const logStream = fs.createWriteStream(path.resolve(rootDir, 'dev.log'), { flags: 'a' });

const child = spawn(process.execPath, [nextBin, 'dev', '-p', '3000'], {
  cwd: rootDir,
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: false,
});

child.stdout.on('data', (data) => {
  process.stdout.write(data);
  logStream.write(data);
});

child.stderr.on('data', (data) => {
  process.stderr.write(data);
  logStream.write(data);
});

child.on('close', (code) => {
  logStream.end();
  process.exit(code ?? 0);
});
