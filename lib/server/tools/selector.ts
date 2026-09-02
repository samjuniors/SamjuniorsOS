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
     // If the selected tool performs any mutation, deny it.
     const toolDef = context.availableTools.find(t => t.id === selectedToolId);
     if (toolDef && toolDef.mutationClass !== 'read') {
       if (selectedToolId) {
         deniedTools.push(selectedToolId);
         if (allowedTools.includes(selectedToolId)) allowedTools.splice(allowedTools.indexOf(selectedToolId), 1);
         if (approvalRequiredTools.includes(selectedToolId)) approvalRequiredTools.splice(approvalRequiredTools.indexOf(selectedToolId), 1);
       }
       selectedToolId = undefined;
       selectionReason = 'Advisor cannot execute mutation tools.';
     }
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
