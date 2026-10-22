#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Gate G3.4: Automated Dependency Security Audit
 *
 * Verifies that zero critical vulnerabilities exist across installed
 * direct and transitive dependencies. Compatible with both npm lockfile
 * environments and Bun environments.
 */

console.log('=== SamJuniorsOS Dependency Security Audit (Gate G3.4) ===');

const cwd = process.cwd();
const lockfilePath = path.join(cwd, 'package-lock.json');
const hadLockfileInitially = fs.existsSync(lockfilePath);

try {
  if (!hadLockfileInitially) {
    console.log('[audit-deps] Generating temporary package-lock.json for vulnerability scanning...');
    execSync('npm i --package-lock-only --no-audit', { stdio: 'inherit', cwd });
  }

  console.log('[audit-deps] Scanning package dependencies for critical vulnerabilities...');
  execSync('npm audit --audit-level=critical', { stdio: 'inherit', cwd });

  console.log('✓ PASS: Dependency security audit completed with zero critical vulnerabilities.');
  process.exit(0);
} catch (error) {
  console.error('✗ FAIL: Dependency security audit detected unmitigated vulnerabilities.');
  process.exit(1);
} finally {
  if (!hadLockfileInitially && fs.existsSync(lockfilePath)) {
    try {
      fs.unlinkSync(lockfilePath);
      console.log('[audit-deps] Cleaned up temporary package-lock.json.');
    } catch {}
  }
}
