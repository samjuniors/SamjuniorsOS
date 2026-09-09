import assert from 'assert';
import { spawnSync } from 'child_process';
import * as path from 'path';
import { prisma, isDatabaseAvailable } from '../lib/server/db/prisma';
import {
  getDatabaseMode,
  isAuthoritativeMode,
  requireAuthoritativeDatabase,
  DatabaseAuthorityError,
} from '../lib/server/db/authority';
import {
  PostgresWorkflowStore,
  InMemoryWorkflowStore,
  getWorkflowStore,
} from '../lib/server/workflow/store';
import {
  PostgresApprovalStore,
  PostgresAuditStore,
  InMemoryApprovalStore,
  InMemoryAuditStore,
} from '../lib/server/authorization/approval-store';
import {
  PostgresAgentRunStore,
  AgentRunStore,
  InMemoryAgentRunStore,
} from '../lib/server/agents/run-store';
import { CompanyStateStore } from '../lib/server/state/state-store';
import {
  PostgresEpistemicStore,
  EpistemicClaimStore,
  InMemoryEpistemicStore,
} from '../lib/server/epistemic/claim-store';
import { CompanyMemoryStore } from '../lib/server/memory/memory-store';
import {
  PostgresScheduledWorkStore,
  InMemoryScheduledWorkStore,
} from '../lib/server/workflow/scheduler-store';
import { WorkflowInstanceState } from '../types/workflow';
import { FounderApprovalRecord, SideEffectAuditRecord } from '../types/authorization';
import { AgentRunRecord } from '../lib/server/agents/run-store';

/**
 * ============================================================================
 * SAMJUNIORS OS — PHASE 2.2 AUTHORITATIVE REPOSITORIES TEST SUITE
 * ============================================================================
 * 
 * Verifies:
 * 1. Database Authority Mode Detection & Transitions
 * 2. Authoritative repository semantics, EXPLICIT PER MODE (Phase 2.6.1 redesign):
 *    - database-unavailable fail-closed mode: every authoritative operation must
 *      throw DatabaseAuthorityError. Offline environments run this inline;
 *      environments with a live PostgreSQL run it in a controlled disposable
 *      outage CHILD PROCESS (tests/phase2_2_outage_child.ts) whose DATABASE_URL
 *      points at an unreachable endpoint — a real infrastructure-level outage.
 *    - database-authoritative ONLINE mode (live PostgreSQL only): functional
 *      round-trip contracts using VALID relational data (real workflow instance
 *      created first so approval/audit rows satisfy their foreign keys), with
 *      deterministic cleanup.
 * 3. Repository Functional Contracts (Create, Read, Update, Query) in Test Mode
 * 4. Preservation of Test/Local Adapters (Zero Regressions, Fast Deterministic Execution)
 * 
 * ENVIRONMENT REQUIREMENTS (explicit):
 * - No DATABASE_URL, or an unreachable one  → offline fail-closed mode runs inline.
 * - Live PostgreSQL at DATABASE_URL         → online mode + outage child process.
 *   Migrations are expected to be applied (npx prisma migrate deploy).
 * ============================================================================
 */

