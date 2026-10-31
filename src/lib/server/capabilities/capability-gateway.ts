/**
 * SamJuniorsOS — Capability Gateway (Gate G14.1 & G14.2)
 *
 * Single authoritative execution gateway for all tools, skills, and MCP servers.
 * Invariant: Every capability call MUST pass through this gateway.
 *
 * Enforces:
 * 1. Request schema validation.
 * 2. Trust tier enforcement (untrusted is quarantined/denied).
 * 3. Autonomy policy evaluation (AutonomyPolicyEngine).
 * 4. Side-effect authorization gate (SideEffectAuthorizationGate) for consequential mutations.
 * 5. Cost accounting and immutable append-only audit trail.
 * 6. MCP integration: routes mcp_stdio / mcp_sse execution through McpClientAdapter (G14.2).
 */

import { v4 as uuidv4 } from 'uuid';
import {
  CapabilityInvocationRequest,
  CapabilityInvocationRequestSchema,
  CapabilityInvocationResult,
  RouteSideEffectClass,
} from '@/types/capability';
import { AutonomyActionClass } from '@/types/autonomy';
import {
  SideEffectClassification,
  SideEffectAuditRecord,
  AuthorizationReasonCode,
} from '@/types/authorization';
import { McpServerConfig } from '@/types/mcp';
import { CapabilityRegistry } from './capability-registry';
import { AutonomyPolicyEngine } from '@/lib/server/authorization/autonomy-policy';
import { SideEffectAuthorizationGate } from '@/lib/server/authorization/gate';
import { InMemoryAuditStore } from '@/lib/server/authorization/approval-store';
import { McpClientAdapter } from './mcp-client';

