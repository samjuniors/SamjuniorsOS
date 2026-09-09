import assert from 'assert';
import {
  getDatabaseMode,
  requireAuthoritativeDatabase,
  DatabaseAuthorityError,
} from '../lib/server/db/authority';
import {
  PostgresWorkflowStore,
} from '../lib/server/workflow/store';
import {
  PostgresApprovalStore,
  PostgresAuditStore,
} from '../lib/server/authorization/approval-store';
import {
  PostgresAgentRunStore,
} from '../lib/server/agents/run-store';
import { CompanyStateStore } from '../lib/server/state/state-store';
import {
  PostgresEpistemicStore,
} from '../lib/server/epistemic/claim-store';
import { CompanyMemoryStore } from '../lib/server/memory/memory-store';
import {
  PostgresScheduledWorkStore,
} from '../lib/server/workflow/scheduler-store';
import { PostgresLeaseManager } from '../lib/server/coordination/lease-manager';
import { isDatabaseAvailable } from '../lib/server/db/prisma';

/**
 * ============================================================================
 * PHASE 2.2 — CONTROLLED DISPOSABLE DATABASE OUTAGE (child process)
 * ============================================================================
 *
 * PHASE 2.6.1 test-design fix. This script is spawned by
 * tests/phase2_2_authoritative_repositories.test.ts with:
 *   - DATABASE_URL pointed at an intentionally unreachable endpoint
 *     (port 9 — discard protocol, nothing listens there), and
 *   - DATABASE_MODE=authoritative.
 *
 * Because it is a SEPARATE process, its PrismaClient is constructed against the
 * dead endpoint, so every authoritative operation exercises the REAL
 * infrastructure-level unavailability path (failed TCP connection) — no mocks,
 * no stubs of the authority layer, no simulated in-memory failure.
 *
 * The premise "DB unavailable => fail closed" therefore ACTUALLY runs with the
 * database unavailable, regardless of whether the parent environment has a
 * live PostgreSQL (e.g. CI with a PostgreSQL service container).
 *
 * Exits 0 when every authoritative path fails closed correctly; exits 1 otherwise.
 * ============================================================================
 */

function isFailClosedError(err: unknown): boolean {
  if (err instanceof DatabaseAuthorityError) return true;
  const e = err as { code?: string; message?: string };
  if (e?.code === 'P1001') return true;
  return /Can't reach database server|ECONNREFUSED|Connection terminated|terminated unexpectedly|timeout/i.test(e?.message || '');
}

async function expectFailClosed(name: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    const result = await fn();
    console.error(`  ✗ FAIL-CLOSED VIOLATION: ${name} resolved with: ${JSON.stringify(result)?.slice(0, 120)}`);
    return false;
  } catch (err: unknown) {
    if (isFailClosedError(err)) {
      const e = err as { code?: string; name?: string };
      console.log(`  ✓ FAIL-CLOSED OK: ${name} (${e?.name || e?.code || 'connection failure'})`);
      return true;
    }
    const e = err as { name?: string; message?: string };
    console.error(`  ✗ FAIL-CLOSED VIOLATION: ${name} threw unexpected ${e?.name}: ${e?.message?.slice(0, 120)}`);
    return false;
  }
}

