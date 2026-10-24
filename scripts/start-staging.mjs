#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Ensure db and .data directories exist in persistent volume
fs.mkdirSync(path.join(rootDir, 'db'), { recursive: true });
fs.mkdirSync(path.join(rootDir, '.data'), { recursive: true });

console.log('[staging] Initializing SamJuniorsOS Staging Environment (Option A)...');

// Run schema sync to ensure database tables are created in the volume
try {
  console.log('[staging] Syncing database schema to SQLite volume...');
  const prismaBin = path.join(rootDir, 'node_modules', 'prisma', 'build', 'index.js');
  const sync = spawn(process.execPath, [prismaBin, 'db', 'push', '--accept-data-loss', '--skip-generate'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'file:./db/custom.db' },
  });
  await new Promise((resolve) => sync.on('close', resolve));
} catch (err) {
  console.warn('[staging] Warning: Database schema sync returned an error:', err.message);
}

// 1. Start application server (Express full-stack server.ts, or fallback to Next.js standalone if present)
const tsxBin = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const serverScript = path.join(rootDir, 'server.ts');
const standaloneServer = path.join(rootDir, '.next', 'standalone', 'server.js');

let appBin;
let appArgs;

if (fs.existsSync(serverScript)) {
  console.log(`[staging] Starting Express + Vite full-stack server on port ${process.env.PORT || '3000'}...`);
  appBin = process.execPath;
  appArgs = [tsxBin, serverScript];
} else if (fs.existsSync(standaloneServer)) {
  console.log(`[staging] Starting Next.js standalone HTTP server on port ${process.env.PORT || '3000'}...`);
  appBin = process.execPath;
  appArgs = [standaloneServer];
} else {
  console.log(`[staging] Starting Next.js HTTP server on port ${process.env.PORT || '3000'}...`);
  const nextTarget = path.join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next');
  appBin = process.execPath;
  appArgs = [nextTarget, 'start', '-p', process.env.PORT || '3000'];
}

const appProcess = spawn(appBin, appArgs, {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.PORT || '3000' },
});

// 2. Start Live Gateway WebSocket Companion Server
console.log(`[staging] Starting Live Gateway WebSocket server on port ${process.env.LIVE_WS_PORT || '3001'}...`);
const gatewayScript = path.join(rootDir, 'scripts', 'live-gateway.ts');

const wsProcess = spawn(process.execPath, [tsxBin, gatewayScript], {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, LIVE_WS_PORT: process.env.LIVE_WS_PORT || '3001' },
});

// Handle graceful shutdown
const shutdown = (signal) => {
  console.log(`\n[staging] Received ${signal}. Shutting down staging services...`);
  appProcess.kill(signal);
  wsProcess.kill(signal);
  setTimeout(() => process.exit(0), 1000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

appProcess.on('exit', (code) => {
  if (code !== 0) console.error(`[staging] Application process exited with code ${code}`);
});

wsProcess.on('exit', (code) => {
  if (code !== 0) console.error(`[staging] WS Gateway process exited with code ${code}`);
});
