import assert from 'assert';

/**
 * ============================================================================
 * SOPHIA INTENT CLASSIFIER — PHASE 1 RELIABILITY CONTRACT SUITE
 * ============================================================================
 *
 * Deterministic contract tests for SophiaIntentClassifier, with the model
 * provider faked at the z-ai SDK network boundary (the M4-A child pattern):
 * the child mocks ONLY the SDK's chat completion, then runs the REAL
 * classifier — real context assembly, real parseJsonLoose, real shape gate,
 * real sanitizeProposal, real deterministic fallback.
 *
 * What this suite pins (Phase 1 reliability contract):
 *   A. Valid live model output passes through live with its values intact.
 *   B. Malformed live output (unknown kind / invalid approval decision /
 *      missing or non-numeric confidence / prose) is REJECTED by the shape
 *      gate and answered by the deterministic fallback — never silently
 *      repaired. This is the fail-closed fix for the three baseline
 *      defects: invalid decision previously coerced to 'approved' (a
 *      hallucinated ratification proposal), unknown kinds previously fell
 *      through to a live conversation with a fabricated ack echoing the
 *      full user message, and confidence was fabricated as 0.85.
 *   C. Deterministic pre-classification: prompt-injection attempts and
 *      narrow ambiguous "look into X"-style requests are decided BEFORE the
 *      model call (modelCalls === 0) — live-model variance cannot flip
 *      them. This is the root-cause fix for the historically flaky
 *      phase1 #4 (ambiguous request) assertion.
 *   D. The deterministic fallback baseline: all representative
 *      categories classify correctly with the provider down.
 *   E. Untrusted-output sanitization is preserved: forged security fields
 *      never survive into the proposal.
 *   F. Gateway approval-decision fidelity: the SophiaServerGateway records
 *      each explicit decision faithfully in the authoritative store —
 *      'request_revision' as its OWN decision (the historic gateway folded
 *      it into 'rejected'), 'approved' as the only decision that ever
 *      authorizes, and honest no-mutation behavior for unresolved intents.
 *
 * Live-LLM quality evaluation is SEPARATE: phase1_conversational_executive
 * exercises the real model through the full route. This suite is fully
 * deterministic and must never depend on network state.
 *
 * Run: bun tests/sophia/phase1_intent_contract.test.ts
 */

