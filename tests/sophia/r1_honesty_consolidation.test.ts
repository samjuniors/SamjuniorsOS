import assert from 'assert';
import fs from 'fs';
import path from 'path';

/**
 * ============================================================================
 * R1 HONESTY & CONSOLIDATION — REGRESSION SUITE
 * ============================================================================
 *
 * The audit's roadmap put R1 after R0 (security closure) and R0.1 (auth
 * hardening): make the capability surface honest and consolidate the dead
 * paths, with minimal auditable changes. This suite pins every honesty
 * contract R1 established, at three levels:
 *
 *   SOURCE-LEVEL (the r01 precedent): the fabricated content is gone from
 *   the files that produced it — dead brain.ts deleted, the LLM chain
 *   removed from providers.ts, no $0.038/84.2%/CR-920/Lumora figures, no
 *   false approval-update claim, no fake "Search Directory" fallback, no
 *   stale GEMINI_API_KEY halt copy, type unions aligned with the registry.
 *
 *   FUNCTIONAL: llmInfo() reports the single real provider; executeSkill
 *   returns an honest not_executed outcome instead of fabricated success;
 *   the selector never picks the declared-but-unwired finance_transfer.
 *
 *   CONVENTION: run with `bun tests/sophia/r1_honesty_consolidation.test.ts`
 *   (script form — same as the r0/r01/m* suites). Exit 1 on any failure.
 */

const ROOT = path.resolve(__dirname, '../..');
const src = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

/**
 * Strip comments so R1's own explanatory comments (which legitimately quote
 * the removed fabricated copy) do not trip absence checks — only live code
 * is scanned. Full-line `//` comments only, so URLs inside string literals
 * on code lines are never eaten.
 */
function codeOnly(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    failed++;
    process.exitCode = 1;
  }
}

