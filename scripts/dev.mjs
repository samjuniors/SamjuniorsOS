import { spawn } from 'node:child_process';
import fs from 'node:fs';

const logStream = fs.createWriteStream('dev.log', { flags: 'a' });
const isWin = process.platform === 'win32';
const nextCmd = isWin ? 'npx.cmd' : 'npx';

const child = spawn(nextCmd, ['next', 'dev', '-p', '3000'], {
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
