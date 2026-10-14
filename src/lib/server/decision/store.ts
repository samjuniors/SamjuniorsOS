/**
 * SamJuniorsOS — Native Decision Workflow
 * Durable Decision Store (Phase 2.1)
 *
 * Single server-side authoritative store for company decisions.
 * Persisted durably to `decisions.json` via DurableFileStore with
 * cross-process collection locking (`withCollectionLockStrict('decisions')`).
 */

import {
  DecisionRecord,
  DecisionFilter,
} from '@/types/decision';
import {
  DecisionNotFoundError,
  DecisionAlreadyExistsError,
  DecisionVersionConflictError,
} from './errors';
import { computeDecisionApprovalHash } from './payload-binding';
import {
  DurableFileStore,
  CriticalCollectionCorruptionError,
} from '@/lib/server/persistence/durable-file-store';
import { mapCompanyDecisionToDecisionRecord } from './adapter';

export class DecisionStore {
  private static instance: DecisionStore | null = null;
  private readonly collection = 'decisions';
  private decisionsMap: Map<string, DecisionRecord> = new Map();
  private initialized = false;

  private constructor() {
    this.ensureInitialized();
  }

  public static getInstance(): DecisionStore {
    if (!DecisionStore.instance) {
      DecisionStore.instance = new DecisionStore();
    }
    return DecisionStore.instance;
  }

  public static resetInstance(): void {
    DecisionStore.instance = null;
  }

  /**
   * Initializes store and runs deterministic seed migration under strict lock.
   */
  public ensureInitialized(): void {
    if (this.initialized) return;

    DurableFileStore.getInstance().withCollectionLockStrict(this.collection, () => {
      this.loadFromDurableStorageUnderLock();
      this.seedInitialDecisionsUnderLock();
    });

    this.initialized = true;
  }

  private loadFromDurableStorageUnderLock(): void {
    try {
      const persisted = DurableFileStore.getInstance().readCollection<DecisionRecord>(this.collection);
      this.decisionsMap.clear();
      for (const [id, record] of Object.entries(persisted)) {
        this.decisionsMap.set(id, record);
      }
    } catch (err) {
      if (err instanceof CriticalCollectionCorruptionError) {
        throw err;
      }
      // First-use clean fallback
    }
  }

