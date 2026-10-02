/**
 * ============================================================================
 * M5.1 — GOLD-STANDARD SYNTHETIC BENCHMARK FIXTURE
 * ============================================================================
 * A SMALL, fully synthetic memory universe for measuring the EXISTING (A0)
 * M4 retrieval architecture. NOTHING in this file is a production fact: all
 * entities, numbers, decisions and dates are invented for measurement.
 *
 * REQUIREMENTS SATISFIED HERE (task M5.1):
 *   - multiple entities: Lumora, Aurorium, Nimbus Gateway, Helix Analytics,
 *     Helix Identity Store, Aurorium Auth Service, SamJuniors (synthetic)
 *   - multiple timestamps across a frozen timeline (May–Sep 2026)
 *   - old AND new facts (pricing v1→v2, personal email→dashboard)
 *   - superseded facts (FACT-OLD-01, PM-05) with successor pointers
 *   - related projects + decisions (PREC-*, DEC-*)
 *   - evidence/provenance (EvidenceSources, claim→fact chains, evidence refs)
 *   - personal memories AND company facts
 *   - intentionally similar lexical wording (KN-06 support "tiers" vs
 *     pricing "tiers"; PREC-06 "Lumora discount ... pricing migration")
 *   - intentionally different wording, same meaning (PM-10 "keeps replies
 *     tight and terse when tired" vs "how I prefer to work")
 *   - at least one contradiction ($29 cost-plus vs $49 value-based; email vs
 *     dashboard strategy updates)
 *   - at least one multi-hop chain with NO lexical bridge record:
 *       Nimbus Gateway → depends on → Aurorium Auth Service  (FACT-DEP-01)
 *       Aurorium Auth Service → depends on → Helix Identity Store (FACT-DEP-02)
 *     No fixture record contains both "Nimbus Gateway" and
 *     "Helix Identity Store"; reaching FACT-DEP-01 from a Helix-anchored
 *     query REQUIRES a traversal operator the current architecture lacks.
 *   - every gold answer in queries.ts names its authoritative evidence here.
 *
 * FROZEN TIMELINE (all ISO-8601 UTC):
 *   2026-05-12  company seeded (out of every window)
 *   2026-05-20  DEC-02 office lease renewal (out of window)
 *   2026-06-01  PREC-05 office monitors (out of window)
 *   2026-06-15  FACT-OLD-01 promoted ($29 cost-plus)
 *   2026-06-25  ---- CHANGE WINDOW OPENS (BQ2) ----
 *   2026-07-01  KN-02 verified (cost-plus era SOP)
 *   2026-07-02..2026-07-25  personal memories accumulate
 *   2026-08-05  KN-03 verified
 *   2026-08-10  KN-05 verified
 *   2026-08-14  CONV-EP-01 (episodic abandonment rationale)
 *   2026-08-15  PREC-02 microservices abandonment
 *   2026-08-20  FACT-DEP-01 promoted; PREC-03
 *   2026-08-22  FACT-DEP-02 promoted; PREC-04; KN-04 verified
 *   2026-08-28  PREC-06 discount freeze
 *   2026-09-02  DEC-01 value-based pricing decision; PREC-01 recorded
 *   2026-09-05  PM-06 created; PM-05 superseded → PM-06
 *   2026-09-08  KN-01 verified (v2 pricing policy)
 *   2026-09-10  FACT-CUR-01 promoted ($49 value-based; supersedes OLD)
 *   2026-09-12  FACT-FIN-01 promoted (burn/runway)
 *   2026-09-15  CLAIM-01 proposed (pending, unverified)
 *   2026-09-18  STATE-FIN-01 financial model (fixture truth)
 *   2026-09-20  PM-04 captured (PENDING_REVIEW)
 *   2026-09-25  ---- CHANGE WINDOW CLOSES (BQ2) ----
 */

import { createHash } from 'crypto';
import type {
  CompanyInitiative,
  CompanyDecision,
  FinanceMetric,
} from '../../src/types/os';
import type { CompanyKnowledgeItem } from '../../src/types/context';
import type { CompanyMemory } from '../../src/types/os';
import type {
  CanonicalFact,
  EpistemicClaim,
  EvidenceSource,
} from '../../src/types/epistemic';

// ---------------------------------------------------------------------------
// Principals
// ---------------------------------------------------------------------------

export const FOUNDER_A = 'founder-m51-a';
export const FOUNDER_B = 'founder-m51-b';

// ---------------------------------------------------------------------------
// Personal Mind records (fixture spec; seeded through SophiaMemoryStore)
// ---------------------------------------------------------------------------

