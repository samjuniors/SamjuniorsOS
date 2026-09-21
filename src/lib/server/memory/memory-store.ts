import { CompanyMemory, RetrievedHistoricalMemory } from '@/types/os';
import { ICompanyMemoryStore, MemoryQueryParams } from '@/types/context';
import { OperationalLearningLoop } from './learning-loop';
import { prisma } from '@/lib/server/db/prisma';
import { isAuthoritativeMode, requireAuthoritativeDatabase } from '@/lib/server/db/authority';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';

/**
 * Canonical Seed Memories for SamJuniors OS
 * Preserves historical founder-approved decisions, precedents, and lessons.
 */
export const INITIAL_COMPANY_MEMORIES: CompanyMemory[] = [
  {
    id: 'mem-margin-1',
    decisionId: 'dec-margin-80',
    approvedAction: 'Enforce strict 80%+ gross margin floor across all customer tiers and token usage',
    executionOutcome: 'Preserved target gross margin floor during stress testing; prevented runaway LLM token costs',
    evidenceReferences: ['finance-model-audit', 'margin-verification', 'julian-margin-stress-test'],
    epistemicConfidence: 'high_confidence',
    timestamp: '2026-08-25T14:30:00Z',
    recordedAt: '2026-08-25T14:30:00Z',
  },
  {
    id: 'mem-infra-legacy',
    decisionId: 'dec-infra-ec2-legacy',
    approvedAction: 'Provision dedicated virtual servers with 5000 fixed monthly cost',
    executionOutcome: 'High idle compute burn observed during off-peak windows; flagged for migration',
    evidenceReferences: ['legacy-cloud-bill', 'infra-audit-2026'],
    epistemicConfidence: 'high_confidence',
    timestamp: '2026-08-15T10:00:00Z',
    recordedAt: '2026-08-15T10:00:00Z',
  },
  {
    id: 'mem-safety-sandbox',
    decisionId: 'dec-zero-trust-sandbox',
    approvedAction: 'Enforce Zero-Trust Safe Mock Sandboxing on all external mutations and payment operations',
    executionOutcome: 'Blocked 3 accidental external API mutations during developer preview tests without interrupting agent workflow',
    evidenceReferences: ['governance-audit-trail', 'sandbox-telemetry'],
    epistemicConfidence: 'high_confidence',
    timestamp: '2026-08-30T16:00:00Z',
    recordedAt: '2026-08-30T16:00:00Z',
  },
  {
    id: 'mem-multi-agent-debate',
    decisionId: 'dec-9step-council',
    approvedAction: 'Require 9-step executive council debate before generating high-impact PRDs or financial commitments',
    executionOutcome: 'Reduced hallucinated specifications and unverified architecture claims by 92% across all council runs',
    evidenceReferences: ['res-multi-agent-eval-2026', 'dr-thorne-research-radar'],
    epistemicConfidence: 'high_confidence',
    timestamp: '2026-09-02T11:20:00Z',
    recordedAt: '2026-09-02T11:20:00Z',
  },
  {
    id: 'mem-office-unrelated',
    decisionId: 'dec-office-ergonomics',
    approvedAction: 'Purchase ergonomic desk monitors for hardware testing lab',
    executionOutcome: 'Procured within approved office budget of $1,400',
    evidenceReferences: ['hardware-invoice-489'],
    epistemicConfidence: 'high_confidence',
    timestamp: '2026-07-20T10:00:00Z',
    recordedAt: '2026-07-20T10:00:00Z',
  },
];

/**
 * Server-Side Single Source of Truth for COMPANY MEMORY (Historical Precedent)
 * 
 * Implements ICompanyMemoryStore with PostgreSQL / Prisma persistence and in-memory caching.
 */
export class CompanyMemoryStore implements ICompanyMemoryStore {
  private static instance: CompanyMemoryStore | null = null;

  private memories: CompanyMemory[] = [...INITIAL_COMPANY_MEMORIES];

  private constructor() {
    this.loadFromDurableStorage();
  }

  public static getInstance(): CompanyMemoryStore {
    if (!CompanyMemoryStore.instance) {
      CompanyMemoryStore.instance = new CompanyMemoryStore();
    }
    return CompanyMemoryStore.instance;
  }

  private loadFromDurableStorage(): void {
    try {
      const persisted = DurableFileStore.getInstance().readCollection<CompanyMemory>('company_memories');
      const loaded = Object.values(persisted);
      if (loaded.length > 0) {
        this.memories = loaded;
      }
    } catch {
      // fallback
    }
  }

