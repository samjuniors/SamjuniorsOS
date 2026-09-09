import {
  EvidenceSource,
  EpistemicSignal,
  EpistemicClaim,
  CanonicalFact,
  VerificationPolicyResult,
  GovernedMemoryObject,
} from '@/types/epistemic';
import { AgentRole } from '@/types/os';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import { prisma } from '@/lib/server/db/prisma';
import { isAuthoritativeMode, requireAuthoritativeDatabase } from '@/lib/server/db/authority';

export interface IEpistemicClaimStore {
  saveSource(source: EvidenceSource): Promise<void>;
  getSource(id: string): Promise<EvidenceSource | null>;
  listSources(): Promise<EvidenceSource[]>;
  saveSignal(signal: EpistemicSignal): Promise<void>;
  getSignal(id: string): Promise<EpistemicSignal | null>;
  saveClaim(claim: EpistemicClaim): Promise<void>;
  getClaim(id: string): Promise<EpistemicClaim | null>;
  listClaims(filter?: {
    status?: EpistemicClaim['verificationStatus'];
    category?: EpistemicClaim['category'];
    proposedBy?: EpistemicClaim['proposedBy'];
  }): Promise<EpistemicClaim[]>;
  recordVerification(verification: VerificationPolicyResult): Promise<void>;
  getVerification(claimId: string): Promise<VerificationPolicyResult | null>;
  saveFact(fact: CanonicalFact): Promise<void>;
  getFact(id: string): Promise<CanonicalFact | null>;
  listActiveFacts(filter?: {
    category?: CanonicalFact['category'];
    subject?: string;
  }): Promise<CanonicalFact[]>;
  markFactSuperseded(factId: string, supersededById: string): Promise<void>;
}

/**
 * Authoritative PostgreSQL Epistemic Store.
 * Direct persistence to PostgreSQL via Prisma. Fail-closed on database failure.
 */
export class PostgresEpistemicStore implements IEpistemicClaimStore {
  private static instance: PostgresEpistemicStore;

  public static getInstance(): PostgresEpistemicStore {
    if (!PostgresEpistemicStore.instance) {
      PostgresEpistemicStore.instance = new PostgresEpistemicStore();
    }
    return PostgresEpistemicStore.instance;
  }

  // =========================================================================
  // Sources
  // =========================================================================

