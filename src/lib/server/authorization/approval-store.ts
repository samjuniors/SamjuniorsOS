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
import { isAuthoritativeMode, requireAuthoritativeDatabase } from '@/lib/server/db/authority';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import { InstanceConcurrencyGuard } from '@/lib/server/persistence/instance-guard';
import { ApprovalAlreadyConsumedError } from '@/lib/server/workflow/state-machine';

/**
 * Interface defining the Approval Store contract.
 */
export interface IApprovalStore {
  save(record: FounderApprovalRecord): Promise<FounderApprovalRecord>;
  get(id: string): Promise<FounderApprovalRecord | null>;
  list(filter?: ApprovalFilter): Promise<FounderApprovalRecord[]>;
  findActiveMatching(params: {
    workflowInstanceId: string;
    stepId: string;
    employeeRole?: string;
    actionName?: string;
    classification?: SideEffectClassification;
  }): Promise<FounderApprovalRecord | null>;
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
 * Authoritative PostgreSQL Approval Store.
 * Direct persistence to PostgreSQL via Prisma. Fail-closed on database failure.
 */
export class PostgresApprovalStore implements IApprovalStore {
  private static instance: PostgresApprovalStore;

  public static getInstance(): PostgresApprovalStore {
    if (!PostgresApprovalStore.instance) {
      PostgresApprovalStore.instance = new PostgresApprovalStore();
    }
    return PostgresApprovalStore.instance;
  }

  public clear(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Approval records are governed and cannot be cleared in production.');
    }
  }

  public async save(record: FounderApprovalRecord): Promise<FounderApprovalRecord> {
    const db = await requireAuthoritativeDatabase();
    const created = await db.approvalRecord.upsert({
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
        payloadHash: record.payloadHash || null,
        decision: record.decision,
        decidedBy: record.decidedBy,
        decidedAt: record.decidedAt ? new Date(record.decidedAt) : null,
        reason: record.decisionReason,
        expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
        consumedAt: record.isConsumed ? new Date() : null,
        scope: (record.scope as any) ?? {},
      },
      update: {
        payloadHash: record.payloadHash || null,
        decision: record.decision,
        decidedBy: record.decidedBy,
        decidedAt: record.decidedAt ? new Date(record.decidedAt) : null,
        reason: record.decisionReason,
        expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
        consumedAt: record.isConsumed ? new Date() : null,
        scope: (record.scope as any) ?? {},
      },
    });