  /**
   * Deterministically migrates the three canonical seed decisions (dec-1, dec-2, dec-3)
   * if they are not already present in the collection.
   * NEVER overwrites existing records or duplicates seeds on repeated startup.
   */
  private seedInitialDecisionsUnderLock(): void {
    let diskRecords: Record<string, DecisionRecord> = {};
    try {
      diskRecords = DurableFileStore.getInstance().readCollection<DecisionRecord>(this.collection);
    } catch (err) {
      if (err instanceof CriticalCollectionCorruptionError) {
        throw err;
      }
      diskRecords = {};
    }

    let modified = false;

    // Seed 1: Beta launch plan
    if (!diskRecords['dec-1'] && !this.decisionsMap.has('dec-1')) {
      const dec1: DecisionRecord = {
        decisionId: 'dec-1',
        creationRequestId: 'seed-dec-1',
        stateVersion: 1,
        title: 'Approve Beta Launch Plan for Self-Serve AI Tier',
        problemStatement:
          'Opening pilot onboarding to 15 waitlisted enterprise accounts requires capital and operational policy approval.',
        proposedAction:
          'Open pilot onboarding to 15 waitlisted enterprise accounts with automated workspace provisioning.',
        category: 'strategic',
        proposer: 'coo',
        accountableOwner: 'founder',
        createdAt: '2026-09-01T00:00:00.000Z',
        evidenceFactIds: [],
        assumptions: ['Validated onboarding compute burn strictly held at $0.18/tenant'],
        uncertainty: {
          level: 'low',
          description:
            'Empirical benchmark model indicates 78% drop-off on sales-gated demos; validated onboarding compute burn strictly held at $0.18/tenant.',
        },
        impact: 'medium',
        reversibility: 'reversible',
        status: 'pending_approval',
        approvalRequired: true,
        transitions: [
          {
            transitionId: 'tr-seed-1',
            fromStatus: 'proposed',
            toStatus: 'pending_approval',
            actor: 'coo',
            timestamp: '2026-09-01T00:00:00.000Z',
            reason: 'Initial seed proposal submitted for Founder approval',
            stateVersion: 1,
          },
        ],
      };
      diskRecords['dec-1'] = dec1;
      this.decisionsMap.set('dec-1', dec1);
      modified = true;
    }

    // Seed 2: 80%+ gross margin floor
    if (!diskRecords['dec-2'] && !this.decisionsMap.has('dec-2')) {
      const dec2Pre: DecisionRecord = {
        decisionId: 'dec-2',
        creationRequestId: 'seed-dec-2',
        stateVersion: 2,
        title: 'Adopt Strict 80%+ Gross Margin Floor Policy',
        problemStatement:
          'Capital efficiency and token inference runaway risks require advisory veto on compute-heavy operations.',
        proposedAction:
          'Julian Cruz holds advisory veto over compute-heavy workflows exceeding 20% cost-to-value ratio.',
        category: 'financial',
        proposer: 'finance',
        accountableOwner: 'founder',
        createdAt: '2026-08-15T00:00:00.000Z',
        evidenceFactIds: [],
        assumptions: ['Gross margin target floor of 80%+ is achievable across compute tiers'],
        uncertainty: {
          level: 'low',
          description:
            'Verified token cost attribution model confirms 83.9% target margin floor in sandbox.',
        },
        impact: 'high',
        reversibility: 'partially_reversible',
        status: 'approved',
        approvalRequired: true,
        decidedBy: 'founder',
        decidedAt: '2026-08-16T00:00:00.000Z',
        decisionReason: 'Adopted by Founder to enforce compute sustainability',
        transitions: [
          {
            transitionId: 'tr-seed-2-1',
            fromStatus: 'proposed',
            toStatus: 'pending_approval',
            actor: 'finance',
            timestamp: '2026-08-15T00:00:00.000Z',
            reason: 'Initial proposal for gross margin floor',
            stateVersion: 1,
          },
          {
            transitionId: 'tr-seed-2-2',
            fromStatus: 'pending_approval',
            toStatus: 'approved',
            actor: 'founder',
            timestamp: '2026-08-16T00:00:00.000Z',
            reason: 'Approved by Founder',
            stateVersion: 2,
          },
        ],
      };
      dec2Pre.approvedPayloadHash = computeDecisionApprovalHash(dec2Pre);
      diskRecords['dec-2'] = dec2Pre;
      this.decisionsMap.set('dec-2', dec2Pre);
      modified = true;
    }

    // Seed 3: Zero-trust agent sandboxing
    if (!diskRecords['dec-3'] && !this.decisionsMap.has('dec-3')) {
      const dec3Pre: DecisionRecord = {
        decisionId: 'dec-3',
        creationRequestId: 'seed-dec-3',
        stateVersion: 2,
        title: 'Zero-Trust Agent Sandboxing & Safe Mock Protocol',
        problemStatement:
          'Autonomous agent executions risk financial or state mutation without explicit sandboxing.',
        proposedAction:
          'All external capital movements and production mutations remain sandboxed in Safe Mock mode until explicit Founder approval.',
        category: 'governance',
        proposer: 'coo',
        accountableOwner: 'founder',
        createdAt: '2026-08-01T00:00:00.000Z',
        evidenceFactIds: [],
        assumptions: ['Agent sandboxing prevents accidental production side effects'],
        uncertainty: {
          level: 'low',
          description: 'Enforced at server orchestrator level via ServerAgentExecutor guardrails.',
        },
        impact: 'critical',
        reversibility: 'reversible',
        status: 'approved',
        approvalRequired: true,
        decidedBy: 'founder',
        decidedAt: '2026-08-02T00:00:00.000Z',
        decisionReason: 'Approved core safety protocol',
        transitions: [
          {
            transitionId: 'tr-seed-3-1',
            fromStatus: 'proposed',
            toStatus: 'pending_approval',
            actor: 'coo',
            timestamp: '2026-08-01T00:00:00.000Z',
            reason: 'Submitted zero-trust sandboxing proposal',
            stateVersion: 1,
          },
          {
            transitionId: 'tr-seed-3-2',
            fromStatus: 'pending_approval',
            toStatus: 'approved',
            actor: 'founder',
            timestamp: '2026-08-02T00:00:00.000Z',
            reason: 'Approved by Founder',
            stateVersion: 2,
          },
        ],
      };
      dec3Pre.approvedPayloadHash = computeDecisionApprovalHash(dec3Pre);
      diskRecords['dec-3'] = dec3Pre;
      this.decisionsMap.set('dec-3', dec3Pre);
      modified = true;
    }

    // Migrate any legacy company_state decisions if present in storage and not yet migrated
    try {
      const companyState = DurableFileStore.getInstance().readCollection<any>('company_state');
      if (companyState?.decisions && Array.isArray(companyState.decisions)) {
        for (const legacyDec of companyState.decisions) {
          if (legacyDec?.id && !diskRecords[legacyDec.id] && !this.decisionsMap.has(legacyDec.id)) {
            const migrated = mapCompanyDecisionToDecisionRecord(legacyDec);
            diskRecords[migrated.decisionId] = migrated;
            this.decisionsMap.set(migrated.decisionId, migrated);
            modified = true;
          }
        }
      }
    } catch {
      // Safe fallback if company_state is not initialized or corrupted
    }

    if (modified) {
      DurableFileStore.getInstance().writeCollectionStrict(this.collection, diskRecords);
    }
  }

  public async get(decisionId: string): Promise<DecisionRecord | null> {
    this.ensureInitialized();
    const diskRecords = DurableFileStore.getInstance().readCollection<DecisionRecord>(this.collection);
    const found = diskRecords[decisionId] || this.decisionsMap.get(decisionId);
    if (!found) return null;
    return JSON.parse(JSON.stringify(found));
  }

