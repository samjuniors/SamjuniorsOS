import { MultiAgentOrchestrator } from '../lib/server/orchestration/orchestrator';

async function runTest() {
  console.log('--- Phase 11.3: Web Research Integration Test ---');
  
  const orchestrator = new MultiAgentOrchestrator();
  
  (orchestrator as any).executor = {
    isConfigured: () => true,
    executeAgentTask: async (agentRole: string, taskParams: any, prompt: string) => {
      return {
        success: true,
        outputContent: 'Mocked output',
        statusMessage: 'Mocked status',
        structuredData: { summary: 'Mocked summary' },
        provenance: {
          agentId: agentRole,
          agentName: agentRole.toUpperCase(),
          taskId: 'mock-task',
          protocolStep: taskParams.protocolStep,
          timestamp: new Date().toISOString(),
          isVerified: true,
          evidenceBasis: 'system_record'
        }
      };
    }
  };

  const directive = "Competitor landscape for AI Code Assistants like GitHub Copilot";
  console.log(`Directive: ${directive}`);
  
  const result = await orchestrator.orchestrateDirective({ directive });
  
  console.log('\n--- Orchestration Completed ---');
  console.log(`Success: ${result.executiveResult?.executionOutcome}`);
  console.log('\nExecution Plan Items with Tool Evidence:');
  
  const planWithEvidence = result.plan.filter(item => item.toolSelection || item.toolEvidence);
  
  for (const item of planWithEvidence) {
    console.log(`\nStage ${item.stage} (${item.agentId} / ${item.protocolStep}):`);
    if (item.toolSelection) {
      console.log(`  Selected Tool ID: ${item.toolSelection.selectedToolId || 'none'}`);
    }
    if (item.toolEvidence) {
      console.log(`\n  --- Evidence Details ---`);
      console.log(`  Tool ID:       ${item.toolEvidence.toolId}`);
      console.log(`  Status:        ${item.toolEvidence.status}`);
      console.log(`  Input Summary: ${item.toolEvidence.inputSummary}`);
      console.log(`  Output:        ${item.toolEvidence.outputSummary}`);
      console.log(`  Verification:  ${item.toolEvidence.verificationState}`);
      if (item.toolEvidence.errorMessage) {
         console.log(`  Error:         ${item.toolEvidence.errorMessage}`);
      }
      if (item.toolEvidence.sourceReferences && item.toolEvidence.sourceReferences.length > 0) {
         console.log(`  Sources:       \n    - ${item.toolEvidence.sourceReferences.join('\n    - ')}`);
      }
    }
    console.log(`\n  Output Snippet: ${item.outputSnippet}`);
  }
}

runTest().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