  public async getAllMemories(): Promise<CompanyMemory[]> {
    if (isAuthoritativeMode()) {
      const db = await requireAuthoritativeDatabase();
      const records = await db.companyMemory.findMany({ orderBy: { createdAt: 'desc' } });
      return records.map((r) => r.details as unknown as CompanyMemory);
    }
    return [...this.memories];
  }

  public async getMemoryById(id: string): Promise<CompanyMemory | null> {
    if (isAuthoritativeMode()) {
      const db = await requireAuthoritativeDatabase();
      const dbMem = await db.companyMemory.findUnique({ where: { id } });
      if (dbMem && dbMem.details) {
        return dbMem.details as unknown as CompanyMemory;
      }
      return null;
    }

    const mem = this.memories.find((m) => m.id === id);
    if (mem) return { ...mem };

    if (process.env.DATABASE_URL) {
      try {
        const dbMem = await prisma.companyMemory.findUnique({ where: { id } });
        if (dbMem && dbMem.details) {
          const mapped = dbMem.details as unknown as CompanyMemory;
          this.memories.unshift(mapped);
          return mapped;
        }
      } catch {
        // Fallback
      }
    }

    return null;
  }

  public async recordMemory(memory: CompanyMemory): Promise<void> {
    const sanitizedMemory: CompanyMemory = { ...memory };
    if (sanitizedMemory.epistemicConfidence === 'verified_fact') {
      const hasValidLineage = Array.isArray(sanitizedMemory.evidenceReferences) && sanitizedMemory.evidenceReferences.length > 0;
      if (!hasValidLineage) {
        sanitizedMemory.epistemicConfidence = 'high_confidence';
      }
    }

    if (isAuthoritativeMode()) {
      const db = await requireAuthoritativeDatabase();
      await db.companyMemory.upsert({
        where: { id: memory.id },
        create: {
          id: memory.id,
          type: memory.decisionId || 'DECISION_OUTCOME',
          summary: memory.approvedAction || memory.id,
          details: sanitizedMemory as any,
          tags: [],
          importance: 1,
          decayScore: 1.0,
        },
        update: {
          details: sanitizedMemory as any,
          summary: memory.approvedAction || memory.id,
        },
      });
      return;
    }

    this.memories.unshift(sanitizedMemory);

    try {
      DurableFileStore.getInstance().saveItem('company_memories', sanitizedMemory.id, sanitizedMemory);
    } catch {}

    if (process.env.DATABASE_URL) {
      try {
        await prisma.companyMemory.upsert({
          where: { id: memory.id },
          create: {
            id: memory.id,
            type: memory.decisionId || 'DECISION_OUTCOME',
            summary: memory.approvedAction || memory.id,
            details: memory as any,
            tags: [],
            importance: 1,
            decayScore: 1.0,
          },
          update: {
            details: memory as any,
            summary: memory.approvedAction || memory.id,
          },
        });
      } catch {
        // Fallback safely for offline test environments
      }
    }
  }

  public async setMemories(memories: CompanyMemory[]): Promise<void> {
    this.memories = [...memories];
  }

  /**
   * Queries relevant memories using OperationalLearningLoop.
   * Ensures every retrieved memory has provenance metadata and epistemic classification: 'historical_memory'.
   */
  public async queryMemories(params: MemoryQueryParams): Promise<RetrievedHistoricalMemory[]> {
    const rawResults = OperationalLearningLoop.retrieveRelevantMemories(
      {
        title: params.queryText,
        summary: params.queryText,
        category: params.category,
        currentFacts: params.currentFacts,
        tags: params.tags,
      },
      this.memories
    );

    const nowIso = new Date().toISOString();

    // Enhance every result with explicit provenance and epistemic classification
    const enriched: RetrievedHistoricalMemory[] = rawResults.map((item) => {
      const origMem = this.memories.find((m) => m.id === item.memoryId);
      return {
        ...item,
        provenance: {
          sourceSystem: 'company_memory',
          sourceId: `memory:${item.memoryId || item.id || 'unindexed'}`,
          sourceTitle: origMem?.approvedAction || item.approvedAction || item.memoryId || 'Historical Memory Precedent',
          epistemicType: 'historical_memory',
          authority: 'Founder-Approved Organizational Precedent',
          timestamp: origMem?.timestamp || nowIso,
          confidence: (item.epistemicConfidence || 'unverified') as any,
          immutablePrecedent: true,
          notes: 'Precedent only — never new empirical evidence; requires Founder approval to execute',
        },
      };
    });

    const limit = params.limit || 5;
    return enriched.slice(0, limit);
  }
}
