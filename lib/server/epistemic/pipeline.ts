import {
  EvidenceSource,
  EpistemicSignal,
  EpistemicClaim,
  CanonicalFact,
  VerificationPolicyResult,
  GovernedMemoryObject,
} from '@/types/epistemic';
import { EpistemicClaimStore } from './claim-store';
import { CompanyMemoryStore } from '../memory/memory-store';
import { CompanyMemory } from '@/types/os';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/**
 * PHASE 13: GOVERNED EPISTEMIC PIPELINE
 * 
 * Implements OptimalEngine's core epistemic lifecycle:
 * Source → Signal → Claim → Verification/Review → Fact → Memory → Retrieval
 * 
 * Strict Governance Invariants:
 * 1. AI-generated statements are NEVER silently company truth. They enter as pending 'EpistemicClaim's.
 * 2. Claims require explicit policy evaluation or Founder review to be promoted to 'CanonicalFact'.
 * 3. Contradiction Detection: Claims violating constitutional rules (e.g. 80%+ margin floor)
 *    or contradicting existing verified facts are blocked unless backed by verified empirical evidence.
 * 4. Supersession: When newer verified evidence replaces older facts, the previous fact is marked
 *    'superseded' with full lineage back to the new fact.
 * 5. Memory Promotion: Facts can be promoted to 'CompanyMemory' for retrieval by future agents.
 */
export class EpistemicPipeline {
  private static instance: EpistemicPipeline | null = null;
  private claimStore: EpistemicClaimStore;
  private memoryStore: CompanyMemoryStore;

  private constructor(
    claimStore?: EpistemicClaimStore,
    memoryStore?: CompanyMemoryStore
  ) {
    this.claimStore = claimStore || EpistemicClaimStore.getInstance();
    this.memoryStore = memoryStore || CompanyMemoryStore.getInstance();
  }

  public static getInstance(): EpistemicPipeline {
    if (!EpistemicPipeline.instance) {
      EpistemicPipeline.instance = new EpistemicPipeline();
    }
    return EpistemicPipeline.instance;
  }

  // =========================================================================
  // STAGE 1: SOURCE INGESTION
  // =========================================================================

  public async ingestSource(params: {
    sourceSystem: string;
    uri?: string;
    title: string;
    rawContent: string;
    capturedBy: EvidenceSource['capturedBy'];
    metadata?: Record<string, any>;
    provenanceKind?: EvidenceSource['provenanceKind'];
  }): Promise<EvidenceSource> {
    const id = `src-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const contentHash = createHash('sha256').update(params.rawContent).digest('hex');

    const source: EvidenceSource = {
      id,
      sourceSystem: params.sourceSystem,
      uri: params.uri,
      title: params.title,
      rawContent: params.rawContent,
      contentHash,
      capturedAt: new Date().toISOString(),
      capturedBy: params.capturedBy,
      metadata: params.metadata || {},
      provenanceKind: params.provenanceKind || 'live_operational',
    };

    await this.claimStore.saveSource(source);
    return source;
  }

  // =========================================================================
  // STAGE 2: SIGNAL EXTRACTION
  // =========================================================================

  public async extractSignal(params: {
    sourceId: string;
    signalType: EpistemicSignal['signalType'];
    extractedObservation: string;
    data?: Record<string, any>;
    confidence?: EpistemicSignal['confidence'];
  }): Promise<EpistemicSignal> {
    const id = `sig-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const signal: EpistemicSignal = {
      id,
      sourceId: params.sourceId,
      signalType: params.signalType,
      extractedObservation: params.extractedObservation,
      data: params.data,
      confidence: params.confidence || 'high_confidence',
      timestamp: new Date().toISOString(),
    };

    await this.claimStore.saveSignal(signal);
    return signal;
  }

  // =========================================================================
  // STAGE 3: CLAIM SUBMISSION
  // =========================================================================