export interface PersonalMemorySpec {
  evidenceKey: string;
  founderId: string;
  memoryType:
    | 'INTERACTION_PREFERENCE'
    | 'COMMUNICATION_PREFERENCE'
    | 'INTERACTION_PATTERN'
    | 'PERSONAL_CONTEXT_NOTE'
    | 'INTERACTION_OBSERVATION';
  content: string;
  provenance: string;
  confidence: number;
  /** Birth state; SUPERSEDED/ARCHIVED/REJECTED are reached via transitions. */
  birthState: 'ACTIVE' | 'PENDING_REVIEW';
  createdAt: string;
  updatedAt: string;
  /** Founder-executed transition applied AFTER creation (lifecycle machinery). */
  transition?: {
    to: 'SUPERSEDED' | 'ARCHIVED' | 'REJECTED' | 'ACTIVE';
    /** evidenceKey of the successor when to === 'SUPERSEDED'. */
    successorKey?: string;
    at: string;
  };
  /** Semantic note: what this record exists to test. */
  purpose: string;
}

export const PERSONAL_MEMORIES: PersonalMemorySpec[] = [
  {
    evidenceKey: 'PM-01',
    founderId: FOUNDER_A,
    memoryType: 'INTERACTION_PREFERENCE',
    content: 'Prefers short written briefings over long meetings.',
    provenance: 'founder_direct',
    confidence: 0.9,
    birthState: 'ACTIVE',
    createdAt: '2026-07-02T09:00:00.000Z',
    updatedAt: '2026-07-02T09:00:00.000Z',
    purpose: 'Core work-style gold (lexically reachable via "prefer" fold).',
  },
  {
    evidenceKey: 'PM-02',
    founderId: FOUNDER_A,
    memoryType: 'COMMUNICATION_PREFERENCE',
    content: 'Wants bullet-point summaries in the morning digest.',
    provenance: 'founder_direct',
    confidence: 0.85,
    birthState: 'ACTIVE',
    createdAt: '2026-07-15T08:30:00.000Z',
    updatedAt: '2026-07-15T08:30:00.000Z',
    purpose: 'Communication gold; no lexical anchor for "communication preferences" (type/filter gap).',
  },
  {
    evidenceKey: 'PM-03',
    founderId: FOUNDER_A,
    memoryType: 'INTERACTION_PATTERN',
    content: 'Reviews revenue numbers every Friday afternoon.',
    provenance: 'founder_direct',
    confidence: 0.8,
    birthState: 'ACTIVE',
    createdAt: '2026-08-01T14:00:00.000Z',
    updatedAt: '2026-08-01T14:00:00.000Z',
    purpose: 'Work-rhythm gold; unreachable lexically from work-style queries (paraphrase).',
  },
  {
    evidenceKey: 'PM-04',
    founderId: FOUNDER_A,
    memoryType: 'INTERACTION_PREFERENCE',
    content: 'Prefers phone calls for urgent decisions.',
    provenance: 'm4cap:conv-m51-episodic:turn-9:0',
    confidence: 0.5,
    birthState: 'PENDING_REVIEW',
    createdAt: '2026-09-20T11:00:00.000Z',
    updatedAt: '2026-09-20T11:00:00.000Z',
    purpose: 'Lifecycle authority: captured candidate — must NEVER render anywhere.',
  },
  {
    evidenceKey: 'PM-05',
    founderId: FOUNDER_A,
    memoryType: 'COMMUNICATION_PREFERENCE',
    content: 'Wants weekly strategy updates sent by email.',
    provenance: 'founder_direct',
    confidence: 0.7,
    birthState: 'ACTIVE',
    createdAt: '2026-07-10T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
    transition: { to: 'SUPERSEDED', successorKey: 'PM-06', at: '2026-09-05T10:00:00.000Z' },
    purpose: 'Superseded personal preference (email) — must not render for "now" queries.',
  },
  {
    evidenceKey: 'PM-06',
    founderId: FOUNDER_A,
    memoryType: 'COMMUNICATION_PREFERENCE',
    content: 'Prefers strategy updates in the shared dashboard instead of email.',
    provenance: 'founder_direct',
    confidence: 0.88,
    birthState: 'ACTIVE',
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
    purpose: 'Successor preference (dashboard) — current-truth gold for supersession checks.',
  },
  {
    evidenceKey: 'PM-07',
    founderId: FOUNDER_A,
    memoryType: 'PERSONAL_CONTEXT_NOTE',
    content: 'Dislikes early-morning meetings before 9am.',
    provenance: 'founder_direct',
    confidence: 0.75,
    birthState: 'ACTIVE',
    createdAt: '2026-08-20T09:15:00.000Z',
    updatedAt: '2026-08-20T09:15:00.000Z',
    purpose: 'Work-style gold; no lexical anchor (paraphrase-only).',
  },
  {
    evidenceKey: 'PM-08',
    founderId: FOUNDER_A,
    memoryType: 'INTERACTION_PREFERENCE',
    content: 'Prefers video calls for deep work sessions.',
    provenance: 'm4cap:conv-m51-episodic:turn-4:0',
    confidence: 0.4,
    birthState: 'PENDING_REVIEW',
    createdAt: '2026-09-16T16:00:00.000Z',
    updatedAt: '2026-09-18T16:00:00.000Z',
    transition: { to: 'REJECTED', at: '2026-09-18T16:00:00.000Z' },
    purpose: 'REJECTED tombstone — out of context forever, kept for duplicate detection.',
  },
  {
    evidenceKey: 'PM-09',
    founderId: FOUNDER_A,
    memoryType: 'PERSONAL_CONTEXT_NOTE',
    content: 'Keeps personal Lumora pricing scratch notes in a paper journal.',
    provenance: 'founder_direct',
    confidence: 0.6,
    birthState: 'ACTIVE',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    purpose:
      'BOUNDARY TRAP: personal content that lexically matches company pricing queries. ' +
      'May render in the PERSONAL_MIND untrusted container; must NEVER surface as company evidence.',
  },
  {
    evidenceKey: 'PM-10',
    founderId: FOUNDER_A,
    memoryType: 'INTERACTION_OBSERVATION',
    content: 'Keeps replies tight and terse when tired in the evening.',
    provenance: 'founder_direct',
    confidence: 0.55,
    birthState: 'ACTIVE',
    createdAt: '2026-07-25T21:00:00.000Z',
    updatedAt: '2026-07-25T21:00:00.000Z',
    purpose:
      'PARAPHRASE-ONLY GOLD: same meaning as "how I prefer to work", zero folded-token overlap ' +
      'with every work-style query in the registry (B_semantic measurement).',
  },
  {
    evidenceKey: 'PM-11',
    founderId: FOUNDER_A,
    memoryType: 'PERSONAL_CONTEXT_NOTE',
    content: 'Thinks the company financial state looks healthier than last year.',
    provenance: 'founder_direct',
    confidence: 0.65,
    birthState: 'ACTIVE',
    createdAt: '2026-09-14T18:00:00.000Z',
    updatedAt: '2026-09-14T18:00:00.000Z',
    purpose:
      'BOUNDARY TRAP: personal opinion about company finances — lexically matches the financial-state ' +
      'query on the personal surface; must never be an authority source for it.',
  },
  {
    evidenceKey: 'PM-B1',
    founderId: FOUNDER_B,
    memoryType: 'COMMUNICATION_PREFERENCE',
    content: 'Prefers Slack pings over email.',
    provenance: 'founder_direct',
    confidence: 0.9,
    birthState: 'ACTIVE',
    createdAt: '2026-09-10T09:00:00.000Z',
    updatedAt: '2026-09-10T09:00:00.000Z',
    purpose: 'Cross-founder isolation: must never appear in FOUNDER_A retrieval.',
  },
  {
    evidenceKey: 'PM-B2',
    founderId: FOUNDER_B,
    memoryType: 'INTERACTION_PATTERN',
    content: 'Reviews metrics on Monday mornings.',
    provenance: 'founder_direct',
    confidence: 0.9,
    birthState: 'ACTIVE',
    createdAt: '2026-09-12T09:00:00.000Z',
    updatedAt: '2026-09-12T09:00:00.000Z',
    purpose: 'Cross-founder isolation (second record).',
  },
  {
    evidenceKey: 'PM-12',
    founderId: FOUNDER_A,
    memoryType: 'PERSONAL_CONTEXT_NOTE',
    content: 'Takes afternoon walks to reset focus.',
    provenance: 'founder_direct',
    confidence: 0.7,
    birthState: 'ACTIVE',
    createdAt: '2026-07-05T13:00:00.000Z',
    updatedAt: '2026-09-03T13:00:00.000Z',
    transition: { to: 'ARCHIVED', at: '2026-09-03T13:00:00.000Z' },
    purpose:
      'ARCHIVED ("forget from cognition, not from record"): out of context, retained and ' +
      'restorable. Completes all five lifecycle states in the fixture.',
  },
];