export class CapabilityGateway {
  /**
   * Authoritative entrypoint: invokes a capability through policy and approval gates.
   */
  public static async invoke(
    rawRequest: CapabilityInvocationRequest
  ): Promise<CapabilityInvocationResult> {
    const parseResult = CapabilityInvocationRequestSchema.safeParse(rawRequest);
    if (!parseResult.success) {
      return {
        success: false,
        capabilityId: rawRequest?.capabilityId || 'unknown',
        status: 'error',
        error: `Invalid invocation request: ${parseResult.error.message}`,
        durationMs: 0,
        costChargedCents: 0,
      };
    }

    const request = parseResult.data;
    const registry = CapabilityRegistry.getInstance();
    const capability = registry.get(request.capabilityId);

    if (!capability) {
      return {
        success: false,
        capabilityId: request.capabilityId,
        status: 'error',
        error: `Capability "${request.capabilityId}" is not registered in the CapabilityRegistry.`,
        durationMs: 0,
        costChargedCents: 0,
      };
    }

    const { manifest } = capability;

    // 1. Trust tier check: Untrusted capabilities are strictly quarantined
    if (manifest.trustTier === 'untrusted') {
      return {
        success: false,
        capabilityId: request.capabilityId,
        status: 'denied',
        error: `Execution denied: Capability "${request.capabilityId}" has trust tier "untrusted" and is quarantined.`,
        durationMs: 0,
        costChargedCents: 0,
      };
    }

    // 2. Map sideEffectClass to AutonomyActionClass and SideEffectClassification
    const autonomyClass = mapSideEffectToAutonomyClass(manifest.sideEffectClass);
    const sideEffectClassification = mapSideEffectToClassification(manifest.sideEffectClass);

    // 3. Evaluate Autonomy Policy Engine
    const policyResult = AutonomyPolicyEngine.getInstance().evaluate({
      actionClass: autonomyClass,
      employeeRole: request.callerAgentId,
    });

    if (policyResult.effect === 'forbidden') {
      return {
        success: false,
        capabilityId: request.capabilityId,
        status: 'denied',
        error:
          policyResult.reason ||
          `Execution forbidden by company autonomy policy for action class "${autonomyClass}".`,
        durationMs: 0,
        costChargedCents: 0,
      };
    }

    // 4. Approval check:
    // If policy says needs_approval, or if sideEffectClass is external_hard_to_reverse,
    // financial_legal, or destructive_security, halt and route to Founder approval.
    const requiresFounderApproval =
      policyResult.effect === 'needs_approval' ||
      manifest.sideEffectClass === 'external_hard_to_reverse' ||
      manifest.sideEffectClass === 'financial_legal' ||
      manifest.sideEffectClass === 'destructive_security';

    if (requiresFounderApproval) {
      const gate = SideEffectAuthorizationGate.getInstance();
      const approvalRecord = await gate.requestApproval({
        actionName: manifest.id,
        classification: sideEffectClassification,
        workflowInstanceId: request.conversationId || 'adhoc-capability',
        stepId: manifest.id,
        employeeRole: (request.callerAgentId as any) || 'system',
        notes: request.reason || `Invocation of capability ${manifest.id}`,
        payload: request.parameters,
      });

      return {
        success: false,
        capabilityId: request.capabilityId,
        status: 'awaiting_founder_approval',
        approvalId: approvalRecord.id,
        payloadHash: approvalRecord.payloadHash,
        error: 'Side effect requires explicit Founder approval before execution.',
        durationMs: 0,
        costChargedCents: 0,
      };
    }

    // 5. Execution
    const startTime = performance.now();
    try {
      let data: any;
      if (capability.executor) {
        data = await capability.executor(request.parameters, {
          callerAgentId: request.callerAgentId,
          userId: request.userId,
          conversationId: request.conversationId,
          reason: request.reason,
        });
      } else if (
        manifest.entrypoint.type === 'mcp_stdio' ||
        manifest.entrypoint.type === 'mcp_sse'
      ) {
        const mcpClient = McpClientAdapter.getInstance();
        const serverConfig: McpServerConfig = {
          id: manifest.id,
          name: manifest.name,
          transport: manifest.entrypoint.type === 'mcp_stdio' ? 'stdio' : 'sse',
          command: manifest.entrypoint.target,
          args: manifest.entrypoint.args || [],
          env: manifest.entrypoint.env,
          timeoutMs: 10000,
        };
        const toolName =
          (manifest.metadata?.mcpToolName as string) ||
          manifest.id.split(':').pop() ||
          manifest.id;

        const result = await mcpClient.callTool(
          serverConfig,
          toolName,
          request.parameters,
          {
            callerAgentId: request.callerAgentId,
            userId: request.userId,
            conversationId: request.conversationId,
          }
        );
        data = result;
      } else {
        data = {
          executed: true,
          capabilityId: manifest.id,
          entrypoint: manifest.entrypoint,
        };
      }

      const durationMs = Math.round(performance.now() - startTime);
      const costChargedCents = manifest.cost?.perCallCents ?? 0;

      // 6. Record immutable audit record
      const reasonCode: AuthorizationReasonCode =
        manifest.sideEffectClass === 'read_only'
          ? 'READ_ONLY_ALLOWED'
          : 'INTERNAL_MUTATION_ALLOWED';

      const auditRecord: SideEffectAuditRecord = {
        id: `audit-${uuidv4()}`,
        timestamp: new Date().toISOString(),
        requestId: `req-${uuidv4()}`,
        employeeRole: (request.callerAgentId as any) || 'system',
        requestedBy: request.callerAgentId,
        skillId: manifest.id,
        actionClassification: sideEffectClassification,
        actionName: manifest.id,
        decision: 'allowed',
        reasonCode,
        reason: `Capability "${manifest.id}" executed via CapabilityGateway.`,
        executed: true,
      };

      try {
        await InMemoryAuditStore.getInstance().record(auditRecord);
      } catch (auditErr) {
        console.error('[CapabilityGateway] Failed to persist audit record:', auditErr);
      }

      return {
        success: true,
        capabilityId: request.capabilityId,
        status: 'executed',
        data,
        durationMs,
        costChargedCents,
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - startTime);
      return {
        success: false,
        capabilityId: request.capabilityId,
        status: 'error',
        error: err?.message || 'Capability execution encountered an unhandled error.',
        durationMs,
        costChargedCents: 0,
      };
    }
  }
}

/**
 * Maps RouteSideEffectClass to AutonomyActionClass
 */
function mapSideEffectToAutonomyClass(
  sideEffectClass: RouteSideEffectClass
): AutonomyActionClass {
  switch (sideEffectClass) {
    case 'read_only':
      return 'read';
    case 'internal_write':
      return 'internal_write';
    case 'external_reversible':
      return 'external_reversible';
    case 'external_hard_to_reverse':
      return 'external_hard_to_reverse';
    case 'financial_legal':
      return 'financial_legal';
    case 'destructive_security':
      return 'destructive_security';
    default:
      return 'internal_write';
  }
}

/**
 * Maps RouteSideEffectClass to SideEffectClassification
 */
function mapSideEffectToClassification(
  sideEffectClass: RouteSideEffectClass
): SideEffectClassification {
  switch (sideEffectClass) {
    case 'read_only':
      return 'read_only';
    case 'internal_write':
      return 'internal_mutation';
    case 'external_reversible':
      return 'external_record_mutation';
    case 'external_hard_to_reverse':
      return 'external_communication';
    case 'financial_legal':
      return 'financial_action';
    case 'destructive_security':
      return 'high_impact_action';
    default:
      return 'internal_mutation';
  }
}
