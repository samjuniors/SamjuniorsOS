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

// 1. Start Next.js standalone server
const standaloneServer = path.join(rootDir, '.next', 'standalone', 'server.js');
const nextTarget = fs.existsSync(standaloneServer)
  ? standaloneServer
  : path.join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next');

const nextArgs = fs.existsSync(standaloneServer)
  ? []
  : ['start', '-p', process.env.PORT || '3000'];

console.log(`[staging] Starting Next.js HTTP server on port ${process.env.PORT || '3000'}...`);
const nextProcess = spawn(process.execPath, [nextTarget, ...nextArgs], {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.PORT || '3000' },
});

// 2. Start Live Gateway WebSocket Companion Server
console.log(`[staging] Starting Live Gateway WebSocket server on port ${process.env.LIVE_WS_PORT || '3001'}...`);
const tsxBin = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const gatewayScript = path.join(rootDir, 'scripts', 'live-gateway.ts');

const wsProcess = spawn(process.execPath, [tsxBin, gatewayScript], {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, LIVE_WS_PORT: process.env.LIVE_WS_PORT || '3001' },
});

// Handle graceful shutdown
const shutdown = (signal) => {
  console.log(`\n[staging] Received ${signal}. Shutting down staging services...`);
  nextProcess.kill(signal);
  wsProcess.kill(signal);
  setTimeout(() => process.exit(0), 1000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

nextProcess.on('exit', (code) => {
  if (code !== 0) console.error(`[staging] Next.js process exited with code ${code}`);
});

wsProcess.on('exit', (code) => {
  if (code !== 0) console.error(`[staging] WS Gateway process exited with code ${code}`);
});
