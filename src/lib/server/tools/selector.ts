import { 
  ToolSelectionContext, 
  ToolSelectionResult, 
  ToolDefinition, 
  PermissionPolicy,
  ToolId 
} from '@/types/capabilities';

/**
 * Deterministic tool evaluation and selection.
 * Enforces least privilege: Unknown tool -> deny, unknown permission -> deny.
 * High-risk mutation -> requires approval or deny based on policy.
 */
export function selectTools(context: ToolSelectionContext): ToolSelectionResult {
  const candidateTools: ToolId[] = [];
  const allowedTools: ToolId[] = [];
  const deniedTools: ToolId[] = [];
  const approvalRequiredTools: ToolId[] = [];
  let selectedToolId: ToolId | undefined = undefined;
  let selectionReason = 'No candidate tools match the required skills.';

  // 1. Identify candidates based on skills
  const candidates = context.availableTools.filter(tool => 
    context.requiredSkills.some(skill => tool.capabilities.includes(skill))
  );

  for (const tool of candidates) {
    candidateTools.push(tool.id);

    // 2. Check availability
    if (tool.availability !== 'available') {
      deniedTools.push(tool.id);
      continue;
    }

    // 3. Check permission policy (Default to Deny if unknown)
    const policy = context.permissions.find(p => p.toolId === tool.id);
    const effect = policy?.effect ?? 'denied';

    // 4. Enforce high-risk safety net (High risk mutations must not be blindly allowed)
    let finalEffect = effect;
    if (tool.riskLevel === 'high' && effect === 'allowed') {
      if (tool.requiresApproval) {
        finalEffect = 'approval_required';
      }
    }

    // 5. Categorize
    if (finalEffect === 'allowed') {
      allowedTools.push(tool.id);
    } else if (finalEffect === 'approval_required') {
      approvalRequiredTools.push(tool.id);
    } else {
      deniedTools.push(tool.id);
    }
  }

  // 6. Select the best tool (first allowed, then fallback to approval_required)
  if (allowedTools.length > 0) {
    selectedToolId = allowedTools[0];
    selectionReason = `Selected allowed tool: ${selectedToolId}`;
  } else if (approvalRequiredTools.length > 0) {
    selectedToolId = approvalRequiredTools[0];
    selectionReason = `Selected tool requiring approval: ${selectedToolId}`;
  } else if (deniedTools.length > 0) {
    selectionReason = `All candidate tools were denied.`;
  }

  // Enforce Employee Role constraints (Advisor cannot gain execution permissions)
  if (context.employeeRole === 'advisor') {
    // Advisor has no external tool execution authority. It may reason over evidence but cannot execute tools.
    for (const toolId of [...allowedTools, ...approvalRequiredTools]) {
      if (!deniedTools.includes(toolId)) {
        deniedTools.push(toolId);
      }
    }
    allowedTools.length = 0;
    approvalRequiredTools.length = 0;
    selectedToolId = undefined;
    selectionReason = 'Advisor role has no external tool execution authority. Advisor may reason over evidence but cannot execute tools.';
  }

  return {
    candidateTools,
    allowedTools,
    deniedTools,
    approvalRequiredTools,
    selectedToolId,
    reason: selectionReason
  };
}
