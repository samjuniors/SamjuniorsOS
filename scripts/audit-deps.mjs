#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Gate G3.4: Automated Dependency Security Audit
 *
 * Verifies that zero unmitigated critical vulnerabilities exist across
 * installed dependencies. Any accepted advisory must be explicitly listed
 * in ACCEPTED_ADVISORIES with architectural rationale (e.g., unused subsystem).
 */

console.log('=== SamJuniorsOS Dependency Security Audit (Gate G3.4) ===');

const cwd = process.cwd();
const lockfilePath = path.join(cwd, 'package-lock.json');
const hadLockfileInitially = fs.existsSync(lockfilePath);

// Accepted advisories documented under the Founder Operating Model
const ACCEPTED_ADVISORIES = new Map([
  [
    'GHSA-vcvr-r3jv-pc5j',
    'Next.js next/og ImageResponse: verified unused in SamJuniorsOS codebase (0 occurrences of next/og)',
  ],
]);

try {
  if (!hadLockfileInitially) {
    console.log('[audit-deps] Generating temporary package-lock.json for vulnerability scanning...');
    execSync('npm i --package-lock-only --no-audit', { stdio: 'pipe', cwd });
  }

  console.log('[audit-deps] Scanning package dependencies for critical vulnerabilities...');
  let auditJson = null;
  try {
    const raw = execSync('npm audit --json', { encoding: 'utf-8', cwd });
    auditJson = JSON.parse(raw);
  } catch (auditErr) {
    if (auditErr.stdout) {
      try {
        auditJson = JSON.parse(auditErr.stdout);
      } catch {}
    }
  }

  if (!auditJson) {
    throw new Error('Failed to parse npm audit output');
  }

  const unmitigatedCritical = [];

  for (const [pkgName, pkgData] of Object.entries(auditJson.vulnerabilities || {})) {
    if (pkgData.severity === 'critical') {
      const via = pkgData.via || [];
      for (const item of via) {
        if (typeof item === 'object' && item.severity === 'critical') {
          const advisoryUrl = item.url || '';
          const ghsaMatch = advisoryUrl.match(/GHSA-[a-z0-9-]+/i);
          const ghsaId = ghsaMatch ? ghsaMatch[0] : null;

          if (ghsaId && ACCEPTED_ADVISORIES.has(ghsaId)) {
            console.log(`[audit-deps] Accepted Risk (${ghsaId}): ${ACCEPTED_ADVISORIES.get(ghsaId)}`);
          } else {
            unmitigatedCritical.push({
              name: pkgName,
              title: item.title || 'Critical vulnerability',
              url: advisoryUrl,
            });
          }
        }
      }
    }
  }

  if (unmitigatedCritical.length > 0) {
    console.error(`✗ FAIL: ${unmitigatedCritical.length} unmitigated critical vulnerability/vulnerabilities detected:`);
    for (const v of unmitigatedCritical) {
      console.error(`  - [${v.name}] ${v.title} (${v.url})`);
    }
    process.exit(1);
  }

  console.log('✓ PASS: Dependency security audit completed with zero unmitigated critical vulnerabilities.');
  process.exit(0);
} catch (error) {
  console.error('✗ FAIL: Dependency security audit error:', error.message);
  process.exit(1);
} finally {
  if (!hadLockfileInitially && fs.existsSync(lockfilePath)) {
    try {
      fs.unlinkSync(lockfilePath);
      console.log('[audit-deps] Cleaned up temporary package-lock.json.');
    } catch {}
  }
}
