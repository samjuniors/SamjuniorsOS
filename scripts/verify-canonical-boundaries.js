#!/usr/bin/env node
/**
 * Canonical boundary verifier — Phase 4.3C.
 *
 * Fails if any canonical runtime source imports from the inert /old
 * archive, or if the boundary guards (tsconfig exclude, eslint ignore,
 * Tailwind @source guard) are missing.
 *
 * Run from repository root: node scripts/verify-canonical-boundaries.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failures = 0;

const check = (name, ok, detail = '') => {
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

/* ------------------------------------------------------------ helpers */

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|css)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/* ------------------------------------- 1. no canonical imports from old */

const CANONICAL_ROOTS = ['src'];
const importPattern = /(?:import|export|require\s*\(|import\s*\()\s*(?:type\s+)?(?:[\s\S]*?from\s*)?['"]([^'"]+)['"]/g;

const offenders = [];
for (const canon of CANONICAL_ROOTS) {
  const canonDir = path.join(root, canon);
  if (!fs.existsSync(canonDir)) continue;
  for (const file of walk(canonDir)) {
    const src = fs.readFileSync(file, 'utf8');
    let m;
    const re = new RegExp(importPattern.source, 'g');
    while ((m = re.exec(src)) !== null) {
      const spec = m[1];
      // Any reference that resolves into the /old archive.
      if (/(^|\/|\.\.)old(\/|$)/.test(spec) || spec.startsWith('old/')) {
        offenders.push(`${path.relative(root, file)} → ${spec}`);
      }
    }
  }
}
check('canonical runtime has ZERO imports from /old', offenders.length === 0,
  offenders.length ? offenders.join(' | ') : 'src/** clean');

/* ------------------------------------------- 2. boundary guards present */

const tsconfig = fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8');
check('tsconfig.json excludes "old"', /"old"/.test(tsconfig));

const eslint = fs.readFileSync(path.join(root, 'eslint.config.mjs'), 'utf8');
check('eslint ignores "old/**"', /old\/\*\*/.test(eslint));

const v2globals = fs.readFileSync(path.join(root, 'src/app/v2-globals.css'), 'utf8');
check('Tailwind @source not guard present (v2-globals.css)', /@source\s+not\s+"[^"]*old/.test(v2globals));

/* ------------------------------------------- 3. old/ has no consumers */

// No Next.js route may live under old/, and old/ must not be a public dir.
check('old/ contains no app router directory', !fs.existsSync(path.join(root, 'old/app')));
check('old/README.md documents the archive', fs.existsSync(path.join(root, 'old/README.md')));

/* ------------------------------------------------------------- result */

if (failures > 0) {
  console.error(`\nCANONICAL BOUNDARY VERIFICATION FAILED (${failures} failure${failures > 1 ? 's' : ''}).`);
  process.exit(1);
}
console.log('\nAll canonical boundary verification checks PASSED.');
