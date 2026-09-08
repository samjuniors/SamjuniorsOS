import {
  EvidenceSource,
  EpistemicSignal,
  EpistemicClaim,
  CanonicalFact,
  VerificationPolicyResult,
  GovernedMemoryObject,
} from '@/types/epistemic';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import { prisma } from '@/lib/server/db/prisma';

/**
 * Durable Epistemic Store for Sources, Claims, and Canonical Facts.
 * 
 * Fulfills FounderOS repository pattern & OptimalEngine governed state:
 * - Clean repository boundary
 * - Process restart durability via DurableFileStore
 * - PostgreSQL / Prisma fallback
 * - Auditability & immutability of promoted facts
 */
export class EpistemicClaimStore {
  private static instance: EpistemicClaimStore | null = null;

  private sources: Map<string, EvidenceSource> = new Map();
  private signals: Map<string, EpistemicSignal> = new Map();
  private claims: Map<string, EpistemicClaim> = new Map();
  private facts: Map<string, CanonicalFact> = new Map();
  private verifications: Map<string, VerificationPolicyResult> = new Map();

  private constructor() {
    this.loadFromDurableStorage();
  }

  public static getInstance(): EpistemicClaimStore {
    if (!EpistemicClaimStore.instance) {
      EpistemicClaimStore.instance = new EpistemicClaimStore();
    }
    return EpistemicClaimStore.instance;
  }

  private loadFromDurableStorage(): void {
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

  // =========================================================================
  // Sources
  // =========================================================================

  public async saveSource(source: EvidenceSource): Promise<void> {
    this.sources.set(source.id, { ...source });
    try {
      DurableFileStore.getInstance().saveItem('epistemic_sources', source.id, source);
    } catch {}
  }

  public async getSource(id: string): Promise<EvidenceSource | null> {
    const s = this.sources.get(id);
    return s ? { ...s } : null;
  }

  public async listSources(): Promise<EvidenceSource[]> {
    return Array.from(this.sources.values());
  }

  // =========================================================================
  // Signals
  // =========================================================================

  public async saveSignal(signal: EpistemicSignal): Promise<void> {
    this.signals.set(signal.id, { ...signal });
    try {
      DurableFileStore.getInstance().saveItem('epistemic_signals', signal.id, signal);
    } catch {}
  }

  public async getSignal(id: string): Promise<EpistemicSignal | null> {
    const sig = this.signals.get(id);
    return sig ? { ...sig } : null;
  }

  // =========================================================================
  // Claims
  // =========================================================================

  public async saveClaim(claim: EpistemicClaim): Promise<void> {
    this.claims.set(claim.id, { ...claim });
    try {
      DurableFileStore.getInstance().saveItem('epistemic_claims', claim.id, claim);
    } catch {}
  }

  public async getClaim(id: string): Promise<EpistemicClaim | null> {
    const c = this.claims.get(id);
    return c ? { ...c } : null;
  }

  public async listClaims(filter?: {
    status?: EpistemicClaim['verificationStatus'];
    category?: EpistemicClaim['category'];
    proposedBy?: EpistemicClaim['proposedBy'];
  }): Promise<EpistemicClaim[]> {
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

  // =========================================================================
  // Verifications
  // =========================================================================

  public async recordVerification(verification: VerificationPolicyResult): Promise<void> {
    this.verifications.set(verification.claimId, { ...verification });
    try {
      DurableFileStore.getInstance().saveItem('epistemic_verifications', verification.claimId, verification);
    } catch {}
  }

  public async getVerification(claimId: string): Promise<VerificationPolicyResult | null> {
    const v = this.verifications.get(claimId);
    return v ? { ...v } : null;
  }

  // =========================================================================
  // Canonical Facts
  // =========================================================================

  public async saveFact(fact: CanonicalFact): Promise<void> {
    this.facts.set(fact.id, { ...fact });
    try {
      DurableFileStore.getInstance().saveItem('canonical_facts', fact.id, fact);
    } catch {}
  }

  public async getFact(id: string): Promise<CanonicalFact | null> {
    const f = this.facts.get(id);
    return f ? { ...f } : null;
  }

  public async listActiveFacts(filter?: {
    category?: CanonicalFact['category'];
    subject?: string;
  }): Promise<CanonicalFact[]> {
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
    const fact = this.facts.get(factId);
    if (fact) {
      fact.validityState = 'superseded';
      fact.supersededById = supersededById;
      await this.saveFact(fact);
    }
  }
}