// ---------------------------------------------------------------------------
// Company Knowledge (fixture spec; seeded via CompanyKnowledgeStore.setKnowledge)
// ---------------------------------------------------------------------------

export const COMPANY_KNOWLEDGE: CompanyKnowledgeItem[] = [
  {
    id: 'know-m51-pricing-v2',
    documentId: 'SOP-LUMORA-PRICING-V2',
    title: 'Lumora Pricing Policy (Value-Based, v2)',
    category: 'sop',
    version: '2.1.0',
    summary:
      'Current Lumora pricing: value-based tiers Starter $49/month, Growth $199/month, Enterprise custom.',
    content:
      'Lumora Pricing Policy v2 (value-based). Tiers: Starter $49 per seat per month; Growth $199 per ' +
      'seat per month; Enterprise custom contract. Approved 2026-09-02. Supersedes the cost-plus policy ' +
      'documented in v1. Margin analysis: blended gross margin target 82% holds across tiers.',
    tags: ['lumora', 'pricing', 'value-based', 'tiers'],
    applicableDepartments: ['council', 'coo', 'finance'],
    authorAuthority: 'Founder-ratified SOP',
    lastVerifiedDate: '2026-09-08',
    isDurableReference: true,
  },
  {
    id: 'know-m51-pricing-v1',
    documentId: 'SOP-LUMORA-PRICING-V1',
    title: 'Lumora Pricing Policy (Cost-Plus, v1)',
    category: 'sop',
    version: '1.3.0',
    summary:
      'Previous Lumora pricing: cost-plus markup Starter $29/month, Growth $99/month.',
    content:
      'Lumora Pricing Policy v1 (cost-plus). Tiers: Starter $29 per seat per month; Growth $99 per seat ' +
      'per month. Cost-plus markup of 40% over unit delivery cost. Retired 2026-09-02 when the company ' +
      'moved Lumora pricing to value-based tiers.',
    tags: ['lumora', 'pricing', 'cost-plus'],
    applicableDepartments: ['council', 'coo', 'finance'],
    authorAuthority: 'Founder-ratified SOP',
    lastVerifiedDate: '2026-07-01',
    isDurableReference: true,
  },
  {
    id: 'know-m51-nimbus-runbook',
    documentId: 'RUNBOOK-NIMBUS',
    title: 'Nimbus Gateway Runbook',
    category: 'technical_architecture',
    version: '1.0.0',
    summary: 'Operational runbook for the Nimbus Gateway API front door.',
    content:
      'Nimbus Gateway runbook: restart procedure, horizontal scaling, and alert routing for the gateway ' +
      'that fronts the Lumora API. Does not cover authentication internals.',
    tags: ['nimbus', 'gateway', 'runbook'],
    applicableDepartments: ['council', 'coo'],
    authorAuthority: 'Engineering runbook',
    lastVerifiedDate: '2026-08-05',
    isDurableReference: true,
  },
  {
    id: 'know-m51-helix-contract',
    documentId: 'SPEC-HELIX-DATA-CONTRACT',
    title: 'Helix Analytics Data Contract',
    category: 'product_spec',
    version: '1.2.0',
    summary: 'Event schemas, retention and partitioning for the analytics warehouse.',
    content:
      'Helix Analytics data contract: event schema registry, 18-month retention, daily partitioning of ' +
      'the analytics warehouse, and consumer onboarding steps.',
    tags: ['helix', 'analytics', 'data-contract'],
    applicableDepartments: ['council', 'coo'],
    authorAuthority: 'Engineering spec',
    lastVerifiedDate: '2026-08-22',
    isDurableReference: true,
  },
  {
    id: 'know-m51-aurorium-checklist',
    documentId: 'CHECKLIST-AURORIUM',
    title: 'Aurorium Launch Checklist',
    category: 'policy',
    version: '1.0.0',
    summary: 'Pre-launch checklist for the Aurorium rollout.',
    content:
      'Aurorium launch checklist: auth configuration verified, load test green, rollback plan staged, ' +
      'support rotation staffed.',
    tags: ['aurorium', 'launch'],
    applicableDepartments: ['council', 'pm'],
    authorAuthority: 'Product checklist',
    lastVerifiedDate: '2026-08-10',
    isDurableReference: true,
  },
  {
    id: 'know-m51-lumora-support',
    documentId: 'SOP-LUMORA-SUPPORT',
    title: 'Lumora Support Escalation Policy',
    category: 'sop',
    version: '1.1.0',
    summary: 'Support response tiers for each Lumora plan.',
    content:
      'Lumora support policy: response tiers per plan — Starter 48h, Growth 8h, Enterprise 1h with ' +
      'dedicated channel. Escalation path defined for billing and outage classes.',
    tags: ['lumora', 'support', 'tiers'],
    applicableDepartments: ['council'],
    authorAuthority: 'Founder-ratified SOP',
    lastVerifiedDate: '2026-07-20',
    isDurableReference: true,
  },
];

