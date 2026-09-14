import { AgentRole, OrchestrationRun } from '@/types/os';
import { SideEffectClassification } from '@/types/authorization';

/**
 * ============================================================================
 * SOPHIA CONVERSATIONAL EXECUTIVE — TYPES (PHASE 1)
 * ============================================================================
 * Defines the core types for Cognitive Ingress, Context Assembly, and the
 * Untrusted Model Proposal Boundary.
 */

export type SophiaAuthorityClass =
  | 'CONVERSATIONAL_RECORD'          // Conversational memory, not factual authority
  | 'AUTHORITATIVE_OPERATIONAL_STATE'// Live verified company metrics & database state
  | 'EPISTEMIC_FACT'                 // Verified claims, authoritative only per verification status
  | 'ACTIVE_WORKFLOW_STATE'          // Authoritative in-flight workflows & agent runs
  | 'PENDING_GOVERNANCE_STATE'       // Authoritative pending founder approval gates
  | 'HISTORICAL_PRECEDENT';          // Past run summaries & decision outcomes, not new empirical data

export interface SophiaContextSlice {
  label: string;
  authority: SophiaAuthorityClass;
  provenance: string;
  content: string;
  isStale?: boolean;
}

export interface SophiaAssembledContext {
  slices: SophiaContextSlice[];
  formattedContext: string;
  estimatedTokens: number;
}

/**
 * UNTRUSTED CANDIDATE INTENT PROPOSAL
 * Emitted by the cognitive model reasoning layer.
 * 
 * SECURITY INVARIANT:
 * The model NEVER generates:
 * - founderId
 * - sessionToken
 * - authenticationIdentity
 * - approvalAuthority
 * - credentials
 * - authorization grants
 * 
 * The candidate proposal is treated strictly as UNTRUSTED data.
 */
export type CandidateIntentProposal =
  | {
      kind: 'conversation';
      reply: string;
      confidence: number;
      reason: string;
    }
  | {
      kind: 'informational_query';
      domain: 'company_metrics' | 'epistemic_fact' | 'workstream_status' | 'general';
      query: string;
      subject?: string;
      confidence: number;
      reason: string;
    }
  | {
      kind: 'operational_inspection';
      target: string;
      proposedTool?: string;
      reason: string;
      confidence: number;
    }
  | {
      kind: 'directive_proposal';
      title: string;
      objective: string;
      assignedAgents: ('coo' | 'researcher' | 'pm' | 'finance')[];
      proposedExecutionMode: 'autonomous' | 'prepare_only'; // Proposal only; deterministic policy evaluates
      confidence: number;
      reason: string;
    }
  | {
      kind: 'steering_proposal';
      action: 'pause' | 'resume' | 'redirect' | 'halt';
      targetRunId?: string;
      modification?: string;
      confidence: number;
      reason: string;
    }
  | {
      kind: 'approval_proposal';
      decision: 'approved' | 'rejected' | 'request_revision';
      approvalId?: string;
      actionName?: string;
      note?: string;
      confidence: number;
      reason: string;
    }
  | {
      kind: 'clarification_prompt';
      ambiguityReason: string;
      structuredOptions: string[];
      suggestedScope?: string;
      confidence: number;
      reason: string;
    };

/**
 * TRUSTED SERVER VALIDATED COMMAND
 * Constructed exclusively by server-side trusted gateway code AFTER
 * validating session principal and evaluating deterministic policy.
 */
export type ValidatedSophiaCommand =
  | {
      type: 'CONVERSATION_REPLY';
      reply: string;
    }
  | {
      type: 'RESOLVED_INFORMATION';
      reply: string;
      provenance: string[];
    }
  | {
      type: 'DISPATCH_INSPECTION';
      target: string;
      toolId: string;
      verifiedFounderId: string;
    }
  | {
      type: 'DISPATCH_DIRECTIVE';
      title: string;
      objective: string;
      assignedAgents: AgentRole[];
      authorizedExecutionMode: 'autonomous' | 'prepare_only';
      verifiedFounderId: string;
    }
  | {
      type: 'RESOLVE_APPROVAL';
      approvalId: string;
      decision: 'approved' | 'rejected' | 'request_revision';
      note?: string;
      verifiedFounderId: string;
    }
  | {
      type: 'PRESENT_CLARIFICATION';
      ambiguityReason: string;
      structuredOptions: string[];
      suggestedScope?: string;
    }
  | {
      type: 'REGISTER_STEERING';
      action: 'pause' | 'resume' | 'redirect' | 'halt';
      targetRunId?: string;
      modification?: string;
      verifiedFounderId: string;
    };

/**
 * Performance & Turn Latency Instrumentation
 */
export interface TurnMetrics {
  contextAssemblyMs: number;
  modelMs: number;
  gatewayValidationMs: number;
  totalTurnMs: number;
  estimatedTokens: {
    input: number;
    output: number;
  };
}

export interface SophiaExecutionResult {
  success: boolean;
  agentId: string;
  name: string;
  role: string;
  intent: string;
  proposal: CandidateIntentProposal;
  reply: string;
  liveAi: boolean;
  directiveExecuted?: boolean;
  orchestrationRun?: OrchestrationRun;
  metrics: TurnMetrics;
}
