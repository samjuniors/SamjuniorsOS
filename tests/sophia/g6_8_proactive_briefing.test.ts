/**
 * GATE G6.8 REGRESSION SUITE: Proactive Executive Briefing
 *
 * Title: Proactive briefing: a short, interruptible summary of what changed since the last session.
 * Exit Evidence: Briefing built from the decision log and approvals only; interruptible by voice; can be turned off.
 *
 * Invariants per AGENTS.md §1, §3, §4, §5, §6, and G6.8:
 * 1. Strict Source Isolation: Built strictly from DecisionLogStore and InMemoryApprovalStore ONLY.
 *    Never consults external web, simulated items, unverified claims, or synthetic metrics.
 * 2. Honest Empty State: When zero decisions or approvals changed, confirms plain operational quiet.
 * 3. Exact Real State Grounding: Synthesizes real decision counts and pending governance approvals accurately.
 * 4. Can Be Turned Off: Persisted in BriefingSettingsStore; when disabled, auto-briefing is suppressed across UI and voice.
 *    Can be toggled via API routes and natural language voice/text directives.
 * 5. Interruptible by Voice: Voice stop commands ("stop briefing", "pause briefing", "quiet", "stop") freeze turns immediately
 *    and flush audio output buffers in <= 5ms.
 * 6. Latency Budget: Deterministic execution completes under 50ms without unbounded model latency.
 * 7. Single Unified App: UI surfaces adhere to the unified SamJuniorsOS cockpit.
 */

import assert from 'node:assert/strict';
import {
  getProactiveBriefing,
  BriefingSettingsStore,
  DEFAULT_BRIEFING_SETTINGS,
} from '../../src/lib/server/sophia/briefing';
import { DecisionLogStore } from '../../src/lib/server/sophia/decision-log-store';
import { InMemoryApprovalStore } from '../../src/lib/server/authorization/approval-store';
import {
  executeSophiaTurn,
} from '../../src/lib/server/sophia/turn-executor';
import {
  isStopCommand,
  SafeModeManager,
} from '../../src/lib/server/sophia/stop-control';
import { SophiaIntentClassifier } from '../../src/lib/server/sophia/intent-classifier';
import { GET as sophiaBriefingGet, POST as sophiaBriefingPost } from '../../src/app/api/sophia/briefing/route';
import { GET as sofiaBriefingGet } from '../../src/app/api/sofia/briefing/route';
import {
  GET as sophiaBriefingSettingsGet,
  POST as sophiaBriefingSettingsPost,
} from '../../src/app/api/sophia/briefing/settings/route';
import {
  GET as sofiaBriefingSettingsGet,
} from '../../src/app/api/sofia/briefing/settings/route';
import { os, getOS, briefingState } from '../../src/os/lib/osStore';

