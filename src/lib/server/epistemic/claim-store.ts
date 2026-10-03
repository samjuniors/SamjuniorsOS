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
import { extractTokens } from '@/lib/server/knowledge/knowledge-store';
import { DependencyRelationStore } from '@/lib/server/retrieval/dependency-relation-store';
import {
  collectFactLineage,
  resolveSupersessionEventTime,
  selectFactsForReadMode,
  type FactLineage,
  type FactReadParams,
} from '@/lib/server/retrieval/fact-read-model';

/**
 * M5.2 — query-conditioned canonical-fact retrieval parameters.
 *
 * LIFECYCLE AUTHORITY (unchanged by M5.2/M5.3): validityState remains the ONLY
 * eligibility authority for truth-bearing rendering. `includeSuperseded`
 * exists so a HISTORY-intent caller can retrieve superseded facts as clearly
 * labeled historical evidence — it NEVER changes what counts as current
 * truth (slice 4A renders only active facts; superseded facts render only
 * under a non-truth-bearing historical projection in context-assembly).
 *
 * M5.3-A adds `asOf`: when present, eligibility switches to the AS_OF read
 * mode (what was truth at that instant — see fact-read-model.ts). `asOf`
 * and `includeSuperseded` are mutually exclusive by construction (an as-of
 * pool is computed, not pooled by validityState).
 */
export interface FactQueryParams {
  queryText: string;
  /** Maximum number of facts to return (default 5). */
  limit?: number;
  /** Include validityState === 'superseded' facts (history intent). */
  includeSuperseded?: boolean;
  /** M5.3-A — restrict eligibility to what was current truth at this ISO instant. */
  asOf?: string;
}

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
  listAllFacts(): Promise<CanonicalFact[]>;
  queryFacts(params: FactQueryParams): Promise<CanonicalFact[]>;
  /** M5.3-A — authoritative read projection (CURRENT / HISTORICAL / AS_OF). */
  readFacts(params: FactReadParams): Promise<CanonicalFact[]>;
  /** M5.3-A — bounded successor/predecessor chain with event times. */
  getFactLineage(factId: string): Promise<FactLineage>;
  markFactSuperseded(
    factId: string,
    supersededById: string,
    opts?: { supersededAt?: string }
  ): Promise<void>;
}

/**
 * M5.2 — deterministic lexical fact scoring, shared by both store modes so
 * local and authoritative retrieval rank identically. Uses the SAME shared
 * extractTokens/stop-word pipeline as CompanyKnowledgeStore.queryKnowledge
 * (M4-C convention — no second tokenizer). Subject identifiers tokenize
 * with underscores as spaces ('lumora_pricing' → 'lumora pricing') so a
 * stored subject remains reachable from natural-language queries.
 * Pure function; zero-overlap facts score 0.
 */
export function scoreFactAgainstQuery(fact: CanonicalFact, queryText: string): number {
  const queryTokens = new Set(extractTokens(queryText));
  if (queryTokens.size === 0) return 0;
  const factTokens = new Set([
    ...extractTokens(fact.statement),
    ...extractTokens((fact.subject || '').replace(/_/g, ' ')),
  ]);
  let matched = 0;
  for (const token of queryTokens) {
    if (factTokens.has(token)) matched++;
  }
  return matched;
}

/**
 * M5.2 — deterministic query-conditioned fact ranking (shared by both
 * modes): score DESC, then promotedAt DESC, then id ASC (total stable order).
 * Zero-score facts are excluded (a fact that shares no token with the query
 * is not query-relevant; the CALLER applies the documented never-empty
 * fallback when every candidate scores zero).
 */
