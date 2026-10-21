#!/usr/bin/env node
// product-kit CLI. Zero dependencies, Node >= 18. See .agent/product-kit/PROTOCOL.md.
//
// State model (no single mutable state file, so parallel agents do not conflict):
//   definitions : .agent/product-kit/gates.json              (committed, edited by the lead only)
//   claims      : <git-common-dir>/kit/claims/<ID>/   (local, shared by all worktrees, survives shutdown)
//   completion  : .agent/product-kit/done/<ID>.json          (committed WITH the work on the step branch)
//   decisions   : .agent/product-kit/ack/<KEY>.json          (committed, records a founder statement)
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kitDir = path.dirname(fileURLToPath(import.meta.url));
const git = (args, cwd = kitDir) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const root = git(['rev-parse', '--show-toplevel']);
const commonDir = path.resolve(kitDir, git(['rev-parse', '--git-common-dir']));
const claimsDir = path.join(commonDir, 'kit', 'claims');

const data = JSON.parse(readFileSync(path.join(kitDir, 'gates.json'), 'utf8'));
const STALE_MS = (data.stale_claim_minutes ?? 30) * 60 * 1000;
const gates = data.gates;
const gateById = new Map(gates.map((g) => [g.id, g]));
const steps = new Map();
for (const g of gates) for (const s of g.steps) steps.set(s.id, { ...s, gate: g.id });

const keysIn = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
const done = new Set(keysIn(path.join(kitDir, 'done')));
const acks = new Set(keysIn(path.join(kitDir, 'ack')));

const satisfied = (key) => done.has(key) || acks.has(key);
const gateClosed = (id) => acks.has(id) || acks.has(`NA-${id}`);
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
  if (!gateOpen(s.gate)) return { k: 'locked', why: `gate ${s.gate} needs ack of ${gateById.get(s.gate).requires.filter((r) => !gateClosed(r)).join(', ')}` };
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
const stepOrDie = (id) => { const s = steps.get(id); need(s, `unknown step "${id}"`); return s; };
const worktreePath = (id) =>
  process.env.KIT_WORKTREE_DIR
    ? path.join(path.resolve(process.env.KIT_WORKTREE_DIR), id)
    : path.join(root, '.agent', 'worktrees', id);


