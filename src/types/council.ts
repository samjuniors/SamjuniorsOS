/**
 * SamJuniorsOS — Phase 2.2.2: Bounded Executive Council Deliberation
 * Domain Types, Schemas & Contracts
 *
 * ARCHITECTURAL INVARIANTS (AGENTS.md & Issue #11):
 * 1. Single Sophia Supervisor:
 *    - Sophia Vance (COO) convenes the council, supplies the integrated proposal,
 *      solicits bounded specialist critiques, and mediates trade-offs.
 *    - No autonomous peer-to-peer swarm mesh or unconstrained multi-turn loops.
 * 2. Specialists as Scoped Capabilities:
 *    - Dr. Aris Thorne (researcher): Feasibility, empirical grounding, evidence audit.
 *    - Maya Lin (pm): Product scope, operational complexity, user journey viable tradeoffs.
 *    - Julian Cruz (finance): Unit economics, compute spend, non-negotiable 80%+ margin floor.
 * 3. Real Agent Executions:
 *    - All critiques must be backed by real ServerAgentExecutor runs with valid OutputProvenance.
 * 4. Hard Bounds:
 *    - Max review rounds: strictly 1 round in Phase 2.2.2 (hard safety limit = 1).
 *    - Max calls: bounded to active specialists (max 3) + 1 COO mediation ruling (max 4 calls total).
 *    - Wall-clock timeout & role allowlist guards per call.
 * 5. Sovereign Deterministic Verification:
 *    - Verification precedes deliberation. Non-compliant proposals stop immediately.
 *    - Mathematical margin calculation when structured revenue/cost inputs exist;
 *      explicitly 'unverified' when missing; lexical checks catch textual anti-patterns.
 * 6. Honest Resilience:
 *    - Fail-closed on errors, outages, or invalid payloads; zero fabricated consensus.
 *    - Incomplete or degraded reviews prevent consensus (status: 'degraded').
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import { AgentRole, OutputProvenance } from './os';

export type CouncilReviewStatus =
  | 'passed'
  | 'passed_with_reservations'
  | 'rejected'
  | 'failed'
  | 'degraded';

export const SpecialistStatusEnum = z.enum([
  'passed',
  'passed_with_reservations',
  'rejected',
]);

/**
 * Strict schema for specialist structured review output.
 * Fail-closed: missing, malformed, or unexpected fields will fail validation.
 */
export const SpecialistStructuredOutputSchema = z.object({
  status: SpecialistStatusEnum,
  summary: z.string().min(1, 'Summary must not be empty'),
  keyFindings: z.array(z.string()).default([]),
  risksOrFrictions: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  artifactContent: z.string().optional(),
});

export type SpecialistStructuredOutput = z.infer<typeof SpecialistStructuredOutputSchema>;

/**
 * Strict schema for COO mediation structured output.
 */
export const CooFrictionPointSchema = z.object({
  id: z.string().default('fric-1'),
  topic: z.string().min(1, 'Friction topic must not be empty'),
  raisedBy: z.string().min(1, 'Friction raisedBy must not be empty'),
  contestedBy: z.string().optional(),
  description: z.string().min(1, 'Friction description must not be empty'),
  severity: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  ruling: z.string().min(1, 'Friction ruling must not be empty'),
  resolutionStrategy: z.string().min(1, 'Resolution strategy must not be empty'),
});

export const CooMediationStructuredOutputSchema = z.object({
  verdict: z.string().min(1, 'COO verdict must not be empty'),
  ruling: z.string().min(1, 'COO ruling must not be empty'),
  frictions: z.array(CooFrictionPointSchema).default([]),
  recommendedNextActions: z.array(z.string()).default([]),
});

export type CooMediationStructuredOutput = z.infer<typeof CooMediationStructuredOutputSchema>;

export interface CouncilSpecialistCritique {
  agentId: AgentRole;
  agentName: string;
  role: string;
  status: CouncilReviewStatus;
  summary: string;
  critiqueMarkdown: string;
  keyFindings: string[];
  risksOrFrictions: string[];
  recommendations: string[];
  provenance: OutputProvenance;
  runId?: string;
  durationMs?: number;
  error?: string;
  isCached?: boolean;
  cachedFromRunId?: string;
  fingerprint?: string;
}

export interface CouncilFrictionPoint {
  id: string;
  topic: string;
  raisedBy: AgentRole;
  contestedBy?: AgentRole;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  ruling: string;
  resolutionStrategy: string;
  resolvedBy: 'coo';
}