async function runAuthoritativeRepositoriesSuite() {
  console.log('================================================================');
  console.log('🏛️  SAMJUNIORS OS — PHASE 2.2 AUTHORITATIVE REPOSITORIES SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function recordPass(testName: string) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  }

  function recordFail(testName: string, error: any) {
    console.error(`  ✗ FAIL: ${testName}`);
    console.error(`    ${error?.message || error}`);
    failed++;
  }

  // --- Group 1: Database Authority Configuration & Mode Transitions ---
  console.log('--- Group 1: Database Authority Configuration & Modes ---');
  try {
    const originalMode = process.env.DATABASE_MODE;
    const originalNodeEnv = process.env.NODE_ENV;

    // Test default in test environment
    (process.env as any).NODE_ENV = 'test';
    delete process.env.DATABASE_MODE;
    assert.strictEqual(getDatabaseMode(), 'test', 'Should default to "test" mode when NODE_ENV=test');
    assert.strictEqual(isAuthoritativeMode(), false, 'isAuthoritativeMode() should be false in test mode');
    recordPass('Default test mode detection adheres to specification');

    // Test explicit authoritative mode
    process.env.DATABASE_MODE = 'authoritative';
    assert.strictEqual(getDatabaseMode(), 'authoritative', 'Explicit DATABASE_MODE=authoritative should be honored');
    assert.strictEqual(isAuthoritativeMode(), true, 'isAuthoritativeMode() should be true in authoritative mode');
    recordPass('Authoritative mode honors explicit environment setting');

    // Test production default
    delete process.env.DATABASE_MODE;
    (process.env as any).NODE_ENV = 'production';
    assert.strictEqual(getDatabaseMode(), 'authoritative', 'Production must default strictly to authoritative mode');
    recordPass('Production environment strictly defaults to authoritative mode');

    // Restore environment
    process.env.DATABASE_MODE = originalMode;
    (process.env as any).NODE_ENV = originalNodeEnv;
  } catch (err) {
    recordFail('Database Authority mode transitions', err);
  }

  // --- Group 2: Authoritative Repository Semantics (PHASE 2.6.1 mode-explicit redesign) ---
  //
  // ORIGINAL DESIGN FLAW (Phase 2.6 finding): Group 2 asserted "DB unavailable =>
  // fail closed" WITHOUT verifying the premise. When a real DATABASE_URL pointed
  // at a live PostgreSQL (CI, Phase 2.6 runs), the stores happily performed real
  // I/O: "must throw" assertions failed, junk rows were written, and the approval
  // save even PASSED for the WRONG reason (a foreign-key violation on the
  // nonexistent workflowInstanceId 'inst-1', not an authority failure).
  //
  // PHASE 2.6.1 REDESIGN — explicit modes, each with a verified premise:
  //   2A. database-unavailable fail-closed mode (offline env: runs inline;
  //       online env: runs in a CONTROLLED DISPOSABLE OUTAGE child process with
  //       DATABASE_URL pointed at an unreachable endpoint — a real infrastructure
  //       outage, not a mock of the authority layer)
  //   2B. database-authoritative ONLINE mode (live env only): functional
  //       round-trip contracts using VALID relational data — a real workflow
  //       instance is created first so approval/audit rows satisfy the
  //       workflowInstanceId foreign keys (Phase 2.6 FK test-data fix), with
  //       deterministic cleanup.
  console.log('\n--- Group 2: Authoritative Repository Semantics (mode-explicit) ---');
  const originalMode = process.env.DATABASE_MODE;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const dbReachable = await isDatabaseAvailable();

  if (!dbReachable) {
    // 2A (offline variant): the premise GENUINELY holds — no live database here.
    console.log('  [MODE: database-unavailable] PostgreSQL unreachable from this process — fail-closed premise holds; running inline.');
    process.env.DATABASE_MODE = 'authoritative';

    // 1. Workflow Store Fail-Closed
    try {
      const wfStore = PostgresWorkflowStore.getInstance();
      let threw = false;
      try {
        await wfStore.getInstance('non-existent-inst-123');
      } catch (err: any) {
        threw = true;
        assert(err instanceof DatabaseAuthorityError || err.message.includes('Database Unavailable') || err.message.includes('authoritative'), 'Must throw authoritative DB error');
      }
      assert(threw, 'PostgresWorkflowStore.getInstance must fail closed when PostgreSQL is unavailable');
      recordPass('Workflow Repository fails closed on read when DB is unreachable');

      threw = false;
      try {
        await wfStore.saveInstance({
          instanceId: 'inst-fail-test',
          workflowId: 'wf-1',
          version: '1.0.0',
          status: 'running',
          objective: 'fail closed test',
          stepStates: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          outputs: {},
          evidenceReferences: [],
        });
      } catch (err: any) {
        threw = true;
      }
      assert(threw, 'PostgresWorkflowStore.saveInstance must fail closed when PostgreSQL is unavailable');
      recordPass('Workflow Repository fails closed on write when DB is unreachable');
    } catch (err) {
      recordFail('Workflow Store fail-closed enforcement', err);
    }

    // 2. Approval Store Fail-Closed
    try {
      const approvalStore = PostgresApprovalStore.getInstance();
      let threw = false;
      try {
        await approvalStore.get('appr-test-123');
      } catch (err: any) {
        threw = true;
      }
      assert(threw, 'PostgresApprovalStore.get must fail closed when DB is unreachable');
      recordPass('Approval Repository fails closed on read when DB is unreachable');

      threw = false;
      try {
        await approvalStore.save({
          id: 'appr-fail-test',
          workflowInstanceId: 'inst-1',
          stepId: 'step-1',
          actionName: 'send_email',
          employeeRole: 'pm',
          classification: 'external_communication',
          decision: 'pending',
          scope: { scopeType: 'single_action' },
          requestedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        threw = true;
      }
      assert(threw, 'PostgresApprovalStore.save must fail closed when DB is unreachable');
      recordPass('Approval Repository fails closed on write when DB is unreachable');
    } catch (err) {
      recordFail('Approval Store fail-closed enforcement', err);
    }

    // 3. Audit Store Fail-Closed
    try {
      const auditStore = PostgresAuditStore.getInstance();
      let threw = false;
      try {
        await auditStore.record({
          id: 'audit-fail-test',
          requestId: 'req-123',
          employeeRole: 'pm',
          requestedBy: 'pm',
          actionClassification: 'external_communication',
          actionName: 'send_email',
          decision: 'allowed',
          reasonCode: 'APPROVED_BY_FOUNDER',
          reason: 'Authorized by Founder',
          executed: true,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        threw = true;
      }
      assert(threw, 'PostgresAuditStore.record must fail closed when DB is unreachable');
      recordPass('Audit Repository fails closed on record when DB is unreachable');
    } catch (err) {
      recordFail('Audit Store fail-closed enforcement', err);
    }

    // 4. Agent Run Store Fail-Closed
    try {
      const runStore = PostgresAgentRunStore.getInstance();
      let threw = false;
      try {
        await runStore.saveRun({
          runId: 'run-fail-test',
          agentId: 'pm',
          agentName: 'Product Manager',
          protocolStep: 'execute',
          taskTitle: 'Test Agent Run',
          directive: 'Fail closed test',
          status: 'completed',
          durationMs: 120,
          outputContent: 'Test Output',
          provenance: {
            role: 'pm',
            timestamp: new Date().toISOString(),
            sources: [],
            confidence: 'high_confidence',
            verificationMethod: 'heuristic_check',
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        threw = true;
      }
      assert(threw, 'PostgresAgentRunStore.saveRun must fail closed when DB is unreachable');
      recordPass('Agent Run Repository fails closed on save when DB is unreachable');
    } catch (err) {
      recordFail('Agent Run Store fail-closed enforcement', err);
    }

    // 5. Company State Store Fail-Closed
    try {
      const stateStore = CompanyStateStore.getInstance();
      let threw = false;
      try {
        await stateStore.setInitiatives([]);
      } catch (err: any) {
        threw = true;
      }
      assert(threw, 'CompanyStateStore.setInitiatives must fail closed in authoritative mode when DB is unreachable');
      recordPass('Company State Repository fails closed on write when DB is unreachable');
    } catch (err) {
      recordFail('Company State Store fail-closed enforcement', err);
    }

    // 6. Epistemic Store Fail-Closed
    try {
      const epistemicStore = PostgresEpistemicStore.getInstance();
      let threw = false;
      try {
        await epistemicStore.saveSource({
          id: 'src-fail-test',
          sourceSystem: 'github',
          title: 'Fail closed source',
          rawContent: 'Sample content',
          contentHash: 'hash-12345',
          capturedAt: new Date().toISOString(),
          capturedBy: 'system',
          metadata: {},
          provenanceKind: 'live_operational',
        });
      } catch (err: any) {
        threw = true;
      }
      assert(threw, 'PostgresEpistemicStore.saveSource must fail closed when DB is unreachable');
      recordPass('Epistemic Repository fails closed on source save when DB is unreachable');
    } catch (err) {
      recordFail('Epistemic Store fail-closed enforcement', err);
    }

    // 7. Company Memory Store Fail-Closed
    try {
      const memoryStore = CompanyMemoryStore.getInstance();
      let threw = false;
      try {
        await memoryStore.getAllMemories();
      } catch (err: any) {
        threw = true;
      }
      assert(threw, 'CompanyMemoryStore.getAllMemories must fail closed in authoritative mode when DB is unreachable');
      recordPass('Company Memory Repository fails closed on read when DB is unreachable');
    } catch (err) {
      recordFail('Company Memory Store fail-closed enforcement', err);
    }

    // 8. Scheduled Work Store Fail-Closed
    try {
      const schedulerStore = PostgresScheduledWorkStore.getInstance();
      let threw = false;
      try {
        await schedulerStore.save({
          id: 'work-fail-test',
          workflowInstanceId: 'inst-1',
          stepId: 'step-1',
          executeAt: new Date().toISOString(),
          status: 'scheduled',
          scheduleType: 'one_time',
          createdAt: new Date().toISOString(),
        });
      } catch (err: any) {
        threw = true;
      }
      assert(threw, 'PostgresScheduledWorkStore.save must fail closed when DB is unreachable');
      recordPass('Scheduled Work Repository fails closed on save when DB is unreachable');
    } catch (err) {
      recordFail('Scheduled Work Store fail-closed enforcement', err);
    }
  } else {
    // Live PostgreSQL reachable from this process.
    console.log('  [MODE: database-authoritative ONLINE] Live PostgreSQL detected.');

    // 2A (online variant): controlled disposable DB outage via a child process.
    // The child is spawned with DATABASE_URL pointed at an unreachable endpoint and
    // DATABASE_MODE=authoritative. Its PrismaClient is constructed against the dead
    // endpoint, so the fail-closed premise ACTUALLY holds at the infrastructure level
    // (real TCP connection failure) — no mocking of the authority layer.
    try {
      const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
      const childEnv = {
        ...process.env,
        DATABASE_URL: 'postgresql://outage:outage@127.0.0.1:9/none',
        DATABASE_MODE: 'authoritative',
      };
      const result = spawnSync(tsxBin, ['tests/phase2_2_outage_child.ts'], {
        cwd: process.cwd(),
        env: childEnv,
        timeout: 120000,
        encoding: 'utf8',
      });
      const childOut = ((result.stdout || '') + (result.stderr || '')).trim();
      const lastLines = childOut.split('\n').filter((l: string) => l.trim()).slice(-4).join(' | ');
      assert(
        result.status === 0,
        `Controlled DB outage child must exit 0 (got ${result.status}${result.signal ? ` signal ${result.signal}` : ''}): ${lastLines}`
      );
      assert(
        childOut.includes('ALL FAIL-CLOSED OK'),
        'Controlled DB outage child must report all paths fail-closed'
      );
      recordPass('All authoritative repositories fail closed under controlled real DB outage (child process, real connection failure)');
    } catch (err) {
      recordFail('Controlled DB outage fail-closed enforcement', err);
    }

    // 2B (online mode): authoritative functional contracts with VALID relational data.
    // PHASE 2.6 FK FIX: the previous online-mode fixture wrote approval rows
    // referencing a nonexistent workflowInstanceId ('inst-1'), violating the
    // approval_records.workflow_instance_id -> workflow_instances.id FK (and could
    // pass fail-closed assertions for the WRONG reason — a P2003 FK violation).
    // The schema is authoritative: this fixture now creates a REAL workflow
    // instance first, so approval + audit rows reference valid relational data.
    process.env.DATABASE_MODE = 'authoritative';
    const runTag = `p22-online-${Date.now()}`;
    const instanceId = `inst-${runTag}`;
    const approvalId = `appr-${runTag}`;
    const auditId = `audit-${runTag}`;
    const cleanupIds = { instanceId, approvalId, auditId };

    try {
      // Create a REAL workflow instance (valid relational anchor).
      const wfStore = PostgresWorkflowStore.getInstance();
      await wfStore.saveInstance({
        instanceId,
        workflowId: `wf-${runTag}`,
        version: '1.0.0',
        status: 'running',
        objective: 'Phase 2.2 online-mode relational fixture',
        stepStates: {
          'step-p22-1': {
            stepId: 'step-p22-1',
            status: 'pending',
            assignedRole: 'pm',
            skill: 'content_generation',
            outputs: {},
            evidenceReferences: [],
            retryCount: 0,
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        outputs: {},
        evidenceReferences: [],
      });
      const fetchedInstance = await wfStore.getInstance(instanceId);
      assert(fetchedInstance, 'Online mode: saved workflow instance must be retrievable');
      assert.strictEqual(fetchedInstance?.instanceId, instanceId, 'Online mode: instanceId round-trip');
      assert.strictEqual(fetchedInstance?.status, 'running', 'Online mode: status round-trip');
      recordPass('Online authoritative mode: workflow instance round-trip with valid relational data');

      // Approval referencing the REAL instance (FK satisfied).
      const approvalStore = PostgresApprovalStore.getInstance();
      await approvalStore.save({
        id: approvalId,
        workflowInstanceId: instanceId,
        stepId: 'step-p22-1',
        actionName: 'send_client_email',
        employeeRole: 'pm',
        classification: 'external_communication',
        decision: 'pending',
        scope: { scopeType: 'single_action', allowedUses: 1, usedCount: 0 },
        requestedAt: new Date().toISOString(),
      });
      const fetchedApproval = await approvalStore.get(approvalId);
      assert(fetchedApproval, 'Online mode: approval referencing a real workflow instance must persist (FK satisfied)');
      assert.strictEqual(fetchedApproval?.workflowInstanceId, instanceId, 'Online mode: approval FK round-trip');
      recordPass('Online authoritative mode: approval record persists with valid workflowInstanceId FK');

      // Audit record referencing the REAL instance (FK satisfied).
      const auditStore = PostgresAuditStore.getInstance();
      await auditStore.record({
        id: auditId,
        requestId: `req-${runTag}`,
        employeeRole: 'pm',
        requestedBy: 'pm',
        workflowInstanceId: instanceId,
        stepId: 'step-p22-1',
        actionClassification: 'external_communication',
        actionName: 'send_client_email',
        decision: 'allowed',
        reasonCode: 'APPROVED_BY_FOUNDER',
        reason: 'Authorized execution',
        executionReference: `exec-${runTag}`,
        executed: true,
        timestamp: new Date().toISOString(),
      });
      const fetchedAudit = await auditStore.get(auditId);
      assert(fetchedAudit, 'Online mode: audit record referencing a real workflow instance must persist (FK satisfied)');
      assert.strictEqual(fetchedAudit?.workflowInstanceId, instanceId, 'Online mode: audit FK round-trip');
      const auditList = await auditStore.list({ workflowInstanceId: instanceId });
      assert(
        auditList.some((a: any) => a.id === auditId),
        'Online mode: audit list-by-workflowInstanceId must return the FK-valid record'
      );
      recordPass('Online authoritative mode: audit record persists with valid workflowInstanceId FK');
    } catch (err) {
      recordFail('Online authoritative relational contracts (FK-valid fixtures)', err);
    } finally {
      // Deterministic cleanup — remove exactly the rows this group created.
      process.env.DATABASE_URL = originalDatabaseUrl;
      try {
        await prisma.sideEffectAudit.deleteMany({ where: { id: cleanupIds.auditId } });
        await prisma.approvalRecord.deleteMany({ where: { id: cleanupIds.approvalId } });
        await prisma.workflowInstance.deleteMany({ where: { id: cleanupIds.instanceId } });
      } catch {
        // Cleanup is best-effort; rows are tagged with a unique runTag so they
        // cannot collide with real data and can be reaped manually if needed.
      }
    }
  }

  // Reset DATABASE_MODE to test for functional validation
  process.env.DATABASE_MODE = 'test';

  // --- Group 3: Test Adapter Functional Contracts (Preserving Development Ergonomics) ---
  console.log('\n--- Group 3: Test Adapter Functional Contracts & Deterministic Execution ---');

  // Workflow Store
  try {
    const wfStore = InMemoryWorkflowStore.getInstance();
    const instId = `inst-test-${Date.now()}`;
    const instanceData: WorkflowInstanceState = {
      instanceId: instId,
      workflowId: 'wf-contract-test',
      version: '1.0.0',
      status: 'running',
      objective: 'Verify test adapter contract',
      stepStates: {
        'step-1': {
          stepId: 'step-1',
          status: 'completed',
          assignedRole: 'pm',
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outputs: { key: 'value' },
      evidenceReferences: [],
    };

    await wfStore.saveInstance(instanceData);
    const retrieved = await wfStore.getInstance(instId);
    assert(retrieved, 'Retrieved instance must exist');
    assert.strictEqual(retrieved?.instanceId, instId, 'Instance ID must match');
    assert.strictEqual(retrieved?.status, 'running', 'Status must match');
    recordPass('Workflow test adapter: create, persist, and retrieve instance');

    // Update status
    instanceData.status = 'completed';
    await wfStore.saveInstance(instanceData);
    const updated = await wfStore.getInstance(instId);
    assert.strictEqual(updated?.status, 'completed', 'Updated status must be preserved');
    recordPass('Workflow test adapter: instance state update preserved');
  } catch (err) {
    recordFail('Workflow test adapter contract', err);
  }

  // Approval Store
  try {
    const approvalStore = InMemoryApprovalStore.getInstance();
    const apprId = `appr-test-${Date.now()}`;
    const approvalData: FounderApprovalRecord = {
      id: apprId,
      workflowInstanceId: 'inst-100',
      stepId: 'step-100',
      actionName: 'send_client_email',
      employeeRole: 'pm',
      classification: 'external_communication',
      decision: 'pending',
      payloadHash: 'hash-abc-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
      scope: { scopeType: 'single_action', allowedUses: 1, usedCount: 0 },
      requestedAt: new Date().toISOString(),
    };

    await approvalStore.save(approvalData);
    const retrieved = await approvalStore.get(apprId);
    assert(retrieved, 'Saved approval must be retrievable');
    assert.strictEqual(retrieved?.payloadHash, approvalData.payloadHash, 'Payload hash must be durably preserved');
    recordPass('Approval test adapter: save, retrieve, and payloadHash preservation');

    // Decide
    await approvalStore.decide(apprId, 'approved', 'founder-1', 'Approved for production');
    const decided = await approvalStore.get(apprId);
    assert.strictEqual(decided?.decision, 'approved', 'Decision state must transition to approved');
    assert.strictEqual(decided?.decidedBy, 'founder-1', 'decidedBy must record founder identity');
    recordPass('Approval test adapter: lifecycle decision transition');

    // Consume
    await approvalStore.consume(apprId);
    const consumed = await approvalStore.get(apprId);
    assert.strictEqual(consumed?.isConsumed, true, 'isConsumed must become true upon consumption');
    recordPass('Approval test adapter: single-use consumption state');
  } catch (err) {
    recordFail('Approval test adapter contract', err);
  }

  // Audit Store
  try {
    const auditStore = InMemoryAuditStore.getInstance();
    const auditId = `audit-test-${Date.now()}`;
    const auditData: SideEffectAuditRecord = {
      id: auditId,
      requestId: 'req-audit-test-999',
      employeeRole: 'pm',
      requestedBy: 'pm',
      workflowInstanceId: 'inst-audit-100',
      stepId: 'step-audit-1',
      actionClassification: 'external_communication',
      actionName: 'send_client_email',
      decision: 'allowed',
      reasonCode: 'APPROVED_BY_FOUNDER',
      reason: 'Authorized execution',
      executionReference: 'exec-ref-456',
      executed: true,
      timestamp: new Date().toISOString(),
    };

    await auditStore.record(auditData);
    const retrieved = await auditStore.get(auditId);
    assert(retrieved, 'Recorded audit entry must exist');
    assert.strictEqual(retrieved?.requestId, 'req-audit-test-999', 'requestId must be preserved');
    assert.strictEqual(retrieved?.executionReference, 'exec-ref-456', 'executionReference must be preserved');

    const listResults = await auditStore.list({ workflowInstanceId: 'inst-audit-100' });
    assert(listResults.length >= 1, 'Audit list by workflowInstanceId must return matching entries');
    recordPass('Audit test adapter: append, retrieve, and filter query');
  } catch (err) {
    recordFail('Audit test adapter contract', err);
  }

  // Agent Run Store
  try {
    const runStore = AgentRunStore.getInstance();
    const runId = `run-contract-test-${Date.now()}`;
    const runData: AgentRunRecord = {
      runId,
      agentId: 'pm',
      agentName: 'Product Manager',
      protocolStep: 'execute',
      taskTitle: 'Create Launch Roadmap',
      directive: 'Plan Q4 deliverables',
      status: 'completed',
      durationMs: 450,
      outputContent: 'Deliverable content markdown',
      structuredData: { deliverableCount: 3 },
      claimsGenerated: ['claim-101'],
      provenance: {
        role: 'pm',
        timestamp: new Date().toISOString(),
        sources: ['src-1'],
        confidence: 'high_confidence',
        verificationMethod: 'heuristic_check',
      },
      timestamp: new Date().toISOString(),
    };

    await runStore.saveRun(runData);
    const retrieved = await runStore.getRun(runId);
    assert(retrieved, 'Saved agent run must exist');
    assert.strictEqual(retrieved?.runId, runId, 'Run ID must match');
    assert.strictEqual(retrieved?.outputContent, 'Deliverable content markdown', 'Output content must match');
    assert.strictEqual(retrieved?.status, 'completed', 'Run status must match');

    const runsList = await runStore.listRuns({ agentId: 'pm' });
    assert(runsList.some((r) => r.runId === runId), 'Run must be listed in filtered query');
    recordPass('Agent Run test adapter: saveRun, getRun, and listRuns with filtering');
  } catch (err) {
    recordFail('Agent Run test adapter contract', err);
  }

  // Epistemic Store
  try {
    const epistemicStore = EpistemicClaimStore.getInstance();
    const srcId = `src-test-${Date.now()}`;
    await epistemicStore.saveSource({
      id: srcId,
      sourceSystem: 'github',
      title: 'Repository Commit Log',
      rawContent: 'Commit 73af411c',
      contentHash: 'hash-commit-73af411c',
      capturedAt: new Date().toISOString(),
      capturedBy: 'system',
      metadata: {},
      provenanceKind: 'live_operational',
    });

    const src = await epistemicStore.getSource(srcId);
    assert(src, 'Saved source must exist');
    assert.strictEqual(src?.contentHash, 'hash-commit-73af411c', 'contentHash must match');
    recordPass('Epistemic test adapter: source persistence');

    const claimId = `claim-test-${Date.now()}`;
    await epistemicStore.saveClaim({
      id: claimId,
      sourceId: srcId,
      statement: 'Gross margin is 85%',
      subject: 'gross_margin',
      category: 'financial',
      proposedBy: 'finance',
      confidence: 'unverified',
      verificationStatus: 'pending',
      evidenceReferences: [srcId],
      createdAt: new Date().toISOString(),
    });

    const claim = await epistemicStore.getClaim(claimId);
    assert(claim, 'Saved claim must exist');
    assert.strictEqual(claim?.statement, 'Gross margin is 85%', 'Claim statement must match');
    recordPass('Epistemic test adapter: claim persistence linked to source');

    const factId = `fact-test-${Date.now()}`;
    await epistemicStore.saveFact({
      id: factId,
      claimId,
      sourceId: srcId,
      statement: 'Verified gross margin is 85%',
      subject: 'gross_margin',
      category: 'financial',
      validityState: 'active',
      confidence: 'verified_fact',
      promotedAt: new Date().toISOString(),
      promotedBy: 'founder-verified',
      provenance: {},
    });

    const activeFacts = await epistemicStore.listActiveFacts({ subject: 'gross_margin' });
    assert(activeFacts.some((f) => f.id === factId), 'Promoted fact must appear in active facts list');
    recordPass('Epistemic test adapter: canonical fact persistence and active query');
  } catch (err) {
    recordFail('Epistemic test adapter contract', err);
  }

  // Scheduled Work Store
  try {
    const schedulerStore = InMemoryScheduledWorkStore.getInstance();
    const workId = `work-contract-${Date.now()}`;
    await schedulerStore.save({
      id: workId,
      workflowInstanceId: 'inst-sch-1',
      stepId: 'step-sch-1',
      executeAt: new Date(Date.now() - 1000).toISOString(),
      status: 'scheduled',
      scheduleType: 'one_time',
      createdAt: new Date().toISOString(),
    });

    const retrieved = await schedulerStore.get(workId);
    assert(retrieved, 'Saved scheduled work must exist');

    const dueItems = await schedulerStore.listDue();
    assert(dueItems.some((i) => i.id === workId), 'Past due item must be returned by listDue()');
    recordPass('Scheduled Work test adapter: save and listDue() query');
  } catch (err) {
    recordFail('Scheduled Work test adapter contract', err);
  }

  // Restore environment
  process.env.DATABASE_MODE = originalMode;

  console.log('\n================================================================');
  console.log(`Phase 2.2 Authoritative Repositories Suite: ${passed}/${passed + failed} Passed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthoritativeRepositoriesSuite().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