export function rankFactsForQuery(
  facts: CanonicalFact[],
  queryText: string,
  limit: number
): CanonicalFact[] {
  return facts
    .map((fact) => ({ fact, score: scoreFactAgainstQuery(fact, queryText) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = Date.parse(a.fact.promotedAt || '') || 0;
      const tb = Date.parse(b.fact.promotedAt || '') || 0;
      if (tb !== ta) return tb - ta;
      return a.fact.id < b.fact.id ? -1 : a.fact.id > b.fact.id ? 1 : 0;
    })
    .slice(0, limit)
    .map((entry) => entry.fact);
}

/**
 * Authoritative Epistemic Store (target: PostgreSQL — see M0 naming note).
 * DATABASE REALITY: in this sandbox branch the Prisma schema is the SQLite port,
 * so "Postgres*" classes currently run against SQLite via Prisma. The class
 * names refer to the target architecture (M6 migration milestone).
 * Direct persistence via Prisma. Fail-closed on database failure.
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
        supersededAt: fact.supersededAt ? new Date(fact.supersededAt) : null,
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
        supersededAt: fact.supersededAt ? new Date(fact.supersededAt) : null,
        confidence: fact.confidence || 'verified_fact',
        provenance: (fact.provenance as any) ?? {},
      },
    });
    // M5.3-C — derived-index maintenance (rebuildable retrieval index; a
    // maintenance failure never fails the truth write, it is logged and the
    // index can be rebuilt from the facts).
    try {
      await DependencyRelationStore.getInstance().maintainRelationsForFact(fact);
    } catch (err) {
      console.error(
        '[DependencyRelationStore] derived-index maintenance failed (rebuild available):',
        err
      );
    }
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

  /**
   * M5.2 — every fact regardless of validityState (change enumeration /
   * supersession-history reads). Ordered promotedAt DESC, id ASC.
   */
  public async listAllFacts(): Promise<CanonicalFact[]> {
    const db = await requireAuthoritativeDatabase();
    const facts = await db.canonicalFact.findMany({
      orderBy: [{ promotedAt: 'desc' }, { id: 'asc' }],
    });
    return facts.map((f) => this.mapPrismaToFact(f));
  }

  /**
   * M5.3-A — authoritative read projection over the PostgreSQL representation
   * (Prisma/SQLite port here; the where clauses are plain relational filters:
   * no extensions, no vectors — the same query shape runs on PostgreSQL).
   * The eligibility predicates are the SHARED pure fact-read-model rules;
   * this method only pushes the coarse filters into the database and applies
   * the shared predicate for the AS_OF tail conditions.
   */
  public async readFacts(params: FactReadParams): Promise<CanonicalFact[]> {
    const db = await requireAuthoritativeDatabase();
    const where: any = {};
    if (params.mode === 'CURRENT') {
      where.validityState = 'active';
    } else if (params.mode === 'HISTORICAL') {
      where.validityState = { in: ['active', 'superseded'] };
    } else {
      // AS_OF: promoted before T; not superseded at T; unknown event times
      // excluded (fail-closed). Coarse date filter in SQL; the exact
      // predicate re-applied in the shared pure rule so both modes cannot
      // diverge.
      const asOf = params.asOf ? new Date(params.asOf) : null;
      if (!asOf || Number.isNaN(asOf.getTime())) return [];
      where.validityState = { in: ['active', 'superseded'] };
      where.promotedAt = { lte: asOf };
      where.NOT = {
        AND: [
          { validityState: 'superseded' },
          { OR: [{ supersededAt: null }, { supersededAt: { lte: asOf } }] },
        ],
      };
    }
    if (params.category) where.category = params.category;
    if (params.subject) where.subject = params.subject;

    const rows = await db.canonicalFact.findMany({
      where,
      orderBy: [{ promotedAt: 'desc' }, { id: 'asc' }],
    });
    // Re-apply the shared pure predicate (authoritative for AS_OF semantics;
    // a no-op filter for CURRENT/HISTORICAL) so one rule defines eligibility.
    const params2: FactReadParams =
      params.mode === 'AS_OF' ? { ...params, asOf: new Date(params.asOf!).toISOString() } : params;
    return selectFactsForReadMode(rows.map((f) => this.mapPrismaToFact(f)), params2);
  }

  /**
   * M5.3-A — bounded lineage over the relational supersededById chain
   * (successors forward, predecessors by reverse lookup), shared traversal.
   */
  public async getFactLineage(factId: string): Promise<FactLineage> {
    const db = await requireAuthoritativeDatabase();
    return collectFactLineage(
      factId,
      async (id) => {
        const found = await db.canonicalFact.findUnique({ where: { id } });
        return found ? this.mapPrismaToFact(found) : null;
      },
      async (id) => {
        const preds = await db.canonicalFact.findMany({
          where: { supersededById: id },
          orderBy: [{ promotedAt: 'desc' }, { id: 'asc' }],
        });
        return preds.map((f) => this.mapPrismaToFact(f));
      }
    );
  }

  /**
   * M5.2 — query-conditioned fact retrieval (authoritative mode). Fetches
   * the eligible rows and applies the shared deterministic rankFactsForQuery
   * — the SAME ranking the local mode uses, so retrieval semantics never
   * diverge by mode. M5.3-A: eligibility now flows through the shared read
   * model (asOf switches the pool to the AS_OF projection).
   */
  public async queryFacts(params: FactQueryParams): Promise<CanonicalFact[]> {
    const db = await requireAuthoritativeDatabase();
    const readMode: FactReadParams = params.asOf
      ? { mode: 'AS_OF', asOf: params.asOf }
      : params.includeSuperseded
        ? { mode: 'HISTORICAL' }
        : { mode: 'CURRENT' };
    const rows = await db.canonicalFact.findMany({
      where:
        readMode.mode === 'CURRENT'
          ? { validityState: 'active' }
          : { validityState: { in: ['active', 'superseded'] } },
    });
    const pool = selectFactsForReadMode(rows.map((f) => this.mapPrismaToFact(f)), readMode);
    return rankFactsForQuery(pool, params.queryText, params.limit ?? 5);
  }

  public async markFactSuperseded(
    factId: string,
    supersededById: string,
    opts?: { supersededAt?: string }
  ): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    // M5.3-A — record the supersession EVENT TIME. Deterministic preference:
    // explicit caller time, else the successor's promotion moment, else now.
    let eventTime = resolveSupersessionEventTime(opts?.supersededAt, null);
    if (!eventTime) {
      const successor = await db.canonicalFact.findUnique({ where: { id: supersededById } });
      eventTime = resolveSupersessionEventTime(
        undefined,
        successor ? this.mapPrismaToFact(successor) : null
      );
    }
    await db.canonicalFact.update({
      where: { id: factId },
      data: {
        validityState: 'superseded',
        supersededById,
        ...(eventTime ? { supersededAt: new Date(eventTime) } : {}),
      },
    });
    // M5.3-C — edges extracted from a superseded fact leave the CURRENT
    // traversal pool (status mirrors the source fact's lifecycle).
    try {
      await DependencyRelationStore.getInstance().markRelationsStaleForFact(factId);
    } catch (err) {
      console.error(
        '[DependencyRelationStore] derived-index stale-marking failed (rebuild available):',
        err
      );
    }
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
      supersededAt: f.supersededAt ? f.supersededAt.toISOString() : undefined,
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
    // M5.3-C — derived-index maintenance (rebuildable retrieval index; a
    // maintenance failure never fails the truth write).
    try {
      await DependencyRelationStore.getInstance().maintainRelationsForFact(fact);
    } catch (err) {
      console.error(
        '[DependencyRelationStore] derived-index maintenance failed (rebuild available):',
        err
      );
    }
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

  /**
   * M5.2 — every fact regardless of validityState (local mode). Ordered
   * promotedAt DESC, id ASC — identical order contract to the authoritative
   * mode. Superseded facts retain their supersededById pointers.
   */
  public async listAllFacts(): Promise<CanonicalFact[]> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().listAllFacts();
    }
    return Array.from(this.facts.values())
      .sort((a, b) => {
        if (b.promotedAt !== a.promotedAt) return b.promotedAt.localeCompare(a.promotedAt);
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      })
      .map((f) => ({ ...f }));
  }

  /**
   * M5.2 — query-conditioned canonical-fact retrieval (local mode).
   * Deterministic lexical ranking over the shared tokenizer (see
   * rankFactsForQuery). Zero-overlap facts are excluded; the CALLER applies
   * the documented never-empty fallback (A0 top-3-newest) when nothing
   * matches. includeSuperseded adds superseded facts to the candidate pool
   * WITHOUT changing their lifecycle state or truth position. M5.3-A: asOf
   * switches eligibility to the shared AS_OF read projection.
   */
  public async queryFacts(params: FactQueryParams): Promise<CanonicalFact[]> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().queryFacts(params);
    }
    const readMode: FactReadParams = params.asOf
      ? { mode: 'AS_OF', asOf: params.asOf }
      : params.includeSuperseded
        ? { mode: 'HISTORICAL' }
        : { mode: 'CURRENT' };
    const pool = selectFactsForReadMode(Array.from(this.facts.values()), readMode);
    return rankFactsForQuery(pool, params.queryText, params.limit ?? 5);
  }

  /**
   * M5.3-A — authoritative read projection (local mode): the SAME shared
   * pure eligibility rules the authoritative (Prisma) mode applies, so the
   * read semantics cannot diverge by mode. Ordered promotedAt DESC, id ASC.
   */
  public async readFacts(params: FactReadParams): Promise<CanonicalFact[]> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().readFacts(params);
    }
    return selectFactsForReadMode(Array.from(this.facts.values()), params);
  }

  /**
   * M5.3-A — bounded successor/predecessor lineage (local mode), shared
   * traversal over the in-memory maps.
   */
  public async getFactLineage(factId: string): Promise<FactLineage> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().getFactLineage(factId);
    }
    return collectFactLineage(
      factId,
      async (id) => {
        const f = this.facts.get(id);
        return f ? { ...f } : null;
      },
      async (id) =>
        Array.from(this.facts.values())
          .filter((f) => f.supersededById === id)
          .sort((a, b) => {
            if (b.promotedAt !== a.promotedAt) return b.promotedAt.localeCompare(a.promotedAt);
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
          })
          .map((f) => ({ ...f }))
    );
  }

  public async markFactSuperseded(
    factId: string,
    supersededById: string,
    opts?: { supersededAt?: string }
  ): Promise<void> {
    if (isAuthoritativeMode()) {
      return PostgresEpistemicStore.getInstance().markFactSuperseded(factId, supersededById, opts);
    }
    const fact = this.facts.get(factId);
    if (fact) {
      fact.validityState = 'superseded';
      fact.supersededById = supersededById;
      // M5.3-A — record the supersession EVENT TIME (explicit, else the
      // successor's promotion moment, else now). Deterministic for the
      // frozen benchmark universe: the seed saves successors before marking
      // predecessors, so the recorded time is the fixture's frozen timeline.
      fact.supersededAt =
        resolveSupersessionEventTime(opts?.supersededAt, this.facts.get(supersededById)) ??
        new Date().toISOString();
      await this.saveFact(fact);
    }
  }
}
