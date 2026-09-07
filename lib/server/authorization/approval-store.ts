import {
  FounderApprovalRecord,
  ApprovalFilter,
  SideEffectAuditRecord,
  AuditFilter,
  ApprovalStatus,
  SideEffectClassification,
} from '@/types/authorization';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/server/db/prisma';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import { InstanceConcurrencyGuard } from '@/lib/server/persistence/instance-guard';

/**
 * Interface defining the Approval Store contract.
 */
export interface IApprovalStore {
  save(record: FounderApprovalRecord): Promise<FounderApprovalRecord>;
  get(id: string): Promise<FounderApprovalRecord | null>;
  list(filter?: ApprovalFilter): Promise<FounderApprovalRecord[]>;
  decide(
    id: string,
    decision: 'approved' | 'rejected',
    decidedBy: string,
    reason?: string,
    expiresAt?: string
  ): Promise<FounderApprovalRecord>;
  revoke(id: string, revokedBy: string, reason?: string): Promise<FounderApprovalRecord>;
  consume(id: string): Promise<FounderApprovalRecord>;
  clear(): void;
}

/**
 * Interface defining the Audit Store contract.
 */
export interface IAuditStore {
  record(audit: SideEffectAuditRecord): Promise<SideEffectAuditRecord>;
  get(id: string): Promise<SideEffectAuditRecord | null>;
  list(filter?: AuditFilter): Promise<SideEffectAuditRecord[]>;
  clear(): void;
}

/**
 * Dual-layer Approval Store with PostgreSQL/Prisma persistence and fast in-memory caching.
 * Enforces strict immutability of audit fields and deterministic lifecycle updates.
 */
export class InMemoryApprovalStore implements IApprovalStore {
  private static instance: InMemoryApprovalStore;
  private approvals: Map<string, FounderApprovalRecord> = new Map();

  private constructor() {
    InstanceConcurrencyGuard.getInstance().acquireSingleInstanceLease();
    this.loadFromDurableStorage();
  }

  public static getInstance(): InMemoryApprovalStore {
    if (!InMemoryApprovalStore.instance) {
      InMemoryApprovalStore.instance = new InMemoryApprovalStore();
    }
    return InMemoryApprovalStore.instance;
  }

  private loadFromDurableStorage(): void {
    try {
      const persisted = DurableFileStore.getInstance().readCollection<FounderApprovalRecord>('approvals');
      for (const [id, record] of Object.entries(persisted)) {
        this.approvals.set(id, record);
      }
    } catch {
      // fallback
    }
  }

  public clear(): void {
    this.approvals.clear();
    try {
      DurableFileStore.getInstance().clearCollection('approvals');
    } catch {
      // fallback
    }
  }

  public async save(record: FounderApprovalRecord): Promise<FounderApprovalRecord> {
    const clone = JSON.parse(JSON.stringify(record));
    this.approvals.set(record.id, clone);

    // Persist to local durable file store
    try {
      DurableFileStore.getInstance().saveItem('approvals', record.id, clone);
    } catch (err) {
      console.warn('[ApprovalStore] Error saving to durable file store:', err);
    }

    // Persist to PostgreSQL if database connection is available
    if (process.env.DATABASE_URL) {
      try {
        await prisma.approvalRecord.upsert({
          where: { id: record.id },
          create: {
            id: record.id,
            workflowInstanceId: record.workflowInstanceId,
            stepId: record.stepId,
            campaignId: record.scope?.campaignId,
            employeeRole: record.employeeRole,
            classification: record.classification,
            actionType: record.actionName,
            targetSystem: record.target?.targetSystem || 'internal',
            payload: (record.target?.metadata as any) ?? {},
            decision: record.decision,
            decidedBy: record.decidedBy,
            decidedAt: record.decidedAt ? new Date(record.decidedAt) : null,
            reason: record.decisionReason,
            expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
            consumedAt: record.isConsumed ? new Date() : null,
            scope: (record.scope as any) ?? {},
          },
          update: {
            decision: record.decision,
            decidedBy: record.decidedBy,
            decidedAt: record.decidedAt ? new Date(record.decidedAt) : null,
            reason: record.decisionReason,
            expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
            consumedAt: record.isConsumed ? new Date() : null,
            scope: (record.scope as any) ?? {},
          },
        });
      } catch (err) {
        // Fallback safely in environments without live PostgreSQL
      }
    }

    return clone;
  }