function readIf(rel: string): string | null {
  try {
    return src(rel);
  } catch {
    return null;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('R1 HONESTY & CONSOLIDATION REGRESSION SUITE');
  console.log('======================================================\n');

  // ------------------------------------------------------------------
  // SECTION 1 — CONSOLIDATION: the dead tool path is gone
  // ------------------------------------------------------------------
  console.log('--- 1. Dead-path consolidation ---');

  await test('1.1 brain.ts is deleted from the source tree', () => {
    assert.strictEqual(readIf('src/lib/server/brain.ts'), null, 'brain.ts must not exist');
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return ['node_modules', '.next'].includes(e.name) ? [] : walk(p);
        return /\.(ts|tsx|js|mjs)$/.test(e.name) ? [p] : [];
      });
    for (const file of walk(path.join(ROOT, 'src'))) {
      const body = fs.readFileSync(file, 'utf-8');
      assert.ok(
        !/from\s+['"][^'"]*server\/brain['"]/.test(body) && !/import\([^)]*server\/brain/.test(body),
        `${file} still references server/brain`,
      );
    }
  });

  await test('1.2 providers.ts no longer carries the never-wired LLM chain', () => {
    const providers = src('src/lib/server/providers.ts');
    for (const gone of [
      'openLlmStream',
      'LLM_CHAIN',
      'GEMINI_URL',
      'geminiKey',
      'localLlmBase',
      'looksLikeToolRejection',
      'LLM_GUARD',
      'SOFIA_LLM_PROVIDER',
    ]) {
      assert.ok(!providers.includes(gone), `providers.ts still contains ${gone}`);
    }
    for (const kept of ['STT_CHAIN', 'transcribeAnywhere', 'synthesizeLocalTts', 'ttsPinId']) {
      assert.ok(providers.includes(kept), `providers.ts lost the live symbol ${kept}`);
    }
  });

  await test('1.3 llmInfo() reports the single real provider (functional)', async () => {
    const { llmInfo } = await import('../../src/lib/server/providers');
    const info = llmInfo();
    assert.strictEqual(info.active, 'zai');
    assert.strictEqual(info.label, 'Z-AI');
    assert.strictEqual(info.pin, null);
    assert.strictEqual(info.providers.length, 1, 'exactly one brain link');
    assert.strictEqual(info.providers[0].id, 'zai');
    assert.strictEqual(info.providers[0].note, 'built-in, no key');
  });

  // ------------------------------------------------------------------
  // SECTION 2 — SKILL REGISTRY: no fabricated execution
  // ------------------------------------------------------------------
  console.log('--- 2. Skill registry honesty ---');

  await test('2.1 executeSkill returns not_executed, never a fabricated success (functional)', async () => {
    const { executeSkill } = await import('../../src/lib/skills/skill-registry');
    const result = await executeSkill({
      skillId: 'market_research',
      employeeRole: 'researcher',
      taskTitle: 'Test task',
      inputs: { topic: 'agent runtimes' },
    });
    assert.strictEqual(result.status, 'not_executed');
    assert.strictEqual(result.verificationPassed, false);
    assert.strictEqual(result.evidenceBasis, 'unverified');
    assert.strictEqual(result.outputContent, undefined, 'no template output masquerading as real work');
    assert.ok(!/verification requirement\(s\) satisfied/i.test(result.verificationNotes));
    assert.ok(/no skill execution engine is wired/i.test(result.verificationNotes));
  });

  await test('2.2 executeSkill boundary checks still enforced (advisor denied, unknown skill failed)', async () => {
    const { executeSkill } = await import('../../src/lib/skills/skill-registry');
    const advisor = await executeSkill({
      skillId: 'market_research',
      employeeRole: 'advisor',
      taskTitle: 'Advisor attempt',
      inputs: {},
    });
    assert.strictEqual(advisor.status, 'denied');
    assert.strictEqual(advisor.verificationPassed, false);

    const unknown = await executeSkill({
      skillId: 'does_not_exist',
      employeeRole: 'researcher',
      taskTitle: 'Unknown skill',
      inputs: {},
    });
    assert.strictEqual(unknown.status, 'failed');
    assert.strictEqual(unknown.verificationPassed, false);
  });

  await test('2.3 SkillId union == the skills that actually exist (drift closed)', async () => {
    const { STRUCTURED_SKILLS } = await import('../../src/lib/skills/skill-registry');
    const caps = src('src/types/capabilities.ts');
    const m = caps.match(/export type SkillId\s*=\s*([\s\S]*?);/);
    assert.ok(m, 'SkillId union not found');
    const members = Array.from(m[1].matchAll(/\|\s*'([a-z_]+)'/g)).map((x) => x[1]);
    const defined = Object.keys(STRUCTURED_SKILLS);
    assert.deepStrictEqual(
      [...members].sort(),
      [...defined].sort(),
      'SkillId must declare exactly the registry-defined skills',
    );
  });

  await test('2.4 ToolId union carries only live or declared tools (drift closed)', () => {
    const caps = src('src/types/capabilities.ts');
    const m = caps.match(/export type ToolId\s*=\s*([\s\S]*?);/);
    assert.ok(m, 'ToolId union not found');
    const members = Array.from(m[1].matchAll(/\|\s*'([a-z_]+)'/g)).map((x) => x[1]);
    assert.deepStrictEqual(
      [...members].sort(),
      [
        'finance_transfer',
        'github_issue_create',
        'github_issues_read',
        'github_read',
        'github_repository_read',
        'web_research',
      ].sort(),
      'ToolId must declare only the live/declared tools (tsc enforces no other usage)',
    );
  });

  await test('2.5 declared-but-unwired tools are honestly unconfigured (functional + source)', async () => {
    const { selectTools } = await import('../../src/lib/server/tools/selector');
    const result = selectTools({
      employeeRole: 'finance',
      taskObjective: 'audit capital efficiency',
      requiredSkills: ['capital_efficiency_audit'],
      availableTools: [
        {
          id: 'finance_transfer',
          name: 'Finance Transfer',
          description: 'declaration only',
          category: 'Finance',
          capabilities: ['capital_efficiency_audit'],
          inputSchema: {},
          outputSchema: {},
          riskLevel: 'high',
          requiresApproval: true,
          mutationClass: 'execute',
          availability: 'unconfigured',
          provider: 'internal',
        },
      ],
      permissions: [{ toolId: 'finance_transfer' as never, effect: 'allowed' }],
    });
    assert.strictEqual(result.selectedToolId, undefined, 'unconfigured tool must never be selected');
    assert.ok(result.deniedTools.includes('finance_transfer'));

    const orchestrator = src('src/lib/server/orchestration/orchestrator.ts');
    const ft = orchestrator.match(/id: 'finance_transfer',[\s\S]*?availability: '([a-z]+)'/);
    assert.ok(ft, 'finance_transfer definition not found in orchestrator');
    assert.strictEqual(ft[1], 'unconfigured', 'orchestrator must declare finance_transfer unconfigured');
  });

  // ------------------------------------------------------------------
  // SECTION 3 — DEGRADED PATHS: honest failure, no fabricated content
  // ------------------------------------------------------------------
  console.log('--- 3. Degraded-path honesty ---');

  await test('3.1 agent-collab fallback: fabricated council session removed', () => {
    const route = codeOnly(src('src/app/api/agent-collab/route.ts'));
    const gone = [
      'deterministic-orchestrator',
      '$0.038',
      '84.2%',
      'CR-920',
      'Sprint 15',
      'Company Memory updated',
    ];
    for (const g of gone) {
      assert.ok(!route.includes(g), `agent-collab still contains fabricated content: ${g}`);
    }
    assert.ok(!route.includes("status: 'completed'"), 'no fabricated completed subtasks');
    const raw = src('src/app/api/agent-collab/route.ts');
    assert.ok(raw.includes('degraded-no-model'), 'fallback must identify itself as degraded');
    assert.ok(raw.includes('was NOT executed'), 'fallback must state that nothing was executed');
  });

  await test('3.2 agent-chat fallback: no false approval claim, no fabricated specifics', () => {
    const route = codeOnly(src('src/app/api/agent-chat/route.ts'));
    const gone = [
      'decision state has been updated',
      'Project Lumora',
      '$0.18',
      '80%+',
      'European market shows strong demand',
      'spent all morning analyzing',
      'sprints are on schedule',
      'All systems are green',
    ];
    for (const g of gone) {
      assert.ok(!route.includes(g), `agent-chat fallback still fabricates: ${g}`);
    }
    const raw = src('src/app/api/agent-chat/route.ts');
    assert.ok(raw.includes('degradedNotice'), 'fallback must carry the degraded notice');
    assert.ok(raw.includes('was NOT executed'), 'approval fallback must state the command was NOT executed');
  });

  await test('3.3 server-gateway: no fabricated inspection result or status claims', () => {
    const gateway = codeOnly(src('src/lib/server/sophia/server-gateway.ts'));
    assert.ok(!gateway.includes('Inspection completed'), 'inspection completion claim must be gone');
    assert.ok(!gateway.includes('No security policy violations detected'), 'violation-findings claim must be gone');
    assert.ok(!gateway.includes('All executive workstreams are operating smoothly'), 'fabricated status claim must be gone');
    assert.ok(gateway.includes('No inspection has been executed yet'), 'inspection reply must be honest');
  });

  await test('3.4 web-search fallback: no fake "Search Directory" result (functional)', async () => {
    const realFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      throw new Error('network down (r1 test)');
    };
    try {
      const { searchLiveWeb } = await import('../../src/lib/server/tools/web-search');
      const res = await searchLiveWeb('anything at all');
      assert.strictEqual(res.results.length, 0, 'fallback must return zero results');
      assert.strictEqual(res.source, 'search-unavailable');
    } finally {
      (globalThis as any).fetch = realFetch;
    }
    const source = src('src/lib/server/tools/web-search.ts');
    assert.ok(!codeOnly(source).includes("'Search Directory'"), 'fake source label must be gone');
  });

  // ------------------------------------------------------------------
  // SECTION 4 — ORCHESTRATOR & DOC COPY HONESTY
  // ------------------------------------------------------------------
  console.log('--- 4. Orchestrator and documentation copy ---');

  await test('4.1 council review is a labelled procedural checkpoint, not fabricated consensus', () => {
    const orchestrator = codeOnly(src('src/lib/server/orchestration/orchestrator.ts'));
    assert.ok(!orchestrator.includes('Executive Council Review & Consensus'), 'old fabricated-consensus title must be gone');
    assert.ok(orchestrator.includes('Executive Council Consolidation Checkpoint'), 'honest checkpoint title');
    assert.ok(!orchestrator.includes('Cross-functional consensus achieved'), 'consensus claim must be gone');
    assert.ok(orchestrator.includes('Procedural checkpoint'), 'checkpoint copy must say procedural');
  });

  await test('4.2 unconfigured-response copy no longer blames a GEMINI_API_KEY that gates nothing', () => {
    const orchestrator = codeOnly(src('src/lib/server/orchestration/orchestrator.ts'));
    assert.ok(!orchestrator.includes('GEMINI_API_KEY'), 'stale GEMINI_API_KEY copy must be gone');
    assert.ok(orchestrator.includes('AI Backend Unavailable'), 'honest halt condition copy');
  });

  await test('4.3 README no longer documents the dead tool loop as live', () => {
    const readme = src('README.md');
    assert.ok(!readme.includes('14 tools'), '"14 tools" claim must be gone');
    assert.ok(!readme.includes('the SSE tool loop'), 'architecture map must not list brain.ts as the live loop');
    assert.ok(!readme.includes('SOFIA_LLM_PROVIDER'), 'LLM pin must be gone');
    assert.ok(readme.includes('not a chain'), 'single-provider brain explained');
  });

  await test('4.4 env sample and SETUP doc drop the dead LLM-chain variables', () => {
    const envExample = src('.env.example');
    assert.ok(!/^GEMINI_API_KEY=/m.test(envExample), 'GEMINI_API_KEY entry must be gone');
    assert.ok(!/^LOCAL_LLM_BASE_URL=/m.test(envExample), 'LOCAL_LLM_BASE_URL entry must be gone');
    assert.ok(!/^SOFIA_LLM_PROVIDER=/m.test(envExample), 'LLM pin entry must be gone');
    const setup = src('docs/SETUP.md');
    assert.ok(!setup.includes('SOFIA_LLM_PROVIDER='), 'SETUP LLM pin must be gone');
  });

  await test('4.5 FlowDesktop no longer claims immediate directives use the workflow runtime', () => {
    const flow = src('src/os/components/FlowDesktop.tsx');
    assert.ok(
      !flow.includes('same governed workflow runtime as immediate directives'),
      'inaccurate engine claim must be gone',
    );
    assert.ok(
      flow.includes('two engines sharing the same side-effect authorization gate'),
      'honest two-engine copy present',
    );
  });

  console.log('\n======================================================');
  console.log(`R1 HONESTY SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('R1 suite crashed:', err);
  process.exit(1);
});
