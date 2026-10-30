/**
 * GATE G6.6 REGRESSION SUITE: Greeting on Open Grounded in Real State
 *
 * Title: Greeting on open, grounded in real state: time, last session, pending approvals, alerts. It never invents.
 * Exit Evidence: On opening the app Sofia greets within the latency budget using only real state;
 * with no state she greets plainly; tested with empty and full state. First check whether any
 * greeting behaviour already exists (NOT VERIFIED today).
 *
 * Invariants per AGENTS.md §1, §3, §6:
 * 1. Zero state invented: Greeting must never hallucinate numbers, activities, or metrics.
 * 2. Empty state must greet plainly and honestly.
 * 3. Real state must accurately reflect pending approvals, active workstreams, alerts, and time.
 * 4. Latency budget: Greeting must generate deterministically under 50ms without unbounded LLM roundtrips.
 * 5. Single unified app: OS desktop/cockpit is the primary surface; Design specimen tab removed from OS UI.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSofiaGreeting } from '../../src/lib/server/sophia/greeting';
import { InMemoryApprovalStore } from '../../src/lib/server/authorization/approval-store';
import { AgentRunStore } from '../../src/lib/server/agents/run-store';
import { GET as sophiaGreetingRoute } from '../../src/app/api/sophia/greeting/route';
import { GET as sofiaGreetingRoute } from '../../src/app/api/sofia/greeting/route';
import { os, getOS, greetingState } from '../../src/os/lib/osStore';

async function main() {
  console.log('======================================================================');
  console.log('SAMJUNIORS-OS: GATE G6.6 GREETING ON OPEN REGRESSION SUITE');
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

  const approvalStore = InMemoryApprovalStore.getInstance();
  const runStore = AgentRunStore.getInstance();

  // Backup existing store state
  const backupApprovals = new Map(approvalStore.approvals);
  const backupRuns = new Map((runStore as any).runs);

  try {
    // --------------------------------------------------------------------------
    // 1. Empty State Greeting (No state invented)
    // --------------------------------------------------------------------------
    console.log('--- 1. Empty State Greeting (Zero State Invented) ---');
    approvalStore.approvals.clear();
    (runStore as any).runs.clear();

    await check('1a. Empty state greeting hasRealState is false when no approvals or runs exist', async () => {
      const greeting = await getSofiaGreeting({ clientHour: 9 });
      assert.equal(greeting.hasRealState, false, 'hasRealState must be false for empty state');
      assert.equal(greeting.stateSummary.pendingApprovalsCount, 0);
      assert.equal(greeting.stateSummary.activeWorkstreamsCount, 0);
      assert.match(greeting.text, /Good morning, Founder/);
      assert.match(greeting.text, /Systems are calm, no approvals are pending/);
      assert.ok(!greeting.text.includes('undefined') && !greeting.text.includes('null'));
    });

    await check('1b. Empty state greeting carries deterministic fallback and company_brain scope', async () => {
      const greeting = await getSofiaGreeting();
      assert.equal(greeting.liveAi, false, 'Initial state greeting must be deterministic (liveAi=false)');
      assert.equal(greeting.fallback, true, 'Deterministic greeting must indicate fallback: true');
      assert.ok(greeting.scopes.includes('company_brain'));
    });

    // --------------------------------------------------------------------------
    // 2. Full State Greeting (Reflects exact reality)
    // --------------------------------------------------------------------------
    console.log('\n--- 2. Full State Greeting (Exact Real State) ---');

    const app1Id = `appr-test-${Date.now()}-1`;
    const app2Id = `appr-test-${Date.now()}-2`;
    approvalStore.approvals.set(app1Id, {
      id: app1Id,
      workflowInstanceId: 'wf-1',
      stepId: 'step-1',
      actionName: 'deploy_code',
      employeeRole: 'pm',
      classification: 'deployment',
      decision: 'pending',
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    approvalStore.approvals.set(app2Id, {
      id: app2Id,
      workflowInstanceId: 'wf-2',
      stepId: 'step-2',
      actionName: 'charge_card',
      employeeRole: 'finance',
      classification: 'financial_mutation',
      decision: 'pending',
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    const run1Id = `run-test-${Date.now()}`;
    await runStore.saveRun({
      runId: run1Id,
      directive: 'Audit market landscape',
      protocolStep: 'research',
      status: 'running',
      agentId: 'thorne',
      agentName: 'Dr. Aris Thorne',
      taskTitle: 'Market Landscape',
      durationMs: 120,
      outputContent: 'In progress',
      timestamp: new Date().toISOString(),
    });

    await check('2a. Full state greeting hasRealState is true and reflects exact counts', async () => {
      const greeting = await getSofiaGreeting({ clientHour: 14 });
      assert.equal(greeting.hasRealState, true, 'hasRealState must be true when pending approvals exist');
      assert.equal(greeting.stateSummary.pendingApprovalsCount, 2);
      assert.equal(greeting.stateSummary.activeWorkstreamsCount, 1);
      assert.match(greeting.text, /Good afternoon, Founder/);
      assert.match(greeting.text, /2 approvals awaiting your review/);
      assert.match(greeting.text, /1 active multi-agent workstream in flight/);
    });

    // --------------------------------------------------------------------------
    // 3. Time Grounding (Morning, Afternoon, Evening)
    // --------------------------------------------------------------------------
    console.log('\n--- 3. Time Grounding ---');

    await check('3a. Morning greeting hour (hour 8) produces "Good morning"', async () => {
      const res = await getSofiaGreeting({ clientHour: 8 });
      assert.equal(res.stateSummary.timeOfDay, 'morning');
      assert.match(res.text, /Good morning, Founder/);
    });

    await check('3b. Afternoon greeting hour (hour 14) produces "Good afternoon"', async () => {
      const res = await getSofiaGreeting({ clientHour: 14 });
      assert.equal(res.stateSummary.timeOfDay, 'afternoon');
      assert.match(res.text, /Good afternoon, Founder/);
    });

    await check('3c. Evening greeting hour (hour 20) produces "Good evening"', async () => {
      const res = await getSofiaGreeting({ clientHour: 20 });
      assert.equal(res.stateSummary.timeOfDay, 'evening');
      assert.match(res.text, /Good evening, Founder/);
    });

    // --------------------------------------------------------------------------
    // 4. Last Session Grounding
    // --------------------------------------------------------------------------
    console.log('\n--- 4. Last Session Grounding ---');

    await check('4a. Last session 15 minutes ago reports relative minutes', async () => {
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const res = await getSofiaGreeting({ lastSessionAt: fifteenMinsAgo });
      assert.equal(res.stateSummary.lastSessionText, '15 minutes ago');
      assert.match(res.text, /Last session was 15 minutes ago/);
    });

    await check('4b. Last session 3 hours ago reports relative hours', async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      const res = await getSofiaGreeting({ lastSessionAt: threeHoursAgo });
      assert.equal(res.stateSummary.lastSessionText, '3 hours ago');
      assert.match(res.text, /Last session was 3 hours ago/);
    });

    await check('4c. No last session provided produces no phantom session mention', async () => {
      const res = await getSofiaGreeting({ lastSessionAt: null });
      assert.equal(res.stateSummary.lastSessionText, null);
      assert.ok(!res.text.includes('Last session was'));
    });

    // --------------------------------------------------------------------------
    // 5. Latency Budget Enforcement (<= 50ms)
    // --------------------------------------------------------------------------
    console.log('\n--- 5. Latency Budget Enforcement ---');

    await check('5a. Greeting generates deterministically within latency budget (<= 50ms)', async () => {
      const res = await getSofiaGreeting();
      assert.ok(typeof res.latencyMs === 'number', 'latencyMs must be a number');
      assert.ok(res.latencyMs >= 0, 'latencyMs must be non-negative');
      assert.ok(res.latencyMs <= 50, `latencyMs (${res.latencyMs}ms) must be within budget (<= 50ms)`);
    });

    // --------------------------------------------------------------------------
    // 6. API Route Contracts (/api/sophia/greeting & /api/sofia/greeting)
    // --------------------------------------------------------------------------
    console.log('\n--- 6. API Route Contracts ---');

    await check('6a. /api/sophia/greeting returns valid JSON with grounded state and latency', async () => {
      const req = {
        url: 'http://localhost:3000/api/sophia/greeting?clientHour=10&lastSessionAt=' + encodeURIComponent(new Date(Date.now() - 10 * 60000).toISOString()),
      } as any;
      const res = await sophiaGreetingRoute(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.text);
      assert.equal(json.stateSummary.timeOfDay, 'morning');
      assert.equal(json.stateSummary.lastSessionText, '10 minutes ago');
      assert.ok(json.latencyMs <= 50);
    });

    await check('6b. /api/sofia/greeting route handler also returns valid JSON with identical contract', async () => {
      const req = {
        url: 'http://localhost:3000/api/sofia/greeting?clientHour=16',
      } as any;
      const res = await sofiaGreetingRoute(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.stateSummary.timeOfDay, 'afternoon');
    });

    // --------------------------------------------------------------------------
    // 7. Client Store State & Selectors
    // --------------------------------------------------------------------------
    console.log('\n--- 7. Client Store State & Selectors ---');

    check('7a. os.setGreeting and os.dismissGreeting manage greeting visibility cleanly', () => {
      const mockGreeting = {
        text: 'Good afternoon, Founder.',
        hasRealState: false,
        stateSummary: {
          pendingApprovalsCount: 0,
          activeWorkstreamsCount: 0,
          openAlertsCount: 0,
          openAlerts: [],
          mrr: null,
          runwayMonths: null,
          timeOfDay: 'afternoon' as const,
          formattedTime: '02:00 PM',
          lastSessionAt: null,
          lastSessionText: null,
        },
        latencyMs: 1.5,
        liveAi: false,
        fallback: true,
        scopes: ['company_brain'],
        sources: ['InMemoryApprovalStore'],
      };

      os.setGreeting(mockGreeting);
      const s1 = greetingState(getOS());
      assert.equal(s1.greeting?.text, 'Good afternoon, Founder.');
      assert.equal(s1.dismissed, false);

      os.dismissGreeting();
      const s2 = greetingState(getOS());
      assert.equal(s2.dismissed, true);
    });

    // --------------------------------------------------------------------------
    // 8. Static Architecture & Invariant Checks
    // --------------------------------------------------------------------------
    console.log('\n--- 8. Static UI Unification & Invariant Checks ---');

    check('8a. App.tsx defaults tab to "os" (Cockpit)', () => {
      const appCode = readFileSync(join(process.cwd(), 'src/os/App.tsx'), 'utf8');
      assert.match(appCode, /useState<Tab>\("os"\)/, 'App.tsx must default tab to "os" so user lands in Cockpit');
    });

    check('8b. App.tsx removes Design specimen button from top mode switcher', () => {
      const appCode = readFileSync(join(process.cwd(), 'src/os/App.tsx'), 'utf8');
      assert.ok(!appCode.includes('title="Open the workflow design-system specimen"'), 'Design button must be removed from App.tsx');
      assert.ok(!appCode.includes('/design-system/workflow'), 'Design specimen path must not appear in App.tsx navigation switcher');
    });

    check('8c. App.tsx presents unified switcher with Cockpit and Sophia Presence', () => {
      const appCode = readFileSync(join(process.cwd(), 'src/os/App.tsx'), 'utf8');
      assert.match(appCode, /data-testid="mode-switcher-cockpit"/);
      assert.match(appCode, /data-testid="mode-switcher-sophia"/);
      assert.match(appCode, /fetchGreeting\(\{/);
    });

    check('8d. SharedSophiaVoicePresence.tsx contains dismissible greeting bubble testids', () => {
      const presenceCode = readFileSync(join(process.cwd(), 'src/os/components/voice/SharedSophiaVoicePresence.tsx'), 'utf8');
      assert.match(presenceCode, /data-testid="sofia-greeting-bubble"/);
      assert.match(presenceCode, /data-testid="sofia-greeting-dismiss-btn"/);
      assert.match(presenceCode, /data-testid="sofia-greeting-text"/);
    });

    check('8e. ChatPanel.tsx seeds conversation with Sophia honest greeting when empty', () => {
      const chatCode = readFileSync(join(process.cwd(), 'src/os/components/os/ChatPanel.tsx'), 'utf8');
      assert.match(chatCode, /greeting-seed/);
      assert.match(chatCode, /greeting\?\.text/);
    });

  } finally {
    // Restore backed up store state
    approvalStore.approvals.clear();
    for (const [k, v] of backupApprovals) approvalStore.approvals.set(k, v);
    (runStore as any).runs.clear();
    for (const [k, v] of backupRuns) (runStore as any).runs.set(k, v);
  }

  console.log('\n======================================================');
  console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled test suite failure:', err);
  process.exit(1);
});
