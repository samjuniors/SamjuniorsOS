import {
  FounderApprovalRecord,
  ApprovalFilter,
  SideEffectAuditRecord,
  AuditFilter,
  ApprovalStatus,
  SideEffectClassification,
} from '@/types/authorization';
import { v4 as uuidv4 } from 'uuid';

/**
 * Thread-safe In-Memory Store for Founder Approval Records.
 * Enforces strict immutability of audit fields and deterministic lifecycle updates.
 */
export class InMemoryApprovalStore {
  private static instance: InMemoryApprovalStore;
  private approvals: Map<string, FounderApprovalRecord> = new Map();

  private constructor() {}

  public static getInstance(): InMemoryApprovalStore {
    if (!InMemoryApprovalStore.instance) {
      InMemoryApprovalStore.instance = new InMemoryApprovalStore();
    }
    return InMemoryApprovalStore.instance;
  }

  public clear(): void {
    this.approvals.clear();
  }

  public async save(record: FounderApprovalRecord): Promise<FounderApprovalRecord> {
    const clone = JSON.parse(JSON.stringify(record));
    this.approvals.set(record.id, clone);
    return clone;
  }

  public async get(id: string): Promise<FounderApprovalRecord | null> {
    const record = this.approvals.get(id);
    if (!record) return null;
    return JSON.parse(JSON.stringify(record));
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
        // Mark as expired in record
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
    return JSON.parse(JSON.stringify(record));
  }
}

/**
 * Append-only Audit Trail Store for Side-Effect Authorization decisions and executions.
 */
export class InMemoryAuditStore {
  private static instance: InMemoryAuditStore;
  private audits: Map<string, SideEffectAuditRecord> = new Map();

  private constructor() {}

  public static getInstance(): InMemoryAuditStore {
    if (!InMemoryAuditStore.instance) {
      InMemoryAuditStore.instance = new InMemoryAuditStore();
    }
    return InMemoryAuditStore.instance;
  }

  public clear(): void {
    this.audits.clear();
  }

  public async record(audit: SideEffectAuditRecord): Promise<SideEffectAuditRecord> {
    const clone = JSON.parse(JSON.stringify(audit));
    this.audits.set(audit.id, clone);
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