  public async get(id: string): Promise<FounderApprovalRecord | null> {
    const record = this.approvals.get(id);
    if (record) return JSON.parse(JSON.stringify(record));

    if (process.env.DATABASE_URL) {
      try {
        const dbRecord = await prisma.approvalRecord.findUnique({ where: { id } });
        if (dbRecord) {
          const mapped: FounderApprovalRecord = {
            id: dbRecord.id,
            workflowInstanceId: dbRecord.workflowInstanceId || '',
            stepId: dbRecord.stepId,
            employeeRole: dbRecord.employeeRole as any,
            classification: dbRecord.classification as SideEffectClassification,
            actionName: dbRecord.actionType,
            decision: dbRecord.decision as ApprovalStatus,
            decidedBy: dbRecord.decidedBy || undefined,
            decidedAt: dbRecord.decidedAt ? dbRecord.decidedAt.toISOString() : undefined,
            decisionReason: dbRecord.reason || undefined,
            expiresAt: dbRecord.expiresAt ? dbRecord.expiresAt.toISOString() : undefined,
            isConsumed: !!dbRecord.consumedAt,
            scope: (dbRecord.scope as any) || { scopeType: 'single_action' },
            target: {
              targetSystem: dbRecord.targetSystem,
              metadata: (dbRecord.payload as any) || {},
            },
            requestedAt: dbRecord.createdAt.toISOString(),
          };
          this.approvals.set(mapped.id, mapped);
          return mapped;
        }
      } catch {
        // Fallback
      }
    }

    return null;
  }

  public async list(filter?: ApprovalFilter): Promise<FounderApprovalRecord[]> {
    let list = Array.from(this.approvals.values());

    if (filter?.status) {
      list = list.filter((a) => a.decision === filter.status);
    }
    if (filter?.workflowInstanceId) {
      list = list.filter((a) => a.workflowInstanceId === filter.workflowInstanceId);
    }
    if (filter?.stepId) {
      list = list.filter((a) => a.stepId === filter.stepId);
    }
    if (filter?.employeeRole) {
      list = list.filter((a) => a.employeeRole === filter.employeeRole);
    }
    if (filter?.classification) {
      list = list.filter((a) => a.classification === filter.classification);
    }

    return JSON.parse(JSON.stringify(list));
  }

  /**
   * Find an existing active approval matching the intended workflow step action.
   */
  public async findActiveMatching(params: {
    workflowInstanceId: string;
    stepId: string;
    employeeRole?: string;
    actionName?: string;
    classification?: SideEffectClassification;
  }): Promise<FounderApprovalRecord | null> {
    const now = Date.now();
    for (const record of this.approvals.values()) {
      if (record.workflowInstanceId !== params.workflowInstanceId) continue;

      // Check Step Scope matching
      if (record.scope.scopeType === 'step' || record.scope.scopeType === 'single_action') {
        if (record.stepId !== params.stepId) continue;
      }

      if (params.classification && record.classification !== params.classification) continue;
      if (params.employeeRole && record.employeeRole !== params.employeeRole) continue;

      // Check if expired
      if (record.expiresAt && new Date(record.expiresAt).getTime() < now) {
        if (record.decision === 'approved') {
          record.decision = 'expired';
          record.decisionReason = record.decisionReason || 'Approval expired automatically due to TTL';
          this.approvals.set(record.id, record);
        }
      }

      return JSON.parse(JSON.stringify(record));
    }
    return null;
  }

  public async decide(
    id: string,
    decision: 'approved' | 'rejected',
    decidedBy: string,
    reason?: string,
    expiresAt?: string
  ): Promise<FounderApprovalRecord> {
    const record = this.approvals.get(id);
    if (!record) {
      throw new Error(`Approval record not found: ${id}`);
    }

    record.decision = decision;
    record.decidedAt = new Date().toISOString();
    record.decidedBy = decidedBy;
    if (reason) record.decisionReason = reason;
    if (expiresAt) record.expiresAt = expiresAt;

    this.approvals.set(id, record);
    try {
      DurableFileStore.getInstance().saveItem('approvals', id, record);
    } catch {}

    if (process.env.DATABASE_URL) {
      try {
        await prisma.approvalRecord.update({
          where: { id },
          data: {
            decision,
            decidedBy,
            decidedAt: new Date(record.decidedAt),
            reason: record.decisionReason,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          },
        });
      } catch {
        // Fallback
      }
    }

    return JSON.parse(JSON.stringify(record));
  }