  public async getByCreationRequestId(creationRequestId: string): Promise<DecisionRecord | null> {
    this.ensureInitialized();
    const diskRecords = DurableFileStore.getInstance().readCollection<DecisionRecord>(this.collection);
    for (const record of Object.values(diskRecords)) {
      if (record.creationRequestId === creationRequestId) {
        return JSON.parse(JSON.stringify(record));
      }
    }
    for (const record of this.decisionsMap.values()) {
      if (record.creationRequestId === creationRequestId) {
        return JSON.parse(JSON.stringify(record));
      }
    }
    return null;
  }

  public async list(filter?: DecisionFilter): Promise<DecisionRecord[]> {
    this.ensureInitialized();
    const diskRecords = DurableFileStore.getInstance().readCollection<DecisionRecord>(this.collection);
    let all = Object.values(diskRecords);

    if (all.length === 0) {
      all = Array.from(this.decisionsMap.values());
    }

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      all = all.filter((d) => statuses.includes(d.status));
    }
    if (filter?.category) {
      all = all.filter((d) => d.category === filter.category);
    }
    if (filter?.proposer) {
      all = all.filter((d) => d.proposer === filter.proposer);
    }
    if (filter?.accountableOwner) {
      all = all.filter((d) => d.accountableOwner === filter.accountableOwner);
    }
    if (filter?.impact) {
      all = all.filter((d) => d.impact === filter.impact);
    }

    // Sort newest first by createdAt
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return JSON.parse(JSON.stringify(all));
  }

  /**
   * Creates a decision record idempotently under collection lock.
   * If a record with `creationRequestId` exists, returns the existing record.
   * If a record with `decisionId` exists with a different `creationRequestId`, throws.
   */
  public async create(record: DecisionRecord): Promise<{ record: DecisionRecord; isExisting: boolean }> {
    this.ensureInitialized();

    return DurableFileStore.getInstance().withCollectionLockStrict(this.collection, () => {
      const diskRecords = DurableFileStore.getInstance().readCollection<DecisionRecord>(this.collection);

      // Check for matching creationRequestId (idempotency)
      for (const existing of Object.values(diskRecords)) {
        if (existing.creationRequestId === record.creationRequestId) {
          return {
            record: JSON.parse(JSON.stringify(existing)),
            isExisting: true,
          };
        }
      }

      // Check for decisionId collision with different creationRequestId
      if (diskRecords[record.decisionId]) {
        throw new DecisionAlreadyExistsError(record.decisionId);
      }

      const clone = JSON.parse(JSON.stringify(record));
      DurableFileStore.getInstance().saveItemStrict(this.collection, record.decisionId, clone);
      this.decisionsMap.set(record.decisionId, clone);

      return {
        record: clone,
        isExisting: false,
      };
    });
  }

  /**
   * Atomically mutates a decision record under strict collection lock with
   * optimistic concurrency control (`expectedStateVersion`).
   * Validates that immutable creation attributes are not modified.
   */
  public async update(
    decisionId: string,
    expectedStateVersion: number,
    updater: (current: DecisionRecord) => DecisionRecord
  ): Promise<DecisionRecord> {
    this.ensureInitialized();

    return DurableFileStore.getInstance().withCollectionLockStrict(this.collection, () => {
      const diskRecords = DurableFileStore.getInstance().readCollection<DecisionRecord>(this.collection);
      const current = diskRecords[decisionId] || this.decisionsMap.get(decisionId);

      if (!current) {
        throw new DecisionNotFoundError(decisionId);
      }

      if (current.stateVersion !== expectedStateVersion) {
        throw new DecisionVersionConflictError(decisionId, expectedStateVersion, current.stateVersion);
      }

      const copy: DecisionRecord = JSON.parse(JSON.stringify(current));
      const updated = updater(copy);

      // Guard immutable creation fields
      if (updated.decisionId !== current.decisionId) {
        throw new Error(`Immutable field violation: decisionId cannot be mutated (${current.decisionId} -> ${updated.decisionId})`);
      }
      if (updated.creationRequestId !== current.creationRequestId) {
        throw new Error(`Immutable field violation: creationRequestId cannot be mutated`);
      }
      if (updated.createdAt !== current.createdAt) {
        throw new Error(`Immutable field violation: createdAt cannot be mutated`);
      }
      if (updated.proposer !== current.proposer) {
        throw new Error(`Immutable field violation: proposer cannot be mutated`);
      }

      // Increment optimistic state version
      updated.stateVersion = current.stateVersion + 1;

      DurableFileStore.getInstance().saveItemStrict(this.collection, decisionId, updated);
      this.decisionsMap.set(decisionId, updated);

      return JSON.parse(JSON.stringify(updated));
    });
  }

  public clear(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Decision records are governed company state and cannot be cleared in production.');
    }
    DurableFileStore.getInstance().withCollectionLockStrict(this.collection, () => {
      this.decisionsMap.clear();
      try {
        DurableFileStore.getInstance().clearCollection(this.collection);
      } catch {
        // Fallback
      }
    });
  }
}