  public async saveSource(source: EvidenceSource): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    await db.epistemicSource.upsert({
      where: { id: source.id },
      create: {
        id: source.id,
        sourceSystem: source.sourceSystem,
        uri: source.uri || null,
        title: source.title,
        rawContent: source.rawContent,
        contentHash: source.contentHash,
        capturedAt: new Date(source.capturedAt),
        capturedBy: source.capturedBy,
        metadata: (source.metadata as any) ?? {},
        provenanceKind: source.provenanceKind || 'live_operational',
      },
      update: {
        title: source.title,
        rawContent: source.rawContent,
        metadata: (source.metadata as any) ?? {},
        provenanceKind: source.provenanceKind || 'live_operational',
      },
    });
  }

  public async getSource(id: string): Promise<EvidenceSource | null> {
    const db = await requireAuthoritativeDatabase();
    const found = await db.epistemicSource.findUnique({ where: { id } });
    if (!found) return null;
    return {
      id: found.id,
      sourceSystem: found.sourceSystem as any,
      uri: found.uri || undefined,
      title: found.title,
      rawContent: found.rawContent,
      contentHash: found.contentHash,
      capturedAt: found.capturedAt.toISOString(),
      capturedBy: found.capturedBy as AgentRole | 'founder' | 'system',
      metadata: (found.metadata as any) || {},
      provenanceKind: found.provenanceKind as any,
    };
  }

  public async listSources(): Promise<EvidenceSource[]> {
    const db = await requireAuthoritativeDatabase();
    const records = await db.epistemicSource.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return records.map((found) => ({
      id: found.id,
      sourceSystem: found.sourceSystem as any,
      uri: found.uri || undefined,
      title: found.title,
      rawContent: found.rawContent,
      contentHash: found.contentHash,
      capturedAt: found.capturedAt.toISOString(),
      capturedBy: found.capturedBy as AgentRole | 'founder' | 'system',
      metadata: (found.metadata as any) || {},
      provenanceKind: found.provenanceKind as any,
    }));
  }

  // =========================================================================
  // Signals
  // =========================================================================

  public async saveSignal(signal: EpistemicSignal): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    await db.epistemicSignal.upsert({
      where: { id: signal.id },
      create: {
        id: signal.id,
        sourceId: signal.sourceId,
        signalType: signal.signalType,
        extractedObservation: signal.extractedObservation,
        data: (signal.data as any) ?? {},
        confidence: signal.confidence || 'high_confidence',
        timestamp: new Date(signal.timestamp),
      },
      update: {
        extractedObservation: signal.extractedObservation,
        data: (signal.data as any) ?? {},
        confidence: signal.confidence || 'high_confidence',
      },
    });
  }

  public async getSignal(id: string): Promise<EpistemicSignal | null> {
    const db = await requireAuthoritativeDatabase();
    const found = await db.epistemicSignal.findUnique({ where: { id } });
    if (!found) return null;
    return {
      id: found.id,
      sourceId: found.sourceId,
      signalType: found.signalType as any,
      extractedObservation: found.extractedObservation,
      data: (found.data as Record<string, any>) || undefined,
      confidence: found.confidence as any,
      timestamp: found.timestamp.toISOString(),
    };
  }

  // =========================================================================
  // Claims
  // =========================================================================

  public async saveClaim(claim: EpistemicClaim): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    await db.epistemicClaim.upsert({
      where: { id: claim.id },
      create: {
        id: claim.id,
        sourceId: claim.sourceId || null,
        signalId: claim.signalId || null,
        statement: claim.statement,
        subject: claim.subject,
        category: claim.category,
        proposedBy: claim.proposedBy,
        confidence: claim.confidence || 'unverified',
        verificationStatus: claim.verificationStatus || 'pending',
        evidenceReferences: (claim.evidenceReferences as any) ?? [],
        verificationNotes: claim.verificationNotes || null,
        reviewedAt: claim.reviewedAt ? new Date(claim.reviewedAt) : null,
        reviewedBy: claim.reviewedBy || null,
        rejectionReason: claim.rejectionReason || null,
        createdAt: new Date(claim.createdAt),
      },
      update: {
        statement: claim.statement,
        subject: claim.subject,
        category: claim.category,
        confidence: claim.confidence || 'unverified',
        verificationStatus: claim.verificationStatus || 'pending',
        evidenceReferences: (claim.evidenceReferences as any) ?? [],
        verificationNotes: claim.verificationNotes || null,
        reviewedAt: claim.reviewedAt ? new Date(claim.reviewedAt) : null,
        reviewedBy: claim.reviewedBy || null,
        rejectionReason: claim.rejectionReason || null,
      },
    });
  }

  public async getClaim(id: string): Promise<EpistemicClaim | null> {
    const db = await requireAuthoritativeDatabase();
    const found = await db.epistemicClaim.findUnique({ where: { id } });
    if (!found) return null;
    return this.mapPrismaToClaim(found);
  }

  public async listClaims(filter?: {
    status?: EpistemicClaim['verificationStatus'];
    category?: EpistemicClaim['category'];
    proposedBy?: EpistemicClaim['proposedBy'];
  }): Promise<EpistemicClaim[]> {
    const db = await requireAuthoritativeDatabase();
    const where: any = {};
    if (filter?.status) where.verificationStatus = filter.status;
    if (filter?.category) where.category = filter.category;
    if (filter?.proposedBy) where.proposedBy = filter.proposedBy;

    const claims = await db.epistemicClaim.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return claims.map((c) => this.mapPrismaToClaim(c));
  }

  // =========================================================================
  // Verifications
  // =========================================================================

  public async recordVerification(verification: VerificationPolicyResult): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    await db.epistemicVerification.upsert({
      where: { claimId: verification.claimId },
      create: {
        claimId: verification.claimId,
        passed: verification.passed,
        policyOutcome: verification.policyOutcome,
        conflictingFactIds: (verification.conflictingFactIds as any) ?? [],
        reason: verification.reason,
        verifiedAt: new Date(verification.verifiedAt),
        verifiedBy: verification.verifiedBy,
        precedenceNote: verification.precedenceNote || null,
      },
      update: {
        passed: verification.passed,
        policyOutcome: verification.policyOutcome,
        conflictingFactIds: (verification.conflictingFactIds as any) ?? [],
        reason: verification.reason,
        verifiedAt: new Date(verification.verifiedAt),
        verifiedBy: verification.verifiedBy,
        precedenceNote: verification.precedenceNote || null,
      },
    });
  }

  public async getVerification(claimId: string): Promise<VerificationPolicyResult | null> {
    const db = await requireAuthoritativeDatabase();
    const found = await db.epistemicVerification.findUnique({ where: { claimId } });
    if (!found) return null;
    return {
      claimId: found.claimId,
      passed: found.passed,
      policyOutcome: found.policyOutcome as any,
      conflictingFactIds: (found.conflictingFactIds as any) || [],
      reason: found.reason,
      verifiedAt: found.verifiedAt.toISOString(),
      verifiedBy: found.verifiedBy,
      precedenceNote: found.precedenceNote || undefined,
    };
  }

  // =========================================================================
  // Canonical Facts
  // =========================================================================

  public async saveFact(fact: CanonicalFact): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    await db.canonicalFact.upsert({
      where: { id: fact.id },
      create: {
        id: fact.id,
        claimId: fact.claimId,
        sourceId: fact.sourceId || null,
        statement: fact.statement,
        subject: fact.subject,
        category: fact.category,
        validityState: fact.validityState || 'active',
        supersededById: fact.supersededById || null,
        confidence: fact.confidence || 'verified_fact',
        promotedAt: new Date(fact.promotedAt),
        promotedBy: fact.promotedBy,
        provenance: (fact.provenance as any) ?? {},
      },
      update: {
        statement: fact.statement,
        subject: fact.subject,
        category: fact.category,
        validityState: fact.validityState || 'active',
        supersededById: fact.supersededById || null,
        confidence: fact.confidence || 'verified_fact',
        provenance: (fact.provenance as any) ?? {},
      },
    });
  }

  public async getFact(id: string): Promise<CanonicalFact | null> {
    const db = await requireAuthoritativeDatabase();
    const found = await db.canonicalFact.findUnique({ where: { id } });
    if (!found) return null;
    return this.mapPrismaToFact(found);
  }

  public async listActiveFacts(filter?: {
    category?: CanonicalFact['category'];
    subject?: string;
  }): Promise<CanonicalFact[]> {
    const db = await requireAuthoritativeDatabase();
    const where: any = { validityState: 'active' };
    if (filter?.category) where.category = filter.category;
    if (filter?.subject) where.subject = filter.subject;

    const facts = await db.canonicalFact.findMany({
      where,
      orderBy: { promotedAt: 'desc' },
    });

    return facts.map((f) => this.mapPrismaToFact(f));
  }

  public async markFactSuperseded(factId: string, supersededById: string): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    await db.canonicalFact.update({
      where: { id: factId },
      data: {
        validityState: 'superseded',
        supersededById,
      },
    });
  }

  private mapPrismaToClaim(c: any): EpistemicClaim {
    return {
      id: c.id,
      sourceId: c.sourceId || undefined,
      signalId: c.signalId || undefined,
      statement: c.statement,
      subject: c.subject,
      category: c.category as any,
      proposedBy: c.proposedBy,
      confidence: c.confidence as any,
      verificationStatus: c.verificationStatus as any,
      evidenceReferences: (c.evidenceReferences as any) || [],
      verificationNotes: c.verificationNotes || undefined,
      reviewedAt: c.reviewedAt ? c.reviewedAt.toISOString() : undefined,
      reviewedBy: c.reviewedBy || undefined,
      rejectionReason: c.rejectionReason || undefined,
      createdAt: c.createdAt.toISOString(),
    };
  }

  private mapPrismaToFact(f: any): CanonicalFact {
    return {
      id: f.id,
      claimId: f.claimId,
      sourceId: f.sourceId || undefined,
      statement: f.statement,
      subject: f.subject,
      category: f.category as any,
      validityState: f.validityState as any,
      supersededById: f.supersededById || undefined,
      confidence: f.confidence as any,
      promotedAt: f.promotedAt.toISOString(),
      promotedBy: f.promotedBy,
      provenance: (f.provenance as any) || {},
    };
  }
}