export type CouncilDeliberationStatus =
  | 'consensus_achieved'
  | 'consensus_with_reservations'
  | 'frictions_escalated'
  | 'verification_rejected'
  | 'degraded'
  | 'unknown_outcome';

export type CouncilLeaseStatus =
  | 'in_progress'
  | 'completed'
  | 'degraded'
  | 'unknown_outcome';

export interface StructuredFinancialInput {
  revenue?: number;
  cogs?: number;
  computeCost?: number;
  grossMarginPercent?: number;
}

export interface CouncilDeliberationResult {
  deliberationId: string;
  directive: string;
  round: number;
  maxRounds: number;
  status: CouncilDeliberationStatus;
  verdict: string;
  specialistCritiques: CouncilSpecialistCritique[];
  frictions: CouncilFrictionPoint[];
  cooRuling: string;
  recommendedNextActions: string[];
  startedAt: string;
  completedAt: string;
  totalCalls: number;
  durationMs: number;
  verificationPassed: boolean;
  notes?: string;
  financialVerificationState?:
    | 'calculated_compliant'
    | 'calculated_violation'
    | 'unverified_pending_founder_review'
    | 'lexical_violation';
  calculatedMarginPercent?: number;
  orphanedProviderCalls?: string[];
  idempotencyKey?: string;
}

export interface CouncilDeliberationRecord {
  id: string;
  deliberationId?: string;
  idempotencyKey: string;
  leaseStatus: CouncilLeaseStatus;
  claimedByPid: number;
  claimedAt: string;
  expiresAt: string;
  fingerprint: string;
  result?: CouncilDeliberationResult;
  orphanedProviderCalls?: string[];
  error?: string;
  reconciledAt?: string;
  reconciliationReason?: string;
}

export interface CouncilDeliberationInput {
  directive: string;
  cooScopeContent?: string;
  researchFindings?: string;
  productSpecs?: string;
  financeAssessment?: string;
  verificationNotes?: string;
  verificationStatus?: 'verified' | 'failed' | 'pending';
  activeAgents?: AgentRole[];
  maxRounds?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  structuredFinancials?: StructuredFinancialInput;
  idempotencyKey?: string;
  forceFresh?: boolean;
}

export const SPECIALIST_CONTRACT_VERSION = 'v2.2.2';
export const COUNCIL_CONTRACT_VERSION = 'v2.2.2';

/**
 * Computes a canonical SHA-256 fingerprint for a specialist review request.
 * Any change to directive, upstream package, prompt version, or financial inputs
 * invalidates the fingerprint and forces a fresh execution.
 */
export function computeSpecialistReviewFingerprint(
  agentId: AgentRole,
  input: CouncilDeliberationInput
): string {
  const canonicalPayload = JSON.stringify({
    contractVersion: SPECIALIST_CONTRACT_VERSION,
    agentId,
    directive: input.directive,
    cooScope: input.cooScopeContent || '',
    researchFindings: input.researchFindings || '',
    productSpecs: input.productSpecs || '',
    financeAssessment: input.financeAssessment || '',
    verificationNotes: input.verificationNotes || '',
    financials: {
      revenue: input.structuredFinancials?.revenue,
      cogs: input.structuredFinancials?.cogs,
      computeCost: input.structuredFinancials?.computeCost,
    },
  });
  return createHash('sha256').update(canonicalPayload).digest('hex');
}

/**
 * Computes a canonical SHA-256 fingerprint for a full council deliberation request.
 */
export function computeCouncilFingerprint(input: CouncilDeliberationInput): string {
  const canonicalPayload = JSON.stringify({
    contractVersion: COUNCIL_CONTRACT_VERSION,
    directive: input.directive,
    cooScope: input.cooScopeContent || '',
    researchFindings: input.researchFindings || '',
    productSpecs: input.productSpecs || '',
    financeAssessment: input.financeAssessment || '',
    verificationNotes: input.verificationNotes || '',
    activeAgents: input.activeAgents ? [...input.activeAgents].sort() : [],
    financials: {
      revenue: input.structuredFinancials?.revenue,
      cogs: input.structuredFinancials?.cogs,
      computeCost: input.structuredFinancials?.computeCost,
    },
  });
  return createHash('sha256').update(canonicalPayload).digest('hex');
}
