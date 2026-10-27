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
  | 'EPISTEMIC_FACT'                 // Verified claims, authoritative only per verification status (Phase 1 compat)
  | 'CANONICAL_FACT'                 // Verified, active canonical facts (Phase 2)
  | 'SUPERSEDED_FACT'                // M5.2 — historical/superseded canonical facts, clearly labeled, NEVER current truth (advisory historical projection)
  | 'UNVERIFIED_CLAIM'               // Pending/under-review claims; strictly unverified hypotheses (Phase 2)
  | 'ACTIVE_WORKFLOW_STATE'          // Authoritative in-flight workflows & agent runs
  | 'PENDING_GOVERNANCE_STATE'       // Authoritative pending founder approval gates
  | 'COMPANY_KNOWLEDGE'              // Durable reference SOPs, PRDs, and architecture documents (Phase 2)
  | 'HISTORICAL_PRECEDENT'           // Past run summaries & decision outcomes, not current empirical data
  | 'RECENT_ACTIVITY'                 // Authoritative projected recent company actions (Phase 2)
  | 'CHANGE_RECORD'                   // M5.2 — derived windowed change enumeration (pointers to authoritative records; advisory, not a truth position)
  | 'EPISODIC_MEMORY'                 // M5.2 — founder-scoped past-conversation recall; interaction records only, never company truth
  | 'PERSONAL_MIND_MEMORY';           // Founder-scoped personal/interaction context (M3 K-2) — contextual ONLY, never company authority, never an authorization source

export type MemoryScope = 'personal_mind' | 'company_brain';

export interface SophiaContextSlice {
  label: string;
  authority: SophiaAuthorityClass;
  provenance: string;
  content: string;
  isStale?: boolean;
  sourceIds?: string[];
}

export interface SophiaAssembledContext {
  slices: SophiaContextSlice[];
  formattedContext: string;
  estimatedTokens: number;
  dynamicPayloadTokens?: number;
  retrievalHit?: boolean;
  degradedStores?: string[];
  scopes?: MemoryScope[];
  sources?: string[];
  sourceIds?: string[];
  tokenBreakdown?: {
    operationalState?: number;
    activeWorkflows?: number;
    pendingGovernance?: number;
    changeRecord?: number;
    canonicalFacts?: number;
    supersededFacts?: number;
    unverifiedClaims?: number;
    companyKnowledge?: number;
    historicalPrecedent?: number;
    recentActivity?: number;
    episodicMemory?: number;
    dependencyPath?: number;
    dialogueHistory?: number;
    personalMind?: number;
  };
}

/**
 * CONSERVATIVE ENTITY RESOLUTION RESULT
 * Tri-state deterministic candidate matching:
 * - resolved: exactly 1 high-confidence match
 * - unresolved: 0 matches (honest reporting; zero guessing)
 * - ambiguous: multiple candidates (triggers clarification)
 */
export type EntityResolutionResult<T> =
  | { status: 'resolved'; candidate: T; matchReason: string }
  | { status: 'unresolved'; reason: string }
  | { status: 'ambiguous'; candidates: T[]; reason: string };

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
/**
 * Authoritative 5-Route Minimal Router taxonomy for Sophia (M1.2 / G12.1).
 * The model proposes; deterministic policy disposes.
 */
import type {
  SophiaRoute,
  RouteMemoryScope,
  RouteSideEffectClass,
  DecisionRouteDefinition,
} from '../../../types/decision';
import {
  SOPHIA_ROUTES,
  DECISION_ROUTE_TAXONOMY,
  isKnownSophiaRoute,
  getRouteDefinition,
  isRouteMemoryScopeAllowed,
} from '../../../types/decision';

export {
  SOPHIA_ROUTES,
  DECISION_ROUTE_TAXONOMY,
  isKnownSophiaRoute,
  getRouteDefinition,
  isRouteMemoryScopeAllowed,
};
export type {
  SophiaRoute,
  RouteMemoryScope,
  RouteSideEffectClass,
  DecisionRouteDefinition,
};