// ---------------------------------------------------------------------------
// Company Memory — historical precedent (seeded via setMemories)
// ---------------------------------------------------------------------------

export const COMPANY_MEMORIES: CompanyMemory[] = [
  {
    id: 'PREC-01',
    decisionId: 'dec-lumora-pricing-2026-09',
    approvedAction: 'Switch Lumora pricing from cost-plus markup to value-based tiers',
    executionOutcome:
      'Standard tier revenue per account rose 18% within two billing cycles after the switch',
    evidenceReferences: ['fin-model-2026-09', 'pricing-experiment-12'],
    epistemicConfidence: 'high_confidence',
    timestamp: '2026-09-02T09:00:00.000Z',
    recordedAt: '2026-09-02T09:00:00.000Z',
  },
  {
    id: 'PREC-02',
    decisionId: 'dec-aurorium-refactor-abandon',
    approvedAction: 'Abandon the microservices refactor of Aurorium',
    executionOutcome:
      'Team coordination overhead exceeded the latency gains; returned to a modular monolith',
    evidenceReferences: ['arch-review-2026-08', 'latency-benchmark-aurorium', 'conversation:conv-m51-episodic'],
    epistemicConfidence: 'high_confidence',
    timestamp: '2026-08-15T10:00:00.000Z',
    recordedAt: '2026-08-15T10:00:00.000Z',
  },
  {
    id: 'PREC-03',
    decisionId: 'dec-nimbus-gateway-launch',
    approvedAction: 'Approve Nimbus Gateway launch as the front door for the Lumora API',
    executionOutcome: 'Gateway latency p95 dropped to 120ms under production load',
    evidenceReferences: ['gateway-load-test'],
    epistemicConfidence: 'high_confidence',
    timestamp: '2026-08-20T15:00:00.000Z',
    recordedAt: '2026-08-20T15:00:00.000Z',
  },
  {
    id: 'PREC-04',
    decisionId: 'dec-helix-analytics-build',
    approvedAction: 'Build Helix Analytics on the Helix Identity Store data warehouse',
    executionOutcome: 'Nightly identity-warehouse pipeline shipped on schedule',
    evidenceReferences: ['helix-dcr'],
    epistemicConfidence: 'high_confidence',
    timestamp: '2026-08-22T11:00:00.000Z',
    recordedAt: '2026-08-22T11:00:00.000Z',
  },
  {
    id: 'PREC-05',
    decisionId: 'dec-office-monitors',
    approvedAction: 'Purchase ergonomic desk monitors for the hardware testing lab',
    executionOutcome: 'Procured within the approved office budget',
    evidenceReferences: ['hardware-invoice-489'],
    epistemicConfidence: 'high_confidence',
    timestamp: '2026-06-01T10:00:00.000Z',
    recordedAt: '2026-06-01T10:00:00.000Z',
  },
  {
    id: 'PREC-06',
    decisionId: 'dec-lumora-discount-freeze',
    approvedAction: 'Freeze Lumora discount codes during the pricing migration',
    executionOutcome: 'No discount leakage during the cutover window',
    evidenceReferences: ['billing-audit-2026-08'],
    epistemicConfidence: 'high_confidence',
    timestamp: '2026-08-28T09:00:00.000Z',
    recordedAt: '2026-08-28T09:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Epistemic chain: sources → claims → facts (seeded via EpistemicClaimStore)
// ---------------------------------------------------------------------------

export const EPISTEMIC_SOURCES: EvidenceSource[] = [
  {
    id: 'SRC-01',
    sourceSystem: 'stripe',
    uri: 'stripe://invoices/2026-06',
    title: 'June 2026 billing export',
    rawContent: 'Lumora Starter seats billed at $29/month (cost-plus era).',
    contentHash: 'bench-src-01',
    capturedAt: '2026-06-14T00:00:00.000Z',
    capturedBy: 'system',
    provenanceKind: 'live_operational',
  },
  {
    id: 'SRC-02',
    sourceSystem: 'stripe',
    uri: 'stripe://invoices/2026-09',
    title: 'September 2026 billing export',
    rawContent: 'Lumora Starter seats billed at $49/month (value-based era).',
    contentHash: 'bench-src-02',
    capturedAt: '2026-09-09T00:00:00.000Z',
    capturedBy: 'system',
    provenanceKind: 'live_operational',
  },
];

export const EPISTEMIC_CLAIMS: EpistemicClaim[] = [
  {
    id: 'CLAIM-01',
    statement: 'Lumora Enterprise tier may reach $1M ARR by Q4',
    subject: 'lumora_enterprise_arr',
    category: 'financial',
    proposedBy: 'advisor',
    confidence: 'hypothetical',
    verificationStatus: 'pending',
    evidenceReferences: ['advisor-forecast-note'],
    createdAt: '2026-09-15T14:00:00.000Z',
  },
  {
    id: 'CLAIM-02',
    sourceId: 'SRC-02',
    statement: 'Lumora Starter tier is priced at $49 per seat per month',
    subject: 'lumora_pricing',
    category: 'financial',
    proposedBy: 'founder',
    confidence: 'verified_fact',
    verificationStatus: 'promoted_to_fact',
    evidenceReferences: ['SRC-02'],
    verificationNotes: 'Verified against the September billing export.',
    createdAt: '2026-09-09T09:00:00.000Z',
    reviewedAt: '2026-09-10T09:00:00.000Z',
    reviewedBy: 'founder',
  },
  {
    id: 'CLAIM-03',
    sourceId: 'SRC-01',
    statement: 'Lumora Starter tier is priced at $29 per seat per month',
    subject: 'lumora_pricing',
    category: 'financial',
    proposedBy: 'founder',
    confidence: 'verified_fact',
    verificationStatus: 'promoted_to_fact',
    evidenceReferences: ['SRC-01'],
    verificationNotes: 'Verified against the June billing export.',
    createdAt: '2026-06-14T09:00:00.000Z',
    reviewedAt: '2026-06-15T09:00:00.000Z',
    reviewedBy: 'founder',
  },
];

/**
 * Canonical facts. FACT-OLD-01 is seeded ACTIVE and then superseded through
 * the REAL store machinery (markFactSuperseded) so the chain on disk is
 * produced by the production code path, not by fixture fiat.
 */
export interface CanonicalFactSpec extends CanonicalFact {
  evidenceKey: string;
  purpose: string;
}

export const CANONICAL_FACTS: CanonicalFactSpec[] = [
  {
    evidenceKey: 'FACT-OLD-01',
    id: 'fact-lumora-price-29',
    claimId: 'CLAIM-03',
    sourceId: 'SRC-01',
    statement: 'Lumora Starter tier is priced at $29 per seat per month under cost-plus pricing',
    subject: 'lumora_pricing',
    category: 'financial',
    validityState: 'active', // superseded via store machinery at seed time
    supersededById: 'fact-lumora-price-49',
    confidence: 'verified_fact',
    promotedAt: '2026-06-15T09:00:00.000Z',
    promotedBy: 'founder',
    provenance: {
      sourceSystem: 'epistemic_pipeline',
      sourceId: 'SRC-01',
      sourceTitle: 'June 2026 billing export',
      epistemicType: 'canonical_fact',
      authority: 'Founder-promoted canonical fact',
      timestamp: '2026-06-15T09:00:00.000Z',
      confidence: 'verified_fact',
    },
    purpose: 'SUPERSEDED company truth ($29): the "previous" gold for temporal queries.',
  },
  {
    evidenceKey: 'FACT-CUR-01',
    id: 'fact-lumora-price-49',
    claimId: 'CLAIM-02',
    sourceId: 'SRC-02',
    statement: 'Lumora Starter tier is priced at $49 per seat per month under value-based pricing',
    subject: 'lumora_pricing',
    category: 'financial',
    validityState: 'active',
    confidence: 'verified_fact',
    promotedAt: '2026-09-10T09:00:00.000Z',
    promotedBy: 'founder',
    provenance: {
      sourceSystem: 'epistemic_pipeline',
      sourceId: 'SRC-02',
      sourceTitle: 'September 2026 billing export',
      epistemicType: 'canonical_fact',
      authority: 'Founder-promoted canonical fact',
      timestamp: '2026-09-10T09:00:00.000Z',
      confidence: 'verified_fact',
    },
    purpose: 'CURRENT company truth ($49): the "now" gold for supersession/contradiction queries.',
  },
  {
    evidenceKey: 'FACT-FIN-01',
    id: 'fact-burn-runway',
    claimId: 'claim-burn-runway-2026-09',
    statement: 'Company monthly burn rate is $34,000 with 14 months of runway',
    subject: 'financial_state',
    category: 'financial',
    validityState: 'active',
    confidence: 'verified_fact',
    promotedAt: '2026-09-12T09:00:00.000Z',
    promotedBy: 'founder',
    provenance: {
      sourceSystem: 'epistemic_pipeline',
      sourceId: 'ledger-2026-09',
      sourceTitle: 'September ledger reconciliation',
      epistemicType: 'canonical_fact',
      authority: 'Founder-promoted canonical fact',
      timestamp: '2026-09-12T09:00:00.000Z',
      confidence: 'verified_fact',
    },
    purpose: 'Financial-state canonical fact (company authority gold).',
  },
  {
    evidenceKey: 'FACT-DEP-01',
    id: 'fact-nimbus-auth-dependency',
    claimId: 'claim-nimbus-auth-dependency',
    statement: 'Nimbus Gateway depends on the Aurorium Auth Service for token verification',
    subject: 'service_dependencies',
    category: 'architectural',
    validityState: 'active',
    confidence: 'verified_fact',
    promotedAt: '2026-08-20T09:00:00.000Z',
    promotedBy: 'founder',
    provenance: {
      sourceSystem: 'epistemic_pipeline',
      sourceId: 'arch-review-2026-08',
      sourceTitle: 'Architecture review August 2026',
      epistemicType: 'canonical_fact',
      authority: 'Founder-promoted canonical fact',
      timestamp: '2026-08-20T09:00:00.000Z',
      confidence: 'verified_fact',
    },
    purpose:
      'MULTI-HOP EDGE (hop 2 from a Helix-anchored query). Deliberately contains NO Helix Identity ' +
      'Store tokens — unreachable without traversal.',
  },
  {
    evidenceKey: 'FACT-DEP-02',
    id: 'fact-auth-helix-dependency',
    claimId: 'claim-auth-helix-dependency',
    statement: 'Aurorium Auth Service depends on the Helix Identity Store for credential storage',
    subject: 'service_dependencies',
    category: 'architectural',
    validityState: 'active',
    confidence: 'verified_fact',
    promotedAt: '2026-08-22T09:00:00.000Z',
    promotedBy: 'founder',
    provenance: {
      sourceSystem: 'epistemic_pipeline',
      sourceId: 'arch-review-2026-08',
      sourceTitle: 'Architecture review August 2026',
      epistemicType: 'canonical_fact',
      authority: 'Founder-promoted canonical fact',
      timestamp: '2026-08-22T09:00:00.000Z',
      confidence: 'verified_fact',
    },
    purpose: 'MULTI-HOP EDGE (hop 1 from a Helix-anchored query) — lexically reachable.',
  },
];

// ---------------------------------------------------------------------------
// CompanyState (seeded via durable 'company_state' before store construction)
// ---------------------------------------------------------------------------

export const STATE_FINANCIAL_MODEL: FinanceMetric = {
  mrr: 18500,
  arr: 222000,
  grossMargin: 82,
  computeSpend: 4200,
  runwayMonths: 14,
  burnRate: 34000,
  netIncome: -15500,
  tokenUsageMillions: 8.4,
};

export const STATE_INITIATIVES: CompanyInitiative[] = [
  {
    id: 'init-lumora-scale',
    title: 'Lumora Scale Program',
    codeName: 'LUMORA-SCALE',
    status: 'Active',
    currentObjective:
      'Execute the value-based pricing decision dec-pricing-value-based and grow Lumora ARR to $500k',
    contributors: [],
    latestResult: 'Pricing cutover completed with zero billing incidents',
    nextRecommendedAction: 'Expand Growth-tier onboarding capacity',
    risks: [],
    updatedAt: '2026-09-18T00:00:00.000Z',
  },
  {
    id: 'init-aurorium-hardening',
    title: 'Aurorium Hardening Initiative',
    status: 'Active',
    currentObjective: 'Harden the Aurorium Auth Service before the enterprise pilot',
    contributors: [],
    latestResult: 'Token verification latency down to 40ms p95',
    nextRecommendedAction: 'Complete the identity-store failover drill',
    risks: ['Identity store failover not yet rehearsed'],
    updatedAt: '2026-09-16T00:00:00.000Z',
  },
  {
    id: 'init-brand-refresh',
    title: 'Brand Refresh 2027',
    codeName: 'BRAND-27',
    status: 'Paused',
    currentObjective: 'Refresh company brand assets for the 2027 cycle',
    contributors: [],
    latestResult: 'Paused pending product milestones',
    nextRecommendedAction: 'Revisit after Lumora Scale Program',
    risks: [],
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
];

export const STATE_DECISIONS: CompanyDecision[] = [
  {
    id: 'dec-pricing-value-based',
    title: 'Adopt value-based pricing company-wide',
    status: 'approved',
    category: 'Strategic',
    recommendedBy: 'coo',
    agentId: 'coo',
    recommendation: 'Move all Lumora tiers to value-based pricing',
    businessImpact: 'Revenue per account +18% in two billing cycles',
    evidenceSummary: 'Pricing experiment 12 and the July financial model',
    date: '2026-09-02T00:00:00.000Z',
    founderApprovalRequired: true,
  },
  {
    id: 'dec-office-lease',
    title: 'Renew the office lease for 12 months',
    status: 'approved',
    category: 'Product',
    recommendedBy: 'coo',
    agentId: 'coo',
    recommendation: 'Renew the current office lease',
    businessImpact: 'Facility continuity',
    evidenceSummary: 'Facilities report',
    date: '2026-05-20T00:00:00.000Z',
    founderApprovalRequired: true,
  },
];

// ---------------------------------------------------------------------------
// Episodic record: a PAST conversation holding the abandonment rationale
// (seeded via ConversationStore with fixed ids/timestamps)
// ---------------------------------------------------------------------------

export interface EpisodicConversationSpec {
  conversationId: string;
  founderId: string;
  title: string;
  messages: {
    id: string;
    sender: 'founder' | 'assistant';
    content: string;
    createdAt: string;
  }[];
}

export const EPISODIC_CONVERSATION: EpisodicConversationSpec = {
  conversationId: 'conv-m51-episodic',
  founderId: FOUNDER_A,
  title: 'Aurorium refactor check-in',
  messages: [
    {
      id: 'msg-m51-ep-1',
      sender: 'founder',
      content: 'The refactor is dragging. Every release needs three teams to sync.',
      createdAt: '2026-08-14T10:00:00.000Z',
    },
    {
      id: 'msg-m51-ep-2',
      sender: 'assistant',
      content:
        'Measured: the microservices refactor of Aurorium adds about three hours of coordination ' +
        'overhead per release while the latency gain is only 40ms.',
      createdAt: '2026-08-14T10:01:00.000Z',
    },
    {
      id: 'msg-m51-ep-3',
      sender: 'founder',
      content: 'Then we are abandoning it. Record why so we remember.',
      createdAt: '2026-08-14T10:02:00.000Z',
    },
    {
      id: 'msg-m51-ep-4',
      sender: 'assistant',
      content:
        'Recorded: abandoning the microservices refactor of Aurorium because coordination overhead ' +
        'exceeds the latency gains; returning to a modular monolith.',
      createdAt: '2026-08-14T10:03:00.000Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// Registry of every evidence key (fixture integrity checks iterate this).
// ---------------------------------------------------------------------------

export const ALL_EVIDENCE_KEYS: string[] = [
  ...PERSONAL_MEMORIES.map((m) => m.evidenceKey),
  ...COMPANY_KNOWLEDGE.map((k) => k.documentId),
  ...COMPANY_MEMORIES.map((m) => m.id),
  ...CANONICAL_FACTS.map((f) => f.evidenceKey),
  ...EPISTEMIC_CLAIMS.map((c) => c.id),
  ...EPISTEMIC_SOURCES.map((s) => s.id),
  'STATE-FIN-01',
  ...STATE_INITIATIVES.map((i) => `STATE-${i.id}`),
  ...STATE_DECISIONS.map((d) => `STATE-${d.id}`),
  'CONV-EP-01',
];

/**
 * Deterministic digest of the fixture (SHA-256 over a canonical JSON
 * serialization). Printed with every run; two runs with the same fixture MUST
 * produce the same digest.
 */
export function computeFixtureDigest(): string {
  const canonical = JSON.stringify({
    personal: PERSONAL_MEMORIES,
    knowledge: COMPANY_KNOWLEDGE,
    precedents: COMPANY_MEMORIES,
    facts: CANONICAL_FACTS.map(({ purpose, ...f }) => f),
    claims: EPISTEMIC_CLAIMS,
    sources: EPISTEMIC_SOURCES,
    financial: STATE_FINANCIAL_MODEL,
    initiatives: STATE_INITIATIVES,
    decisions: STATE_DECISIONS,
    episodic: EPISODIC_CONVERSATION,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
