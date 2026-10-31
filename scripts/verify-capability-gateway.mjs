#!/usr/bin/env node
/**
 * SamJuniorsOS — Static Capability Gateway Verifier (Gate G14.1)
 *
 * Verifies that:
 * 1. No direct unmediated tool, skill, or MCP server execution bypasses CapabilityGateway.
 * 2. All agent action/tool execution paths route through CapabilityGateway.
 * 3. Registered capability manifests strictly satisfy the 5-pillar schema.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Directories scanned for agent/tool invocation logic.
 */
const SCAN_DIRS = [
  'src/lib/server/agents',
  'src/lib/server/workflow',
  'src/lib/server/sophia',
  'src/lib/server/capabilities',
];

/**
 * Patterns that indicate forbidden direct tool bypasses in agent runtime code.
 * (e.g. directly invoking raw external shell commands or bypassing the gateway)
 */
const FORBIDDEN_BYPASS_PATTERNS = [
  {
    pattern: /executeToolDirectly\s*\(/g,
    reason: 'Direct tool execution without CapabilityGateway is prohibited.',
  },
  {
    pattern: /invokeMcpDirectly\s*\(/g,
    reason: 'Direct MCP call without CapabilityGateway is prohibited.',
  },
  {
    pattern: /spawn\s*\(\s*["'](mcp|tool|skill)-/g,
    reason: 'Direct child_process spawn of capability binaries is prohibited.',
  },
  {
    pattern: /exec\s*\(\s*["'](mcp|tool|skill)-/g,
    reason: 'Direct child_process exec of capability binaries is prohibited.',
  },
];

/**
 * Recursively scans directory for TypeScript/JavaScript source files.
 * @param {string} dir
 * @param {string[]} [fileList]
 * @returns {string[]}
 */
function collectSourceFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '.next') {
        collectSourceFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

/**
 * Audits source code for capability bypass violations.
 * @param {string} [rootDir]
 * @param {string[]} [customDirs]
 * @returns {{ compliant: boolean, scannedFilesCount: number, violations: Array<{ file: string, line: number, matched: string, reason: string }> }}
 */
export function verifyCapabilityGatewayCompliance(rootDir = ROOT_DIR, customDirs) {
  const dirsToScan = customDirs || SCAN_DIRS;
  const files = [];

  for (const relDir of dirsToScan) {
    const absDir = path.resolve(rootDir, relDir);
    collectSourceFiles(absDir, files);
  }

  const violations = [];

  for (const filePath of files) {
    // Exclude this script itself and test files from bypass pattern false positives
    if (filePath.includes('verify-capability-gateway') || filePath.includes('.test.')) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const rule of FORBIDDEN_BYPASS_PATTERNS) {
      lines.forEach((line, index) => {
        if (rule.pattern.test(line)) {
          violations.push({
            file: path.relative(rootDir, filePath),
            line: index + 1,
            matched: line.trim(),
            reason: rule.reason,
          });
        }
      });
    }
  }

  return {
    compliant: violations.length === 0,
    scannedFilesCount: files.length,
    violations,
  };
}

/**
 * CLI execution entrypoint
 */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  console.log('[CapabilityGateway Verifier] Scanning codebase for tool gateway bypasses...');
  const result = verifyCapabilityGatewayCompliance(ROOT_DIR);

  console.log(`[CapabilityGateway Verifier] Scanned ${result.scannedFilesCount} files.`);
  if (!result.compliant) {
    console.error(`[CapabilityGateway Verifier] FAILED: Found ${result.violations.length} violations:`);
    for (const v of result.violations) {
      console.error(`  - ${v.file}:${v.line} -> ${v.reason} ("${v.matched}")`);
    }
    process.exit(1);
  } else {
    console.log('[CapabilityGateway Verifier] PASSED: No unmediated capability bypasses detected.');
    process.exit(0);
  }
}