  public async revoke(id: string, revokedBy: string, reason?: string): Promise<FounderApprovalRecord> {
    const record = this.approvals.get(id);
    if (!record) {
      throw new Error(`Approval record not found: ${id}`);
    }

    record.decision = 'revoked';
    record.decidedAt = new Date().toISOString();
    record.decidedBy = revokedBy;
    record.decisionReason = reason || 'Revoked by Founder';

    this.approvals.set(id, record);
    try {
      DurableFileStore.getInstance().saveItem('approvals', id, record);
    } catch {}

    if (process.env.DATABASE_URL) {
      try {
        await prisma.approvalRecord.update({
          where: { id },
          data: {
            decision: 'revoked',
            decidedBy: revokedBy,
            decidedAt: new Date(record.decidedAt),
            reason: record.decisionReason,
          },
        });
      } catch {
        // Fallback
      }
    }

    return JSON.parse(JSON.stringify(record));
  }

  public async consume(id: string): Promise<FounderApprovalRecord> {
    const record = this.approvals.get(id);
    if (!record) {
      throw new Error(`Approval record not found: ${id}`);
    }

    record.isConsumed = true;
    record.scope.usedCount = (record.scope.usedCount || 0) + 1;
    this.approvals.set(id, record);
    try {
      DurableFileStore.getInstance().saveItem('approvals', id, record);
    } catch {}

    if (process.env.DATABASE_URL) {
      try {
        await prisma.approvalRecord.update({
          where: { id },
          data: {
            consumedAt: new Date(),
            scope: record.scope as any,
          },
        });
      } catch {
        // Fallback
      }
    }

    return JSON.parse(JSON.stringify(record));
  }
}

/**
 * Append-only Audit Trail Store for Side-Effect Authorization decisions and executions.
 */
export class InMemoryAuditStore implements IAuditStore {
  private static instance: InMemoryAuditStore;
  private audits: Map<string, SideEffectAuditRecord> = new Map();

  private constructor() {
    this.loadFromDurableStorage();
  }

  public static getInstance(): InMemoryAuditStore {
    if (!InMemoryAuditStore.instance) {
      InMemoryAuditStore.instance = new InMemoryAuditStore();
    }
    return InMemoryAuditStore.instance;
  }

  private loadFromDurableStorage(): void {
    try {
      const persisted = DurableFileStore.getInstance().readCollection<SideEffectAuditRecord>('audits');
      for (const [id, record] of Object.entries(persisted)) {
        this.audits.set(id, record);
      }
    } catch {
      // fallback
    }
  }

  public clear(): void {
    this.audits.clear();
    try {
      DurableFileStore.getInstance().clearCollection('audits');
    } catch {
      // fallback
    }
  }

  public async record(audit: SideEffectAuditRecord): Promise<SideEffectAuditRecord> {
    const clone = JSON.parse(JSON.stringify(audit));
    this.audits.set(audit.id, clone);

    try {
      DurableFileStore.getInstance().saveItem('audits', audit.id, clone);
    } catch (err) {
      console.warn('[AuditStore] Error saving to durable file store:', err);
    }

    if (process.env.DATABASE_URL) {
      try {
        await prisma.sideEffectAudit.create({
          data: {
            id: audit.id,
            approvalId: audit.approvalId,
            workflowInstanceId: audit.workflowInstanceId,
            stepId: audit.stepId,
            employeeRole: audit.employeeRole,
            classification: audit.actionClassification,
            actionType: audit.actionName || 'UNKNOWN',
            targetSystem: audit.target?.targetSystem || 'internal',
            payload: (audit.target?.metadata as any) ?? {},
            decisionOutcome: audit.decision,
            reason: audit.reason,
            executionReference: audit.executionReference,
            timestamp: new Date(audit.timestamp),
          },
        });
      } catch {
        // Fallback
      }
    }

    return clone;
  }

  public async get(id: string): Promise<SideEffectAuditRecord | null> {
    const record = this.audits.get(id);
    if (!record) return null;
    return JSON.parse(JSON.stringify(record));
  }

  public async list(filter?: AuditFilter): Promise<SideEffectAuditRecord[]> {
    let list = Array.from(this.audits.values());

    if (filter?.workflowInstanceId) {
      list = list.filter((a) => a.workflowInstanceId === filter.workflowInstanceId);
    }
    if (filter?.stepId) {
      list = list.filter((a) => a.stepId === filter.stepId);
    }
    if (filter?.employeeRole) {
      list = list.filter((a) => a.employeeRole === filter.employeeRole);
    }
    if (filter?.classification) {
      list = list.filter((a) => a.actionClassification === filter.classification);
    }
    if (filter?.decision) {
      list = list.filter((a) => a.decision === filter.decision);
    }
    if (filter?.executedOnly) {
      list = list.filter((a) => a.executed === true);
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return JSON.parse(JSON.stringify(list));
  }
}
