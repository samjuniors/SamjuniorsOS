import { fork, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

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