export interface SophiaRouteResult {
  route: SophiaRoute;
  proposal: CandidateIntentProposal;
  liveAi: boolean;
  confidence: number;
  reason: string;
  rawOutput?: string;
}

export type CandidateIntentProposal =
  | {
      kind: 'conversation';
      route?: SophiaRoute;
      reply: string;
      confidence: number;
      reason: string;
    }
  | {
      kind: 'informational_query';
      route?: SophiaRoute;
      domain: 'company_metrics' | 'epistemic_fact' | 'workstream_status' | 'general' | 'personal';
      query: string;
      subject?: string;
      confidence: number;
      reason: string;
    }
  | {
      kind: 'operational_inspection';
      route?: SophiaRoute;
      target: string;
      proposedTool?: string;
      reason: string;
      confidence: number;
    }
  | {
      kind: 'directive_proposal';
      route?: SophiaRoute;
      title: string;
      objective: string;
      assignedAgents: ('coo' | 'researcher' | 'pm' | 'finance')[];
      proposedExecutionMode: 'autonomous' | 'prepare_only'; // Proposal only; deterministic policy evaluates
      confidence: number;
      reason: string;
    }
  | {
      kind: 'steering_proposal';
      route?: SophiaRoute;
      action: 'pause' | 'resume' | 'redirect' | 'halt';
      targetRunId?: string;
      modification?: string;
      confidence: number;
      reason: string;
    }
  | {
      kind: 'approval_proposal';
      route?: SophiaRoute;
      decision: 'approved' | 'rejected' | 'request_revision';
      approvalId?: string;
      actionName?: string;
      note?: string;
      confidence: number;
      reason: string;
    }
  | {
      kind: 'clarification_prompt';
      route?: SophiaRoute;
      ambiguityReason: string;
      structuredOptions: string[];
      suggestedScope?: string;
      confidence: number;
      reason: string;
    }
  | {
      kind: 'refuse';
      route?: 'refuse';
      reply: string;
      confidence: number;
      reason: string;
    }
  | {
      kind: 'research_proposal';
      route?: SophiaRoute;
      topic: string;
      sources?: string[];
      depth?: 'quick' | 'deep';
      confidence: number;
      reason: string;
    }
  | {
      kind: 'tool_call_proposal';
      route?: SophiaRoute;
      toolName: string;
      parameters?: Record<string, unknown>;
      confidence: number;
      reason: string;
    }
  | {
      kind: 'schedule_proposal';
      route?: SophiaRoute;
      title: string;
      intervalMinutes?: number;
      recurrenceRule?: string;
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
      scopes?: MemoryScope[];
      sources?: string[];
      sourceIds?: string[];
    }
  | {
      type: 'RESOLVED_INFORMATION';
      reply: string;
      provenance: string[];
      scopes?: MemoryScope[];
      sources?: string[];
      sourceIds?: string[];
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

export interface TurnMetrics {
  contextAssemblyMs: number;
  retrievalMs?: number;
  modelMs: number;
  gatewayValidationMs: number;
  totalTurnMs: number;
  estimatedTokens: {
    input: number;
    output: number;
    dynamicPayload?: number;
    systemPrompt?: number;
    breakdown?: {
      operationalState?: number;
      activeWorkflows?: number;
      pendingGovernance?: number;
      changeRecord?: number;
      canonicalFacts?: number;
      supersededFacts?: number;
      unverifiedClaims?: number;
      companyKnowledge?: number;
      historicalPrecedent?: number;
      recentActivity?: number;
      episodicMemory?: number;
      dialogueHistory?: number;
      personalMind?: number;
    };
  };
  retrievalHit?: boolean;
  degradedStores?: string[];
}

export interface SophiaExecutionResult {
  success: boolean;
  validatedCommand: ValidatedSophiaCommand;
  proposal: CandidateIntentProposal;
  reply: string;
  metrics?: TurnMetrics;
  directiveExecuted: boolean;
  orchestrationRun?: OrchestrationRun;
  authoritativeData?: any;
  liveAi: boolean;
  error?: string;
  agentId?: string;
  name?: string;
  role?: string;
  intent?: string;
  scopes?: MemoryScope[];
  sources?: string[];
  sourceIds?: string[];
}