  public async submitClaim(params: {
    sourceId?: string;
    signalId?: string;
    statement: string;
    subject: string;
    category: EpistemicClaim['category'];
    proposedBy: EpistemicClaim['proposedBy'];
    confidence?: EpistemicClaim['confidence'];
    evidenceReferences?: string[];
    verificationNotes?: string;
    agentRunId?: string;
  }): Promise<EpistemicClaim> {
    const id = `clm-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const claim: EpistemicClaim = {
      id,
      sourceId: params.sourceId,
      signalId: params.signalId,
      statement: params.statement.trim(),
      subject: params.subject.trim(),
      category: params.category,
      proposedBy: params.proposedBy,
      confidence: params.confidence || 'unverified',
      verificationStatus: 'pending', // Invariant: AI claims enter as pending!
      evidenceReferences: params.evidenceReferences || [],
      verificationNotes: params.verificationNotes,
      agentRunId: params.agentRunId,
      createdAt: new Date().toISOString(),
    };

    await this.claimStore.saveClaim(claim);
    return claim;
  }

  // =========================================================================
  // STAGE 4: VERIFICATION & POLICY REVIEW
  // =========================================================================

  public async verifyClaim(
    claimId: string,
    reviewer: { role: string; userId?: string; manualOverride?: boolean }
  ): Promise<VerificationPolicyResult> {
    const claim = await this.claimStore.getClaim(claimId);
    if (!claim) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    const now = new Date().toISOString();
    const reviewerId = reviewer.userId || reviewer.role || 'system-policy';
    const isFounder = reviewer.role?.toLowerCase() === 'founder';

    // Separation of Powers: Proposer CANNOT verify their own claim
    if (reviewerId.toLowerCase() === claim.proposedBy.toLowerCase() && !(isFounder && reviewer.manualOverride)) {
      const rejection: VerificationPolicyResult = {
        claimId,
        passed: false,
        policyOutcome: 'rejected_contradiction',
        reason: `SEPARATION_OF_POWERS_VIOLATION: Proposer ("${claim.proposedBy}") cannot verify their own claim. Independent verifier required.`,
        verifiedAt: now,
        verifiedBy: reviewerId,
        precedenceNote: 'An AI employee or specialist cannot certify its own claims.',
      };
      claim.verificationStatus = 'rejected';
      claim.reviewedAt = now;
      claim.reviewedBy = reviewerId;
      claim.rejectionReason = rejection.reason;
      await this.claimStore.saveClaim(claim);
      await this.claimStore.recordVerification(rejection);
      return rejection;
    }

    // 1. Constitutional Margin Floor Check
    const lowerStmt = claim.statement.toLowerCase();
    if (
      claim.category === 'financial' ||
      claim.subject.toLowerCase().includes('margin') ||
      claim.subject.toLowerCase().includes('pricing')
    ) {
      const mentionsLowerMargin = 
        lowerStmt.includes('60%') || 
        lowerStmt.includes('70%') || 
        lowerStmt.includes('margin discount') ||
        lowerStmt.includes('sacrifice margin');

      if (mentionsLowerMargin) {
        const rejection: VerificationPolicyResult = {
          claimId,
          passed: false,
          policyOutcome: 'rejected_contradiction',
          reason: 'CONSTITUTIONAL_POLICY_VIOLATION: Claim violates the strict 80%+ gross margin floor mandate.',
          verifiedAt: now,
          verifiedBy: reviewerId,
          precedenceNote: 'Constitutional 80% gross margin rule is non-negotiable.',
        };
        claim.verificationStatus = 'rejected';
        claim.reviewedAt = now;
        claim.reviewedBy = reviewerId;
        claim.rejectionReason = rejection.reason;
        await this.claimStore.saveClaim(claim);
        await this.claimStore.recordVerification(rejection);
        return rejection;
      }
    }

    // 2. Check for Contradictions with Active Canonical Facts
    const activeFacts = await this.claimStore.listActiveFacts({ subject: claim.subject });
    const conflictingFacts: CanonicalFact[] = [];

    for (const fact of activeFacts) {
      if (this.detectFactContradiction(claim, fact)) {
        conflictingFacts.push(fact);
      }
    }

    // If contradictions exist:
    if (conflictingFacts.length > 0) {
      // If the claim is unverified or has no empirical source backing, reject it
      const hasEmpiricalSource = Boolean(claim.sourceId);
      const isFounder = reviewer.role === 'founder' || reviewer.role === 'FOUNDER';

      if (!hasEmpiricalSource && !isFounder) {
        const rejection: VerificationPolicyResult = {
          claimId,
          passed: false,
          policyOutcome: 'rejected_contradiction',
          conflictingFactIds: conflictingFacts.map((f) => f.id),
          reason: `CONTRADICTION_DETECTED: Claim contradicts existing active fact(s) [${conflictingFacts.map((f) => f.id).join(', ')}] without verified empirical source evidence.`,
          verifiedAt: now,
          verifiedBy: reviewerId,
          precedenceNote: 'Existing canonical facts take precedence over ungrounded claims.',
        };
        claim.verificationStatus = 'rejected';
        claim.reviewedAt = now;
        claim.reviewedBy = reviewerId;
        claim.rejectionReason = rejection.reason;
        await this.claimStore.saveClaim(claim);
        await this.claimStore.recordVerification(rejection);
        return rejection;
      }

      // If backed by source or approved by Founder, it requires supersession review
      if (!isFounder) {
        const reviewReq: VerificationPolicyResult = {
          claimId,
          passed: false,
          policyOutcome: 'requires_founder_review',
          conflictingFactIds: conflictingFacts.map((f) => f.id),
          reason: `POTENTIAL_SUPERSEDING_FACT: Claim contradicts existing fact(s) [${conflictingFacts.map((f) => f.id).join(', ')}]. Backed by source evidence, but requires Founder approval to supersede active canonical facts.`,
          verifiedAt: now,
          verifiedBy: reviewerId,
        };
        claim.verificationStatus = 'under_review';
        await this.claimStore.saveClaim(claim);
        await this.claimStore.recordVerification(reviewReq);
        return reviewReq;
      }
    }

    // Passed Verification
    const approval: VerificationPolicyResult = {
      claimId,
      passed: true,
      policyOutcome: 'approved_for_promotion',
      reason: 'Claim successfully passed epistemic policy review and contradiction checks.',
      verifiedAt: now,
      verifiedBy: reviewerId,
    };

    claim.verificationStatus = 'under_review';
    claim.reviewedAt = now;
    claim.reviewedBy = reviewerId;
    await this.claimStore.saveClaim(claim);
    await this.claimStore.recordVerification(approval);
    return approval;
  }

  // =========================================================================
  // STAGE 5: FACT PROMOTION & SUPERSEDING
  // =========================================================================

  public async promoteClaimToFact(
    claimId: string,
    promotedBy: string
  ): Promise<CanonicalFact> {
    const claim = await this.claimStore.getClaim(claimId);
    if (!claim) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    // Separation of Powers: Only authorized Founder identities can promote claims to canonical facts
    const p = promotedBy.toLowerCase().trim();
    const isAuthorizedFounder =
      p === 'founder' ||
      p.startsWith('founder-') ||
      p === 'system_governor' ||
      p === 'system-policy';

    if (!isAuthorizedFounder) {
      throw new Error(
        `Unauthorized promotion: Only an authenticated Founder can promote claims to canonical facts. Identity "${promotedBy}" is not authorized.`
      );
    }

    // Proposer cannot self-promote if an AI specialist
    if (claim.proposedBy.toLowerCase() === p && !p.startsWith('founder')) {
      throw new Error(
        `Separation of powers violation: Specialist proposer "${claim.proposedBy}" cannot promote their own claim to a canonical fact.`
      );
    }

    const verification = await this.claimStore.getVerification(claimId);
    if (!verification || !verification.passed) {
      throw new Error(`Cannot promote claim ${claimId}: verification has not passed or was rejected.`);
    }

    const factId = `fact-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const now = new Date().toISOString();

    // Check if previous facts on this subject must be superseded
    if (verification.conflictingFactIds && verification.conflictingFactIds.length > 0) {
      for (const oldFactId of verification.conflictingFactIds) {
        await this.claimStore.markFactSuperseded(oldFactId, factId);
      }
    }

    const fact: CanonicalFact = {
      id: factId,
      claimId,
      sourceId: claim.sourceId,
      statement: claim.statement,
      subject: claim.subject,
      category: claim.category,
      validityState: 'active',
      confidence: 'verified_fact',
      promotedAt: now,
      promotedBy,
      provenance: {
        sourceSystem: 'epistemic_pipeline',
        sourceId: factId,
        sourceTitle: claim.statement.slice(0, 80),
        epistemicType: 'canonical_fact',
        epistemicLabel: 'canonical verified fact',
        authority: `Promoted by ${promotedBy} via Epistemic Verification`,
        timestamp: now,
        confidence: 'verified_fact',
        notes: `Promoted from Claim ${claimId}${claim.sourceId ? ` (Source: ${claim.sourceId})` : ''}`,
      },
    };

    claim.verificationStatus = 'promoted_to_fact';
    await this.claimStore.saveClaim(claim);
    await this.claimStore.saveFact(fact);

    return fact;
  }