/**
 * Dual-Mode Epistemic Store.
 * In Authoritative Mode: delegates directly to PostgresEpistemicStore (fail-closed).
 * In Test/Local Mode: uses fast in-memory maps with local file persistence.
 */
export class EpistemicClaimStore implements IEpistemicClaimStore {
  private static instance: EpistemicClaimStore | null = null;

  public sources: Map<string, EvidenceSource> = new Map();
  public signals: Map<string, EpistemicSignal> = new Map();
  public claims: Map<string, EpistemicClaim> = new Map();
  public facts: Map<string, CanonicalFact> = new Map();
  public verifications: Map<string, VerificationPolicyResult> = new Map();

  constructor() {
    this.loadFromDurableStorage();
  }

  public static getInstance(): EpistemicClaimStore {
    if (!EpistemicClaimStore.instance) {
      EpistemicClaimStore.instance = new EpistemicClaimStore();
    }
    return EpistemicClaimStore.instance;
  }

  public loadFromDurableStorage(): void {
    try {
      const fileStore = DurableFileStore.getInstance();

      const sourcesDisk = fileStore.readCollection<EvidenceSource>('epistemic_sources');
      Object.values(sourcesDisk).forEach((s) => this.sources.set(s.id, s));

      const signalsDisk = fileStore.readCollection<EpistemicSignal>('epistemic_signals');
      Object.values(signalsDisk).forEach((sig) => this.signals.set(sig.id, sig));

      const claimsDisk = fileStore.readCollection<EpistemicClaim>('epistemic_claims');
      Object.values(claimsDisk).forEach((c) => this.claims.set(c.id, c));

      const factsDisk = fileStore.readCollection<CanonicalFact>('canonical_facts');
      Object.values(factsDisk).forEach((f) => this.facts.set(f.id, f));

      const verificationsDisk = fileStore.readCollection<VerificationPolicyResult>('epistemic_verifications');
      Object.values(verificationsDisk).forEach((v) => this.verifications.set(v.claimId, v));
    } catch (err) {
      console.warn('[EpistemicClaimStore] Failed to load from durable storage:', err);
    }
  }

