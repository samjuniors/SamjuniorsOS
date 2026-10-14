/**
 * SamJuniorsOS — Phase 2.2.2: Bounded Executive Council Deliberation
 * Domain Types & Contracts
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
 *    - Max review rounds: 1 by default, hard cap <= 2.
 *    - Max calls: bounded to active specialists (max 3) + 1 COO mediation ruling.
 *    - Timeout & budget guards per call.
 * 5. Sovereign Deterministic Verification:
 *    - Verification precedes deliberation. Non-compliant proposals stop immediately.
 *    - Critiques and rulings are checked for invariant violations (margin floor, secrets, escalation).
 * 6. Honest Resilience:
 *    - Fail-closed on errors, outages, or invalid payloads; zero fabricated consensus.
 */

import { AgentRole, OutputProvenance } from './os';

export type CouncilReviewStatus =
  | 'passed'
  | 'passed_with_reservations'
  | 'rejected'
  | 'failed'
  | 'degraded';

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
  | 'degraded';

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
}