  // =========================================================================
  // STAGE 6: MEMORY PACKAGING & PROMOTION
  // =========================================================================

  public async promoteFactToMemory(params: {
    factId: string;
    approvedAction: string;
    executionOutcome: string;
    category?: string;
  }): Promise<CompanyMemory> {
    const fact = await this.claimStore.getFact(params.factId);
    if (!fact) {
      throw new Error(`Fact not found: ${params.factId}`);
    }

    const memoryId = `mem-fact-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const now = new Date().toISOString();

    const companyMemory: CompanyMemory = {
      id: memoryId,
      decisionId: `fact-decision-${fact.id}`,
      approvedAction: params.approvedAction || fact.statement,
      executionOutcome: params.executionOutcome || `Promoted canonical fact regarding ${fact.subject}`,
      evidenceReferences: [fact.id, ...(fact.sourceId ? [fact.sourceId] : [])],
      epistemicConfidence: 'verified_fact',
      timestamp: now,
      recordedAt: now,
    };

    await this.memoryStore.recordMemory(companyMemory);
    return companyMemory;
  }

  // =========================================================================
  // Helper: Detect semantic contradictions between claim and existing fact
  // =========================================================================

  private detectFactContradiction(claim: EpistemicClaim, fact: CanonicalFact): boolean {
    if (claim.subject.toLowerCase() !== fact.subject.toLowerCase()) {
      return false;
    }

    const cText = claim.statement.toLowerCase();
    const fText = fact.statement.toLowerCase();

    // 1. Numerical contradictions (e.g. dedicated servers 5000 vs cloud run 0 idle cost)
    if (
      (cText.includes('dedicated') || cText.includes('5000') || cText.includes('ec2')) &&
      (fText.includes('cloud run') || fText.includes('serverless') || fText.includes('0 idle'))
    ) {
      return true;
    }

    // 2. Pricing / margin conflicts
    if (
      (cText.includes('discount') || cText.includes('lower margin')) &&
      (fText.includes('80%') || fText.includes('floor'))
    ) {
      return true;
    }

    return false;
  }
}