  public async saveSource(source: EvidenceSource): Promise<void> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().saveSource(source);
    }
    this.sources.set(source.id, { ...source });
    try {
      DurableFileStore.getInstance().saveItem('epistemic_sources', source.id, source);
    } catch {}
  }

  public async getSource(id: string): Promise<EvidenceSource | null> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().getSource(id);
    }
    const s = this.sources.get(id);
    return s ? { ...s } : null;
  }

  public async listSources(): Promise<EvidenceSource[]> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().listSources();
    }
    return Array.from(this.sources.values());
  }

  public async saveSignal(signal: EpistemicSignal): Promise<void> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().saveSignal(signal);
    }
    this.signals.set(signal.id, { ...signal });
    try {
      DurableFileStore.getInstance().saveItem('epistemic_signals', signal.id, signal);
    } catch {}
  }

  public async getSignal(id: string): Promise<EpistemicSignal | null> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().getSignal(id);
    }
    const sig = this.signals.get(id);
    return sig ? { ...sig } : null;
  }

  public async saveClaim(claim: EpistemicClaim): Promise<void> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().saveClaim(claim);
    }
    this.claims.set(claim.id, { ...claim });
    try {
      DurableFileStore.getInstance().saveItem('epistemic_claims', claim.id, claim);
    } catch {}
  }

  public async getClaim(id: string): Promise<EpistemicClaim | null> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().getClaim(id);
    }
    const c = this.claims.get(id);
    return c ? { ...c } : null;
  }

  public async listClaims(filter?: {
    status?: EpistemicClaim['verificationStatus'];
    category?: EpistemicClaim['category'];
    proposedBy?: EpistemicClaim['proposedBy'];
  }): Promise<EpistemicClaim[]> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().listClaims(filter);
    }
    let result = Array.from(this.claims.values());
    if (filter?.status) {
      result = result.filter((c) => c.verificationStatus === filter.status);
    }
    if (filter?.category) {
      result = result.filter((c) => c.category === filter.category);
    }
    if (filter?.proposedBy) {
      result = result.filter((c) => c.proposedBy === filter.proposedBy);
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public async recordVerification(verification: VerificationPolicyResult): Promise<void> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().recordVerification(verification);
    }
    this.verifications.set(verification.claimId, { ...verification });
    try {
      DurableFileStore.getInstance().saveItem('epistemic_verifications', verification.claimId, verification);
    } catch {}
  }

  public async getVerification(claimId: string): Promise<VerificationPolicyResult | null> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().getVerification(claimId);
    }
    const v = this.verifications.get(claimId);
    return v ? { ...v } : null;
  }

  public async saveFact(fact: CanonicalFact): Promise<void> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().saveFact(fact);
    }
    this.facts.set(fact.id, { ...fact });
    try {
      DurableFileStore.getInstance().saveItem('canonical_facts', fact.id, fact);
    } catch {}
  }

  public async getFact(id: string): Promise<CanonicalFact | null> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().getFact(id);
    }
    const f = this.facts.get(id);
    return f ? { ...f } : null;
  }

  public async listActiveFacts(filter?: {
    category?: CanonicalFact['category'];
    subject?: string;
  }): Promise<CanonicalFact[]> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().listActiveFacts(filter);
    }
    let result = Array.from(this.facts.values()).filter((f) => f.validityState === 'active');
    if (filter?.category) {
      result = result.filter((f) => f.category === filter.category);
    }
    if (filter?.subject) {
      result = result.filter((f) => f.subject.toLowerCase() === filter.subject!.toLowerCase());
    }
    return result.sort((a, b) => b.promotedAt.localeCompare(a.promotedAt));
  }

  public async markFactSuperseded(factId: string, supersededById: string): Promise<void> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().markFactSuperseded(factId, supersededById);
    }
    const fact = this.facts.get(factId);
    if (fact) {
      fact.validityState = 'superseded';
      fact.supersededById = supersededById;
      await this.saveFact(fact);
    }
  }
}
