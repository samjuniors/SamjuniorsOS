import { AgentRole, OutputProvenance } from './os';
import { ContextItemProvenance, EpistemicClassification } from './context';

/**
 * ============================================================================
 * SAMJUNIORS OS — GOVERNED EPISTEMIC & MEMORY LIFECYCLE TYPING
 * 
 * Inspired by OptimalEngine's governed epistemic architecture:
 * Source → Signal → Claim → Review/Verification → Fact → Memory → Retrieval
 * 
 * Combined with FounderOS's typed boundaries and honest provenance guarantees.
 * ============================================================================
 */

export type EpistemicStatus = 
  | 'pending'
  | 'under_review'
  | 'promoted_to_fact'
  | 'rejected'
  | 'superseded';

export type FactValidityState =
  | 'active'
  | 'superseded'
  | 'disputed'
  | 'deprecated';

export type EpistemicConfidence =
  | 'verified_fact'
  | 'high_confidence'
  | 'medium_confidence'
  | 'unverified'
  | 'hypothetical';

/**
 * Stage 1: RAW EVIDENCE SOURCE
 * The ground-truth raw artifact from external systems or real tool execution.
 */
export interface EvidenceSource {
  id: string;
  sourceSystem: string; // e.g. "github", "stripe", "resend", "tool_execution", "founder_input"
  uri?: string;
  title: string;
  rawContent: string;
  contentHash: string; // SHA-256 hash for tamper detection
  capturedAt: string;
  capturedBy: AgentRole | 'founder' | 'system';
  metadata?: Record<string, any>;
  provenanceKind: 'live_operational' | 'synthetic' | 'sandbox_mock';
}

/**
 * Stage 2: EPISTEMIC SIGNAL
 * Parsed and structured observation derived from an EvidenceSource.
 */
export interface EpistemicSignal {
  id: string;
  sourceId: string;
  signalType: 'metric_observation' | 'system_event' | 'code_analysis' | 'financial_record' | 'communication';
  extractedObservation: string;
  data?: Record<string, any>;
  confidence: EpistemicConfidence;
  timestamp: string;
}

/**
 * Stage 3: EPISTEMIC CLAIM
 * A proposition, assertion, or model inference proposed by an agent or human.
 * CRITICAL RULE: Claims are NEVER company truth until verified and promoted.
 */
export interface EpistemicClaim {
  id: string;
  sourceId?: string;
  signalId?: string;
  statement: string;
  subject: string; // e.g. "gross_margin", "customer_pricing", "container_architecture"
  category: 'financial' | 'architectural' | 'operational' | 'market_research' | 'governance';
  proposedBy: AgentRole | 'founder' | 'advisor' | 'system';
  confidence: EpistemicConfidence;
  verificationStatus: EpistemicStatus;
  evidenceReferences: string[]; // IDs of supporting EvidenceSource or ToolExecutionEvidence
  verificationNotes?: string;
  agentRunId?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

/**
 * Stage 4: VERIFICATION POLICY RESULT
 * The outcome of running a claim through verification policies (e.g. contradiction checks,
 * constitutional floor checks, founder review).
 */
export interface VerificationPolicyResult {
  claimId: string;
  passed: boolean;
  policyOutcome: 'approved_for_promotion' | 'rejected_contradiction' | 'rejected_unverified' | 'requires_founder_review';
  conflictingFactIds?: string[];
  reason: string;
  verifiedAt: string;
  verifiedBy: string; // role or userId
  precedenceNote?: string;
}

/**
 * Stage 5: CANONICAL FACT
 * Promoted, verified truth of the company. Retains strict cryptographic lineage back to Claim & Source.
 */
export interface CanonicalFact {
  id: string;
  claimId: string;
  sourceId?: string;
  statement: string;
  subject: string;
  category: 'financial' | 'architectural' | 'operational' | 'market_research' | 'governance';
  validityState: FactValidityState;
  supersededById?: string; // If superseded by a newer verified fact
  confidence: 'verified_fact';
  promotedAt: string;
  promotedBy: string;
  provenance: ContextItemProvenance;
}

/**
 * Stage 6: GOVERNED MEMORY OBJECT
 * Packaged organizational precedent combining Fact + Context + Precedent for retrieval.
 */
export interface GovernedMemoryObject {
  id: string;
  factId: string;
  decisionId?: string;
  approvedAction: string;
  executionOutcome: string;
  evidenceReferences: string[];
  epistemicConfidence: 'verified_fact';
  category: string;
  tags: string[];
  importance: number; // 1 - 5
  decayScore: number;
  timestamp: string;
  recordedAt: string;
  provenance: ContextItemProvenance;
}
