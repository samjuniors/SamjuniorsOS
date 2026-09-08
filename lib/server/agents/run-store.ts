import { AgentRole, AgentWorkProtocolStep, OutputProvenance } from '@/types/os';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import { prisma } from '@/lib/server/db/prisma';
import { isAuthoritativeMode, requireAuthoritativeDatabase } from '@/lib/server/db/authority';

export interface AgentRunRecord {
  runId: string;
  agentId: AgentRole | 'advisor';
  agentName: string;
  protocolStep: AgentWorkProtocolStep;
  taskTitle: string;
  directive: string;
  status: 'running' | 'completed' | 'failed' | 'halted';
  durationMs: number;
  outputContent: string;
  structuredData?: Record<string, any>;
  claimsGenerated?: string[];
  provenance: OutputProvenance;
  modelUsed?: string;
  error?: string;
  timestamp: string;
}

export interface IAgentRunStore {
  saveRun(run: AgentRunRecord): Promise<void>;
  getRun(runId: string): Promise<AgentRunRecord | null>;
  listRuns(filter?: {
    agentId?: AgentRole | 'advisor';
    status?: AgentRunRecord['status'];
    limit?: number;
  }): Promise<AgentRunRecord[]>;
}

/**
 * Authoritative PostgreSQL Agent Run Store.
 * Direct persistence to PostgreSQL via Prisma. Fail-closed on database failure.
 */
export class PostgresAgentRunStore implements IAgentRunStore {
  private static instance: PostgresAgentRunStore;

  public static getInstance(): PostgresAgentRunStore {
    if (!PostgresAgentRunStore.instance) {
      PostgresAgentRunStore.instance = new PostgresAgentRunStore();
    }
    return PostgresAgentRunStore.instance;
  }

  public async saveRun(run: AgentRunRecord): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    await db.agentRun.upsert({
      where: { id: run.runId },
      create: {
        id: run.runId,
        agentId: run.agentId,
        agentName: run.agentName,
        protocolStep: run.protocolStep,
        taskTitle: run.taskTitle,
        directive: run.directive,
        status: run.status,
        durationMs: run.durationMs,
        outputContent: run.outputContent,
        structuredData: (run.structuredData as any) ?? {},
        claimsGenerated: (run.claimsGenerated as any) ?? [],
        provenance: (run.provenance as any) ?? {},
        modelUsed: run.modelUsed || null,
        error: run.error || null,
        createdAt: new Date(run.timestamp),
      },
      update: {
        status: run.status,
        durationMs: run.durationMs,
        outputContent: run.outputContent,
        structuredData: (run.structuredData as any) ?? {},
        claimsGenerated: (run.claimsGenerated as any) ?? [],
        provenance: (run.provenance as any) ?? {},
        modelUsed: run.modelUsed || null,
        error: run.error || null,
      },
    });
  }

  public async getRun(runId: string): Promise<AgentRunRecord | null> {
    const db = await requireAuthoritativeDatabase();
    const found = await db.agentRun.findUnique({
      where: { id: runId },
    });
    if (!found) return null;
    return this.mapPrismaToRun(found);
  }

  public async listRuns(filter?: {
    agentId?: AgentRole | 'advisor';
    status?: AgentRunRecord['status'];
    limit?: number;
  }): Promise<AgentRunRecord[]> {
    const db = await requireAuthoritativeDatabase();
    const where: any = {};
    if (filter?.agentId) where.agentId = filter.agentId;
    if (filter?.status) where.status = filter.status;

    const runs = await db.agentRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter?.limit,
    });

    return runs.map((r) => this.mapPrismaToRun(r));
  }

  private mapPrismaToRun(r: any): AgentRunRecord {
    return {
      runId: r.id,
      agentId: r.agentId as any,
      agentName: r.agentName,
      protocolStep: r.protocolStep as any,
      taskTitle: r.taskTitle,
      directive: r.directive,
      status: r.status as any,
      durationMs: r.durationMs,
      outputContent: r.outputContent,
      structuredData: (r.structuredData as any) || undefined,
      claimsGenerated: (r.claimsGenerated as any) || undefined,
      provenance: (r.provenance as any) || {},
      modelUsed: r.modelUsed || undefined,
      error: r.error || undefined,
      timestamp: r.createdAt.toISOString(),
    };
  }
}

/**
 * Dual-Mode Agent Run Store.
 * In Authoritative Mode: delegates directly to PostgresAgentRunStore (fail-closed).
 * In Test/Local Mode: uses fast in-memory maps with local file persistence.
 */
export class AgentRunStore implements IAgentRunStore {
  private static instance: AgentRunStore | null = null;
  public runs: Map<string, AgentRunRecord> = new Map();

  constructor() {
    this.loadFromDurableStorage();
  }

  public static getInstance(): AgentRunStore {
    if (!AgentRunStore.instance) {
      AgentRunStore.instance = new AgentRunStore();
    }
    return AgentRunStore.instance;
  }

  public loadFromDurableStorage(): void {
    try {
      const persisted = DurableFileStore.getInstance().readCollection<AgentRunRecord>('agent_runs');
      Object.values(persisted).forEach((run) => {
        this.runs.set(run.runId, run);
      });
    } catch (err) {
      console.warn('[AgentRunStore] Failed to load agent runs from disk:', err);
    }
  }

  public async saveRun(run: AgentRunRecord): Promise<void> {
    if (isAuthoritativeMode()) {
      return PostgresAgentRunStore.getInstance().saveRun(run);
    }

    this.runs.set(run.runId, { ...run });
    try {
      DurableFileStore.getInstance().saveItem('agent_runs', run.runId, run);
    } catch {}
  }

  public async getRun(runId: string): Promise<AgentRunRecord | null> {
    if (isAuthoritativeMode()) {
      return PostgresAgentRunStore.getInstance().getRun(runId);
    }

    const run = this.runs.get(runId);
    return run ? { ...run } : null;
  }

  public async listRuns(filter?: {
    agentId?: AgentRole | 'advisor';
    status?: AgentRunRecord['status'];
    limit?: number;
  }): Promise<AgentRunRecord[]> {
    if (isAuthoritativeMode()) {
      return PostgresAgentRunStore.getInstance().listRuns(filter);
    }

    let result = Array.from(this.runs.values());

    if (filter?.agentId) {
      result = result.filter((r) => r.agentId === filter.agentId);
    }

    if (filter?.status) {
      result = result.filter((r) => r.status === filter.status);
    }

    result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (filter?.limit) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }
}