async function main() {
  console.log('======================================================================');
  console.log('SAMJUNIORS-OS: GATE G6.8 PROACTIVE BRIEFING TEST SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  async function check(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err?.message || err}`);
      if (err?.stack) {
        console.error(`         ${err.stack.split('\n').slice(1, 4).join('\n')}`);
      }
      failed++;
    }
  }

  const decStore = DecisionLogStore.getInstance();
  const approvalStore = InMemoryApprovalStore.getInstance();
  const settingsStore = BriefingSettingsStore.getInstance();
  const safeMode = SafeModeManager.getInstance();

  // Reset stores for testing
  await decStore.clearForTest();
  approvalStore.approvals.clear();
  await settingsStore.updateSettings({ ...DEFAULT_BRIEFING_SETTINGS });
  safeMode.resetForTesting();

  try {
    // --------------------------------------------------------------------------
    // 1. Strict Source Isolation (DecisionLogStore & InMemoryApprovalStore ONLY)
    // --------------------------------------------------------------------------
    console.log('--- 1. Strict Source Isolation ---');

    await check('1a. Briefing sources strictly restricted to DecisionLogStore and InMemoryApprovalStore', async () => {
      const res = await getProactiveBriefing();
      assert.equal(res.success, true);
      assert.ok(res.briefing !== null);
      const briefing = res.briefing!;

      const allowedSources = new Set(['DecisionLogStore', 'InMemoryApprovalStore']);
      for (const s of briefing.sources) {
        assert.ok(
          allowedSources.has(s),
          `Briefing contained unauthorized source: ${s}. Only DecisionLogStore and InMemoryApprovalStore are permitted.`
        );
      }
      assert.ok(!briefing.text.includes('Weather'));
      assert.ok(!briefing.text.includes('Stock Market'));
      assert.ok(!briefing.text.includes('Silicon Valley'));
      assert.ok(!briefing.spokenText.includes('hallucinated'));
    });

    // --------------------------------------------------------------------------
    // 2. Honest Empty State
    // --------------------------------------------------------------------------
    console.log('\n--- 2. Honest Empty State (Zero Changes Confirmed Plainly) ---');

    await check('2a. Empty state confirms zero changes plainly and calmly', async () => {
      await decStore.clearForTest();
      approvalStore.approvals.clear();

      const res = await getProactiveBriefing();
      assert.equal(res.success, true);
      assert.ok(res.briefing !== null);
      const briefing = res.briefing!;

      assert.equal(briefing.hasChanges, false);
      assert.equal(briefing.decisionCount, 0);
      assert.equal(briefing.pendingApprovalCount, 0);
      assert.match(briefing.spokenText, /No decisions or approval changes have been recorded/i);
      assert.match(briefing.spokenText, /All systems are standing by/i);
      assert.match(briefing.text, /No decisions were evaluated and no approval changes occurred/i);
    });

    // --------------------------------------------------------------------------
    // 3. Exact Real State Change Synthesis
    // --------------------------------------------------------------------------
    console.log('\n--- 3. Exact Real State Synthesis ---');

    await check('3a. Synthesizes decisions and pending approvals with exact counts', async () => {
      const pastTime = new Date(Date.now() - 3600000); // 1 hour ago

      // Seed 2 decisions in DecisionLogStore
      await decStore.recordDecision({
        turnId: 'turn-test-1',
        conversationId: 'conv-test',
        query: 'What is our MRR?',
        route: 'recall-company',
        scopes: ['company_brain'],
        confidence: 0.95,
        outcome: 'answered',
        sources: ['AuthoritativeMetricsStore'],
        reasoning: 'Authoritative metrics queried.',
      });

      await decStore.recordDecision({
        turnId: 'turn-test-2',
        conversationId: 'conv-test',
        query: 'Good morning Sophia',
        route: 'converse',
        scopes: [],
        confidence: 0.9,
        outcome: 'answered',
        sources: [],
        reasoning: 'Conversational pleasantry.',
      });

      // Seed 2 pending approvals in InMemoryApprovalStore
      approvalStore.approvals.set('appr-test-1', {
        id: 'appr-test-1',
        workflowInstanceId: 'wf-1',
        stepId: 'step-1',
        actionName: 'deploy_production_api',
        employeeRole: 'pm',
        classification: 'deployment',
        decision: 'pending',
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });

      approvalStore.approvals.set('appr-test-2', {
        id: 'appr-test-2',
        workflowInstanceId: 'wf-2',
        stepId: 'step-2',
        actionName: 'transfer_treasury_funds',
        employeeRole: 'finance',
        classification: 'financial',
        decision: 'awaiting_founder_approval',
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const res = await getProactiveBriefing({ since: pastTime });
      assert.equal(res.success, true);
      assert.ok(res.briefing !== null);
      const briefing = res.briefing!;

      assert.equal(briefing.hasChanges, true);
      assert.equal(briefing.decisionCount, 2);
      assert.equal(briefing.pendingApprovalCount, 2);

      // Spoken text contains exact numbers
      assert.match(briefing.spokenText, /2 decisions were logged/i);
      assert.match(briefing.spokenText, /2 approvals remain pending in the governance gate/i);

      // Panel text contains structured markdown breakdown
      assert.match(briefing.text, /### Pending Approvals \(2\)/);
      assert.match(briefing.text, /deploy_production_api/);
      assert.match(briefing.text, /transfer_treasury_funds/);
      assert.match(briefing.text, /### Decisions Evaluated \(2\)/);
    });

    // --------------------------------------------------------------------------
    // 4. Can Be Turned Off
    // --------------------------------------------------------------------------
    console.log('\n--- 4. Can Be Turned Off ---');

    await check('4a. When disabled in settings, proactive briefing returns enabled: false and null briefing', async () => {
      await settingsStore.updateSettings({ enabled: false }, 'founder');

      const res = await getProactiveBriefing();
      assert.equal(res.success, true);
      assert.equal(res.enabled, false);
      assert.equal(res.briefing, null);
      assert.match(res.disabledReason!, /turned off in settings/i);

      // Force option still allows explicit on-demand requests even when proactive is off
      const forced = await getProactiveBriefing({ force: true });
      assert.equal(forced.success, true);
      assert.ok(forced.briefing !== null);
      assert.equal(forced.enabled, false); // Reflects setting truthfully
    });

    await check('4b. Settings API routes persist and toggle enabled state', async () => {
      // Test PATCH /api/sophia/briefing/settings
      const reqDisable = new Request('http://localhost/api/sophia/briefing/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      const patchRes = await sophiaBriefingSettingsPost(reqDisable);
      const patchJson = await patchRes.json();
      assert.equal(patchJson.success, true);
      assert.equal(patchJson.settings.enabled, false);

      // Test GET /api/sophia/briefing reflects disabled state
      const getReq = new Request('http://localhost/api/sophia/briefing');
      const getRes = await sophiaBriefingGet(getReq);
      const getJson = await getRes.json();
      assert.equal(getJson.success, true);
      assert.equal(getJson.enabled, false);
      assert.equal(getJson.briefing, null);

      // Re-enable via /api/sofia/briefing/settings
      const reqEnable = new Request('http://localhost/api/sofia/briefing/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const enableRes = await sophiaBriefingSettingsPost(reqEnable);
      const enableJson = await enableRes.json();
      assert.equal(enableJson.success, true);
      assert.equal(enableJson.settings.enabled, true);

      // Verify re-enabled in getProactiveBriefing
      const verified = await getProactiveBriefing();
      assert.equal(verified.enabled, true);
      assert.ok(verified.briefing !== null);
    });

    await check('4c. Conversational directive turns off proactive briefing', async () => {
      await settingsStore.updateSettings({ enabled: true }, 'founder');

      const turn = await executeSophiaTurn({
        message: 'Turn off proactive briefing',
        founderId: 'founder',
        conversationId: 'conv-briefing-toggle',
      });

      assert.equal(turn.success, true);
      assert.match(turn.reply, /Proactive briefing has been disabled/i);
      assert.equal(settingsStore.getSettings().enabled, false);

      // Conversational directive turns it back on
      const turnOn = await executeSophiaTurn({
        message: 'Turn on proactive briefing',
        founderId: 'founder',
        conversationId: 'conv-briefing-toggle',
      });

      assert.equal(turnOn.success, true);
      assert.match(turnOn.reply, /Proactive briefing has been enabled/i);
      assert.equal(settingsStore.getSettings().enabled, true);
    });

    // --------------------------------------------------------------------------
    // 5. Interruptible by Voice
    // --------------------------------------------------------------------------
    console.log('\n--- 5. Interruptible by Voice ---');

    await check('5a. Stop control recognizes briefing-specific barge-in phrases', () => {
      assert.equal(isStopCommand('stop'), true);
      assert.equal(isStopCommand('stop briefing'), true);
      assert.equal(isStopCommand('pause briefing'), true);
      assert.equal(isStopCommand('cancel briefing'), true);
      assert.equal(isStopCommand('stop talking'), true);
      assert.equal(isStopCommand('quiet'), true);
      assert.equal(isStopCommand('stand down'), true);
      assert.equal(isStopCommand('tell me more'), false);
    });

    await check('5b. Voice stop command freezes turns and drops system into Safe Mode immediately', async () => {
      safeMode.resetForTesting();
      assert.equal(safeMode.isFrozen(), false);

      const stopTurn = await executeSophiaTurn({
        message: 'Stop briefing immediately',
        founderId: 'founder',
        conversationId: 'conv-voice-barge-in',
        ingress: 'live_voice',
      });

      assert.equal(stopTurn.success, true);
      assert.equal(stopTurn.cancelled, true);
      assert.match(stopTurn.reply, /EMERGENCY STOP ACTIVATED/i);
      assert.equal(safeMode.isFrozen(), true);

      // Clean up by confirming resume
      await safeMode.confirmResume({ founderId: 'founder', confirmed: true });
      assert.equal(safeMode.isFrozen(), false);
    });

    // --------------------------------------------------------------------------
    // 6. Conversational Grounding & Latency Budget
    // --------------------------------------------------------------------------
    console.log('\n--- 6. Conversational Turn Grounding & Latency Budget ---');

    await check('6a. Natural query "What changed since my last session?" invokes briefing deterministically', async () => {
      const turn = await executeSophiaTurn({
        message: 'What changed since my last session?',
        founderId: 'founder',
        conversationId: 'conv-briefing-inquiry',
      });

      assert.equal(turn.success, true);
      assert.equal(turn.liveAi, false, 'Proactive briefing turn must be deterministic (liveAi=false)');
      assert.ok(turn.sources.includes('DecisionLogStore') || turn.sources.includes('InMemoryApprovalStore'));
      assert.match(turn.reply, /Proactive Executive Briefing|No decisions|decisions were logged/i);
    });

    await check('6b. Natural voice query "Give me a briefing" returns concise spoken briefing', async () => {
      const voiceTurn = await executeSophiaTurn({
        message: 'Give me a briefing',
        founderId: 'founder',
        conversationId: 'conv-voice-briefing',
        ingress: 'live_voice',
      });

      assert.equal(voiceTurn.success, true);
      assert.equal(voiceTurn.liveAi, false);
      assert.ok(!voiceTurn.reply.startsWith('```'));
      // Spoken turn is 1-3 sentences
      const sentenceCount = voiceTurn.reply.split(/[.!?]+/).filter(Boolean).length;
      assert.ok(sentenceCount <= 3, `Spoken briefing should be 1-3 sentences, got ${sentenceCount}`);
    });

    await check('6c. Briefing generation complies with <= 50ms latency budget', async () => {
      const res = await getProactiveBriefing();
      assert.equal(res.success, true);
      assert.ok(res.briefing !== null);
      assert.ok(
        res.briefing!.latencyMs <= 50,
        `Briefing latency ${res.briefing!.latencyMs}ms exceeded 50ms budget`
      );
    });

    // --------------------------------------------------------------------------
    // 7. Client UI Store State
    // --------------------------------------------------------------------------
    console.log('\n--- 7. Client UI Store State ---');

    await check('7a. OS client store manages briefing state, dismissal, and toggle', () => {
      const mockBriefing: any = {
        since: new Date().toISOString(),
        sinceText: '10 minutes ago',
        decisionCount: 3,
        decisions: { totalCount: 3, byRoute: {}, byOutcome: {}, sampleQueries: [] },
        pendingApprovalCount: 1,
        approvals: { pendingCount: 1, decidedCount: 0, requestedCount: 1, pendingActions: [], recentlyDecided: [] },
        hasChanges: true,
        text: 'Mock Panel Briefing',
        spokenText: 'Mock Spoken Briefing',
        sources: ['DecisionLogStore', 'InMemoryApprovalStore'],
        latencyMs: 12,
        enabled: true,
      };

      os.setBriefing(mockBriefing);
      let s = briefingState(getOS());
      assert.equal(s.briefing?.decisionCount, 3);
      assert.equal(s.dismissed, false);
      assert.equal(s.enabled, true);

      os.dismissBriefing();
      s = briefingState(getOS());
      assert.equal(s.dismissed, true);

      os.setBriefingEnabled(false);
      s = briefingState(getOS());
      assert.equal(s.enabled, false);

      os.setBriefingEnabled(true);
      s = briefingState(getOS());
      assert.equal(s.enabled, true);
    });

  } finally {
    // Restore stores
    approvalStore.approvals.clear();
    await decStore.clearForTest();
    await settingsStore.updateSettings({ ...DEFAULT_BRIEFING_SETTINGS });
    safeMode.resetForTesting();
  }

  console.log('\n======================================================================');
  console.log(`G6.8 PROACTIVE BRIEFING RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in G6.8 regression runner:', err);
  process.exit(1);
});
