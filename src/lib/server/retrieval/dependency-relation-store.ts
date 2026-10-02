/**
 * ============================================================================
 * M5.3-C — DEPENDENCY RELATION STORE (derived retrieval index, dual-mode)
 * ============================================================================
 * Persistence for the DEPENDS_ON edges extracted from canonical facts
 * (see dependency-relations.ts for the pure rules — this file only stores).
 *
 * DUAL MODE, same contract as every SamJuniorsOS store:
 *   - Authoritative mode: Prisma over the relational `dependency_relations`
 *     table (PostgreSQL target; SQLite port in this sandbox). Fail-closed on
 *     database failure for reads that the canonical path depends on.
 *   - Local/test mode: in-memory map + DurableFileStore collection
 *     'dependency_relations' (same durability as the other local stores).
 *
 * DERIVED-INDEX DISCIPLINE (the governance contract):
 *   - The ONLY writers are maintainRelationsForFact / rebuildFromFacts /
 *     markRelationsStaleForFact, all driven from canonical-fact lifecycle
 *     events (saveFact / markFactSuperseded in the claim store). Nothing
 *     else may create, edit, or delete an edge.
 *   - The table is fully rebuildable from the canonical facts (deterministic
 *     extraction) — dropping it loses NO truth. It is never an authorization
 *     source and never renders as an independent authority.
 *   - Maintenance failure inside a fact write is logged but does not fail
 *     the truth write (the index is rebuildable; blocking truth persistence
 *     on a derived cache would invert the authority model). Retrieval-side
 *     failures still fail closed at their own boundary (context-assembly
 *     records a degraded store and renders nothing).
 */

import { isAuthoritativeMode, requireAuthoritativeDatabase } from '@/lib/server/db/authority';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import {
  extractDependencyRelations,
  type ExtractedDependencyRelation,
} from '@/lib/server/retrieval/dependency-relations';
import type { CanonicalFact } from '@/types/epistemic';

export interface StoredDependencyRelation {
  id: string;
  sourceEntity: string;
  sourceEntityDisplay: string;
  targetEntity: string;
  targetEntityDisplay: string;
  relationType: 'DEPENDS_ON';
  scope: 'company';
  status: 'active' | 'superseded';
  sourceFactId: string;
  observedAt: string;
  provenance: {
    statementHash: string;
    extractionRule: string;
    statement: string;
  };
  createdAt: string;
}

const COLLECTION = 'dependency_relations';

/** Deterministic row id so idempotent maintenance converges. */
function relationRowId(extracted: ExtractedDependencyRelation): string {
  return `deprel-${extracted.sourceFactId}-${extracted.sourceEntity.replace(/\s+/g, '-')}-on-${extracted.targetEntity.replace(/\s+/g, '-')}`;
}

export class DependencyRelationStore {
  private static instance: DependencyRelationStore | null = null;

  public readonly relations: Map<string, StoredDependencyRelation> = new Map();

  constructor() {
    this.loadFromDurableStorage();
  }

  public static getInstance(): DependencyRelationStore {
    if (!DependencyRelationStore.instance) {
      DependencyRelationStore.instance = new DependencyRelationStore();
    }
    return DependencyRelationStore.instance;
  }

  /** Test/benchmark isolation helper (same contract as the other stores). */
  public static resetInstance(): void {
    DependencyRelationStore.instance = null;
  }

  private loadFromDurableStorage(): void {
    if (isAuthoritativeMode()) return; // authoritative reads always hit the DB
    try {
      const disk = DurableFileStore.getInstance().readCollection<StoredDependencyRelation>(COLLECTION);
      Object.values(disk).forEach((r) => this.relations.set(r.id, r));
    } catch {
      // Durable cache unavailable — the in-memory index starts empty and
      // rebuilds as facts are saved (derived index, no truth at stake).
    }
  }

  private persistLocal(relation: StoredDependencyRelation): void {
    try {
      DurableFileStore.getInstance().saveItem(COLLECTION, relation.id, relation);
    } catch {
      // Best-effort durability, same convention as the local epistemic store.
    }
  }

