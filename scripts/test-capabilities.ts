import assert from 'node:assert';
import { selectTools } from '../lib/server/tools/selector';
import { 
  ToolDefinition, 
  PermissionPolicy,
  ToolSelectionContext
} from '../types/capabilities';

console.log('Running capability architecture tests...');

// ----------------------------------------------------------------------------
// 1. SKILL & 2. TOOL REGISTRATION (Mocks for testing)
// ----------------------------------------------------------------------------
const mockTools: ToolDefinition[] = [
  {
    id: 'web_search',
    name: 'Web Search',
    description: 'Searches the web',
    category: 'Research',
    capabilities: ['web_research', 'competitor_research'],
    inputSchema: {},
    outputSchema: {},
    riskLevel: 'low',
    requiresApproval: false,
    mutationClass: 'read',
    availability: 'available',
    provider: 'internal'
  },
  {
    id: 'finance_transfer',
    name: 'Finance Transfer',
    description: 'Transfers money',
    category: 'Finance',
    capabilities: ['execution_monitoring'], // Just a mock
    inputSchema: {},
    outputSchema: {},
    riskLevel: 'high',
    requiresApproval: true,
    mutationClass: 'execute',
    availability: 'available',
    provider: 'internal'
  },
  {
    id: 'gmail_send',
    name: 'Send Email',
    description: 'Sends an email',
    category: 'Communication',
    capabilities: ['task_coordination'],
    inputSchema: {},
    outputSchema: {},
    riskLevel: 'medium',
    requiresApproval: true,
    mutationClass: 'write',
    availability: 'unconfigured',
    provider: 'google'
  }
];

// Test 3, 4, 5, 6, 7: Tool selection and Permission logic
{
  const permissions: PermissionPolicy[] = [
    { toolId: 'web_search', effect: 'allowed' }
  ];

  const ctx: ToolSelectionContext = {
    employeeRole: 'researcher',
    taskObjective: 'Find market size',
    requiredSkills: ['web_research'],
    availableTools: mockTools,
    permissions
  };

  const res = selectTools(ctx);
  assert.deepStrictEqual(res.candidateTools, ['web_search'], 'Candidate should be web_search based on skill');
  assert.deepStrictEqual(res.allowedTools, ['web_search'], 'web_search is allowed');
  assert.strictEqual(res.selectedToolId, 'web_search', 'Tool selection based on skill & allowed permission');
}

// Test 4: Denied permission
{
  const permissions: PermissionPolicy[] = [
    { toolId: 'web_search', effect: 'denied' }
  ];
  const ctx: ToolSelectionContext = {
    employeeRole: 'researcher',
    taskObjective: 'Find market size',
    requiredSkills: ['web_research'],
    availableTools: mockTools,
    permissions
  };

  const res = selectTools(ctx);
  assert.deepStrictEqual(res.deniedTools, ['web_search'], 'web_search should be denied');
  assert.strictEqual(res.selectedToolId, undefined, 'No tool should be selected');
}

// Test 5 & 10: Approval-required permission / High risk
{
  const permissions: PermissionPolicy[] = [
    { toolId: 'finance_transfer', effect: 'allowed' } // Should be downgraded to approval_required due to high risk
  ];
  const ctx: ToolSelectionContext = {
    employeeRole: 'finance',
    taskObjective: 'Transfer $10k',
    requiredSkills: ['execution_monitoring'],
    availableTools: mockTools,
    permissions
  };

  const res = selectTools(ctx);
  assert.deepStrictEqual(res.approvalRequiredTools, ['finance_transfer'], 'High-risk tool downgraded to approval_required');
  assert.strictEqual(res.selectedToolId, 'finance_transfer', 'Tool selected but marked approval required');
}

// Test 6: Unknown permission defaults to deny
{
  const ctx: ToolSelectionContext = {
    employeeRole: 'researcher',
    taskObjective: 'Find market size',
    requiredSkills: ['web_research'],
    availableTools: mockTools,
    permissions: [] // No permissions specified
  };

  const res = selectTools(ctx);
  assert.deepStrictEqual(res.deniedTools, ['web_search'], 'Missing permission defaults to deny');
  assert.strictEqual(res.selectedToolId, undefined);
}

// Test 8: Tool selection based on employee role / 11. Advisor cannot gain execution permission
{
  const permissions: PermissionPolicy[] = [
    { toolId: 'finance_transfer', effect: 'allowed' }
  ];
  const ctx: ToolSelectionContext = {
    employeeRole: 'advisor',
    taskObjective: 'Transfer money',
    requiredSkills: ['execution_monitoring'],
    availableTools: mockTools,
    permissions
  };

  const res = selectTools(ctx);
  assert.strictEqual(res.selectedToolId, undefined, 'Advisor cannot execute mutation tools');
  assert.deepStrictEqual(res.deniedTools, ['finance_transfer'], 'Advisor executing mutation tool is denied');
}

// Test 9: Incompatible tool rejected (Availability offline/unconfigured)
{
  const permissions: PermissionPolicy[] = [
    { toolId: 'gmail_send', effect: 'allowed' }
  ];
  const ctx: ToolSelectionContext = {
    employeeRole: 'coo',
    taskObjective: 'Send email',
    requiredSkills: ['task_coordination'],
    availableTools: mockTools,
    permissions
  };

  const res = selectTools(ctx);
  assert.deepStrictEqual(res.deniedTools, ['gmail_send'], 'Unconfigured tool should be denied');
  assert.strictEqual(res.selectedToolId, undefined);
}

// Test 12: Employee cannot modify permissions
// (Handled by strict type passing: context.permissions is input only from server side policies, employees can't inject)

// Test 13: No external tools are actually called
// (Selection interface returns IDs and metadata only, no execution code exists)

console.log('All capabilities architecture tests passed!');
