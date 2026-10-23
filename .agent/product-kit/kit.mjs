#!/usr/bin/env node
// product-kit CLI. Zero dependencies, Node >= 18. See .agent/product-kit/PROTOCOL.md.
//
// State model (no single mutable state file, so parallel agents do not conflict):
//   definitions : .agent/product-kit/gates.json              (committed, edited by the lead only)
//   claims      : <git-common-dir>/kit/claims/<ID>/   (local, shared by all worktrees, survives shutdown)
//   completion  : .agent/product-kit/done/<ID>.json          (committed WITH the work on the step branch)
//   decisions   : .agent/product-kit/ack/<KEY>.json          (committed, records a founder statement)
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, renameSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitDir = path.dirname(fileURLToPath(import.meta.url));
const git = (args, cwd = kitDir) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const root = git(['rev-parse', '--show-toplevel']);
const commonDir = path.resolve(kitDir, git(['rev-parse', '--git-common-dir']));
const claimsDir = path.join(commonDir, 'kit', 'claims');

const KIT_VERSION = 2;
// Optional local settings: kit.config.json { integrationBranch (steps land here), mainBranch (released here at milestone ship), remote, checks: [shell commands that must pass before anything lands], ci: { mode: off|wait }, lean, secretScanIgnore: [paths] }
const cfgFile = path.join(kitDir, 'kit.config.json');
const cfg = { mainBranch: 'main', integrationBranch: 'kit/integration', remote: 'origin', checks: [], secretScanIgnore: [], ci: {}, lean: {}, ...(existsSync(cfgFile) ? (() => { try { return JSON.parse(readFileSync(cfgFile, 'utf8')); } catch (e) { console.error(`kit: kit.config.json is not valid JSON (${e.message}). Fix it; nothing was changed.`); process.exit(1); } })() : {}) };

cfg.ci = { mode: 'off', timeoutMinutes: 25, startWaitMinutes: 4, pollSeconds: 20, ...cfg.ci };      // mode: "off" or "wait" (wait for GitHub Actions through the gh CLI)
cfg.lean = { maxFilesPerStep: 15, maxAddedLines: 800, ...cfg.lean };
const trunk = cfg.integrationBranch;   // where finished steps land. Equal to mainBranch means direct mode.

const data = JSON.parse(readFileSync(path.join(kitDir, 'gates.json'), 'utf8'));
const STALE_MS = (data.stale_claim_minutes ?? 30) * 60 * 1000;
const gates = data.gates;
const gateById = new Map(gates.map((g) => [g.id, g]));
const steps = new Map();
for (const g of gates) for (const s of g.steps) steps.set(s.id, { ...s, gate: g.id });

// Milestones: the order the founder tests in. Optional file; without it the kit behaves as before.
const msFile = path.join(kitDir, 'milestones.json');
const milestones = existsSync(msFile) ? JSON.parse(readFileSync(msFile, 'utf8')).milestones : [];
const msById = new Map(milestones.map((m) => [m.id, m]));
for (const m of milestones) {
  for (const s of m.steps ?? []) steps.set(s.id, { ...s, gate: null, milestone: m.id });
  for (const id of m.uses ?? []) if (steps.has(id)) steps.get(id).milestone = m.id;
}
const msStepIds = (m) => [...(m.uses ?? []), ...(m.steps ?? []).map((s) => s.id)];

const keysIn = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
const done = new Set(keysIn(path.join(kitDir, 'done')));
const acks = new Set(keysIn(path.join(kitDir, 'ack')));

const satisfied = (key) => done.has(key) || acks.has(key);
// A gate is closed when every step in it is done (the founder accepts work at milestone level), or by an explicit ack.
const gateClosed = (id) => acks.has(id) || acks.has(`NA-${id}`) || gateById.get(id).steps.every((s) => done.has(s.id));
const msClosed = (id) => acks.has(`MS-${id}`);
const activeMs = milestones.find((m) => !msClosed(m.id)) ?? null;
const gateOpen = (id) => gateById.get(id).requires.every(gateClosed);

function readClaim(id) {
  const f = path.join(claimsDir, id, 'claim.json');
  if (!existsSync(f)) return null;
  const c = JSON.parse(readFileSync(f, 'utf8'));
  c.stale = Date.now() - new Date(c.heartbeatAt).getTime() > STALE_MS;
  return c;
}
const allClaims = () => (existsSync(claimsDir) ? readdirSync(claimsDir).map(readClaim).filter(Boolean) : []);

function stateOf(s) {
  if (done.has(s.id)) return { k: 'done' };
  const c = readClaim(s.id);
  if (c) return { k: c.stale ? 'stale-claim' : 'claimed', c };
  if (s.milestone && activeMs && s.milestone !== activeMs.id && !msClosed(s.milestone)) return { k: 'locked', why: `milestone ${s.milestone} is not active yet (finish ${activeMs.id} first)` };
  if (s.gate && !gateOpen(s.gate)) return { k: 'locked', why: `gate ${s.gate} needs ack of ${gateById.get(s.gate).requires.filter((r) => !gateClosed(r)).join(', ')}` };
  const depsMissing = (s.deps ?? []).filter((d) => !done.has(d));
  if (depsMissing.length) return { k: 'blocked', why: `waiting for ${depsMissing.join(', ')}` };
  const needsMissing = (s.needs ?? []).filter((n) => !satisfied(n));
  if (needsMissing.length) return { k: 'needs-founder', why: `needs ${needsMissing.join(', ')}` };
  if (s.type === 'decision') return { k: 'awaiting-founder', why: 'founder decision required' };
  return { k: 'ready' };
}

const nested = (t, u) => t === u || t.startsWith(`${u}/`) || u.startsWith(`${t}/`);
const overlap = (a, b) => (a ?? []).some((t) => (b ?? []).some((u) => nested(t, u)));
const touchConflict = (s) => allClaims().find((c) => c.step !== s.id && overlap(s.touches, steps.get(c.step)?.touches));

function parse(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const nxt = argv[i + 1];
      if (nxt === undefined || nxt.startsWith('--')) flags[a.slice(2)] = true;
      else { flags[a.slice(2)] = nxt; i++; }
    } else pos.push(a);
  }
  return { pos, flags };
}
const die = (m) => { console.error(`kit: ${m}`); process.exit(1); };
const need = (cond, m) => { if (!cond) die(m); };
const worktreePath = (id) =>
  process.env.KIT_WORKTREE_DIR
    ? path.join(path.resolve(process.env.KIT_WORKTREE_DIR), id)
    : path.join(root, '.agent', 'worktrees', id);

function pickReady(list, n) {
  const picked = [];
  const lanes = new Set();
  for (const pass of [0, 1]) {
    for (const s of list) {
      if (picked.length >= n || picked.includes(s)) continue;
      if (pass === 0 && lanes.has(s.lane)) continue;
      if (picked.some((p) => overlap(p.touches, s.touches))) continue;
      picked.push(s); lanes.add(s.lane);
    }
  }
  return picked;
}
const worktreeList = () => git(['worktree', 'list', '--porcelain'], root).split('\n\n').map((b) => Object.fromEntries(b.split('\n').map((l) => l.split(/ (.*)/s).slice(0, 2)))).filter((w) => w.worktree);
const branchExists = (b) => { try { git(['rev-parse', '--verify', '--quiet', b], root); return true; } catch { return false; } };
const isMerged = (b) => { try { execFileSync('git', ['merge-base', '--is-ancestor', b, 'HEAD'], { cwd: root, stdio: 'ignore' }); return true; } catch { return false; } };
const briefFor = (id) => { if (steps.get(id)?.brief) return steps.get(id).brief; const d = path.join(kitDir, 'briefs'); const f = existsSync(d) ? readdirSync(d).find((x) => x.startsWith(`${id}-`)) : null; return f ? `.agent/product-kit/briefs/${f}` : null; };

