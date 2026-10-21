#!/usr/bin/env node
// product-kit CLI. Zero dependencies, Node >= 18. See .agent/product-kit/PROTOCOL.md.
//
// State model (no single mutable state file, so parallel agents do not conflict):
//   definitions : .agent/product-kit/gates.json              (committed, edited by the lead only)
//   claims      : <git-common-dir>/kit/claims/<ID>/   (local, shared by all worktrees, survives shutdown)
//   completion  : .agent/product-kit/done/<ID>.json          (committed WITH the work on the step branch)
//   decisions   : .agent/product-kit/ack/<KEY>.json          (committed, records a founder statement)
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, renameSync } from 'node:fs';
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
const stepOrDie = (id) => { const s = steps.get(id); need(s, `unknown step "${id}"`); return s; };
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
    console.log(`Active milestone ${m.id}: ${m.title}  (${n}/${ids.length} steps done)\nGoal: ${m.purpose}\n`);
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
    if (n === ids.length) console.log(`${k++}. Every step of ${m.id} is done. Run: node .agent/product-kit/kit.mjs milestone verify ${m.id}\n`);
    else if (!stale.length && !fresh.length && !picked.length && !asks.size) console.log('Nothing is ready and nothing is waiting on the founder. Run "status" and report what blocks the milestone.\n');
    console.log('Rules: no push or deploy, no third-party installs without the founder, record decisions only in the founder\'s own words, independent verification before done.');
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
      console.log(`Milestone ${m.id} (${m.title}) is complete. Ask the founder to test it:\n`);
      m.founder_test.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
      console.log(`\nNot included yet: ${m.skips.join('; ')}\n\nThen ask: "Did this work? Tell me in your own words." If it worked, run:\n  node .agent/product-kit/kit.mjs milestone close ${m.id} --quote "<the founder's own words>"\nIf something failed, record it in findings/, fix it, and ask again. Do not close the milestone.`);
      return;
    }
    need(sub === 'close', `unknown milestone command "${sub}" (use status, verify or close)`);
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
    console.log(`\nRecorded the founder's acceptance in ack/MS-${m.id}.json.${openFindings.length ? `\nOpen findings carried forward (still in findings/): ${openFindings.join(', ')}` : ''}\nNow: commit the archive moves and the ack together, append a short ${m.id} summary to PROGRESS.md, then ${next ? `run "continue" to start ${next.id}: ${next.title}.` : 'tell the founder the last milestone is closed.'}`);
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
    if (milestones.length) renderMilestones();
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
  console.log(`usage: node .agent/product-kit/kit.mjs <command>\n  continue | status | next [--lane L] [--n 4] | resume | validate | render\n  milestone status | milestone verify <M> | milestone close <M> --quote "..." [--dry-run]\n  claim <ID> --agent NAME [--takeover] [--base REF] | heartbeat <ID> | release <ID>\n  scaffold <ID> | done <ID> --evidence "..." | decide <ID> --quote "..." | ack <KEY> --quote "..."`);
  process.exit(cmd ? 1 : 0);
}
cmds[cmd](parse(rest));
