/**
 * ============================================================================
 * G11.5: ROLE BRAINS TEST SUITE
 * ============================================================================
 *
 * SPECIFICATION & EXIT CRITERIA:
 * "Isolation tests: one employee cannot read another's working memory or the
 *  Personal Mind; projection is rebuilt deterministically from the Company
 *  Brain; a Role Brain never becomes company truth."
 *
 * VERIFICATION SCOPE:
 * 1. Cross-Employee Working & Experience Memory Isolation:
 *    - Employees (researcher, finance, pm) can read/write their own memory.
 *    - Cross-employee read, write, or delete attempts fail closed with
 *      RoleBrainSecurityError (403).
 * 2. Personal Mind Isolation:
 *    - Personal memories in SophiaMemoryStore are strictly invisible to
 *      Role Brains and employee context assembly.
 * 3. Deterministic Company Brain Projection:
 *    - Role Brains project Company Brain state, facts, knowledge, precedents.
 *    - Projection hash is deterministic and reproducible across multiple rebuilds.
 *    - Updates to Company Brain state cleanly reflect in refreshed projection.
 * 4. Never Company Truth:
 *    - Role Brain working/experience notes never contaminate CompanyKnowledge,
 *      CanonicalFacts, or CompanyPrecedents.
 * 5. Working Memory Lifecycle & Purge:
 *    - Task-scoped working memory scratchpads can be cleared independently
 *      without affecting long-term experience memory.
 * 6. Durability:
 *    - Memories persist cleanly across rehydration.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./db/custom.db';

import assert from 'assert';
import { RoleBrainRegistry } from '../../src/lib/server/brain/role-brain';
import {
  RoleBrainStore,
  RoleBrainSecurityError,
  RoleBrainValidationError,
} from '../../src/lib/server/brain/role-brain-store';
import { CompanyBrain } from '../../src/lib/server/brain/company-brain';
import { SophiaMemoryStore } from '../../src/lib/server/sophia/personal-memory-store';
import { CompanyKnowledgeStore } from '../../src/lib/server/knowledge/knowledge-store';
import { EpistemicClaimStore } from '../../src/lib/server/epistemic/claim-store';
import { ContextAssemblyService } from '../../src/lib/server/context/context-assembly';
import { CanonicalFact } from '../../src/types/epistemic';

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('STARTING G11.5 ROLE BRAINS TEST SUITE');
  console.log('======================================================\n');

  const store = RoleBrainStore.getInstance();
  const researcherBrain = RoleBrainRegistry.getRoleBrain('researcher');
  const financeBrain = RoleBrainRegistry.getRoleBrain('finance');
  const pmBrain = RoleBrainRegistry.getRoleBrain('pm');
  const personalMemoryStore = SophiaMemoryStore.getInstance();
  const companyBrain = CompanyBrain.getInstance();
  const claimStore = EpistemicClaimStore.getInstance();
  const knowledgeStore = CompanyKnowledgeStore.getInstance();

  const testFounderId = `founder-role-brains-${Date.now()}`;
  const taskIdA = `task-res-${Date.now()}`;
  const taskIdB = `task-fin-${Date.now()}`;

  // --------------------------------------------------------------------------
  // Group 1: Cross-Employee Working & Experience Memory Isolation
  // --------------------------------------------------------------------------
  console.log('--- Group 1: Cross-Employee Working & Experience Memory Isolation ---');

  await runTest('1.1. Employee saves and reads their own working memory', async () => {
    const mem = await researcherBrain.saveWorkingMemory({
      content: 'Evaluating vector database latency benchmarks for semantic graph query.',
      taskContext: taskIdA,
      metadata: { step: 1, confidence: 0.95 },
    });

    assert.ok(mem.id, 'Memory ID must be assigned');
    assert.strictEqual(mem.agentId, 'researcher');
    assert.strictEqual(mem.memoryScope, 'working');
    assert.strictEqual(mem.taskContext, taskIdA);

    const workingMemories = await researcherBrain.getWorkingMemory(taskIdA);
    assert.strictEqual(workingMemories.length, 1);
    assert.strictEqual(workingMemories[0].id, mem.id);
    assert.ok(workingMemories[0].content.includes('vector database latency'));
  });

  await runTest('1.2. Cross-employee read of working memory is rejected with 403', async () => {
    // Julian Cruz (finance) attempts to read Dr. Aris Thorne (researcher)'s memory
    await assert.rejects(
      async () => {
        await store.listMemories('finance', 'researcher', { scope: 'working' });
      },
      (err: any) => {
        assert.ok(err instanceof RoleBrainSecurityError, 'Error must be RoleBrainSecurityError');
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'ROLE_BRAIN_UNAUTHORIZED');
        assert.ok(err.message.includes('Access denied'));
        return true;
      }
    );
  });

  await runTest('1.3. Cross-employee clear or delete of working memory is rejected with 403', async () => {
    // PM attempts to clear researcher's memory
    await assert.rejects(
      async () => {
        await store.clearWorkingMemory('pm', 'researcher', taskIdA);
      },
      (err: any) => {
        assert.ok(err instanceof RoleBrainSecurityError);
        assert.strictEqual(err.statusCode, 403);
        return true;
      }
    );

    // Finance attempts to delete researcher's memory
    const researcherMems = await researcherBrain.getWorkingMemory(taskIdA);
    await assert.rejects(
      async () => {
        await store.deleteMemory('finance', 'researcher', researcherMems[0].id);
      },
      (err: any) => {
        assert.ok(err instanceof RoleBrainSecurityError);
        assert.strictEqual(err.statusCode, 403);
        return true;
      }
    );
  });

  await runTest('1.4. Employee records experience memory isolated from other employees', async () => {
    const pmExp = await pmBrain.recordExperience({
      content: 'Sprint velocity drops by 20% when PRDs omit OpenAPI specifications.',
      provenance: 'prd_retrospective:v1',
    });

    assert.strictEqual(pmExp.agentId, 'pm');
    assert.strictEqual(pmExp.memoryScope, 'experience');

    // Researcher cannot read PM's experience
    await assert.rejects(
      async () => {
        await store.listMemories('researcher', 'pm', { scope: 'experience' });
      },
      (err: any) => {
        assert.ok(err instanceof RoleBrainSecurityError);
        return true;
      }
    );

    // PM can read their own experience
    const pmExperiences = await pmBrain.getExperienceMemory('OpenAPI');
    assert.ok(pmExperiences.some((m) => m.id === pmExp.id));
    assert.ok(pmExperiences[0].content.includes('OpenAPI specifications'));
  });

  await runTest('1.5. Invalid roles or scopes throw RoleBrainValidationError (400)', async () => {
    await assert.rejects(
      async () => {
        await store.saveMemory({
          agentId: 'nonexistent_agent' as any,
          memoryScope: 'working',
          content: 'Test content',
          provenance: 'test',
        });
      },
      (err: any) => {
        assert.ok(err instanceof RoleBrainValidationError);
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await store.saveMemory({
          agentId: 'researcher',
          memoryScope: 'invalid_scope' as any,
          content: 'Test content',
          provenance: 'test',
        });
      },
      (err: any) => {
        assert.ok(err instanceof RoleBrainValidationError);
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // Group 2: Personal Mind Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- Group 2: Personal Mind Isolation ---');

  await runTest('2.1. Personal Mind memory exists in SophiaMemoryStore', async () => {
    const secretPersonalMem = await personalMemoryStore.createMemory({
      founderId: testFounderId,
      memoryType: 'PERSONAL_CONTEXT_NOTE',
      content: 'CONFIDENTIAL: Founder plans to take sabbatic leave in Kyoto in November.',
      lifecycleState: 'ACTIVE',
    });

    assert.ok(secretPersonalMem.id);
    const retrieved = await personalMemoryStore.getMemory(testFounderId, secretPersonalMem.id);
    assert.ok(retrieved?.content.includes('Kyoto'));
  });

  await runTest('2.2. Role Brains have zero access to Personal Mind', async () => {
    // Inspect researcher, finance, and pm projected contexts
    for (const brain of [researcherBrain, financeBrain, pmBrain]) {
      const projection = await brain.getProjectedContext();
      const serialized = JSON.stringify(projection);

      // Strict check: Personal secret never appears anywhere in the projected role context
      assert.strictEqual(
        serialized.includes('Kyoto'),
        false,
        `RoleBrain (${brain.role}) must NEVER contain Personal Mind data`
      );
      assert.strictEqual(
        serialized.includes('sabbatic leave'),
        false,
        `RoleBrain (${brain.role}) must NEVER contain Personal Mind data`
      );
    }
  });

  await runTest('2.3. ContextAssemblyService for employee task NEVER leaks Personal Mind', async () => {
    const assembly = await ContextAssemblyService.getInstance().assembleContextForTask({
      taskId: `task-assembly-${Date.now()}`,
      taskTitle: 'Analyze Q3 Research Priorities',
      taskDescription: 'Evaluate competitive landscape and upcoming schedules',
      role: 'researcher',
      founderId: testFounderId,
    });

    assert.strictEqual(assembly.isReadOnly, true);
    assert.strictEqual(assembly.employeeRole, 'researcher');

    // Assert formattedPrompt contains zero personal secrets
    assert.strictEqual(
      assembly.formattedPrompt.includes('Kyoto'),
      false,
      'Employee assembled context prompt must NOT leak personal mind'
    );

    // Assert formattedSeparatedSections contains zero personal mind
    const allSections = Object.values(assembly.formattedSeparatedSections).join('\n');
    assert.strictEqual(allSections.includes('Kyoto'), false);
  });

  // --------------------------------------------------------------------------
  // Group 3: Deterministic Company Brain Projection
  // --------------------------------------------------------------------------
  console.log('\n--- Group 3: Deterministic Company Brain Projection ---');

  let initialHash = '';

  await runTest('3.1. Role Brain projects company state and computes deterministic hash', async () => {
    const proj1 = await researcherBrain.rebuildProjection();
    assert.ok(proj1.projectionHash, 'Projection hash must exist');
    assert.strictEqual(proj1.projectionHash.length, 64, 'Must be a 64-char hex SHA-256');
    assert.ok(proj1.companyContext.constitution, 'Constitution must be projected');
    assert.ok(Array.isArray(proj1.activeFacts), 'Active facts must be projected');
    assert.ok(Array.isArray(proj1.relevantKnowledge), 'Knowledge must be projected');

    initialHash = proj1.projectionHash;

    // Second call produces identical hash
    const proj2 = await researcherBrain.rebuildProjection();
    assert.strictEqual(
      proj2.projectionHash,
      initialHash,
      'Rebuilt projection from identical Company Brain must produce identical SHA-256 hash'
    );
  });

  await runTest('3.2. Updating Company Brain deterministically reflects in refreshed projection', async () => {
    // Add a new verified canonical fact to CompanyBrain
    const newFactId = `FACT-ROLE-PROJ-${Date.now()}`;
    const newFact: CanonicalFact = {
      id: newFactId,
      claimId: `claim-proj-${Date.now()}`,
      statement: 'SamJuniors core LLM router enforces 250ms latency budget.',
      subject: 'Architecture',
      category: 'architectural',
      validityState: 'active',
      confidence: 'verified_fact',
      promotedAt: new Date().toISOString(),
      promotedBy: 'founder',
      provenance: { sourceSystem: 'benchmark' } as any,
    };
    await claimStore.saveFact(newFact);

    // Rebuild projection
    const updatedProj = await researcherBrain.rebuildProjection();
    assert.notStrictEqual(
      updatedProj.projectionHash,
      initialHash,
      'Projection hash must change when Company Brain changes'
    );
    assert.ok(
      updatedProj.activeFacts.some((f) => f.id === newFactId),
      'Refreshed projection must include the new canonical fact'
    );

    // Another rebuild produces the new hash deterministically
    const verifyRebuild = await researcherBrain.rebuildProjection();
    assert.strictEqual(verifyRebuild.projectionHash, updatedProj.projectionHash);
  });

  // --------------------------------------------------------------------------
  // Group 4: Role Brain Never Becomes Company Truth
  // --------------------------------------------------------------------------
  console.log('\n--- Group 4: Role Brain Never Becomes Company Truth ---');

  await runTest('4.1. Employee working & experience memories are not present in company knowledge or facts', async () => {
    const uniqueWorkerThought = `Internal hypothesis: speculative quantum optimization model ${Date.now()}`;

    // Record both working and experience memory for researcher
    await researcherBrain.saveWorkingMemory({
      content: uniqueWorkerThought,
      taskContext: taskIdA,
    });
    await researcherBrain.recordExperience({
      content: uniqueWorkerThought,
      provenance: 'internal_exploration',
    });

    // 1. Must NOT exist in CompanyKnowledgeStore
    const knowledgeHits = await knowledgeStore.queryKnowledge({
      query: uniqueWorkerThought,
    });
    assert.strictEqual(knowledgeHits.length, 0, 'Worker thought must NOT exist in CompanyKnowledge');

    // 2. Must NOT exist in EpistemicClaimStore / CanonicalFact
    const activeFacts = await claimStore.listActiveFacts();
    assert.ok(
      !activeFacts.some((f) => f.statement.includes(uniqueWorkerThought)),
      'Worker thought must NOT exist in CanonicalFacts'
    );

    // 3. Must NOT exist in CompanyMemoryStore (company precedents)
    const companyMemories = await companyBrain.getMemories();
    assert.ok(
      !companyMemories.some((m) => m.approvedAction?.includes(uniqueWorkerThought)),
      'Worker thought must NOT exist in CompanyMemory precedents'
    );
  });

  // --------------------------------------------------------------------------
  // Group 5: Working Memory Lifecycle & Purge
  // --------------------------------------------------------------------------
  console.log('\n--- Group 5: Working Memory Lifecycle & Purge ---');

  await runTest('5.1. clearWorkingMemory purges task scratchpad while keeping experience memory', async () => {
    const specificTask = `task-cleanup-${Date.now()}`;
    await researcherBrain.saveWorkingMemory({
      content: 'Temporary calculation for step 1.',
      taskContext: specificTask,
    });
    await researcherBrain.saveWorkingMemory({
      content: 'Temporary calculation for step 2.',
      taskContext: specificTask,
    });

    let beforeMems = await researcherBrain.getWorkingMemory(specificTask);
    assert.strictEqual(beforeMems.length, 2, 'Should have 2 working memories before clear');

    // Clear working memory for this specific task
    const cleared = await researcherBrain.clearWorkingMemory(specificTask);
    assert.strictEqual(cleared, 2, 'Cleared 2 records');

    const afterMems = await researcherBrain.getWorkingMemory(specificTask);
    assert.strictEqual(afterMems.length, 0, 'Working memories must be purged');

    // Verify researcher experience memories are completely unaffected
    const experiences = await researcherBrain.getExperienceMemory();
    assert.ok(experiences.length > 0, 'Experience memory must be preserved');
  });

  await runTest('5.2. deleteMemory deletes individual record under strict authorization', async () => {
    const mem = await financeBrain.saveWorkingMemory({
      content: 'Temporary runway calculation: 18 months.',
      taskContext: taskIdB,
    });

    const deleted = await store.deleteMemory('finance', 'finance', mem.id);
    assert.strictEqual(deleted, true);

    const remaining = await financeBrain.getWorkingMemory(taskIdB);
    assert.ok(!remaining.some((m) => m.id === mem.id));
  });

  // --------------------------------------------------------------------------
  // Group 6: Durability & Rehydration
  // --------------------------------------------------------------------------
  console.log('\n--- Group 6: Durability & Rehydration ---');

  await runTest('6.1. Role brain memories survive store rehydration', async () => {
    const uniqueExp = `Permanent engineering pattern for PM ${Date.now()}`;
    const saved = await pmBrain.recordExperience({
      content: uniqueExp,
      provenance: 'sop:pm',
    });

    // Create a new fresh store instance simulating process restart
    const freshStore = new RoleBrainStore();
    const loaded = await freshStore.listMemories('pm', 'pm', { scope: 'experience' });

    assert.ok(loaded.some((m) => m.id === saved.id), 'Memory must persist across store rehydration');
    assert.ok(loaded.some((m) => m.content === uniqueExp), 'Content must match across store rehydration');
  });

  console.log('\n======================================================');
  console.log('ALL G11.5 ROLE BRAINS TESTS PASSED CLEANLY');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('[FATAL] Unhandled error during G11.5 test run:', err);
  process.exit(1);
});