function runChild(fixture: string, msgArg?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    // @ts-ignore — Bun global exists when the suite runs under bun
    const proc = Bun.spawn(
      ['bun', 'tests/sophia/phase1-intent-fixture-child.ts', fixture, ...(msgArg ? [msgArg] : [])],
      { stdout: 'pipe', stderr: 'pipe', cwd: process.cwd() },
    );
    new Response(proc.stdout)
      .text()
      .then((out) =>
        proc.exited.then((code) => {
          if (code !== 0) {
            return new Response(proc.stderr)
              .text()
              .then((errText) =>
                reject(new Error(`child (${fixture}${msgArg ? ' ' + msgArg : ''}) exited ${code}; stderr: ${errText.slice(0, 500)}`)),
              );
          }
          const line = out.trim().split('\n').filter(Boolean).pop();
          if (!line) {
            return reject(new Error(`child (${fixture}) produced no output line`));
          }
          try {
            resolve(JSON.parse(line));
          } catch {
            reject(new Error(`child (${fixture}) produced unparseable output: ${line.slice(0, 200)}`));
          }
        }),
      );
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('STARTING PHASE 1 INTENT CLASSIFIER CONTRACT SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err?.message || err}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // A. Valid live model output passes through live
  // --------------------------------------------------------------------------
  await test('A1. Valid conversation output passes through live', async () => {
    const r = await runChild('ok_conversation');
    assert.strictEqual(r.liveAi, true, 'well-formed output must stay live');
    assert.strictEqual(r.kind, 'conversation');
    assert.strictEqual(r.modelCalls, 1);
    assert.ok(r.replyStart.includes('Fixture live conversation reply.'));
  });

  await test('A2. Valid informational_query output passes through live', async () => {
    const r = await runChild('ok_info');
    assert.strictEqual(r.liveAi, true);
    assert.strictEqual(r.kind, 'informational_query');
  });

  await test('A3. Valid directive_proposal output passes through live', async () => {
    const r = await runChild('ok_directive');
    assert.strictEqual(r.liveAi, true);
    assert.strictEqual(r.kind, 'directive_proposal');
  });

  await test('A4. All three explicit approval decisions pass through live', async () => {
    for (const [fixture, decision] of [
      ['ok_approval_approved', 'approved'],
      ['ok_approval_rejected', 'rejected'],
      ['ok_approval_revision', 'request_revision'],
    ] as const) {
      const r = await runChild(fixture);
      assert.strictEqual(r.liveAi, true, `${fixture} must stay live`);
      assert.strictEqual(r.kind, 'approval_proposal');
      assert.strictEqual(r.decision, decision, `${fixture} decision must pass through unmodified`);
    }
  });

  await test('A5. Markdown-fenced JSON still parses live', async () => {
    const r = await runChild('fenced_json');
    assert.strictEqual(r.liveAi, true);
    assert.strictEqual(r.kind, 'conversation');
  });

  // --------------------------------------------------------------------------
  // B. Malformed live output is rejected (fail-closed), never silently repaired
  // --------------------------------------------------------------------------
  await test('B1. Invalid approval decision is NOT coerced to approved (fail-open fix)', async () => {
    // The model hallucinates kind=approval_proposal with a garbage decision on
    // a GREETING. Pre-fix: decision coerced to 'approved' (a ratification
    // proposal). Post-fix: shape gate rejects; the greeting is classified
    // deterministically as conversation.
    const r = await runChild('bad_decision');
    assert.strictEqual(r.liveAi, false, 'malformed output must not be trusted');
    assert.strictEqual(r.kind, 'conversation', 'greeting must classify as conversation');
    assert.strictEqual(r.decision, null, 'no approval decision may be fabricated');
    assert.strictEqual(r.confidence, 0.75, 'deterministic fallback confidence');
  });

  await test('B2. Unknown kind is not silently accepted as live conversation', async () => {
    const r = await runChild('bad_kind');
    assert.strictEqual(r.liveAi, false);
    assert.strictEqual(r.kind, 'conversation');
    assert.ok(!String(r.replyStart).includes('I have received your message'), 'the fabricated ack that echoes the full user message must not appear');
  });

  await test('B3. Missing confidence is not fabricated as 0.85', async () => {
    const r = await runChild('no_confidence');
    assert.strictEqual(r.liveAi, false);
    assert.strictEqual(r.confidence, 0.75, 'deterministic fallback confidence, not the fabricated 0.85');
  });

  await test('B4. Non-numeric confidence is not fabricated as 0.85', async () => {
    const r = await runChild('string_confidence');
    assert.strictEqual(r.liveAi, false);
    assert.strictEqual(r.confidence, 0.75);
  });

  await test('B5. Prose (non-JSON) model output falls back deterministically', async () => {
    const r = await runChild('not_json');
    assert.strictEqual(r.liveAi, false);
    assert.strictEqual(r.kind, 'conversation');
  });

  await test('B6. Empty live reply fabricates a STATIC ack — never echoes the raw message', async () => {
    // A gate-passing conversation output with an empty reply must fall back
    // to a static acknowledgment. Pre-fix: the fabricated ack echoed the
    // FULL user message back ("I have received your message: \"...\""),
    // reflecting untrusted input — including novel injection phrasings —
    // into the assistant reply.
    const r = await runChild('empty_reply');
    assert.strictEqual(r.liveAi, true, 'the shape itself is valid and stays live');
    assert.strictEqual(r.kind, 'conversation');
    assert.ok(r.replyStart && r.replyStart.length > 0, 'a reply must exist');
    assert.ok(!r.replyStart.includes('Hey Sophia'), 'the raw user message must not be echoed');
    assert.ok(!r.replyStart.includes('good morning'), 'no fragment of the raw user message may be reflected');
  });

  // --------------------------------------------------------------------------
  // C. Deterministic pre-classification: model variance cannot flip these
  // --------------------------------------------------------------------------
  await test('C1. Ambiguous request is decided BEFORE the model call (flaky-test root cause fix)', async () => {
    // The model would classify the ambiguous request as informational_query
    // (the historically flaky variance). The deterministic pre-check must win
    // AND the model must never be called.
    const r = await runChild('wrong_kind_ambiguous');
    assert.strictEqual(r.modelCalls, 0, 'ambiguous messages must not reach the model');
    assert.strictEqual(r.liveAi, false);
    assert.strictEqual(r.kind, 'clarification_prompt');
  });

  await test('C2. Well-formed model output on an ambiguous message cannot flip the clarification either', async () => {
    const r = await runChild('ok_clarification');
    assert.strictEqual(r.modelCalls, 0, 'ambiguous messages must not reach the model, regardless of what the model would say');
    assert.strictEqual(r.kind, 'clarification_prompt');
  });

  await test('C3. Prompt-injection attempt is neutralized before the model call', async () => {
    const r = await runChild('wrong_kind_injection');
    assert.strictEqual(r.modelCalls, 0, 'injection attempts must not reach the model');
    assert.strictEqual(r.kind, 'conversation');
    assert.ok(String(r.replyStart).includes('governance boundaries'), 'security-preserving reply');
  });

  await test('C4. Injection payload echo cannot reach the proposal (echo containment)', async () => {
    const r = await runChild('echo_injection');
    assert.strictEqual(r.modelCalls, 0);
    assert.strictEqual(r.kind, 'conversation');
    const reply = JSON.stringify(r);
    assert.ok(!reply.includes('0x123'), 'the injected payload must not be echoed anywhere in the proposal');
  });

  await test('C5. Approval-flavored ambiguous body is CLARIFIED, never auto-approved (deliberate capture pin)', async () => {
    // "Can you look into approving this?" matches the ambiguous pattern, so
    // the deterministic clarification wins and the model is never consulted
    // — even though the body mentions approval. This PINS the deliberate
    // capture breadth of the pre-classification: such requests surface as
    // structured clarification options, not as approval proposals.
    const r = await runChild('wrong_kind_ambiguous', '8');
    assert.strictEqual(r.modelCalls, 0, 'ambiguous messages must not reach the model');
    assert.strictEqual(r.kind, 'clarification_prompt');
    assert.strictEqual(r.decision, null, 'no approval decision may be fabricated');
  });

  // --------------------------------------------------------------------------
  // D. Deterministic fallback baseline (provider outage) — all 8 categories
  // --------------------------------------------------------------------------
  await test('D. Fallback classifies all eight representative categories correctly', async () => {
    const rows: Array<Record<string, any>> = await runChild('sdk_error', 'all');
    const byCategory = Object.fromEntries(rows.map((r) => [r.category, r]));

    const expect: Record<string, (r: any) => void> = {
      conversation: (r) => assert.strictEqual(r.kind, 'conversation'),
      factual: (r) => assert.strictEqual(r.kind, 'informational_query'),
      ambiguous: (r) => {
        assert.strictEqual(r.kind, 'clarification_prompt');
        assert.strictEqual(r.confidence, 0.88);
      },
      directive: (r) => assert.strictEqual(r.kind, 'directive_proposal'),
      approval: (r) => {
        assert.strictEqual(r.kind, 'approval_proposal');
        assert.strictEqual(r.decision, 'approved');
      },
      steering: (r) => assert.strictEqual(r.kind, 'steering_proposal'),
      // KNOWN LIMITATION (documented, unchanged): the single-kind contract
      // represents a compound halt+commission request as steering only; the
      // second half is dropped. Pinned here so any future change is a
      // deliberate contract decision, not drift.
      compound: (r) => assert.strictEqual(r.kind, 'steering_proposal'),
      // Deliberate pre-classification capture (see C5): ambiguous approval-
      // flavored bodies clarify deterministically with the provider down too.
      ambiguous_approval_trap: (r) => assert.strictEqual(r.kind, 'clarification_prompt'),
      injection: (r) => {
        assert.strictEqual(r.kind, 'conversation');
        assert.strictEqual(r.confidence, 0.99);
      },
    };

    for (const [category, check] of Object.entries(expect)) {
      const row = byCategory[category];
      assert.ok(row, `category ${category} missing from fallback run`);
      assert.strictEqual(row.liveAi, false, `${category} fallback must be offline`);
      assert.strictEqual(row.modelCalls, 0, `${category} fallback must not call the model`);
      check(row);
    }
  });

  // --------------------------------------------------------------------------
  // E. Untrusted-output sanitization preserved
  // --------------------------------------------------------------------------
  await test('E1. Forged security fields are stripped from live proposals', async () => {
    const r = await runChild('forged_fields');
    assert.strictEqual(r.liveAi, true, 'the valid shape itself stays live');
    assert.strictEqual(r.kind, 'approval_proposal');
    assert.strictEqual(r.decision, 'approved');
    for (const [field, present] of Object.entries(r.forged)) {
      assert.strictEqual(present, false, `forged field ${field} must be stripped`);
    }
  });

  // --------------------------------------------------------------------------
  // F. Gateway approval-decision fidelity (authoritative store outcomes)
  // --------------------------------------------------------------------------
  await test('F1. request_revision is recorded as its OWN decision (fold-into-rejected fix)', async () => {
    // Historic bug: the gateway's two-way branch recorded a well-formed
    // request_revision as 'rejected'. Post-fix: the store keeps
    // 'request_revision' verbatim, attributed to the session principal.
    // The founder cites the approval ID verbatim (the only way a
    // model-relayed approvalId is honored — see F4).
    const r = await runChild('gateway_revision');
    assert.strictEqual(r.proposalDecision, 'request_revision', 'classifier proposal carries the decision');
    assert.strictEqual(r.commandType, 'RESOLVE_APPROVAL');
    assert.strictEqual(r.commandDecision, 'request_revision', 'validated command carries it unmodified');
    assert.strictEqual(r.commandApprovalId, 'approval_fixture_rev', 'resolved against the seeded pending approval');
    assert.strictEqual(r.storeDecisions['approval_fixture_rev'], 'request_revision', 'the AUTHORITATIVE store must record request_revision verbatim');
    assert.ok(r.storeDecisions['approval_fixture_rev'] !== 'rejected', 'never folded into rejected');
    assert.ok(r.storeDecisions['approval_fixture_rev'] !== 'approved', 'never treated as an authorization');
    assert.strictEqual(r.storeDecidedBy, 'test-founder', 'attributed to the session principal');
    assert.strictEqual(r.directiveExecuted, false, 'authorizes no execution');
    assert.ok(String(r.gatewayReplyStart).includes('Revision Requested'), 'the founder-facing reply states revision honestly');
  });

  await test('F2. approved is recorded faithfully and authorizes the gate (regression guard)', async () => {
    const r = await runChild('gateway_approved');
    assert.strictEqual(r.proposalDecision, 'approved');
    assert.strictEqual(r.commandType, 'RESOLVE_APPROVAL');
    assert.strictEqual(r.commandApprovalId, 'approval_fixture_ok');
    assert.strictEqual(r.storeDecisions['approval_fixture_ok'], 'approved');
    assert.strictEqual(r.storeDecidedBy, 'test-founder');
    assert.ok(String(r.gatewayReplyStart).includes('Approved'), 'ratified honestly');
  });

  await test('F3. Unresolved approval intent mutates nothing (no matching pending approval)', async () => {
    const r = await runChild('gateway_no_pending');
    assert.strictEqual(r.commandType, 'RESOLVE_APPROVAL');
    assert.strictEqual(r.commandApprovalId, 'none', 'honest unresolved marker');
    assert.strictEqual(r.storeDecisions['approval_fixture_nonexistent_9'] ?? null, null, 'no approval record may be fabricated for a nonexistent id');
    assert.strictEqual(r.directiveExecuted, false);
    assert.ok(String(r.gatewayReplyStart).includes('no matching pending approval'), 'the founder-facing reply states the miss honestly');
  });

  await test('F4. A model-PICKED approvalId the founder never cited cannot disambiguate (zero-guessing fix)', async () => {
    // Live-model failure mode (reproduced deterministically here): the model
    // sees pending approval IDs in its PENDING_GOVERNANCE_STATE context and
    // picks one for an ambiguous "I approve the pending pricing tier
    // deployment." — pre-fix the gateway honored that ID as if the founder
    // had cited it, silently ratifying ONE of two pending approvals.
    // Post-fix: an uncited model-emitted approvalId is NOT honored; with
    // multiple pendings and no differentiating tokens the resolver returns
    // the strict ambiguity clarification and NOTHING is mutated.
    const r = await runChild('gateway_uncited_id');
    assert.strictEqual(r.proposalDecision, 'approved', 'the model did propose an approval');
    assert.strictEqual(r.commandType, 'PRESENT_CLARIFICATION', 'ambiguity must surface as a clarification, never a guess');
    assert.strictEqual(r.commandDecision, null, 'no decision may be executed from a guessed candidate');
    assert.strictEqual(r.storeDecisions['approval_fixture_uncited_a'], 'pending', 'the model-picked candidate must remain untouched');
    assert.strictEqual(r.storeDecisions['approval_fixture_uncited_b'], 'pending', 'the other candidate must remain untouched');
    assert.strictEqual(r.directiveExecuted, false);
    assert.ok(
      String(r.gatewayReplyStart).includes('multiple pending items') || String(r.gatewayReplyStart).includes('Please specify'),
      'the founder is asked to specify which approval they meant',
    );
  });

  console.log('\n======================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