  /**
   * THE ONLY incremental writer: replace every edge derived from one fact.
   * Called from the claim store's saveFact (both modes). Deterministic and
   * idempotent: the same fact always produces the same rows; relations from
   * a superseded fact carry status 'superseded' and never participate in
   * CURRENT-dependency traversal.
   */
  public async maintainRelationsForFact(fact: CanonicalFact): Promise<void> {
    const extracted = extractDependencyRelations(fact);
    const status: StoredDependencyRelation['status'] =
      fact.validityState === 'active' ? 'active' : 'superseded';

    if (isAuthoritativeMode()) {
      const db = await requireAuthoritativeDatabase();
      await db.dependencyRelation.deleteMany({ where: { sourceFactId: fact.id } });
      if (extracted.length > 0) {
        await db.dependencyRelation.createMany({
          data: extracted.map((e) => ({
            id: relationRowId(e),
            sourceEntity: e.sourceEntity,
            sourceEntityDisplay: e.sourceEntityDisplay,
            targetEntity: e.targetEntity,
            targetEntityDisplay: e.targetEntityDisplay,
            relationType: e.relationType,
            scope: 'company',
            status,
            sourceFactId: e.sourceFactId,
            observedAt: new Date(e.observedAt),
            provenance: e.provenance as any,
          })),
        });
      }
      return;
    }

    for (const existing of [...this.relations.values()]) {
      if (existing.sourceFactId === fact.id) {
        this.relations.delete(existing.id);
      }
    }
    for (const e of extracted) {
      const relation: StoredDependencyRelation = {
        id: relationRowId(e),
        sourceEntity: e.sourceEntity,
        sourceEntityDisplay: e.sourceEntityDisplay,
        targetEntity: e.targetEntity,
        targetEntityDisplay: e.targetEntityDisplay,
        relationType: e.relationType,
        scope: 'company',
        status,
        sourceFactId: e.sourceFactId,
        observedAt: e.observedAt,
        provenance: e.provenance,
        createdAt: new Date().toISOString(),
      };
      this.relations.set(relation.id, relation);
      this.persistLocal(relation);
    }
  }

  /** Flip a fact's edges to 'superseded' (from markFactSuperseded). */
  public async markRelationsStaleForFact(factId: string): Promise<void> {
    if (isAuthoritativeMode()) {
      const db = await requireAuthoritativeDatabase();
      await db.dependencyRelation.updateMany({
        where: { sourceFactId: factId },
        data: { status: 'superseded' },
      });
      return;
    }
    for (const relation of this.relations.values()) {
      if (relation.sourceFactId === factId && relation.status === 'active') {
        relation.status = 'superseded';
        this.persistLocal(relation);
      }
    }
  }

  /** Full deterministic rebuild from the canonical fact set (recovery). */
  public async rebuildFromFacts(facts: CanonicalFact[]): Promise<void> {
    if (isAuthoritativeMode()) {
      const db = await requireAuthoritativeDatabase();
      await db.dependencyRelation.deleteMany({});
    } else {
      this.relations.clear();
    }
    for (const fact of facts) {
      await this.maintainRelationsForFact(fact);
    }
  }

  /** ACTIVE relations only (CURRENT-dependency traversal pool). */
  public async listActiveRelations(): Promise<StoredDependencyRelation[]> {
    if (isAuthoritativeMode()) {
      const db = await requireAuthoritativeDatabase();
      const rows = await db.dependencyRelation.findMany({
        where: { status: 'active' },
        orderBy: [{ sourceEntity: 'asc' }, { targetEntity: 'asc' }, { id: 'asc' }],
      });
      return rows.map((r) => this.mapPrismaToRelation(r));
    }
    return [...this.relations.values()]
      .filter((r) => r.status === 'active')
      .sort((a, b) =>
        a.sourceEntity === b.sourceEntity
          ? a.targetEntity === b.targetEntity
            ? a.id < b.id
              ? -1
              : 1
            : a.targetEntity.localeCompare(b.targetEntity)
          : a.sourceEntity.localeCompare(b.sourceEntity)
      )
      .map((r) => ({ ...r }));
  }

  /** Every relation regardless of status (audits / tests). */
  public async listAllRelations(): Promise<StoredDependencyRelation[]> {
    if (isAuthoritativeMode()) {
      const db = await requireAuthoritativeDatabase();
      const rows = await db.dependencyRelation.findMany({
        orderBy: [{ sourceEntity: 'asc' }, { targetEntity: 'asc' }, { id: 'asc' }],
      });
      return rows.map((r) => this.mapPrismaToRelation(r));
    }
    return [...this.relations.values()]
      .sort((a, b) =>
        a.sourceEntity === b.sourceEntity
          ? a.targetEntity === b.targetEntity
            ? a.id < b.id
              ? -1
              : 1
            : a.targetEntity.localeCompare(b.targetEntity)
          : a.sourceEntity.localeCompare(b.sourceEntity)
      )
      .map((r) => ({ ...r }));
  }

  private mapPrismaToRelation(r: any): StoredDependencyRelation {
    return {
      id: r.id,
      sourceEntity: r.sourceEntity,
      sourceEntityDisplay: r.sourceEntityDisplay,
      targetEntity: r.targetEntity,
      targetEntityDisplay: r.targetEntityDisplay,
      relationType: r.relationType as 'DEPENDS_ON',
      scope: r.scope as 'company',
      status: r.status as 'active' | 'superseded',
      sourceFactId: r.sourceFactId,
      observedAt: r.observedAt.toISOString(),
      provenance: (r.provenance as any) ?? {
        statementHash: '',
        extractionRule: '',
        statement: '',
      },
      createdAt: r.createdAt.toISOString(),
    };
  }
}