// ---- git sync helpers (kit v2) ----
const tryGit = (args, cwd = root) => { try { return { ok: true, out: git(args, cwd) }; } catch (e) { return { ok: false, out: String(e.stderr || e.message).trim() }; } };
const branchOf = (cwd = root) => git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
const dirtyCount = (cwd = root) => git(['status', '--porcelain'], cwd).split('\n').filter(Boolean).length;
const hasRemote = () => tryGit(['remote'], root).out.split('\n').includes(cfg.remote);
const syncAcked = () => acks.has('GIT-SYNC');
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const SECRET_PATTERNS = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/], ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{30,}/], ['API key (sk-)', /sk-[A-Za-z0-9_-]{20,}/], ['Slack token', /xox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/], ['hard-coded secret', /(?:api[_-]?key|secret|token|passwd|password)\s*[:=]\s*['"][A-Za-z0-9_\-/+=]{20,}['"]/i],
];
// Report only file and line and the kind of secret. Never print the value.
function secretHits(cwd) {
  const files = new Set([
    ...tryGit(['diff', 'HEAD', '--name-only'], cwd).out.split('\n'),
    ...tryGit(['ls-files', '--others', '--exclude-standard'], cwd).out.split('\n'),
  ].filter(Boolean));
  const hits = [];
  for (const f of files) {
    if ((cfg.secretScanIgnore ?? []).some((i) => f === i || f.startsWith(`${i}/`))) continue;
    if (/(^|\/)\.env(\.|$)/.test(f) && !/\.(example|sample|template)$/.test(f)) hits.push(`${f}: an environment file must not be committed`);
    const full = path.join(cwd, f);
    if (!existsSync(full) || statSync(full).size > 1_000_000) continue;
    const text = readFileSync(full, 'utf8');
    if (text.includes('\u0000')) continue;
    text.split('\n').forEach((line, i) => { for (const [name, re] of SECRET_PATTERNS) if (re.test(line)) hits.push(`${f}:${i + 1}: looks like ${name}`); });
  }
  return hits;
}
// Returns an error message, or null when every check passed. Never exits, so callers can undo a half-done merge first.
function checksPrecondition(a) {
  if (cfg.checks.length) return null;
  return typeof a.flags['no-checks'] === 'string' && a.flags['no-checks'].length > 5 ? null : 'kit.config.json has no "checks" yet. Set it to the repository\'s real commands (the single test command from step G1.1, lint, typecheck, build). Until it exists, pass --no-checks "<why>" and the reason goes into the commit message.';
}
function runChecks(cwd, a) {
  const pre = checksPrecondition(a);
  if (pre) return pre;
  if (!cfg.checks.length) { console.log(`WARNING: no automated checks configured (${a.flags['no-checks']}).`); return null; }
  for (const c of cfg.checks) {
    console.log(`$ ${c}`);
    const r = spawnSync(c, { cwd, shell: true, stdio: 'inherit' });
    if (r.status !== 0) return `check failed: ${c}`;
  }
  return null;
}
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const readDone = (id) => { try { return JSON.parse(readFileSync(path.join(kitDir, 'done', `${id}.json`), 'utf8')); } catch { return null; } };
// Waits for GitHub Actions through the gh CLI. Returns an error message, or null when every run for that commit passed.
// NOT VERIFIED against real GitHub in the kit's own tests (a stand-in gh was used); run "ci check" once on the real repository.
function ciWait(branch, sha) {
  if (cfg.ci.mode !== 'wait') return null;
  const v = spawnSync('gh', ['--version'], { encoding: 'utf8' });
  if (v.error || v.status !== 0) return 'CI mode is "wait" but the GitHub CLI (gh) is not installed or not on PATH. Install it and run "gh auth login", or set ci.mode to "off" in kit.config.json and tell the founder.';
  const t0 = Date.now();
  for (;;) {
    const r = spawnSync('gh', ['run', 'list', '--branch', branch, '--json', 'databaseId,headSha,status,conclusion,url,workflowName', '--limit', '40'], { encoding: 'utf8' });
    if (r.status !== 0) return `gh could not list CI runs: ${(r.stderr || '').trim().slice(0, 300)}`;
    let runs = [];
    try { runs = JSON.parse(r.stdout).filter((x) => x.headSha === sha); } catch { return 'gh returned something that is not JSON'; }
    const min = (Date.now() - t0) / 60000;
    if (!runs.length) { if (min > cfg.ci.startWaitMinutes) return `no CI run started for ${sha.slice(0, 8)} on ${branch} within ${cfg.ci.startWaitMinutes} minutes. Check that a workflow in .github/workflows runs on pushes to ${branch}.`; }
    else if (runs.every((x) => x.status === 'completed')) {
      const bad = runs.filter((x) => !['success', 'skipped', 'neutral'].includes(x.conclusion));
      if (bad.length) return `CI failed on ${branch} ${sha.slice(0, 8)}: ${bad.map((x) => `${x.workflowName} ${x.conclusion} ${x.url}`).join('; ')}`;
      console.log(`CI green on ${branch} ${sha.slice(0, 8)}: ${runs.map((x) => x.url).join(' ')}`);
      return null;
    }
    if (min > cfg.ci.timeoutMinutes) return `CI did not finish within ${cfg.ci.timeoutMinutes} minutes for ${sha.slice(0, 8)} on ${branch}`;
    sleepMs(cfg.ci.pollSeconds * 1000);
  }
}
// Objective size signals for the over-engineering check. Heuristics, not verdicts.
function leanStats(cwd) {
  const base = tryGit(['merge-base', 'HEAD', trunk], cwd);
  if (!base.ok) return null;
  const num = tryGit(['diff', '--numstat', `${base.out}..HEAD`], cwd).out.split('\n').filter(Boolean).map((l) => l.split('\t'));
  const rows = num.filter((r) => !/^\.agent\//.test(r[2]) && !/(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(r[2]));
  const added = rows.reduce((n, r) => n + (Number(r[0]) || 0), 0), deleted = rows.reduce((n, r) => n + (Number(r[1]) || 0), 0);
  const bigNew = rows.filter((r) => Number(r[0]) > 400 && Number(r[1]) === 0).map((r) => r[2]);
  const pj = tryGit(['diff', `${base.out}..HEAD`, '--', 'package.json'], cwd).out;
  const newDeps = pj.split('\n').filter((l) => /^\+\s+"[@a-z0-9._/-]+":\s*"[\^~<>=*0-9][^"]*"/.test(l)).map((l) => l.replace(/^\+\s+/, '').trim());
  return { files: rows.length, added, deleted, bigNew, newDeps };
}
const SECTION = (t, name) => (t.match(new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm')) ?? [])[1] ?? '';
const filled = (text, min = 8) => { const v = String(text ?? '').trim(); return v.length >= min && !v.startsWith('<'); };
const finishedNotLanded = () => [...done].filter((id) => branchExists(`step/${id}`) && !isMerged(`step/${id}`));
const qaFile = (mid) => { for (const base of [kitDir, ...worktreeList().filter((w) => w.branch === `refs/heads/qa/${mid}`).map((w) => path.join(w.worktree, '.agent', 'product-kit'))]) { const f = path.join(base, 'qa', `${mid}.md`); if (existsSync(f)) return f; } return null; };
function qaProblems(m, file) {
  const t = readFileSync(file, 'utf8');
  const errs = [];
  const blocks = [...t.matchAll(/^### (T\d+)[^\n]*\n([\s\S]*?)(?=^### T\d+|^## |(?![\s\S]))/gm)];
  if (blocks.length < m.founder_test.length) errs.push(`expected ${m.founder_test.length} test blocks (T1..T${m.founder_test.length}), found ${blocks.length}`);
  const WEAK = /\b(read|reading|reviewed|inspected|inspection)\b.{0,20}\b(code|source|diff)\b|looks (correct|fine|good|right)|should work|assumed|by inspection|not run/i;
  for (const [, id, body] of blocks) {
    const r = (body.match(/^Result:\s*(.+)$/m) ?? [])[1]?.trim();
    const e = (body.match(/^Evidence:\s*(.+)$/m) ?? [])[1]?.trim();
    if (!['PASS', 'FOUNDER-ONLY'].includes(r)) errs.push(`${id}: Result must be PASS or FOUNDER-ONLY (found "${r ?? 'none'}")`);
    if (!filled(e, 25)) errs.push(`${id}: Evidence needs at least a sentence of what you ran and saw`);
    else if (r === 'PASS' && WEAK.test(e)) errs.push(`${id}: Evidence reads like code review, not a test of the running product (found "${e.match(WEAK)[0]}"). Run it, or mark FOUNDER-ONLY with the reason`);
  }
  const by = (t.match(/^QA by:\s*(.+)$/m) ?? [])[1]?.trim();
  if (!filled(by, 2)) errs.push('"QA by:" needs the name of the session that ran the pass');
  else {
    const builders = new Set(msStepIds(m).map((id) => readDone(id)?.agent).filter(Boolean).map((x) => String(x).toLowerCase()));
    if (builders.has(by.toLowerCase()) && !/^Independence waiver:\s*\S.{14,}/m.test(t)) errs.push(`QA by "${by}" also built steps of this milestone. Use a different session, or add "Independence waiver: <the founder's own words>"`);
  }
  if (!/^Verdict:\s*PASS\s*$/m.test(t)) errs.push('"Verdict: PASS" is missing');
  if (!/^Tested commit:\s*[0-9a-f]{7,40}\s*$/m.test(t)) errs.push('"Tested commit:" needs the sha of the commit you tested (git rev-parse HEAD)');
  if (!/^Checks result:\s*PASS\s*$/m.test(t)) errs.push('"Checks result: PASS" is missing (run every command in kit.config.json "checks")');
  if (cfg.ci.mode === 'wait' && !/^CI run:\s*https?:\/\/\S+/m.test(t)) errs.push('"CI run:" needs the URL of the green CI run for the tested commit (ci wait <branch>)');
  const bugs = SECTION(t, 'Bugs found and fixed');
  if (!/^## Bugs found and fixed/m.test(t)) errs.push('the "Bugs found and fixed" section is missing');
  else for (const l of bugs.split('\n').filter((x) => /^\s*[-*]\s+\S/.test(x))) if (!/test:/i.test(l)) errs.push(`bug line has no regression test (write "test: <file or name>"): ${l.trim().slice(0, 90)}`);
  for (const q of ['Q-UX-2', 'Q-UX-3', 'Q-UX-5', 'Q-A11Y-1']) if (!filled((t.match(new RegExp(`^- ${q}:\\s*(.+)$`, 'm')) ?? [])[1], 10)) errs.push(`${q} needs a line "- ${q}: <what you saw in the running product>"`);
  return { errs, founderOnly: blocks.filter(([, , b]) => /^Result:\s*FOUNDER-ONLY/m.test(b)).map(([, id]) => id) };
}
function qaStale(file) {
  const tc = (readFileSync(file, 'utf8').match(/^Tested commit:\s*([0-9a-f]{7,40})/m) ?? [])[1];
  if (!tc || !tryGit(['cat-file', '-e', `${tc}^{commit}`], root).ok) return `the tested commit ${tc ?? '(none)'} does not exist in this repository`;
  const code = tryGit(['diff', '--name-only', `${tc}..HEAD`], root).out.split('\n').filter((f) => f && !f.startsWith('.agent/'));
  return code.length ? `code changed after the QA pass tested ${tc.slice(0, 8)}: ${code.slice(0, 6).join(', ')}${code.length > 6 ? ' ...' : ''}. Re-test what changed, update "Tested commit", and land the QA report again.` : null;
}

// Older kit wording that sends an agent down the wrong path. Looked for outside the kit's own folder.
const STALE = [
  [/gate[- ]wise|gate[- ]by[- ]gate/i, 'the order of work is milestones, not gates; say "continue"'],
  [/\bnext gate\b|\bstart gate\b|\bwork on gate\b/i, 'agents never pick a gate; "continue" decides'],
  [/\back\s+<?gate/i, 'gates close when their steps are done; founders accept milestones'],
  [/(do not|never|no) (push|merge to main)/i, 'check: pushing and merging are allowed only through checkpoint, land, sync and milestone ship, after ack GIT-SYNC'],
];
function doctorHits() {
  const files = [];
  const walk = (dir, depth) => {
    if (depth > 3 || !existsSync(dir)) return;
    for (const n of readdirSync(dir)) {
      if (['node_modules', '.git', 'archive', 'kit-bundle', 'product-kit'].includes(n)) continue;
      const f = path.join(dir, n);
      const st = statSync(f);
      if (st.isDirectory()) walk(f, depth + 1);
      else if (/\.(md|txt)$/i.test(n) && n !== 'PROGRESS.md') files.push(f);
    }
  };
  for (const n of readdirSync(root)) { const f = path.join(root, n); if (statSync(f).isFile() && /\.(md|txt)$/i.test(n) && n !== 'PROGRESS.md') files.push(f); }
  for (const d of ['docs', 'doc', '.agent', '.claude']) walk(path.join(root, d), 0);
  const stale = [...STALE];
  if (acks.has('MS-MX')) stale.push([/\bnext (dev|build|start)\b|\.next\b|app router|getServerSideProps|next\/(image|font|link)/i, 'the stack is now Vite + React + Express + TypeScript (milestone MX); update this to the new commands and layout']);
  const hits = [];
  for (const f of new Set(files)) readFileSync(f, 'utf8').split('\n').forEach((line, i) => { for (const [re, why] of stale) if (re.test(line)) hits.push({ file: path.relative(root, f), line: i + 1, why, text: line.trim().slice(0, 140) }); });
  const mp = path.join(kitDir, 'MASTER_PROMPT.md');
  if (!existsSync(mp) || !readFileSync(mp, 'utf8').includes(`kit-version: ${KIT_VERSION}`)) hits.push({ file: '.agent/product-kit/MASTER_PROMPT.md', line: 1, why: `not kit version ${KIT_VERSION}; apply the update patch`, text: '' });
  return hits;
}

const cmds = {
  status() {
    const sym = { done: '[x]', ready: '[>]', claimed: '[~]', 'stale-claim': '[!]', blocked: '[ ]', locked: '[-]', 'needs-founder': '[?]', 'awaiting-founder': '[?]' };
    let total = 0, finished = 0;
    if (milestones.length) {
      const ids = activeMs ? msStepIds(activeMs) : [];
      console.log(activeMs ? `Active milestone: ${activeMs.id} ${activeMs.title} (${ids.filter((i) => done.has(i)).length}/${ids.length} steps). Run "continue" for what to do next.` : 'All milestones are closed.');
    }
    const line = (s, st) => {
      const extra = st.k === 'claimed' || st.k === 'stale-claim' ? ` (${st.c.agent}, ${st.c.stale ? 'STALE' : 'fresh'})` : st.why ? ` (${st.why})` : '';
      console.log(`  ${sym[st.k]} ${s.id.padEnd(5)} ${(s.milestone ?? '').padEnd(4)} ${s.lane.padEnd(9)} ${s.title}${extra}`);
    };
    for (const g of gates) {
      const list = g.steps.map((s) => ({ s: steps.get(s.id), st: stateOf(steps.get(s.id)) }));
      const n = list.filter((x) => x.st.k === 'done').length;
      total += list.length; finished += n;
      const tag = gateClosed(g.id) ? 'CLOSED' : gateOpen(g.id) ? 'open' : 'locked';
      console.log(`\n${g.id}  ${g.title}  ${n}/${list.length}  ${tag}${g.conditional ? '  (conditional)' : ''}`);
      for (const { s, st } of list) line(s, st);
    }
    for (const m of milestones.filter((x) => x.steps?.length)) {
      const list = m.steps.map((s) => ({ s: steps.get(s.id), st: stateOf(steps.get(s.id)) }));
      const n = list.filter((x) => x.st.k === 'done').length;
      total += list.length; finished += n;
      console.log(`\n${m.id}  ${m.title}: its own steps  ${n}/${list.length}`);
      for (const { s, st } of list) line(s, st);
    }
    console.log(`\n${finished}/${total} steps done.  Legend: [x] done [>] ready [~] claimed [!] stale claim [?] founder [ ] blocked [-] locked`);
  },

  next(a) {
    const n = Number(a.flags.n ?? 4);
    const ready = [...steps.values()].filter((s) => stateOf(s).k === 'ready' && !touchConflict(s) && (!a.flags.lane || s.lane === a.flags.lane));
    const picked = [];
    const lanesUsed = new Set();
    for (const pass of [0, 1]) {
      for (const s of ready) {
        if (picked.length >= n || picked.includes(s)) continue;
        if (pass === 0 && lanesUsed.has(s.lane)) continue;
        if (picked.some((p) => overlap(p.touches, s.touches))) continue;
        picked.push(s); lanesUsed.add(s.lane);
      }
    }
    if (!picked.length) return console.log('No ready steps. Run "status". If everything is waiting on the founder, report the open decisions and stop.');
    for (const s of picked) console.log(`${s.id}  [${s.lane}]  ${s.title}\n      exit: ${s.exit}\n`);
  },

  claim(a) {
    const s = stepOrDie(a.pos[0]);
    const agent = a.flags.agent;
    need(typeof agent === 'string', 'claim needs --agent NAME');
    const st = stateOf(s);
    need(st.k === 'ready' || (st.k === 'stale-claim' && a.flags.takeover), `step ${s.id} is "${st.k}"${st.why ? ` (${st.why})` : ''}; only ready steps can be claimed (stale claims need --takeover)`);
    const clash = touchConflict(s);
    need(!clash, `step ${s.id} touches files that step ${clash?.step} (${clash?.agent}) also touches; do it after that claim is released`);
    if (st.k === 'stale-claim') rmSync(path.join(claimsDir, s.id), { recursive: true, force: true });
    mkdirSync(claimsDir, { recursive: true });
    try { mkdirSync(path.join(claimsDir, s.id)); } catch (e) { die(`step ${s.id} was claimed by someone else just now`); }
    const wt = worktreePath(s.id);
    const branch = `step/${s.id}`;
    try {
      mkdirSync(path.dirname(wt), { recursive: true });
      if (existsSync(wt)) { /* resuming: reuse the existing worktree */ }
      else {
        const hasBranch = (() => { try { git(['rev-parse', '--verify', branch], root); return true; } catch { return false; } })();
        git(hasBranch ? ['worktree', 'add', wt, branch] : ['worktree', 'add', '-b', branch, wt, a.flags.base ?? 'HEAD'], root);
      }
    } catch (e) {
      rmSync(path.join(claimsDir, s.id), { recursive: true, force: true });
      die(`could not create worktree: ${e.stderr || e.message}`);
    }
    const now = new Date().toISOString();
    writeFileSync(path.join(claimsDir, s.id, 'claim.json'), JSON.stringify({ step: s.id, agent, branch, worktree: wt, claimedAt: now, heartbeatAt: now }, null, 2));
    console.log(`Claimed ${s.id} for ${agent}\nworktree: ${wt}\nbranch:   ${branch}\nexit:     ${s.exit}\nRun "heartbeat ${s.id}" at least every ${STALE_MS / 60000 / 2} minutes.`);
  },

  heartbeat(a) {
    const id = stepOrDie(a.pos[0]).id;
    const c = readClaim(id);
    need(c, `no claim for ${id}`);
    delete c.stale;
    c.heartbeatAt = new Date().toISOString();
    writeFileSync(path.join(claimsDir, id, 'claim.json'), JSON.stringify(c, null, 2));
    console.log(`heartbeat ${id} ok`);
  },

  scaffold(a) {
    const s = stepOrDie(a.pos[0]);
    mkdirSync(path.join(kitDir, 'handoffs'), { recursive: true });
    const h = path.join(kitDir, 'handoffs', `${s.id}.md`);
    const v = path.join(kitDir, 'handoffs', `${s.id}.verify.md`);
    if (!existsSync(h)) writeFileSync(h, `# ${s.id}: ${s.title}\n\nExit evidence required: ${s.exit}\n\n<!-- kit-v2 -->\n\n## Plan\n(5 to 10 lines before coding: files to touch, checks to run, what you will not do.)\n\n## Smallest-change ladder\nNeeded: <why this has to exist at all, in one line>\nAlready in codebase: <what you searched for and the files you found, or \"nothing found\" with the search>\nPlatform or dependency: <what the platform or an installed dependency already does that you used, or what you checked>\nNot built: <what you deliberately left out>\nAdded: <new files, abstractions and dependencies, each with the reason, or \"none\">\n\n## What changed\n\n## Why\n\n## Verification\n(commands run and their results)\n\n## Shortcuts taken\n(each one with its limit and when to upgrade, or "none")\n\n## Remaining risks\n\n## Findings opened\n`);
    if (!existsSync(v)) writeFileSync(v, `# Independent verification of ${s.id}\n\nVerifier: <your agent name; it must differ from the implementer's>\n\nYou did not write this change. Read the exit evidence in gates.json and the diff, then run the checks yourself.\n\n## Exit evidence met\n(for each item: yes or no, and the command you ran)\n\n## Over-engineering check\n<!-- kit-v2 -->\nAnswer: <name code in this diff that could be deleted or replaced by something that already exists, or write \"none found\" and say what you compared it against>\n\n## Problems found\n\n## Verdict\n(replace this line with the one-word result)\n`);
    console.log(`Templates ready:\n  .agent/product-kit/handoffs/${s.id}.md (implementer)\n  .agent/product-kit/handoffs/${s.id}.verify.md (a second agent session fills this)`);
  },

  release(a) {
    const id = stepOrDie(a.pos[0]).id;
    rmSync(path.join(claimsDir, id), { recursive: true, force: true });
    console.log(`released ${id} (branch and worktree are kept)`);
  },

  done(a) {
    const s = stepOrDie(a.pos[0]);
    need(s.type === 'work', `${s.id} is a founder decision; use "decide"`);
    need(readClaim(s.id), `no claim for ${s.id}; claim it first`);
    const ev = a.flags.evidence;
    need(typeof ev === 'string' && ev.length >= 20, 'done needs --evidence "<commands run and their results, or file paths>" (at least 20 characters)');
    need(existsSync(path.join(kitDir, 'handoffs', `${s.id}.md`)), `write .agent/product-kit/handoffs/${s.id}.md first (run "scaffold ${s.id}" for the template)`);
    const vf = path.join(kitDir, 'handoffs', `${s.id}.verify.md`);
    need(existsSync(vf), `a second agent session must verify first: run "scaffold ${s.id}", then have the verifier fill .agent/product-kit/handoffs/${s.id}.verify.md`);
    const vt = readFileSync(vf, 'utf8');
    const who = (vt.match(/^Verifier:\s*(.+)$/m) ?? [])[1]?.trim();
    need(who && !who.startsWith('<'), `${s.id}.verify.md needs a "Verifier: <name>" line`);
    need(who.toLowerCase() !== String(readClaim(s.id).agent).toLowerCase(), `the verifier (${who}) must be a different agent session from the implementer (${readClaim(s.id).agent})`);
    need(/##\s*Verdict[\s\S]*?\bPASS\b/.test(vt) && !/##\s*Verdict[\s\S]*?\bFAIL\b/.test(vt), `${s.id}.verify.md needs a Verdict of PASS`);
    const hf = readFileSync(path.join(kitDir, 'handoffs', `${s.id}.md`), 'utf8');
    if (hf.includes('<!-- kit-v2 -->')) {
      const lad = SECTION(hf, 'Smallest-change ladder');
      for (const k of ['Needed', 'Already in codebase', 'Platform or dependency', 'Not built', 'Added']) need(filled((lad.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) ?? [])[1], 4), `${s.id}.md: the smallest-change ladder needs a real answer for "${k}:" (PROTOCOL.md section 3)`);
      if (vt.includes('<!-- kit-v2 -->')) need(filled((SECTION(vt, 'Over-engineering check').match(/^Answer:\s*(.+)$/m) ?? [])[1], 15), `${s.id}.verify.md: the verifier must answer the over-engineering check (what could be deleted or reused)`);
      const st = leanStats(root);
      if (st) {
        console.log(`Size of this step: ${st.files} files, +${st.added} -${st.deleted} lines${st.newDeps.length ? `, possible new dependencies: ${st.newDeps.join(', ')}` : ''}${st.bigNew.length ? `, big new files: ${st.bigNew.join(', ')}` : ''}.`);
        const over = st.files > cfg.lean.maxFilesPerStep || st.added > cfg.lean.maxAddedLines || st.newDeps.length || st.bigNew.length;
        if (over) need(filled((hf.match(/^Size justification:\s*(.+)$/m) ?? [])[1], 15), `${s.id} is larger than the lean limits or adds dependencies or big new files. Either split it, or add a line "Size justification: <why this is the smallest complete change>" to the handoff.`);
      }
    }
    const rec = { id: s.id, doneAt: new Date().toISOString(), agent: readClaim(s.id).agent, branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], root), commit: git(['rev-parse', 'HEAD'], root), evidence: ev };
    writeFileSync(path.join(kitDir, 'done', `${s.id}.json`), JSON.stringify(rec, null, 2) + '\n');
    console.log(`Wrote done/${s.id}.json. Commit it together with the work. The claim stays until the lead integrates and runs "release".`);
  },

  decide(a) {
    const s = stepOrDie(a.pos[0]);
    need(s.type === 'decision', `${s.id} is not a decision step`);
    const st0 = stateOf(s);
    need(st0.k === 'awaiting-founder' || st0.k === 'locked', `${s.id} cannot be decided yet (${st0.k}${st0.why ? ': ' + st0.why : ''})`);
    need(typeof a.flags.quote === 'string' && a.flags.quote.length > 3, 'decide needs --quote "<the founder\'s own words, verbatim>"');
    writeFileSync(path.join(kitDir, 'done', `${s.id}.json`), JSON.stringify({ id: s.id, decidedAt: new Date().toISOString(), by: 'founder', quote: a.flags.quote }, null, 2) + '\n');
    console.log(`Recorded founder decision for ${s.id}. Commit it.`);
  },

  ack(a) {
    const key = a.pos[0];
    need(key && /^[A-Za-z0-9.-]+$/.test(key), 'ack needs a key such as G1, AUTH-2.3C or NA-G10');
    need(typeof a.flags.quote === 'string' && a.flags.quote.length > 3, 'ack needs --quote "<the founder\'s own words, verbatim>"');
    const g = gateById.get(key);
    const undone = g ? g.steps.filter((s) => !done.has(s.id)).map((s) => s.id) : [];
    need(!undone.length || a.flags.partial, `gate ${key} still has undone steps (${undone.join(', ')}). Only if the founder explicitly accepts closing it anyway, add --partial`);
    writeFileSync(path.join(kitDir, 'ack', `${key}.json`), JSON.stringify({ key, ackedAt: new Date().toISOString(), by: 'founder', quote: a.flags.quote, ...(undone.length ? { partial: true, undone } : {}) }, null, 2) + '\n');
    console.log(`Recorded ack ${key}. Commit it. This tool cannot verify who typed the quote: only record words the founder actually wrote.`);
  },

  continue() {
    if (!milestones.length) return cmds.next({ pos: [], flags: {} });
    if (!activeMs) return console.log('All milestones are closed. Tell the founder the complete product is ready for final review.');
    const m = activeMs;
    const ids = msStepIds(m);
    const n = ids.filter((id) => done.has(id)).length;
    console.log(`Active milestone ${m.id}: ${m.title}  (${n}/${ids.length} steps done)\nGoal: ${m.purpose}\nThe order of work is the active milestone. Gates are only bookkeeping; never pick one.\n`);
    const unlanded = finishedNotLanded().filter((id) => ids.includes(id));
    if (unlanded.length) console.log(`0. Land finished steps on ${trunk} first (from the main checkout; needs ack GIT-SYNC):\n${unlanded.map((id) => `   node .agent/product-kit/kit.mjs land ${id}`).join('\n')}\n`);
    const claims = allClaims().filter((c) => ids.includes(c.step));
    const stale = claims.filter((c) => c.stale);
    const fresh = claims.filter((c) => !c.stale);
    let k = 1;
    if (stale.length) {
      console.log(`${k++}. Take over interrupted work first:`);
      for (const c of stale) console.log(`   node .agent/product-kit/kit.mjs claim ${c.step} --agent <you> --takeover   # worktree: ${c.worktree}`);
      console.log('');
    }
    if (fresh.length) console.log(`Already in progress by another agent: ${fresh.map((c) => `${c.step} (${c.agent})`).join(', ')}\n`);
    const ready = ids.map((id) => steps.get(id)).filter((s) => stateOf(s).k === 'ready' && !touchConflict(s));
    const picked = pickReady(ready, Math.max(0, 4 - stale.length - fresh.length));
    if (picked.length) {
      console.log(`${k++}. Start these ready steps (one agent session each, in parallel):`);
      for (const s of picked) console.log(`   ${s.id} [${s.lane}] ${s.title}\n      exit: ${s.exit}\n      claim: node .agent/product-kit/kit.mjs claim ${s.id} --agent <name>\n`);
    }
    const asks = new Map();
    for (const id of ids) {
      const st = stateOf(steps.get(id));
      if (st.k === 'awaiting-founder') asks.set(id, steps.get(id).title);
      if (st.k === 'needs-founder') for (const key of (steps.get(id).needs ?? []).filter((x) => !satisfied(x))) asks.set(key, steps.get(key)?.title ?? `acknowledgement ${key}`);
    }
    if (asks.size) {
      console.log(`${k++}. Ask the founder, in plain words, and keep working on everything else meanwhile:`);
      for (const [key, title] of asks) console.log(`   ${key}: ${title}${briefFor(key) ? `\n      brief: ${briefFor(key)}` : ''}\n      record the answer: node .agent/product-kit/kit.mjs decide ${key} --quote "<their exact words>"`);
      console.log('');
    }
    if (n === ids.length) {
      const qf = path.join(kitDir, 'qa', `${m.id}.md`);
      const qaOk = existsSync(qf) && !qaProblems(m, qf).errs.length;
      console.log(qaOk ? `${k++}. Every step of ${m.id} is done and QA passed. Run: node .agent/product-kit/kit.mjs milestone verify ${m.id}\n` : `${k++}. Every step of ${m.id} is done. Run the QA pass before the founder tests anything: node .agent/product-kit/kit.mjs qa start ${m.id}  (then qa check, land QA-${m.id})\n`);
    }
    else if (!stale.length && !fresh.length && !picked.length && !asks.size) console.log('Nothing is ready and nothing is waiting on the founder. Run "status" and report what blocks the milestone.\n');
    console.log('Rules: no deploy; push only through checkpoint, land and ship after ack GIT-SYNC; no third-party installs without the founder, record decisions only in the founder\'s own words, independent verification before done.');
  },

  milestone(a) {
    need(milestones.length, 'this kit has no milestones.json');
    const sub = a.pos[0] ?? 'status';
    if (sub === 'status') {
      for (const m of milestones) {
        const ids = msStepIds(m);
        const n = ids.filter((id) => done.has(id)).length;
        const st = msClosed(m.id) ? 'CLOSED' : m === activeMs ? 'ACTIVE' : 'future';
        console.log(`${m.id.padEnd(4)} ${st.padEnd(7)} ${String(n).padStart(3)}/${String(ids.length).padEnd(3)} ${m.title}\n                    you can then: ${m.can_test}`);
      }
      return;
    }
    const m = msById.get(a.pos[1]);
    need(m, `unknown milestone "${a.pos[1]}"`);
    const ids = msStepIds(m);
    const undone = ids.filter((id) => !done.has(id));
    if (sub === 'verify') {
      need(!undone.length, `milestone ${m.id} still has ${undone.length} undone steps: ${undone.join(', ')}`);
      const qf = path.join(kitDir, 'qa', `${m.id}.md`);
      need(existsSync(qf), `no QA report for ${m.id} on ${trunk}. Run the QA pass first: qa start ${m.id}, qa check ${m.id}, land QA-${m.id}. The founder tests only after QA passed.`);
      const q = qaProblems(m, qf);
      need(!q.errs.length, `QA report for ${m.id} is not ready:\n  ${q.errs.join('\n  ')}`);
      const stale = qaStale(qf);
      need(!stale, stale);
      if (q.founderOnly.length) console.log(`Tell the founder first: ${q.founderOnly.join(', ')} could not be checked by an agent (see .agent/product-kit/qa/${m.id}.md). They must try those themselves.\n`);
      console.log(`Milestone ${m.id} (${m.title}) is complete and passed QA. Ask the founder to test it:\n`);
      m.founder_test.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
      console.log(`\nNot included yet: ${m.skips.join('; ')}\n\nThen ask: "Did this work? Tell me in your own words." If it worked, run:\n  node .agent/product-kit/kit.mjs milestone close ${m.id} --quote "<the founder's own words>"\nIf something failed, record it in findings/, fix it, and ask again. Do not close the milestone.`);
      return;
    }
    if (sub === 'ship') {
      const main = cfg.mainBranch;
      need(msClosed(m.id), `${m.id} is not closed; close it with the founder's words first`);
      need(syncAcked(), 'shipping needs the founder\'s GIT-SYNC authorization (ack GIT-SYNC --quote "...")');
      need(branchOf() === trunk, `run ship from the main checkout on ${trunk}`);
      need(dirtyCount() === 0, 'commit the archive moves, the ack and the PROGRESS.md entry first; the tree must be clean');
      if (hasRemote()) { const f = tryGit(['fetch', '--prune', cfg.remote], root); need(f.ok, `fetch failed: ${f.out}`); }
      const failedShip = runChecks(root, a);
      need(!failedShip, failedShip);
      if (hasRemote()) { const pt = tryGit(['push', cfg.remote, trunk], root); need(pt.ok, `push of ${trunk} was rejected (never force it):\n${pt.out}`); }
      const trunkSha = git(['rev-parse', 'HEAD'], root);
      const ciTrunk = ciWait(trunk, trunkSha);
      need(!ciTrunk, `${ciTrunk}\nNothing was released. Fix it on a step branch, land it, and run ship again.`);
      if (trunk !== main) {                      // release the verified integration branch to main
        const back = (msg) => { tryGit(['switch', trunk], root); die(`${msg}\n${main} is unchanged and you are back on ${trunk}.`); };
        if (!branchExists(main)) git(['branch', main, trunkSha], root);
        else {
          const sw = tryGit(['switch', main], root); if (!sw.ok) back(`could not switch to ${main}: ${sw.out}`);
          if (hasRemote() && tryGit(['rev-parse', '--verify', '--quiet', `${cfg.remote}/${main}`], root).ok) { const ff = tryGit(['merge', '--ff-only', `${cfg.remote}/${main}`], root); if (!ff.ok) back(`${main} and ${cfg.remote}/${main} have diverged (someone else pushed). Stop and tell the founder.`); }
          if (!tryGit(['merge', '--ff-only', trunk], root).ok) {
            const mm = tryGit(['merge', '--no-ff', '--no-commit', trunk], root);
            if (!mm.ok) { tryGit(['merge', '--abort'], root); back(`${main} has changes that conflict with ${trunk}. Bring ${main} into ${trunk} (PROTOCOL.md section 11), land that, and ship again.`); }
            const fc = runChecks(root, a);
            if (fc) { tryGit(['merge', '--abort'], root); back(fc); }
            git(['commit', '--no-edit', '-m', `release(${m.id}): ${m.title}`], root);
          }
        }
      }
      const tag = `milestone/${m.id}`;
      if (!tryGit(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], root).ok) git(['tag', '-a', tag, '-m', `${m.id} ${m.title}: accepted by the founder`, main], root);
      if (hasRemote()) {
        const r = tryGit(['push', cfg.remote, main, tag], root);
        if (!r.ok) { if (trunk !== main) tryGit(['switch', trunk], root); die(`push of ${main} was rejected (never force it):\n${r.out}`); }
        console.log(`Pushed ${main} and tag ${tag}.`);
        const mainSha = git(['rev-parse', main], root);
        if (trunk !== main && mainSha !== trunkSha) { const e2 = ciWait(main, mainSha); if (e2) console.error(`WARNING: ${e2}`); }
      } else console.log(`No remote "${cfg.remote}": tagged ${tag} locally only.`);
      if (trunk !== main) tryGit(['switch', trunk], root);
      tryGit(['worktree', 'prune'], root);
      const left = [];
      const names = (o) => o.split('\n').map((l) => l.replace(/^[*+ ]+/, '').trim()).filter(Boolean);
      for (const b of names(tryGit(['branch', '--list', 'step/*', 'qa/*'], root).out)) {
        if (isMerged(b)) { if (hasRemote() && tryGit(['ls-remote', '--exit-code', '--heads', cfg.remote, b], root).ok) tryGit(['push', cfg.remote, '--delete', b], root); tryGit(['branch', '-d', b], root); }
        else left.push(b);
      }
      const other = names(tryGit(['branch', '--no-merged', trunk], root).out).filter((b) => !left.includes(b) && b !== main);
      console.log(`Repository after ${m.id}: ${main} released at ${git(['rev-parse', '--short', main], root)}, working tree clean on ${trunk}, ${left.length ? `kit branches NOT merged and kept: ${left.join(', ')}` : 'no leftover step or QA branches'}.${other.length ? `\nOther unmerged branches (not the kit's; report them to the founder): ${other.join(', ')}` : ''}`);
      const gh = spawnSync('gh', ['issue', 'list', '--state', 'open', '--json', 'number,title', '--limit', '15'], { encoding: 'utf8' });
      const pr = spawnSync('gh', ['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName', '--limit', '15'], { encoding: 'utf8' });
      for (const [label, r] of [['issues', gh], ['pull requests', pr]]) { try { const l = JSON.parse(r.stdout); if (l.length) console.log(`Open ${label} (${l.length}): close the ones this milestone fixed with a comment; report the rest to the founder:\n${l.map((x) => `  #${x.number} ${x.title}`).join('\n')}`); } catch { /* gh missing or not logged in */ } }
      return;
    }
    need(sub === 'close', `unknown milestone command "${sub}" (use status, verify, close or ship)`);
    need(!msClosed(m.id), `${m.id} is already closed`);
    need(m === activeMs, `${m.id} is not the active milestone (${activeMs?.id}); close milestones in order`);
    need(!undone.length, `milestone ${m.id} still has ${undone.length} undone steps: ${undone.join(', ')}`);
    need(typeof a.flags.quote === 'string' && a.flags.quote.length > 3, 'close needs --quote "<the founder\'s own words, verbatim>"');
    const head = git(['rev-parse', '--abbrev-ref', 'HEAD'], root);
    need(!head.startsWith('step/'), 'run milestone close from the main checkout, not from a step worktree');
    const arch = path.join(kitDir, 'archive', m.id);
    const wts = worktreeList();
    const plan = [];
    for (const id of ids) {
      const branch = `step/${id}`;
      const w = wts.find((x) => x.branch === `refs/heads/${branch}`);
      if (w) {
        let dirty = 0;
        try { dirty = git(['status', '--porcelain'], w.worktree).split('\n').filter(Boolean).length; } catch { /* missing worktree */ }
        need(dirty === 0, `worktree ${w.worktree} has ${dirty} uncommitted files; commit or discard them first`);
        plan.push({ text: `remove worktree ${w.worktree}`, run: () => git(['worktree', 'remove', w.worktree], root) });
      }
      if (branchExists(branch)) {
        need(isMerged(branch), `branch ${branch} is not merged into ${head}; merge it, or decide to abandon it, before closing`);
        plan.push({ text: `delete merged branch ${branch}`, run: () => git(['branch', '-d', branch], root) });
      }
      if (existsSync(path.join(claimsDir, id))) plan.push({ text: `release claim ${id}`, run: () => rmSync(path.join(claimsDir, id), { recursive: true, force: true }) });
      for (const suffix of ['.md', '.verify.md']) {
        const f = path.join(kitDir, 'handoffs', `${id}${suffix}`);
        if (existsSync(f)) plan.push({ text: `archive handoffs/${id}${suffix} to archive/${m.id}/`, run: () => { mkdirSync(arch, { recursive: true }); renameSync(f, path.join(arch, `${id}${suffix}`)); } });
      }
    }
    const fdir = path.join(kitDir, 'findings');
    const openFindings = existsSync(fdir) ? readdirSync(fdir).filter((f) => f.endsWith('.md') && ids.some((id) => f.startsWith(`${id}-`))) : [];
    console.log(`${a.flags['dry-run'] ? 'DRY RUN. ' : ''}Closing ${m.id} (${m.title}):`);
    plan.forEach((x) => console.log(`  - ${x.text}`));
    if (!plan.length) console.log('  - nothing to clean up');
    if (a.flags['dry-run']) return console.log('\nNothing was changed.');
    for (const x of plan) x.run();
    writeFileSync(path.join(kitDir, 'ack', `MS-${m.id}.json`), JSON.stringify({ key: `MS-${m.id}`, milestone: m.id, ackedAt: new Date().toISOString(), by: 'founder', quote: a.flags.quote }, null, 2) + '\n');
    const next = milestones[milestones.findIndex((x) => x.id === m.id) + 1];
    console.log(`\nRecorded the founder's acceptance in ack/MS-${m.id}.json.${openFindings.length ? `\nOpen findings carried forward (still in findings/): ${openFindings.join(', ')}` : ''}\nNow: commit the archive moves and the ack together, append a short ${m.id} summary to PROGRESS.md and commit it, then run:\n  node .agent/product-kit/kit.mjs milestone ship ${m.id}\nwhich waits for CI, releases ${trunk} to ${cfg.mainBranch}, tags it, pushes, and leaves the repository clean. After that ${next ? `run "continue" to start ${next.id}: ${next.title}.` : 'tell the founder the last milestone is closed.'}`);
  },

  resume() {
    console.log('== Claims ==');
    const claims = allClaims();
    if (!claims.length) console.log('none');
    for (const c of claims) console.log(`${c.step}  ${c.agent}  ${c.stale ? 'STALE (last heartbeat ' + c.heartbeatAt + ')' : 'fresh'}  ${c.worktree}`);
    console.log('\n== Step worktrees and branches ==');
    const out = git(['worktree', 'list', '--porcelain'], root).split('\n\n').map((b) => Object.fromEntries(b.split('\n').map((l) => l.split(/ (.*)/s).slice(0, 2))));
    let any = false;
    for (const w of out) {
      if (!w.branch || !/^refs\/heads\/(step|qa)\//.test(w.branch)) continue;
      any = true;
      let dirty = '?';
      try { dirty = git(['status', '--porcelain'], w.worktree).split('\n').filter(Boolean).length; } catch { /* worktree missing */ }
      const last = (() => { try { return git(['log', '-1', '--format=%cr: %s'], w.worktree); } catch { return 'n/a'; } })();
      console.log(`${w.branch.replace('refs/heads/', '')}  uncommitted files: ${dirty}  last commit: ${last}\n   ${w.worktree}`);
    }
    if (!any) console.log('none');
    const orphans = git(['branch', '--list', 'step/*'], root).split('\n').map((l) => l.replace(/^[*+ ]+/, '').trim()).filter(Boolean).filter((b) => !out.some((w) => w.branch === `refs/heads/${b}`));
    if (orphans.length) console.log(`\nBranches without a worktree: ${orphans.join(', ')} (re-claim the step to recreate the worktree and continue)`);
    console.log('\n== Resume plan ==\n1. Continue every STALE claim you own: claim <ID> --agent <you> --takeover, then open the worktree.\n2. Then run "next" for fresh work.\n3. Read .agent/product-kit/handoffs/ and PROGRESS.md before editing.');
  },

  render(a = { flags: {} }) {
    const L = ['<!-- Generated from gates.json by "node .agent/product-kit/kit.mjs render". Do not edit by hand. -->', '', '# Gate roadmap', '',
      '**Gates are bookkeeping groups of steps. They are NOT the order of work and nobody starts "a gate".** The order of work is the milestones in `MILESTONES.md`; the agent finds it by running `node .agent/product-kit/kit.mjs continue`. Live status: `node .agent/product-kit/kit.mjs status`.', ''];
    const level = new Map();
    const lv = (id) => { if (level.has(id)) return level.get(id); const g = gateById.get(id); const v = g.requires.length ? 1 + Math.max(...g.requires.map(lv)) : 0; level.set(id, v); return v; };
    gates.forEach((g) => lv(g.id));
    const waves = new Map();
    for (const g of gates) waves.set(level.get(g.id), [...(waves.get(level.get(g.id)) ?? []), `${g.id} ${g.title}`]);
    L.push('## Dependency waves (reference only, not the order of work)', '', 'Which gates depend on which. Use it to understand dependencies; to know what to do next, run `continue`.', '', '| Wave | Gates |', '|---|---|');
    for (const [v, names] of [...waves].sort((a, b) => a[0] - b[0])) L.push(`| ${v} | ${names.join('; ')} |`);
    L.push('');
    for (const g of gates) {
      L.push(`## ${g.id} - ${g.title}`, '', g.purpose, '');
      L.push(`Requires: ${g.requires.length ? g.requires.join(', ') : 'nothing'}${g.conditional ? `  \nConditional: ${g.conditional}` : ''}`, '');
      L.push('| Step | Lane | Type | What | After | Exit evidence |', '|---|---|---|---|---|---|');
      for (const s of g.steps) {
        const after = [...(s.deps ?? []), ...(s.needs ?? []).map((n) => `needs ${n}`)].join(', ') || '-';
        L.push(`| ${s.id} | ${s.lane} | ${s.type} | ${s.title} | ${after} | ${s.exit} |`);
      }
      L.push('');
    }
    writeFileSync(path.join(kitDir, 'GATES.md'), L.join('\n'));
    if (!a.flags.quiet) console.log('wrote .agent/product-kit/GATES.md');
    if (milestones.length) renderMilestones();
  },

  // ---- kit v2: git sync, recover, QA pass, doctor ----
  checkpoint() {
    const br = branchOf();
    need(/^(step|qa)\//.test(br), `checkpoint saves work on a step or QA branch; you are on "${br}". ${[trunk, cfg.mainBranch].includes(br) ? `Work never happens directly on ${br}.` : ''}`);
    const id = br.split('/').slice(1).join('/');
    const hits = secretHits(root);
    need(!hits.length, `possible secrets found; nothing was committed. Remove them or add the file to .gitignore (values are not shown):\n  ${hits.join('\n  ')}`);
    if (dirtyCount()) {
      git(['add', '-A'], root);
      git(['commit', '-m', `wip(${id}): checkpoint ${new Date().toISOString()}`], root);
      console.log(`Committed a checkpoint on ${br}.`);
    } else console.log(`Nothing uncommitted on ${br}.`);
    if (readClaim(id)) cmds.heartbeat({ pos: [id], flags: {} });
    if (!hasRemote()) return console.log(`No remote "${cfg.remote}": the checkpoint is committed locally only.`);
    if (!syncAcked()) return console.log('Not pushed: pushing needs the founder\'s GIT-SYNC authorization (ack GIT-SYNC). The checkpoint is committed locally.');
    const r = tryGit(['push', '-u', cfg.remote, br], root);
    need(r.ok, `committed locally, but the push of ${br} failed (never force it):\n${r.out}`);
    console.log(`Pushed ${br} to ${cfg.remote}. main is untouched.`);
  },

  land(a) {
    const id = a.pos[0];
    need(id, 'land needs a step id (for example M1.3) or QA-<milestone> (for example QA-M1)');
    const isQa = /^QA-/.test(id);
    const branch = isQa ? `qa/${id.slice(3)}` : `step/${id}`;
    if (!isQa) stepOrDie(id);
    need(!checksPrecondition(a), checksPrecondition(a));
    need(syncAcked(), 'landing on main needs the founder\'s GIT-SYNC authorization. Ask for it, then record it: ack GIT-SYNC --quote "<their words>"');
    need(branchOf() === trunk, `run land from the main checkout on ${trunk}, not on "${branchOf()}"`);
    need(dirtyCount() === 0, 'the main checkout has uncommitted changes; commit or move them first (main must be clean to land)');
    need(branchExists(branch), `branch ${branch} does not exist`);
    if (isQa) {
      const mid = id.slice(3);
      const f = path.join(worktreeList().find((w) => w.branch === `refs/heads/${branch}`)?.worktree ?? '', '.agent', 'product-kit', 'qa', `${mid}.md`);
      need(existsSync(f), `no QA report for ${mid} on ${branch}`);
      const bad = qaProblems(msById.get(mid), f).errs;
      need(!bad.length, `QA report is not ready:\n  ${bad.join('\n  ')}`);
    } else need(tryGit(['cat-file', '-e', `${branch}:.agent/product-kit/done/${id}.json`], root).ok, `${id} has no done record on ${branch}: run "done" in its worktree and commit it`);
    const wt = worktreeList().find((w) => w.branch === `refs/heads/${branch}`);
    if (wt) need(dirtyCount(wt.worktree) === 0, `worktree ${wt.worktree} has uncommitted work; run "checkpoint" there first`);
    if (hasRemote()) {
      const f = tryGit(['fetch', cfg.remote], root);
      need(f.ok, `fetch failed: ${f.out}`);
      if (tryGit(['rev-parse', '--verify', '--quiet', `${cfg.remote}/${trunk}`], root).ok) {
        const [behind, ahead] = git(['rev-list', '--left-right', '--count', `${cfg.remote}/${trunk}...${trunk}`], root).split(/\s+/).map(Number);
        if (behind && ahead) die(`local ${trunk} and ${cfg.remote}/${trunk} have both moved (local +${ahead}, remote +${behind}). Someone else pushed. Do not force anything: stop and tell the founder what each side holds (git log --oneline ${trunk}..${cfg.remote}/${trunk}).`);
        if (behind) { git(['merge', '--ff-only', `${cfg.remote}/${trunk}`], root); console.log(`Fast-forwarded ${trunk} by ${behind} commit(s) from ${cfg.remote}.`); }
      }
    }
    // 1. Bring main into the step branch first, so any conflict is resolved on the step branch and main stays untouched.
    if (wt) {
      const m = tryGit(['merge', '--no-edit', trunk], wt.worktree);
      if (!m.ok) {
        const files = tryGit(['diff', '--name-only', '--diff-filter=U'], wt.worktree).out;
        console.error(`Merge conflict while bringing ${trunk} into ${branch}. Resolve it in ${wt.worktree} following PROTOCOL.md section 11, commit, then run land again.\nConflicted files:\n${files.split('\n').map((x) => `  ${x}`).join('\n')}`);
        process.exit(2);
      }
    }
    if (cfg.ci.mode === 'wait' && hasRemote()) {
      const pp = tryGit(['push', '-u', cfg.remote, branch], wt ? wt.worktree : root);
      need(pp.ok, `could not push ${branch} for CI (never force it):\n${pp.out}`);
      const ciErr = ciWait(branch, git(['rev-parse', branch], root));
      need(!ciErr, `${ciErr}\nFix it on ${branch} (checkpoint there), then run land again. ${trunk} is unchanged.`);
    }
    // 2. Merge into trunk without committing, run the checks on the merged result, then commit.
    const m2 = tryGit(['merge', '--no-ff', '--no-commit', branch], root);
    if (!m2.ok) { tryGit(['merge', '--abort'], root); die(`merging ${branch} into ${trunk} failed unexpectedly and was aborted: ${m2.out}`); }
    const failed = runChecks(root, a);
    if (failed) { tryGit(['merge', '--abort'], root); die(`${failed}. The merge was aborted and ${trunk} is unchanged. Fix it on ${branch} and run land again.`); }
    const title = isQa ? `QA pass ${id.slice(3)}` : steps.get(id).title.slice(0, 70);
    git(['commit', '--no-edit', '-m', `land(${id}): ${title}${a.flags['no-checks'] ? `\n\nNo automated checks ran: ${a.flags['no-checks']}` : ''}`], root);
    console.log(`Landed ${branch} on ${trunk}.`);
    if (hasRemote()) {
      const r = tryGit(['push', cfg.remote, trunk], root);
      need(r.ok, `landed locally, but the push was rejected (never force it). Run land's fetch step again or stop and tell the founder:\n${r.out}`);
      console.log(`Pushed ${trunk} to ${cfg.remote}.`);
    } else console.log(`No remote "${cfg.remote}": landed locally only.`);
    // 3. Clean up what is now merged.
    if (!isQa) rmSync(path.join(claimsDir, id), { recursive: true, force: true });
    if (wt) tryGit(['worktree', 'remove', wt.worktree], root);
    if (hasRemote() && tryGit(['ls-remote', '--exit-code', '--heads', cfg.remote, branch], root).ok) tryGit(['push', cfg.remote, '--delete', branch], root);
    const d = tryGit(['branch', '-d', branch], root);
    if (!d.ok) console.log(`Kept ${branch}: ${d.out}`);
    if (hasRemote()) {
      const red = ciWait(trunk, git(['rev-parse', 'HEAD'], root));
      if (red) { console.error(`${trunk} is RED after landing ${id}: ${red}\nDo not land anything else. Fix ${trunk} first: a new step branch from ${trunk}, smallest change, land it. If the cause is unclear, stop and tell the founder.`); process.exit(3); }
    }
    console.log(`Now: append a short ${id} summary to PROGRESS.md (on ${trunk}, in the next landed change), then run "continue".`);
  },

  sync(a) {
    need(syncAcked(), 'syncing needs the founder\'s GIT-SYNC authorization (ack GIT-SYNC --quote "...")');
    need(branchOf() === trunk, `run sync from the main checkout on ${trunk}`);
    need(dirtyCount() === 0, 'the main checkout has uncommitted changes; commit them first (main must be clean)');
    need(hasRemote(), `no remote "${cfg.remote}"; nothing to sync`);
    const f = tryGit(['fetch', '--prune', cfg.remote], root);
    need(f.ok, `fetch failed: ${f.out}`);
    const ref = `${cfg.remote}/${trunk}`;
    if (!tryGit(['rev-parse', '--verify', '--quiet', ref], root).ok) {
      const failedFirst = runChecks(root, a); need(!failedFirst, failedFirst);
      need(tryGit(['push', '-u', cfg.remote, trunk], root).ok, 'push failed');
      return console.log(`Pushed ${trunk} to ${cfg.remote} (first push).`);
    }
    const [behind, ahead] = git(['rev-list', '--left-right', '--count', `${ref}...${trunk}`], root).split(/\s+/).map(Number);
    if (behind && ahead) die(`local ${trunk} and ${ref} have both moved (local +${ahead}, remote +${behind}). Do not force anything: stop and tell the founder what each side holds.`);
    if (behind) { git(['merge', '--ff-only', ref], root); return console.log(`Fast-forwarded ${trunk} by ${behind} commit(s). Nothing to push.`); }
    if (!ahead) return console.log(`${trunk} already matches ${ref}.`);
    const failed = runChecks(root, a);
    need(!failed, `${failed}. Nothing was pushed.`);
    const r = tryGit(['push', cfg.remote, trunk], root);
    need(r.ok, `push was rejected (never force it):\n${r.out}`);
    console.log(`Pushed ${ahead} commit(s) to ${ref}.`);
  },

  ci(a) {
    const sub = a.pos[0];
    need(['check', 'wait'].includes(sub), 'usage: ci check | ci wait [branch]');
    if (sub === 'wait') {
      const b = a.pos[1] ?? branchOf();
      const saved = cfg.ci.mode; cfg.ci.mode = 'wait';
      const err = ciWait(b, git(['rev-parse', b], root));
      cfg.ci.mode = saved;
      need(!err, err);
      return;
    }
    const v = spawnSync('gh', ['--version'], { encoding: 'utf8' });
    if (v.error || v.status !== 0) return console.log('ci check: the GitHub CLI (gh) is not installed. Install it from https://cli.github.com, run "gh auth login", then run this again. ci.mode stays "off".');
    const au = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
    if (au.status !== 0) return console.log('ci check: gh is installed but not logged in. Run "gh auth login", then run this again. ci.mode stays "off".');
    const wf = path.join(root, '.github', 'workflows');
    const files = existsSync(wf) ? readdirSync(wf).filter((f) => /\.ya?ml$/.test(f)) : [];
    if (!files.length) return console.log('ci check: no workflow in .github/workflows. Step G1.2 creates one. ci.mode stays "off" until it exists.');
    console.log(`ci check: gh works and ${files.length} workflow file(s) exist: ${files.join(', ')}.`);
    for (const f of files) { const t = readFileSync(path.join(wf, f), 'utf8'); const br = (t.match(/^\s*branches:.*$/m) ?? [''])[0].trim(); console.log(`  ${f}: ${/^\s*push:/m.test(t) ? 'runs on push' : 'NO push trigger'}${br ? `, ${br}` : ', all branches'}`); }
    console.log(`Make sure each workflow runs on pushes to ${trunk} and step/** (or all branches). Then set "ci": { "mode": "wait" } in kit.config.json. NOT VERIFIED: the kit has not seen your real runs yet.`);
  },

  recover(a) {
    const hook = !!a.flags.hook;
    const L = [];
    const out = (s = '') => L.push(s);
    try {
      const br = branchOf();
      const remoteState = (() => {
        if (!hasRemote()) return 'no remote';
        if (!tryGit(['rev-parse', '--verify', '--quiet', `${cfg.remote}/${trunk}`], root).ok) return `${cfg.remote} not fetched yet`;
        const [behind, ahead] = git(['rev-list', '--left-right', '--count', `${cfg.remote}/${trunk}...${trunk}`], root).split(/\s+/).map(Number);
        return behind || ahead ? `${trunk} is ${ahead} ahead / ${behind} behind ${cfg.remote} (as of the last fetch)` : `${trunk} matches ${cfg.remote} (as of the last fetch)`;
      })();
      out(`== SamjuniorsOS recover (kit v${KIT_VERSION}) ==`);
      out(`Checkout: ${root}  branch: ${br}  uncommitted files: ${dirtyCount()}  remote: ${remoteState}${/ahead/.test(remoteState) && !/ 0 ahead/.test(remoteState) ? '  -> run "sync"' : ''}`);
      if (br !== trunk) out(`WARNING: the main checkout is on "${br}" but steps land on "${trunk}". Switch back: git switch ${trunk}`);
      if (activeMs) { const ids = msStepIds(activeMs); out(`Active milestone: ${activeMs.id} ${activeMs.title}  (${ids.filter((i) => done.has(i)).length}/${ids.length} steps done)`); }
      else out('All milestones are closed.');
      const recent = [...done].map((id) => { try { return JSON.parse(readFileSync(path.join(kitDir, 'done', `${id}.json`), 'utf8')); } catch { return null; } }).filter((r) => r?.doneAt).sort((x, y) => y.doneAt.localeCompare(x.doneAt)).slice(0, 3);
      out(`Last finished: ${recent.length ? recent.map((r) => `${r.id} (${ago(r.doneAt)})`).join(', ') : 'nothing yet'}`);
      const unlanded = finishedNotLanded();
      if (unlanded.length) out(`Finished but NOT on ${trunk} yet: ${unlanded.join(', ')}  -> run "land <ID>" for each (from the main checkout)`);
      out('In progress:');
      let any = false;
      for (const w of worktreeList()) {
        const b = (w.branch ?? '').replace('refs/heads/', '');
        if (!/^(step|qa)\//.test(b)) continue;
        any = true;
        const id = b.split('/')[1];
        const c = readClaim(id.replace(/^QA-/, ''));
        let dirty = '?', last = 'n/a';
        try { dirty = dirtyCount(w.worktree); last = git(['log', '-1', '--format=%cr: %s'], w.worktree); } catch { /* missing worktree */ }
        const pushed = tryGit(['rev-parse', '--verify', '--quiet', `${cfg.remote}/${b}`], root).ok ? 'pushed' : 'not pushed';
        out(`  ${b}  ${c ? `${c.agent}, ${c.stale ? 'STALE' : 'fresh'}` : 'no claim'}  uncommitted: ${dirty}  last commit ${last}  ${pushed}\n    ${w.worktree}`);
      }
      if (!any) out('  none');
      const fdir = path.join(kitDir, 'findings');
      const nf = existsSync(fdir) ? readdirSync(fdir).filter((f) => f.endsWith('.md')).length : 0;
      if (nf) out(`Open findings: ${nf} (.agent/product-kit/findings/)`);
      const bad = doctorHits();
      if (bad.length) out(`Stale instructions found in ${new Set(bad.map((x) => x.file)).size} file(s): run "doctor".`);
      out('');
      out('Next: tell the founder in 3 lines where things stand, then run:  node .agent/product-kit/kit.mjs continue');
      out('The order of work is the active milestone, never a gate. This command changed nothing.');
    } catch (e) {
      out(`recover could not finish: ${e.message}`);
      out('Run "git status" and "node .agent/product-kit/kit.mjs resume" by hand.');
    }
    console.log(L.join('\n'));
    if (!hook) { console.log('\n== Details from resume =='); cmds.resume(); }
  },

  qa(a) {
    const sub = a.pos[0];
    const m = msById.get(a.pos[1]);
    need(['start', 'check'].includes(sub) && m, 'usage: qa start <M> | qa check <M>');
    const undone = msStepIds(m).filter((id) => !done.has(id));
    if (sub === 'start') {
      need(!undone.length, `milestone ${m.id} still has undone steps: ${undone.join(', ')}`);
      const nl = finishedNotLanded();
      need(!nl.length, `land these first, so QA tests what is really on ${trunk}: ${nl.join(', ')}`);
      need(branchOf() === trunk && dirtyCount() === 0, `start QA from a clean ${trunk} checkout`);
      const branch = `qa/${m.id}`;
      const wt = path.join(path.dirname(root), `${path.basename(root)}-wt`, `QA-${m.id}`);
      if (!existsSync(wt)) { mkdirSync(path.dirname(wt), { recursive: true }); git(branchExists(branch) ? ['worktree', 'add', wt, branch] : ['worktree', 'add', '-b', branch, wt, 'HEAD'], root); }
      const f = path.join(wt, '.agent', 'product-kit', 'qa', `${m.id}.md`);
      if (!existsSync(f)) {
        mkdirSync(path.dirname(f), { recursive: true });
        const T = m.founder_test.map((t, i) => `### T${i + 1} ${t}\nResult: <PASS or FOUNDER-ONLY>\nEvidence: <command and output, test name, file, or screenshot. FOUNDER-ONLY needs the reason an agent cannot check it, for example a real microphone>\n`).join('\n');
        writeFileSync(f, `# QA pass for ${m.id}: ${m.title}\n\nQA by: <name of the session that ran this pass; it must not be a session that built steps of this milestone>\nTested commit: ${git(['rev-parse', 'HEAD'], root)}\nChecks result: <PASS or FAIL>\nCI run: <URL of the green CI run for the tested commit, or n/a when ci.mode is off>\nVerdict: <replace with PASS only when every item below is PASS or FOUNDER-ONLY>\n\nRun this against the real app on ${trunk}, the way the founder will: start it, do each test step below yourself, and write what you saw. Do not mark PASS from reading code. A step you cannot exercise (real microphone, real phone, a live provider key) is FOUNDER-ONLY with the reason, and goes to the founder first in their test script.\n\n## Automated checks\n(every command from kit.config.json "checks" with its result)\n\n## Founder test steps, run for real\n\n${T}\n## Bugs found and fixed\n(one bullet each: what broke, the fix commit, and "test: <file or name>" for the regression test that now covers it. Write "none" if none.)\n\n## Bugs found and not fixed\n(severity and why; each also goes in findings/)\n\n## Quality bar items checked in the running product\n- Q-UX-2: <what you saw>\n- Q-UX-3: <what you saw>\n- Q-UX-5: <what you saw>\n- Q-A11Y-1: <what you saw>\n`);
      }
      console.log(`QA worktree ready: ${wt}  (branch ${branch})\nDo this, in order:\n 1. Run the checks, then start the app and walk through every founder test step of ${m.id} yourself. Record each in ${f}.\n 2. Fix every bug that blocks a test step, in this worktree: smallest change, plus a regression test (Q-QA-3). Stay inside the auto-fix scope in PROTOCOL.md section 4; at most two fix rounds, then record the rest in findings/.\n 3. Run "checkpoint" often. When the report is complete: node .agent/product-kit/kit.mjs qa check ${m.id}\n 4. From the main checkout: node .agent/product-kit/kit.mjs land QA-${m.id}\n 5. Then: node .agent/product-kit/kit.mjs milestone verify ${m.id}`);
      return;
    }
    const f = qaFile(m.id);
    need(f, `no QA report for ${m.id}. Run: qa start ${m.id}`);
    const { errs, founderOnly } = qaProblems(m, f);
    if (errs.length) { console.error(`QA report for ${m.id} is not ready:\n${errs.map((e) => `- ${e}`).join('\n')}`); process.exit(1); }
    console.log(`QA report for ${m.id} is complete.${founderOnly.length ? ` Founder-only checks: ${founderOnly.join(', ')}.` : ''}`);
  },

  doctor(a) {
    const hits = doctorHits();
    if (!hits.length) return console.log(`doctor: no stale instructions found (kit v${KIT_VERSION}).`);
    console.log(`doctor: ${hits.length} place(s) still carry older kit wording. Fix each with the smallest edit that keeps the rest of the file as it is, then run doctor again.\n`);
    for (const h of hits) console.log(`${h.file}:${h.line}  ${h.why}\n    ${h.text}`);
    if (a.flags.strict) process.exit(1);
  },

  'install-hook'() {
    const dir = path.join(root, '.claude');
    const f = path.join(dir, 'settings.json');
    let s = {};
    if (existsSync(f)) { try { s = JSON.parse(readFileSync(f, 'utf8')); } catch { die(`${f} is not valid JSON; fix it first. Nothing was changed.`); } }
    const command = 'node .agent/product-kit/kit.mjs recover --hook';
    s.hooks ??= {};
    s.hooks.SessionStart ??= [];
    if (s.hooks.SessionStart.some((e) => (e.hooks ?? []).some((h) => h.command === command))) console.log('SessionStart hook already installed.');
    else { s.hooks.SessionStart.push({ matcher: 'startup|resume|clear|compact', hooks: [{ type: 'command', command }] }); mkdirSync(dir, { recursive: true }); writeFileSync(f, JSON.stringify(s, null, 2) + '\n'); console.log(`Added the SessionStart hook to ${path.relative(root, f)}.`); }
    const cmdFile = path.join(dir, 'commands', 'recover.md');
    if (!existsSync(cmdFile)) { mkdirSync(path.dirname(cmdFile), { recursive: true }); writeFileSync(cmdFile, '---\ndescription: Where did we stop? Show what is finished, what is in progress and what is next\n---\n\nRun `node .agent/product-kit/kit.mjs recover`. Tell me in three lines what is finished, what was interrupted, and what is next. Then run `node .agent/product-kit/kit.mjs continue` and do what it prints.\n'); console.log(`Added the /recover command at ${path.relative(root, cmdFile)}.`); }
    console.log('Commit both files. NOT VERIFIED: the hook runs only in Claude Code; other agents use "recover" by hand (see MASTER_PROMPT.md).');
  },

  validate() {
    const errs = [];
    const seen = new Set();
    for (const g of gates) {
      for (const r of g.requires) if (!gateById.has(r)) errs.push(`gate ${g.id} requires unknown gate ${r}`);
      for (const s of g.steps) {
        if (seen.has(s.id)) errs.push(`duplicate step id ${s.id}`);
        seen.add(s.id);
        if (!data.lanes.includes(s.lane)) errs.push(`${s.id} has unknown lane ${s.lane}`);
        if (!s.exit || s.exit.length < 15) errs.push(`${s.id} lacks exit evidence`);
        for (const d of s.deps ?? []) if (!steps.has(d)) errs.push(`${s.id} depends on unknown step ${d}`);
      }
    }
    for (const g of gates) for (const s of g.steps) for (const n of s.needs ?? []) if (/^G\d+\.\d+$/.test(n) && !steps.has(n)) errs.push(`${s.id} needs unknown step ${n}`);
    const gcolor = new Map();
    const gvisit = (id, trail) => {
      if (gcolor.get(id) === 2) return;
      if (gcolor.get(id) === 1) { errs.push(`gate cycle: ${[...trail, id].join(' -> ')}`); return; }
      gcolor.set(id, 1);
      for (const r of gateById.get(id)?.requires ?? []) gvisit(r, [...trail, id]);
      gcolor.set(id, 2);
    };
    for (const g of gates) gvisit(g.id, []);
    if (errs.length) { console.error(errs.map((e) => `- ${e}`).join('\n')); process.exit(1); }
    const color = new Map();
    const visit = (id, trail) => {
      if (color.get(id) === 2) return;
      if (color.get(id) === 1) { errs.push(`dependency cycle: ${[...trail, id].join(' -> ')}`); return; }
      color.set(id, 1);
      for (const d of steps.get(id)?.deps ?? []) visit(d, [...trail, id]);
      color.set(id, 2);
    };
    for (const id of steps.keys()) visit(id, []);
    for (const id of done) if (!steps.has(id)) errs.push(`done/${id}.json refers to an unknown step`);
    if (milestones.length) {
      const owner = new Map();
      const gateStepIds = new Set(gates.flatMap((g) => g.steps.map((s) => s.id)));
      const idx = new Map(milestones.map((m, i) => [m.id, i]));
      for (const m of milestones) {
        if (!m.founder_test?.length) errs.push(`milestone ${m.id} has no founder test`);
        for (const id of msStepIds(m)) { if (owner.has(id)) errs.push(`step ${id} is in two milestones (${owner.get(id)} and ${m.id})`); owner.set(id, m.id); }
        for (const id of m.uses ?? []) if (!gateStepIds.has(id)) errs.push(`milestone ${m.id} uses unknown step ${id}`);
        for (const s of m.steps ?? []) {
          if (gateStepIds.has(s.id)) errs.push(`milestone step ${s.id} collides with a gate step`);
          if (!s.exit || s.exit.length < 15) errs.push(`${s.id} lacks exit evidence`);
          if (!data.lanes.includes(s.lane)) errs.push(`${s.id} has unknown lane ${s.lane}`);
          for (const d of s.deps ?? []) if (!steps.has(d)) errs.push(`${s.id} depends on unknown step ${d}`);
        }
      }
      for (const g of gates) { if (g.conditional) continue; for (const s of g.steps) if (!owner.has(s.id)) errs.push(`step ${s.id} is in no milestone`); }
      const later = (a, b) => owner.has(a) && owner.has(b) && idx.get(owner.get(a)) > idx.get(owner.get(b));
      for (const g of gates) for (const r of g.requires) for (const s of g.steps) for (const rs of gateById.get(r).steps) if (later(rs.id, s.id)) errs.push(`milestone order: ${s.id} (${owner.get(s.id)}) needs gate ${r}, but ${rs.id} is later (${owner.get(rs.id)})`);
      for (const [id, s] of steps) for (const d of [...(s.deps ?? []), ...(s.needs ?? []).filter((x) => steps.has(x))]) if (later(d, id)) errs.push(`milestone order: ${id} (${owner.get(id)}) waits for ${d} which is later (${owner.get(d)})`);
    }
    const gen = ['GATES.md', ...(milestones.length ? ['MILESTONES.md'] : [])].map((f) => path.join(kitDir, f));
    if (gen.some((f) => !existsSync(f))) errs.push('a generated file is missing; run render');
    else {
      const before = gen.map((f) => readFileSync(f, 'utf8'));
      cmds.render({ pos: [], flags: { quiet: true } });
      gen.forEach((f, i) => { if (readFileSync(f, 'utf8') !== before[i]) errs.push(`${path.basename(f)} was out of date and has been regenerated; commit it`); });
    }
    if (errs.length) { console.error(errs.map((e) => `- ${e}`).join('\n')); process.exit(1); }
    console.log(`valid: ${gates.length} gates, ${steps.size} steps${milestones.length ? `, ${milestones.length} milestones` : ''}`);
  },
};

function renderMilestones() {
  const L = ['<!-- Generated from milestones.json by "node .agent/product-kit/kit.mjs render". Do not edit by hand. -->', '', '# Milestones: what you can test, and what is left', '',
    'Work happens one milestone at a time. When a milestone is finished the agent asks you to test it. After you accept it, the agent cleans it up and starts the next. Live status: `node .agent/product-kit/kit.mjs milestone status`.', '',
    '| Milestone | After it you can | Steps | Decisions you make |', '|---|---|---|---|'];
  for (const m of milestones) {
    const ids = msStepIds(m);
    const dec = ids.filter((id) => steps.get(id)?.type === 'decision');
    L.push(`| ${m.id} ${m.title} | ${m.can_test} | ${ids.length} | ${dec.length ? dec.join(', ') : '-'} |`);
  }
  L.push('');
  for (const m of milestones) {
    L.push(`## ${m.id} - ${m.title}`, '', m.purpose, '', '**You test:**');
    m.founder_test.forEach((t, i) => L.push(`${i + 1}. ${t}`));
    L.push('', `**Not included yet:** ${m.skips.join('; ')}`, '');
    if (m.steps?.length) {
      L.push('**Its own steps (lighter slices; the full versions stay in their later milestones):**', '', '| Step | Lane | What | Slice of | Deferred |', '|---|---|---|---|---|');
      for (const s of m.steps) L.push(`| ${s.id} | ${s.lane} | ${s.title} | ${s.slice_of || '-'} | ${s.defers} |`);
      L.push('');
    }
    L.push(`**Gate steps:** ${m.uses.length ? m.uses.join(', ') : 'none'}`, '');
  }
  writeFileSync(path.join(kitDir, 'MILESTONES.md'), L.join('\n'));
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || !cmds[cmd]) {
  console.log(`usage: node .agent/product-kit/kit.mjs <command>\n  continue | recover [--hook] | status | next [--lane L] [--n 4] | resume | validate | render | doctor [--strict]\n  qa start <M> | qa check <M> | checkpoint | land <ID|QA-M> | sync | ci check | ci wait [branch] | install-hook\n  milestone status | verify <M> | ship <M> | close <M> --quote "..." [--dry-run]\n  claim <ID> --agent NAME [--takeover] [--base REF] | heartbeat <ID> | release <ID>\n  scaffold <ID> | done <ID> --evidence "..." | decide <ID> --quote "..." | ack <KEY> --quote "..."`);
  process.exit(cmd ? 1 : 0);
}
cmds[cmd](parse(rest));