const cmds = {
  status() {
    const sym = { done: '[x]', ready: '[>]', claimed: '[~]', 'stale-claim': '[!]', blocked: '[ ]', locked: '[-]', 'needs-founder': '[?]', 'awaiting-founder': '[?]' };
    let total = 0, finished = 0;
    for (const g of gates) {
      const list = g.steps.map((s) => ({ s, st: stateOf(steps.get(s.id)) }));
      const n = list.filter((x) => x.st.k === 'done').length;
      total += list.length; finished += n;
      const tag = gateClosed(g.id) ? 'CLOSED' : gateOpen(g.id) ? 'open' : 'locked';
      console.log(`\n${g.id}  ${g.title}  ${n}/${list.length}  ${tag}${g.conditional ? '  (conditional)' : ''}`);
      for (const { s, st } of list) {
        const extra = st.k === 'claimed' || st.k === 'stale-claim' ? ` (${st.c.agent}, ${st.c.stale ? 'STALE' : 'fresh'})` : st.why ? ` (${st.why})` : '';
        console.log(`  ${sym[st.k]} ${s.id.padEnd(5)} ${s.lane.padEnd(9)} ${s.title}${extra}`);
      }
    }
    console.log(`\n${finished}/${total} steps done.  Legend: [x] done [>] ready [~] claimed [!] stale claim [?] founder [ ] blocked [-] gate locked`);
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
    if (!existsSync(h)) writeFileSync(h, `# ${s.id}: ${s.title}\n\nExit evidence required: ${s.exit}\n\n## Plan\n(5 to 10 lines before coding: files to touch, checks to run, what you will not do. Apply the smallest-complete-change ladder in PROTOCOL.md section 3 first.)\n\n## What changed\n\n## Why\n\n## Verification\n(commands run and their results)\n\n## Shortcuts taken\n(each one with its limit and when to upgrade, or "none")\n\n## Remaining risks\n\n## Findings opened\n`);
    if (!existsSync(v)) writeFileSync(v, `# Independent verification of ${s.id}\n\nVerifier: <your agent name; it must differ from the implementer's>\n\nYou did not write this change. Read the exit evidence in gates.json and the diff, then run the checks yourself.\n\n## Exit evidence met\n(for each item: yes or no, and the command you ran)\n\n## Problems found\n\n## Verdict\n(replace this line with the one-word result)\n`);
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
    const rec = { id: s.id, doneAt: new Date().toISOString(), agent: readClaim(s.id).agent, branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], root), commit: git(['rev-parse', 'HEAD'], root), evidence: ev };
    writeFileSync(path.join(kitDir, 'done', `${s.id}.json`), JSON.stringify(rec, null, 2) + '\n');
    console.log(`Wrote done/${s.id}.json. Commit it together with the work. The claim stays until the lead integrates and runs "release".`);
  },

  decide(a) {
    const s = stepOrDie(a.pos[0]);
    need(s.type === 'decision', `${s.id} is not a decision step`);
    need(stateOf(s).k === 'awaiting-founder', `${s.id} is not awaiting the founder (${stateOf(s).k})`);
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

  resume() {
    console.log('== Claims ==');
    const claims = allClaims();
    if (!claims.length) console.log('none');
    for (const c of claims) console.log(`${c.step}  ${c.agent}  ${c.stale ? 'STALE (last heartbeat ' + c.heartbeatAt + ')' : 'fresh'}  ${c.worktree}`);
    console.log('\n== Step worktrees and branches ==');
    const out = git(['worktree', 'list', '--porcelain'], root).split('\n\n').map((b) => Object.fromEntries(b.split('\n').map((l) => l.split(/ (.*)/s).slice(0, 2))));
    let any = false;
    for (const w of out) {
      if (!w.branch || !w.branch.startsWith('refs/heads/step/')) continue;
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
      'A gate opens when the gates it requires are acknowledged by the founder. Live status: `node .agent/product-kit/kit.mjs status`.', ''];
    const level = new Map();
    const lv = (id) => { if (level.has(id)) return level.get(id); const g = gateById.get(id); const v = g.requires.length ? 1 + Math.max(...g.requires.map(lv)) : 0; level.set(id, v); return v; };
    gates.forEach((g) => lv(g.id));
    const waves = new Map();
    for (const g of gates) waves.set(level.get(g.id), [...(waves.get(level.get(g.id)) ?? []), `${g.id} ${g.title}`]);
    L.push('## Order of work (waves)', '', 'Gate IDs are stable names, not an order. Gates in the same wave can run in parallel once the previous wave is acknowledged.', '', '| Wave | Gates |', '|---|---|');
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
    const gatesMd = path.join(kitDir, 'GATES.md');
    if (!existsSync(gatesMd)) errs.push('GATES.md missing; run render');
    else {
      const before = readFileSync(gatesMd, 'utf8');
      cmds.render({ pos: [], flags: { quiet: true } });
      if (readFileSync(gatesMd, 'utf8') !== before) errs.push('GATES.md was out of date and has been regenerated; commit it');
    }
    if (errs.length) { console.error(errs.map((e) => `- ${e}`).join('\n')); process.exit(1); }
    console.log(`valid: ${gates.length} gates, ${steps.size} steps`);
  },
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || !cmds[cmd]) {
  console.log(`usage: node .agent/product-kit/kit.mjs <command>\n  status | next [--lane L] [--n 4] | resume | validate | render\n  claim <ID> --agent NAME [--takeover] [--base REF] | heartbeat <ID> | release <ID>\n  scaffold <ID> | done <ID> --evidence "..." | decide <ID> --quote "..." | ack <KEY> --quote "..."`);
  process.exit(cmd ? 1 : 0);
}
cmds[cmd](parse(rest));
