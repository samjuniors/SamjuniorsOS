#!/usr/bin/env node
/**
 * Read-only relative Markdown link checker.
 * Default: maintained navigation documents. --all: all tracked Markdown.
 * Does not validate external URLs or headings after "#".
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const activeDocs = [
  'README.md',
  'docs/README.md',
  'docs/SETUP.md',
  'docs/audit/README.md',
  'docs/audit/2026-10-23-kit-integration-documentation-audit.md',
  'docs/archive/README.md',
  'docs/archive/legacy-setup-nextjs-2026-10-23.md',
  'docs/research/README.md',
  'docs/voice/SHARED-SOFIA-VOICE-PATCH.md',
  'doc/adr/README.md',
  'doc/research/phase4c_stt_benchmark_and_architecture.md',
];

export function removeFencedCode(markdown) {
  const out = [];
  let fence = null;
  for (const line of markdown.split('\n')) {
    const trimmed = line.trimStart();
    const marker = trimmed[0] === '~' || trimmed.charCodeAt(0) === 96 ? trimmed[0] : null;
    const count = marker ? (trimmed.match(new RegExp('^' + (marker === '~' ? '~' : '\\x60') + '+')) || [''])[0].length : 0;
    if (!fence && count >= 3) { fence = marker; continue; }
    if (fence && marker === fence && count >= 3) { fence = null; continue; }
    if (!fence) out.push(line);
  }
  return out.join('\n');
}

export function extractRelativeLinks(markdown) {
  const cleaned = removeFencedCode(markdown);
  const destinations = [];
  const link = /!?\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g;
  for (const match of cleaned.matchAll(link)) {
    let target = (match[1] || match[2] || '').trim();
    if (!target || target.startsWith('#') || target.startsWith('/')) continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) continue;
    target = target.split('#')[0].split('?')[0];
    try { target = decodeURIComponent(target); } catch { /* test literal path */ }
    if (target && !target.includes('$' + '{')) destinations.push(target);
  }
  return destinations;
}

export function checkFile(file, repositoryRoot = root) {
  const fullPath = path.resolve(repositoryRoot, file);
  const markdown = fs.readFileSync(fullPath, 'utf8');
  const missing = [];
  let checked = 0;
  for (const target of extractRelativeLinks(markdown)) {
    const resolved = path.resolve(path.dirname(fullPath), target);
    if (!(resolved === repositoryRoot || resolved.startsWith(repositoryRoot + path.sep))) {
      missing.push({ file, target, reason: 'outside repository' });
      continue;
    }
    checked++;
    if (!fs.existsSync(resolved)) missing.push({ file, target, reason: 'missing file or directory' });
  }
  return { checked, missing };
}

function listTrackedDocs() {
  const output = execFileSync('git', ['ls-files', '-z', '--', '*.md', '*.mdx'], {
    cwd: root, encoding: 'utf8',
  });
  return output.split('\0').filter(Boolean);
}

export function main(args = process.argv.slice(2)) {
  const all = args.includes('--all');
  const files = all ? listTrackedDocs() : activeDocs;
  let checked = 0;
  const missing = [];
  for (const file of files) {
    if (!fs.existsSync(path.join(root, file))) {
      missing.push({ file, target: file, reason: 'missing source document' });
      continue;
    }
    const result = checkFile(file);
    checked += result.checked;
    missing.push(...result.missing);
  }
  console.log('[docs:links] ' + (all ? 'all tracked' : 'maintained') +
    ' documents: ' + files.length + '; relative targets: ' + checked + '; missing: ' + missing.length);
  for (const entry of missing) {
    console.error('  ' + entry.file + ' -> ' + entry.target + ' (' + entry.reason + ')');
  }
  if (!all) console.log('[docs:links] Use --all to audit historical/archived documentation separately.');
  return missing.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