async function main(): Promise<number> {
  console.log('--- phase2_2 outage child: database-unavailable fail-closed mode ---');
  console.log(`  DATABASE_MODE=${process.env.DATABASE_MODE} (resolved: ${getDatabaseMode()})`);

  // Premise verification: this child MUST genuinely see an unavailable database.
  if (await isDatabaseAvailable()) {
    console.error('  ✗ PREMISE VIOLATION: database appears REACHABLE in outage child — test environment is wrong.');
    return 1;
  }
  console.log('  ✓ premise holds: PostgreSQL is genuinely unreachable from this process.');

  let failures = 0;

  // Authority layer itself
  if (!(await expectFailClosed('requireAuthoritativeDatabase()', () => requireAuthoritativeDatabase()))) failures++;

  // 0. Distributed Lease Manager (coordination layer fails closed too)
  const leaseMgr = PostgresLeaseManager.getInstance();
  if (!(await expectFailClosed('PostgresLeaseManager.acquire()', () => leaseMgr.acquire('outage-child-lease', 'outage-worker', 30000)))) failures++;
  if (!(await expectFailClosed('PostgresLeaseManager.renew()', () => leaseMgr.renew('outage-child-lease', 'outage-worker', 30000)))) failures++;
  if (!(await expectFailClosed('PostgresLeaseManager.release()', () => leaseMgr.release('outage-child-lease', 'outage-worker')))) failures++;

  // 1. Workflow Store
  const wfStore = PostgresWorkflowStore.getInstance();
  if (!(await expectFailClosed('PostgresWorkflowStore.getInstance()', () => wfStore.getInstance('non-existent-inst-123')))) failures++;
  if (!(await expectFailClosed('PostgresWorkflowStore.saveInstance()', () =>
    wfStore.saveInstance({
      instanceId: 'inst-outage-child',
      workflowId: 'wf-1',
      version: '1.0.0',
      status: 'running',
      objective: 'outage child fail-closed test',
      stepStates: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outputs: {},
      evidenceReferences: [],
    })))) failures++;

  // 2. Approval Store
  const approvalStore = PostgresApprovalStore.getInstance();
  if (!(await expectFailClosed('PostgresApprovalStore.get()', () => approvalStore.get('appr-outage-123')))) failures++;
  if (!(await expectFailClosed('PostgresApprovalStore.save()', () =>
    approvalStore.save({
      id: 'appr-outage-child',
      workflowInstanceId: 'inst-outage-child',
      stepId: 'step-1',
      actionName: 'send_email',
      employeeRole: 'pm',
      classification: 'external_communication',
      decision: 'pending',
      scope: { scopeType: 'single_action' },
      requestedAt: new Date().toISOString(),
    })))) failures++;

  // 3. Audit Store
  const auditStore = PostgresAuditStore.getInstance();
  if (!(await expectFailClosed('PostgresAuditStore.record()', () =>
    auditStore.record({
      id: 'audit-outage-child',
      requestId: 'req-outage-123',
      employeeRole: 'pm',
      requestedBy: 'pm',
      actionClassification: 'external_communication',
      actionName: 'send_email',
      decision: 'allowed',
      reasonCode: 'APPROVED_BY_FOUNDER',
      reason: 'Authorized by Founder',
      executed: true,
      timestamp: new Date().toISOString(),
    })))) failures++;

  // 4. Agent Run Store
  const runStore = PostgresAgentRunStore.getInstance();
  if (!(await expectFailClosed('PostgresAgentRunStore.saveRun()', () =>
    runStore.saveRun({
      runId: 'run-outage-child',
      agentId: 'pm',
      agentName: 'Product Manager',
      protocolStep: 'execute',
      taskTitle: 'Outage child test',
      directive: 'Outage child fail-closed test',
      status: 'completed',
      durationMs: 10,
      outputContent: 'n/a',
      provenance: {
        role: 'pm',
        timestamp: new Date().toISOString(),
        sources: [],
        confidence: 'high_confidence',
        verificationMethod: 'heuristic_check',
      },
      timestamp: new Date().toISOString(),
    })))) failures++;

  // 5. Company State Store
  const stateStore = CompanyStateStore.getInstance();
  if (!(await expectFailClosed('CompanyStateStore.setInitiatives()', () => stateStore.setInitiatives([])))) failures++;

  // 6. Epistemic Store
  const epistemicStore = PostgresEpistemicStore.getInstance();
  if (!(await expectFailClosed('PostgresEpistemicStore.saveSource()', () =>
    epistemicStore.saveSource({
      id: 'src-outage-child',
      sourceSystem: 'github',
      title: 'Outage source',
      rawContent: 'content',
      contentHash: 'hash-outage',
      capturedAt: new Date().toISOString(),
      capturedBy: 'system',
      metadata: {},
      provenanceKind: 'live_operational',
    })))) failures++;

  // 7. Company Memory Store
  const memoryStore = CompanyMemoryStore.getInstance();
  if (!(await expectFailClosed('CompanyMemoryStore.getAllMemories()', () => memoryStore.getAllMemories()))) failures++;

  // 8. Scheduled Work Store
  const schedulerStore = PostgresScheduledWorkStore.getInstance();
  if (!(await expectFailClosed('PostgresScheduledWorkStore.save()', () =>
    schedulerStore.save({
      id: 'work-outage-child',
      workflowInstanceId: 'inst-outage-child',
      stepId: 'step-1',
      executeAt: new Date().toISOString(),
      status: 'scheduled',
      scheduleType: 'one_time',
      createdAt: new Date().toISOString(),
    })))) failures++;

  console.log(`--- outage child result: ${failures === 0 ? 'ALL FAIL-CLOSED OK' : `${failures} VIOLATIONS`} ---`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Outage child crashed:', err);
    process.exit(1);
  });
