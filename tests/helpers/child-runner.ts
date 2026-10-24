import { fork, ChildProcess, execFileSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export interface ChildRunOptions {
  env?: Record<string, string>;
  cwd?: string;
  timeoutMs?: number;
  silent?: boolean;
}

export interface ChildRunResult<T = any> {
  exitCode: number;
  stdout: string;
  stderr: string;
  json: T | null;
}

/**
 * Spawns a child TypeScript/JavaScript process cross-platform.
 * Works reliably under Node.js (`npx tsx`) and Bun (`bun test` / `bun run`) on both Windows and Linux.
 */
export function spawnTestChild<T = any>(
  scriptPath: string,
  args: string[] = [],
  options: ChildRunOptions = {}
): Promise<ChildRunResult<T>> {
  return new Promise((resolve, reject) => {
    const resolvedScript = path.resolve(scriptPath);
    const env = { ...process.env, ...options.env };
    const cwd = options.cwd || process.cwd();
    const timeoutMs = options.timeoutMs || 30_000;

    let stdoutData = '';
    let stderrData = '';
    let timedOut = false;

    // Use Node's child_process.fork which automatically inherits execution arguments
    // (such as tsx loader and preflight) when running under tsx.
    const child: ChildProcess = fork(resolvedScript, args, {
      cwd,
      env,
      stdio: 'pipe',
      execArgv: process.execArgv,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      reject(new Error(`Test child (${path.basename(scriptPath)} ${args.join(' ')}) timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!timedOut) reject(err);
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      const exitCode = code ?? 0;
      let json: T | null = null;

      // Extract JSON from stdout if available (taking the last valid JSON line)
      const lines = stdoutData.trim().split('\n').map((l) => l.trim()).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]);
          if (parsed && typeof parsed === 'object') {
            json = parsed as T;
            break;
          }
        } catch {
          // not JSON line; continue searching
        }
      }

      resolve({
        exitCode,
        stdout: stdoutData,
        stderr: stderrData,
        json,
      });
    });
  });
}

/**
 * Creates an isolated temporary directory for test executions.
 * Cross-platform: Uses os.tmpdir() rather than hardcoded /tmp.
 * Returns the directory path and a recursive cleanup function.
 */
export function createIsolatedTestDir(prefix: string = 'samjuniors-test-'): {
  dir: string;
  cleanup: () => void;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    },
  };
}

/**
 * Resolves the installed Prisma CLI entry point (build/index.js).
 * Guaranteed to find the local Prisma CLI without relying on shell commands, bunx, or npx.
 */
export function getPrismaCliPath(): string {
  try {
    const prismaPkg = require.resolve('prisma/package.json');
    return path.join(path.dirname(prismaPkg), 'build', 'index.js');
  } catch {
    const fallbackPath = path.resolve(process.cwd(), 'node_modules/prisma/build/index.js');
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
    throw new Error('Could not resolve prisma/build/index.js. Ensure prisma is installed in node_modules.');
  }
}

/**
 * Runs a Prisma CLI command using the current runtime (Node.js or Bun)
 * cross-platform without relying on shell wrappers, npx, or bunx.
 */
export function runPrismaCommand(
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
    stdio?: 'pipe' | 'inherit' | 'ignore';
  } = {}
): string {
  const cliPath = getPrismaCliPath();
  const cwd = options.cwd || process.cwd();
  const env = { ...process.env, ...options.env };
  const timeoutMs = options.timeoutMs || 120_000;

  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: env as Record<string, string>,
    stdio: options.stdio || 'pipe',
    timeout: timeoutMs,
    encoding: 'utf-8',
  });
}

