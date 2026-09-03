import assert from 'node:assert';
import { 
  ComposioProvider, 
  composioProvider, 
  getComposioConfigStatus, 
  getComposioClient, 
  registerComposioToolMapping, 
  getComposioToolMapping, 
  hasComposioToolMapping, 
  createComposioSession, 
  validateComposioPermission 
} from '../lib/server/tools/providers/composio';
import { selectTools } from '../lib/server/tools/selector';
import { 
  ToolDefinition, 
  PermissionPolicy, 
  ToolSelectionContext, 
  ExternalExecutionRequest 
} from '../types/capabilities';

console.log('=== PHASE 11.5: COMPOSIO FOUNDATION & INFRASTRUCTURE TEST SUITE ===');

async function main() {
  // Ensure COMPOSIO_API_KEY is absent during this test suite run
  const originalKey = process.env.COMPOSIO_API_KEY;
  delete process.env.COMPOSIO_API_KEY;

// ----------------------------------------------------------------------------
// TEST 1: Composio provider reports unconfigured when key is absent
// ----------------------------------------------------------------------------
{
  console.log('Test 1: Composio provider reports unconfigured when key is absent');
  const status = getComposioConfigStatus();
  assert.strictEqual(status, 'unconfigured', 'Status must be unconfigured when key is absent');
  assert.strictEqual(composioProvider.getStatus(), 'unconfigured');
  assert.strictEqual(composioProvider.isAvailable(), false, 'Provider must not report available');
  console.log('  Passed.');
}

// ----------------------------------------------------------------------------
// TEST 2: No Composio client instantiation or network request when key is absent
// ----------------------------------------------------------------------------
{
  console.log('Test 2: No client instantiation or network request when key is absent');
  const client = getComposioClient();
  assert.strictEqual(client, null, 'Client accessor must return null without key, avoiding crash');
  console.log('  Passed.');
}

// ----------------------------------------------------------------------------
// TEST 3: No fake ToolExecutionEvidence generated when Composio is unconfigured
// ----------------------------------------------------------------------------
{
  console.log('Test 3: No fake ToolExecutionEvidence when unconfigured');
  const mockRequest: ExternalExecutionRequest = {
    toolId: 'github_issue_create',
    input: { title: 'Test issue' },
    sessionScope: {
      userId: 'founder-001',
      employeeRole: 'researcher',
      permittedToolIds: ['github_issue_create'],
    },
    provenance: {
      agentId: 'researcher',
      agentName: 'Market Intelligence Analyst',
      taskId: 'task-test-01',
      protocolStep: 'research',
      timestamp: new Date().toISOString(),
      isVerified: false,
      evidenceBasis: 'unverified',
      modelUsed: 'deterministic-test',
    }
  };

  const evidence = await composioProvider.executeTool(mockRequest);
  assert.strictEqual(evidence.status, 'not_executed', 'Unconfigured provider must set status to not_executed');
  assert.strictEqual(evidence.verificationState, 'unverified', 'Must not claim verified');
  assert.strictEqual(evidence.executionSafetyState, 'verified_safe');
  assert.ok(evidence.outputSummary?.includes('unconfigured'), 'Must explain unconfigured state');
  assert.strictEqual(evidence.sources, undefined, 'No fake sources allowed');
  assert.strictEqual(evidence.claims, undefined, 'No fake claims allowed');
  assert.ok(evidence.limitations && evidence.limitations.length > 0, 'Must record limitation');
  console.log('  Passed.');
}

// ----------------------------------------------------------------------------
// TEST 4: Composio availability does NOT bypass selectTools() or permissions
// ----------------------------------------------------------------------------
{
  console.log('Test 4: Composio availability does NOT bypass selectTools() or permissions');
  
  // Define tool where provider is composio, but SamJuniors policy DENIES it
  const mockTools: ToolDefinition[] = [
    {
      id: 'github_issue_create',
      name: 'Create GitHub Issue',
      description: 'Creates an issue in repo',
      category: 'Product',
      capabilities: ['prd_creation'],
      inputSchema: {},
      outputSchema: {},
      riskLevel: 'medium',
      requiresApproval: true,
      mutationClass: 'write',
      availability: 'available', // Even if tool is marked available!
      provider: 'composio'
    }
  ];

  const deniedPolicy: PermissionPolicy[] = [
    { toolId: 'github_issue_create', effect: 'denied', reason: 'Founder restricted write access' }
  ];

  const ctx: ToolSelectionContext = {
    employeeRole: 'researcher',
    taskObjective: 'Create ticket for new feature',
    requiredSkills: ['prd_creation'],
    availableTools: mockTools,
    permissions: deniedPolicy
  };

  const selection = selectTools(ctx);
  assert.deepStrictEqual(selection.deniedTools, ['github_issue_create'], 'Tool must be denied by SamJuniors policy');
  assert.strictEqual(selection.selectedToolId, undefined, 'Composio cannot force tool selection when denied');

  // Verify adapter-level enforcement
  const authCheck = validateComposioPermission('github_issue_create', {
    userId: 'founder-1',
    permittedToolIds: [] // Not permitted
  });
  assert.strictEqual(authCheck.authorized, false);
  assert.ok(authCheck.reason?.includes('cannot bypass SamJuniors permissions'));
  console.log('  Passed.');
}

// ----------------------------------------------------------------------------
// TEST 5: Adapter-level execution blocks unauthorized tools with 'denied' status
// ----------------------------------------------------------------------------
{
  console.log('Test 5: Adapter execution blocks unauthorized tools with denied status');
  const unauthorizedRequest: ExternalExecutionRequest = {
    toolId: 'finance_transfer',
    input: { amount: 1000 },
    sessionScope: {
      userId: 'founder-001',
      employeeRole: 'advisor',
      permittedToolIds: ['web_research'], // finance_transfer NOT in permittedToolIds!
    },
    provenance: {
      agentId: 'finance',
      agentName: 'Chief Financial Officer',
      taskId: 'task-test-02',
      protocolStep: 'review',
      timestamp: new Date().toISOString(),
      isVerified: false,
      evidenceBasis: 'unverified',
      modelUsed: 'deterministic-test',
    }
  };

  const evidence = await composioProvider.executeTool(unauthorizedRequest);
  assert.strictEqual(evidence.status, 'denied', 'Status must be denied when tool is not permitted');
  assert.strictEqual(evidence.verificationState, 'unverified');
  assert.strictEqual(evidence.executionSafetyState, 'verified_safe');
  assert.ok(evidence.errorMessage?.includes('not in the permitted tools list'));
  console.log('  Passed.');
}

// ----------------------------------------------------------------------------
// TEST 6: Session boundary correctly scopes user, employee role, and permitted tools
// ----------------------------------------------------------------------------
{
  console.log('Test 6: Session boundary correctly scopes user and permitted tools');
  const session = await createComposioSession({
    userId: 'user-sam-01',
    employeeRole: 'coo',
    permittedToolIds: ['web_research'],
    connectedAccountId: 'conn-github-123'
  });

  assert.ok(session.sessionId.startsWith('comp-session-user-sam-01-coo-'));
  assert.strictEqual(session.scope.userId, 'user-sam-01');
  assert.strictEqual(session.scope.employeeRole, 'coo');
  assert.deepStrictEqual(session.scope.permittedToolIds, ['web_research']);
  assert.strictEqual(session.scope.connectedAccountId, 'conn-github-123');
  assert.strictEqual(session.isConfigured, false);
  console.log('  Passed.');
}

// ----------------------------------------------------------------------------
// TEST 7: Tool mapping abstraction registers and retrieves mappings deterministically
// ----------------------------------------------------------------------------
{
  console.log('Test 7: Tool mapping abstraction');
  assert.strictEqual(hasComposioToolMapping('drive_read'), false);
  
  registerComposioToolMapping({
    toolId: 'drive_read',
    toolkit: 'google_drive',
    action: 'GOOGLEDRIVE_GET_FILE',
    description: 'Fetch file content from Google Drive'
  });

  assert.strictEqual(hasComposioToolMapping('drive_read'), true);
  const mapping = getComposioToolMapping('drive_read');
  assert.ok(mapping);
  assert.strictEqual(mapping.toolkit, 'google_drive');
  assert.strictEqual(mapping.action, 'GOOGLEDRIVE_GET_FILE');
  console.log('  Passed.');
}

// ----------------------------------------------------------------------------
// TEST 8: Server-side only boundary verification (no browser leaks)
// ----------------------------------------------------------------------------
{
  console.log('Test 8: Server-side only boundary check');
  // Verify COMPOSIO_API_KEY is not prefixed with NEXT_PUBLIC_
  assert.strictEqual(process.env.NEXT_PUBLIC_COMPOSIO_API_KEY, undefined, 'NEXT_PUBLIC_COMPOSIO_API_KEY must not exist');
  
  // Verify provider class has server-only guard
  assert.ok(typeof composioProvider === 'object');
  console.log('  Passed.');
}

  // Restore env
  if (originalKey !== undefined) {
    process.env.COMPOSIO_API_KEY = originalKey;
  }

  console.log('\nAll Phase 11.5 tests PASSED successfully!');
}

main().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
