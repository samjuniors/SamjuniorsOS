import assert from 'assert';
import fs from 'fs';
import path from 'path';

/**
 * ============================================================================
 * GATE G3.2: OWASP AGENTIC & LLM THREAT MODEL VALIDATION SUITE
 * ============================================================================
 *
 * Verifies that the canonical threat model document:
 * 1. Exists at docs/security/OWASP_AGENTIC_AND_LLM_THREAT_MODEL.md.
 * 2. Covers all 10 OWASP Agentic Top 10 categories (ASI01 through ASI10).
 * 3. Covers all 10 OWASP LLM Top 10 (2026 Edition) categories (LLM01 through LLM10).
 * 4. Incorporates the OWASP Agent Control Standard (ACS v0.1 preview) as design reference.
 * 5. Contains an explicit Accepted Risks ledger with Founder sign-off references.
 * 6. Every cited repository source code file and test suite actually exists on disk.
 */

const ROOT = path.resolve(__dirname, '../..');
const THREAT_MODEL_PATH = path.join(ROOT, 'docs/security/OWASP_AGENTIC_AND_LLM_THREAT_MODEL.md');

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

async function runTests() {
  console.log('\n======================================================');
  console.log('GATE G3.2: OWASP AGENTIC & LLM THREAT MODEL TEST SUITE');
  console.log('======================================================\n');

  await test('Threat model document exists and is substantial', () => {
    assert(fs.existsSync(THREAT_MODEL_PATH), `Threat model not found at ${THREAT_MODEL_PATH}`);
    const content = fs.readFileSync(THREAT_MODEL_PATH, 'utf-8');
    assert(content.length > 5000, `Threat model is too brief (${content.length} bytes)`);
  });

  const content = fs.existsSync(THREAT_MODEL_PATH) ? fs.readFileSync(THREAT_MODEL_PATH, 'utf-8') : '';

  await test('Covers all OWASP Agentic Top 10 (ASI01 - ASI10)', () => {
    const asiCodes = [
      'ASI01', 'ASI02', 'ASI03', 'ASI04', 'ASI05',
      'ASI06', 'ASI07', 'ASI08', 'ASI09', 'ASI10'
    ];
    for (const code of asiCodes) {
      assert(content.includes(code), `Missing Agentic threat category: ${code}`);
    }
  });

  await test('Covers all OWASP LLM Top 10 2026 Edition (LLM01 - LLM10)', () => {
    const llmCodes = [
      'LLM01', 'LLM02', 'LLM03', 'LLM04', 'LLM05',
      'LLM06', 'LLM07', 'LLM08', 'LLM09', 'LLM10'
    ];
    for (const code of llmCodes) {
      assert(content.includes(code), `Missing LLM threat category: ${code}`);
    }
  });

  await test('References OWASP Agent Control Standard (ACS v0.1 preview) as design reference', () => {
    assert(
      content.includes('Agent Control Standard') || content.includes('ACS'),
      'Must reference OWASP Agent Control Standard'
    );
    assert(
      content.includes('Guardian'),
      'Must analyze the ACS Guardian architecture'
    );
  });

  await test('Contains explicit Accepted Risks ledger with Founder sign-off', () => {
    assert(
      content.includes('Accepted Risks Ledger') || content.includes('Accepted Risk'),
      'Must contain an Accepted Risks ledger'
    );
    assert(
      content.includes('Founder Directive') || content.includes('Founder Sign-Off'),
      'Accepted risks must reference Founder sign-off'
    );
  });

  await test('All referenced source files in the threat model exist in repository', () => {
    const citedSourceFiles = [
      'src/lib/server/workflow/runtime.ts',
      'src/lib/server/sophia/authority-content-guard.ts',
      'src/lib/skills/skill-registry.ts',
      'src/lib/server/tools/providers/composio.ts',
      'src/lib/server/authorization/payload-binding.ts',
      'src/lib/server/authorization/policy-evaluator.ts',
      'src/lib/server/authorization/gate.ts',
      'src/lib/server/net.ts',
      'src/lib/server/sophia/memory-gate.ts',
      'src/lib/server/decision/lifecycle.ts',
      'src/lib/server/workflow/state-machine.ts',
      'src/lib/server/coordination/lease-manager.ts',
      'src/lib/server/graph/read-model.ts',
      'src/lib/server/retrieval/fact-read-model.ts',
      'src/lib/server/workflow/scheduler.ts',
      'src/proxy.ts',
      'src/lib/server/retrieval/temporal-semantics.ts',
      'src/lib/server/providers.ts',
    ];

    for (const relPath of citedSourceFiles) {
      const fullPath = path.join(ROOT, relPath);
      assert(fs.existsSync(fullPath), `Cited source file does not exist: ${relPath}`);
    }
  });

  await test('All referenced test suites in the threat model exist in repository', () => {
    const citedTestSuites = [
      'tests/sophia/m3_authority_hardening.test.ts',
      'tests/sophia/g3_1_auth_gaps.test.ts',
      'tests/decision/phase2_1_1_hardening.test.ts',
      'tests/scheduler/phase4_4b1_governance.test.ts',
      'tests/sophia/g1_6_reproducible_install.test.ts',
      'tests/sophia/phase4_governance_hardening.test.ts',
      'tests/scheduler/phase4_4a_heartbeat.test.ts',
      'tests/sophia/m4a_hardening.test.ts',
      'tests/sophia/m1_batch1_memory_authority.test.ts',
      'tests/sophia/k2_personal_memory.test.ts',
      'tests/decision/workflow_capability_token.test.ts',
      'tests/sophia/g1_5_honest_fallback_labeling.test.ts',
      'tests/sophia/realtime_governance_audit.test.ts',
      'tests/phase4_3a_graph_read_model.test.ts',
      'tests/sophia/m1_canonical_state_authority.test.ts',
      'tests/sophia/m2_knowledge_persistence.test.ts',
      'tests/sophia/m53_authoritative_read_model.test.ts',
      'tests/sophia/m4a_memory_capture.test.ts',
      'tests/sophia/phase3_step6_gateway_security.test.ts',
      'tests/scheduler/phase4_4b_lifecycle.test.ts',
      'tests/orchestration/council_deliberation.test.ts',
      'tests/sophia/m54_scenario_contracts.test.ts',
      'tests/sophia/phase1_conversational_executive.test.ts',
      'tests/sophia/m4c_query_conditioned_retrieval.test.ts',
      'tests/sophia/m52_retrieval_hygiene.test.ts',
    ];

    for (const relPath of citedTestSuites) {
      const fullPath = path.join(ROOT, relPath);
      assert(fs.existsSync(fullPath), `Cited test suite does not exist: ${relPath}`);
    }
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
