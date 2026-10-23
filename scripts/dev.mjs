import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const nextBin = path.resolve(rootDir, 'node_modules/next/dist/bin/next');
const tsxCli = path.resolve(rootDir, 'node_modules/tsx/dist/cli.mjs');
const logStream = fs.createWriteStream(path.resolve(rootDir, 'dev.log'), { flags: 'a' });

loadEnvConfig(rootDir);

const devEnv = { ...process.env };
const configuredGatewayFlag = devEnv.SAMJUNIORS_VOICE_GATEWAY;
const liveWsPort = Number.parseInt(devEnv.LIVE_WS_PORT || '3001', 10);
const configuredWsUrl = devEnv.LIVE_WS_URL?.trim();
let configuredWs = null;
let invalidWsUrl = false;
try {
  configuredWs = configuredWsUrl ? new URL(configuredWsUrl) : null;
} catch {
  invalidWsUrl = true;
  // Leave malformed URLs for the status resolver to report; the rest of the
  // local application should still start so its canonical chat is available.
}
const wsHost = configuredWs?.hostname.toLowerCase();
const wsPort = configuredWs
  ? Number.parseInt(configuredWs.port || (configuredWs.protocol === 'wss:' ? '443' : '80'), 10)
  : liveWsPort;
const isLoopbackHost = !wsHost || ['localhost', '127.0.0.1', '[::1]'].includes(wsHost);
const useLocalGateway = !invalidWsUrl && isLoopbackHost && wsPort === liveWsPort;

// A local dev session owns both processes and creates one transient signing
// key for their shared ticket store. Production deployments must provision a
// stable secret explicitly and configure their gateway separately.
if (configuredGatewayFlag == null && useLocalGateway) {
  devEnv.SAMJUNIORS_VOICE_GATEWAY = '1';
}
const startGateway = useLocalGateway &&
  (devEnv.SAMJUNIORS_VOICE_GATEWAY === '1' || devEnv.SAMJUNIORS_VOICE_GATEWAY === 'true');

if (startGateway && !devEnv.LIVE_WS_TICKET_SECRET?.trim()) {
  devEnv.LIVE_WS_TICKET_SECRET = randomBytes(32).toString('base64url');
}

function pipeOutput(child, prefix) {
  child.stdout?.on('data', (data) => {
    process.stdout.write(data);
    logStream.write(data);
  });
  child.stderr?.on('data', (data) => {
    process.stderr.write(data);
    logStream.write(data);
  });
  child.on('error', (error) => {
    const message = `[${prefix}] ${error.message}\n`;
    process.stderr.write(message);
    logStream.write(message);
  });
}

let gateway = null;
let next = null;
let shuttingDown = false;
let nextExitCode = 0;
let logClosed = false;
const children = new Set();

function closeWhenDone() {
  if (shuttingDown && [...children].every((child) => child.exitCode !== null || child.signalCode !== null)) {
    if (!logClosed) {
      logClosed = true;
      logStream.end();
    }
    process.exitCode = nextExitCode;
  }
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
  closeWhenDone();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

async function startLocalGateway() {
  if (!startGateway) return false;
  if (!fs.existsSync(tsxCli)) {
    process.stderr.write('[Sophia Live Gateway] Local tsx runtime is missing; continuing without the gateway.\n');
    devEnv.SAMJUNIORS_VOICE_GATEWAY = '0';
    return false;
  }

  gateway = spawn(process.execPath, [tsxCli, path.resolve(rootDir, 'scripts/live-gateway.ts')], {
    cwd: rootDir,
    env: devEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.add(gateway);
  pipeOutput(gateway, 'Sophia Live Gateway');
  gateway.on('close', () => closeWhenDone());

  let ready = false;
  let outputBuffer = '';
  const becameReady = new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 15000);
    gateway.stdout.on('data', (data) => {
      outputBuffer = `${outputBuffer}${data}`.slice(-4000);
      if (!ready && outputBuffer.includes('Companion WebSocket listening')) {
        ready = true;
        clearTimeout(timeout);
        resolve(true);
      }
    });
    gateway.once('close', () => {
      if (!ready) {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  });

  const gatewayReady = await becameReady;
  if (!gatewayReady) {
    process.stderr.write('[Sophia Live Gateway] Did not become ready; browser speech fallback will use canonical Sophia chat.\n');
    devEnv.SAMJUNIORS_VOICE_GATEWAY = '0';
    if (gateway.exitCode === null && gateway.signalCode === null) gateway.kill('SIGTERM');
    return false;
  }

  return true;
}

async function main() {
  const gatewayReady = await startLocalGateway();
  if (shuttingDown) return;
  if (startGateway && !gatewayReady) {
    devEnv.SAMJUNIORS_VOICE_GATEWAY = '0';
  }

  next = spawn(process.execPath, [nextBin, 'dev', '-p', '3000'], {
    cwd: rootDir,
    env: devEnv,
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.add(next);
  pipeOutput(next, 'Next.js');

  next.on('close', (code) => {
    nextExitCode = code ?? 0;
    if (!shuttingDown) shutdown('SIGTERM');
    closeWhenDone();
  });
}

void main().catch((error) => {
  const message = `[dev] ${error instanceof Error ? error.message : String(error)}\n`;
  process.stderr.write(message);
  logStream.write(message);
  nextExitCode = 1;
  shutdown('SIGTERM');
});
