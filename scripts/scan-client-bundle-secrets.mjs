#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

/**
 * Gate G3.5: Client Bundle Secret Leak Scanner
 *
 * Verifies that zero production secrets or private environment variables
 * reach client-accessible static bundles (.next/static) or frontend assets.
 */

console.log('=== SamJuniorsOS Client Bundle Secret Scan (Gate G3.5) ===');

const cwd = process.cwd();
const staticDir = path.join(cwd, '.next', 'static');
const publicDir = path.join(cwd, 'public');

// List of private environment variable names that must NEVER leak to the client
const SENSITIVE_ENV_KEYS = [
  'CLERK_SECRET_KEY',
  'SAMJUNIORS_DEV_SECRET',
  'CRON_TRIGGER_SECRET',
  'ELEVENLABS_API_KEY',
  'DEEPGRAM_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'DATABASE_URL',
  'LIVEKIT_API_SECRET',
];

// High-entropy regex patterns for standard third-party credential formats
const SECRET_REGEX_PATTERNS = [
  { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{32,}/g },
  { name: 'Clerk Secret Key', regex: /sk_live_[a-zA-Z0-9]{24,}/g },
  { name: 'GitHub Token', regex: /gh[pousr]_[a-zA-Z0-9]{36,}/g },
  { name: 'Slack Token', regex: /xox[baprs]-[a-zA-Z0-9]{10,}/g },
  { name: 'SendGrid Key', regex: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g },
  { name: 'Private process.env leak', regex: /process\.env\.(CLERK_SECRET_KEY|SAMJUNIORS_DEV_SECRET|CRON_TRIGGER_SECRET|ELEVENLABS_API_KEY|DEEPGRAM_API_KEY)/g },
];

/**
 * Extract active sensitive secrets from environment and env files
 */
function getActiveSecrets() {
  const secrets = new Map();

  // 1. From process.env
  for (const key of SENSITIVE_ENV_KEYS) {
    const val = process.env[key];
    if (val && typeof val === 'string' && val.trim().length >= 8 && !val.includes('file:')) {
      secrets.set(key, val.trim());
    }
  }

  // 2. From .env and .env.local if present
  for (const envFile of ['.env', '.env.local']) {
    const filePath = path.join(cwd, envFile);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (SENSITIVE_ENV_KEYS.includes(key) && val.length >= 8 && !val.includes('file:')) {
            secrets.set(key, val);
          }
        }
      }
    }
  }

  return secrets;
}

/**
 * Recursively find all target files in a directory
 */
function findFiles(dir, extensions = ['.js', '.mjs', '.html', '.json']) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

export function runClientBundleScan(options = {}) {
  const activeSecrets = options.secrets || getActiveSecrets();
  const distDir = path.join(cwd, "dist");
  const searchDirs = options.targetDirs || [distDir, staticDir, publicDir];

  const filesToScan = [];
  for (const d of searchDirs) {
    filesToScan.push(...findFiles(d));
  }

  // If .next/static hasn't been built yet, inspect client source components under src/os & src/app (excluding server-only API routes)
  if (filesToScan.length === 0) {
    console.log('[scan-client-secrets] Static build bundle not found; scanning client source trees in src/os & src/app (excluding server-side API routes)...');
    filesToScan.push(...findFiles(path.join(cwd, 'src', 'os'), ['.ts', '.tsx', '.js']));
    const appFiles = findFiles(path.join(cwd, 'src', 'app'), ['.ts', '.tsx', '.js'])
      .filter((f) => !f.replace(/\\/g, '/').includes('/src/app/api/'));
    filesToScan.push(...appFiles);
  }

  console.log(`[scan-client-secrets] Scanning ${filesToScan.length} client-accessible files against ${activeSecrets.size} sensitive credentials...`);

  const leaks = [];

  for (const file of filesToScan) {
    const content = fs.readFileSync(file, 'utf-8');
    const relativePath = path.relative(cwd, file);

    // 1. Check exact matches for active production secret values
    for (const [key, secretVal] of activeSecrets.entries()) {
      if (content.includes(secretVal)) {
        leaks.push({
          file: relativePath,
          type: 'Exact Value Match',
          secretKey: key,
          preview: secretVal.slice(0, 4) + '...' + secretVal.slice(-2),
        });
      }
    }

    // 2. Check generic pattern signatures
    for (const { name, regex } of SECRET_REGEX_PATTERNS) {
      regex.lastIndex = 0;
      const match = regex.exec(content);
      if (match) {
        // Disregard test fixtures if any was located
        if (!relativePath.includes('test') && !relativePath.includes('fixture')) {
          leaks.push({
            file: relativePath,
            type: `Pattern Match (${name})`,
            secretKey: name,
            preview: match[0].slice(0, 8) + '...',
          });
        }
      }
    }
  }

  if (leaks.length > 0) {
    console.error(`✗ FAIL: Detected ${leaks.length} secret leak(s) in client-accessible assets:`);
    for (const leak of leaks) {
      console.error(`  - [${leak.type}] in ${leak.file}: ${leak.secretKey} (${leak.preview})`);
    }
    return { passed: false, leaks, scannedCount: filesToScan.length };
  }

  console.log(`✓ PASS: Zero secrets detected across ${filesToScan.length} client files.`);
  return { passed: true, leaks: [], scannedCount: filesToScan.length };
}

import { pathToFileURL } from 'node:url';

// Direct CLI invocation
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runClientBundleScan();
  process.exit(result.passed ? 0 : 1);
}