    return this.mapPrismaToApproval(created);
  }

  public async get(id: string): Promise<FounderApprovalRecord | null> {
    const db = await requireAuthoritativeDatabase();
    const found = await db.approvalRecord.findUnique({
      where: { id },
    });
    if (!found) return null;
    return this.mapPrismaToApproval(found);
  }

  public async list(filter?: ApprovalFilter): Promise<FounderApprovalRecord[]> {
    const db = await requireAuthoritativeDatabase();
    const where: any = {};
    if (filter?.workflowInstanceId) where.workflowInstanceId = filter.workflowInstanceId;
    if (filter?.stepId) where.stepId = filter.stepId;
    if (filter?.employeeRole) where.employeeRole = filter.employeeRole;
    if (filter?.classification) where.classification = filter.classification;
    if (filter?.status) where.decision = filter.status;

    const records = await db.approvalRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.mapPrismaToApproval(r));
  }

  public async findActiveMatching(params: {
    workflowInstanceId: string;
    stepId: string;
    employeeRole?: string;
    actionName?: string;
    classification?: SideEffectClassification;
  }): Promise<FounderApprovalRecord | null> {
    const db = await requireAuthoritativeDatabase();
    const where: any = {
      workflowInstanceId: params.workflowInstanceId,
    };
    if (params.classification) where.classification = params.classification;
    if (params.employeeRole) where.employeeRole = params.employeeRole;
    if (params.actionName) where.actionType = params.actionName;

    const candidates = await db.approvalRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();
    for (const raw of candidates) {
      const record = this.mapPrismaToApproval(raw);
      if (record.scope.scopeType === 'step' || record.scope.scopeType === 'single_action') {
        if (record.stepId !== params.stepId) continue;
      }

      // Check TTL expiration
      if (record.expiresAt && new Date(record.expiresAt).getTime() < now) {
        if (record.decision === 'approved') {
          await db.approvalRecord.update({
            where: { id: record.id },
            data: {
              decision: 'expired',
              reason: record.decisionReason || 'Approval expired automatically due to TTL',
            },
          });
          record.decision = 'expired';
          record.decisionReason = 'Approval expired automatically due to TTL';
        }
      }

      return record;
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
    const db = await requireAuthoritativeDatabase();
    const decidedAt = new Date();
    const updated = await db.approvalRecord.update({
      where: { id },
      data: {
        decision,
        decidedBy,
        decidedAt,
        reason: reason || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    return this.mapPrismaToApproval(updated);
  }

  public async revoke(id: string, revokedBy: string, reason?: string): Promise<FounderApprovalRecord> {
    const db = await requireAuthoritativeDatabase();
    const decidedAt = new Date();
    const updated = await db.approvalRecord.update({
      where: { id },
      data: {
        decision: 'revoked',
        decidedBy: revokedBy,
        decidedAt,
        reason: reason || 'Revoked by Founder',
      },
    });

    return this.mapPrismaToApproval(updated);
  }

  public async consume(id: string): Promise<FounderApprovalRecord> {
    const db = await requireAuthoritativeDatabase();
    return await db.$transaction(async (tx) => {
      const existing = await tx.approvalRecord.findUnique({ where: { id } });
      if (!existing) {
        throw new Error(`Approval record not found: ${id}`);
      }

      const scope = (existing.scope as any) || {};
      const allowedUses = scope.maxUses ?? scope.allowedUses ?? 1;
      const currentUses = scope.usedCount ?? 0;

      if (existing.consumedAt !== null || currentUses >= allowedUses) {
        throw new ApprovalAlreadyConsumedError(id, existing.consumedAt ?? undefined);
      }

      scope.usedCount = currentUses + 1;

      const updated = await tx.approvalRecord.update({
        where: { id },
        data: {
          consumedAt: new Date(),
          scope,
        },
      });

      return this.mapPrismaToApproval(updated);
    });
  }

  private mapPrismaToApproval(r: any): FounderApprovalRecord {
    const scope = (r.scope as any) || { allowedUses: 1, usedCount: 0 };
    return {
      id: r.id,
      workflowInstanceId: r.workflowInstanceId || '',
      stepId: r.stepId || '',
      actionName: r.actionType,
      employeeRole: r.employeeRole as any,
      classification: r.classification as any,
      target: {
        targetSystem: r.targetSystem as any,
        metadata: r.payload as any,
      },
      payloadHash: r.payloadHash || undefined,
      decision: r.decision as any,
      decidedBy: r.decidedBy || undefined,
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : undefined,
      decisionReason: r.reason || undefined,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : undefined,
      isConsumed: Boolean(r.consumedAt),
      requestedAt: r.createdAt.toISOString(),
      scope: {
        scopeType: scope.scopeType || 'single_action',
        workflowInstanceId: r.workflowInstanceId || undefined,
        stepId: r.stepId || undefined,
        campaignId: r.campaignId || undefined,
        allowedUses: scope.allowedUses ?? 1,
        usedCount: scope.usedCount ?? (r.consumedAt ? 1 : 0),
      } as any,
    };
  }
}

/**
 * Authoritative PostgreSQL Audit Store.
 * Direct persistence to PostgreSQL via Prisma. Fail-closed on database failure.
 */
export class PostgresAuditStore implements IAuditStore {
  private static instance: PostgresAuditStore;

  public static getInstance(): PostgresAuditStore {
    if (!PostgresAuditStore.instance) {
      PostgresAuditStore.instance = new PostgresAuditStore();
    }
    return PostgresAuditStore.instance;
  }

  public clear(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Audit trail is strictly append-only and immutable; cannot be cleared in production.');
    }
  }

  public async record(audit: SideEffectAuditRecord): Promise<SideEffectAuditRecord> {
    const db = await requireAuthoritativeDatabase();
    await db.sideEffectAudit.create({
      data: {
        id: audit.id,
        requestId: audit.requestId || null,
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

    return JSON.parse(JSON.stringify(audit));
  }

  public async get(id: string): Promise<SideEffectAuditRecord | null> {
    const db = await requireAuthoritativeDatabase();
    const found = await db.sideEffectAudit.findUnique({
      where: { id },
    });
    if (!found) return null;
    return this.mapPrismaToAudit(found);
  }

  public async list(filter?: AuditFilter): Promise<SideEffectAuditRecord[]> {
    const db = await requireAuthoritativeDatabase();
    const where: any = {};
    if (filter?.workflowInstanceId) where.workflowInstanceId = filter.workflowInstanceId;
    if (filter?.stepId) where.stepId = filter.stepId;
    if (filter?.employeeRole) where.employeeRole = filter.employeeRole;
    if (filter?.classification) where.classification = filter.classification;
    if (filter?.decision) where.decisionOutcome = filter.decision;

    const records = await db.sideEffectAudit.findMany({
      where,
      orderBy: { timestamp: 'desc' },
    });

    let results = records.map((r) => this.mapPrismaToAudit(r));
    if (filter?.executedOnly) {
      results = results.filter((a) => a.executed === true);
    }
    return results;
  }

  private mapPrismaToAudit(r: any): SideEffectAuditRecord {
    return {
      id: r.id,
      requestId: r.requestId || uuidv4(),
      requestedBy: r.employeeRole || 'unknown',
      approvalId: r.approvalId || '',
      workflowInstanceId: r.workflowInstanceId || '',
      stepId: r.stepId || '',
      actionName: r.actionType,
      actionClassification: r.classification as any,
      employeeRole: r.employeeRole as any,
      target: {
        targetSystem: r.targetSystem as any,
        metadata: r.payload as any,
      },
      decision: r.decisionOutcome as any,
      reasonCode: (r.decisionOutcome === 'allowed' ? 'APPROVED_BY_FOUNDER' : 'APPROVAL_REQUIRED_STEP_POLICY') as any,
      reason: r.reason || '',
      executionReference: r.executionReference || undefined,
      executed: Boolean(r.executionReference),
      timestamp: r.timestamp.toISOString(),
    };
  }
}

/**
 * Dual-Mode Approval Store.
 * In Authoritative Mode: delegates directly to PostgresApprovalStore (fail-closed).
 * In Test/Local Mode: uses fast in-memory maps with local file persistence.
 */
export class InMemoryApprovalStore implements IApprovalStore {
  private static instance: InMemoryApprovalStore;
  public approvals: Map<string, FounderApprovalRecord> = new Map();

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

  public loadFromDurableStorage(): void {
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
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Approval records are governed and cannot be cleared in production.');
    }
    this.approvals.clear();
    try {
      DurableFileStore.getInstance().clearCollection('approvals');
    } catch {
      // fallback
    }
  }

  public async save(record: FounderApprovalRecord): Promise<FounderApprovalRecord> {
    if (isAuthoritativeMode()) {
      return PostgresApprovalStore.getInstance().save(record);
    }

    const clone = JSON.parse(JSON.stringify(record));
    this.approvals.set(record.id, clone);

    try {
      DurableFileStore.getInstance().saveItem('approvals', record.id, clone);
    } catch (err) {
      console.warn('[ApprovalStore] Error saving to durable file store:', err);
    }

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
            payloadHash: record.payloadHash || null,
            decision: record.decision,
            decidedBy: record.decidedBy,
            decidedAt: record.decidedAt ? new Date(record.decidedAt) : null,
            reason: record.decisionReason,
            expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
            consumedAt: record.isConsumed ? new Date() : null,
            scope: (record.scope as any) ?? {},
          },
          update: {
            payloadHash: record.payloadHash || null,
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
        // Fallback safely in test environments without live PostgreSQL
      }
    }

    return clone;
  }

  public async get(id: string): Promise<FounderApprovalRecord | null> {
    if (isAuthoritativeMode()) {
      return PostgresApprovalStore.getInstance().get(id);
    }

    const record = this.approvals.get(id);
    if (record) return JSON.parse(JSON.stringify(record));

    if (process.env.DATABASE_URL) {
      try {
        const found = await prisma.approvalRecord.findUnique({
          where: { id },
        });
        if (found) {
          const mapped: FounderApprovalRecord = {
            id: found.id,
            workflowInstanceId: found.workflowInstanceId || '',
            stepId: found.stepId || '',
            actionName: found.actionType,
            employeeRole: found.employeeRole as any,
            classification: found.classification as any,
            target: {
              targetSystem: found.targetSystem as any,
              metadata: found.payload as any,
            },
            payloadHash: found.payloadHash || undefined,
            decision: found.decision as any,
            decidedBy: found.decidedBy || undefined,
            decidedAt: found.decidedAt ? found.decidedAt.toISOString() : undefined,
            decisionReason: found.reason || undefined,
            expiresAt: found.expiresAt ? found.expiresAt.toISOString() : undefined,
            isConsumed: Boolean(found.consumedAt),
            requestedAt: found.createdAt.toISOString(),
            scope: (found.scope as any) || { scopeType: 'single_action', allowedUses: 1, usedCount: 0 },
          };
          this.approvals.set(id, mapped);
          return mapped;
        }
      } catch {
        // Fallback
      }
    }

    return null;
  }

  public async list(filter?: ApprovalFilter): Promise<FounderApprovalRecord[]> {
    if (isAuthoritativeMode()) {
      return PostgresApprovalStore.getInstance().list(filter);
    }

    let list = Array.from(this.approvals.values());

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
    if (filter?.status) {
      list = list.filter((a) => a.decision === filter.status);
    }

    return JSON.parse(JSON.stringify(list));
  }

  public async findActiveMatching(params: {
    workflowInstanceId: string;
    stepId: string;
    employeeRole?: string;
    actionName?: string;
    classification?: SideEffectClassification;
  }): Promise<FounderApprovalRecord | null> {
    if (isAuthoritativeMode()) {
      return PostgresApprovalStore.getInstance().findActiveMatching(params);
    }

    const now = Date.now();
    for (const record of this.approvals.values()) {
      if (record.workflowInstanceId !== params.workflowInstanceId) continue;

      if (record.scope.scopeType === 'step' || record.scope.scopeType === 'single_action') {
        if (record.stepId !== params.stepId) continue;
      }

      if (params.classification && record.classification !== params.classification) continue;
      if (params.employeeRole && record.employeeRole !== params.employeeRole) continue;

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
    if (isAuthoritativeMode()) {
      return PostgresApprovalStore.getInstance().decide(id, decision, decidedBy, reason, expiresAt);
    }

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
    if (isAuthoritativeMode()) {
      return PostgresApprovalStore.getInstance().revoke(id, revokedBy, reason);
    }

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
    if (isAuthoritativeMode()) {
      return PostgresApprovalStore.getInstance().consume(id);
    }

    const record = this.approvals.get(id);
    if (!record) {
      throw new Error(`Approval record not found: ${id}`);
    }

    const allowedUses = (record.scope as any)?.maxUses ?? (record.scope as any)?.allowedUses ?? 1;
    const currentUses = record.scope?.usedCount ?? 0;

    if (record.isConsumed || currentUses >= allowedUses) {
      throw new ApprovalAlreadyConsumedError(id, record.decidedAt);
    }

    record.isConsumed = true;
    record.scope.usedCount = currentUses + 1;
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
 * Dual-Mode Audit Trail Store.
 * In Authoritative Mode: delegates directly to PostgresAuditStore (fail-closed).
 * In Test/Local Mode: uses fast in-memory maps with local file persistence.
 */
export class InMemoryAuditStore implements IAuditStore {
  private static instance: InMemoryAuditStore;
  public audits: Map<string, SideEffectAuditRecord> = new Map();

  private constructor() {
    this.loadFromDurableStorage();
  }

  public static getInstance(): InMemoryAuditStore {
    if (!InMemoryAuditStore.instance) {
      InMemoryAuditStore.instance = new InMemoryAuditStore();
    }
    return InMemoryAuditStore.instance;
  }

  public loadFromDurableStorage(): void {
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
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Audit trail is strictly append-only and immutable; cannot be cleared in production.');
    }
    this.audits.clear();
    try {
      DurableFileStore.getInstance().clearCollection('audits');
    } catch {
      // fallback
    }
  }

  public async record(audit: SideEffectAuditRecord): Promise<SideEffectAuditRecord> {
    if (isAuthoritativeMode()) {
      return PostgresAuditStore.getInstance().record(audit);
    }

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
            requestId: audit.requestId || null,
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
    if (isAuthoritativeMode()) {
      return PostgresAuditStore.getInstance().get(id);
    }

    const record = this.audits.get(id);
    if (!record) return null;
    return JSON.parse(JSON.stringify(record));
  }

  public async list(filter?: AuditFilter): Promise<SideEffectAuditRecord[]> {
    if (isAuthoritativeMode()) {
      return PostgresAuditStore.getInstance().list(filter);
    }

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

    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return JSON.parse(JSON.stringify(list));
  }
}
