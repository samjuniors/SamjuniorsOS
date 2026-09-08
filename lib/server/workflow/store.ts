import {
  WorkflowDefinition,
  WorkflowInstanceState,
  WorkflowStepState,
  WorkflowStepStatus,
  WorkflowInstanceStatus,
} from '../../../types/workflow';
import { prisma } from '@/lib/server/db/prisma';
import { isAuthoritativeMode, requireAuthoritativeDatabase } from '@/lib/server/db/authority';
import { DurableFileStore } from '@/lib/server/persistence/durable-file-store';
import {
  validateStepTransition,
  validateInstanceTransition,
  ConcurrencyConflictError,
  StepClaimError,
} from './state-machine';

/**
 * Interface for persisting Workflow Definitions.
 */
export interface WorkflowDefinitionStore {
  saveDefinition(definition: WorkflowDefinition): Promise<void>;
  getDefinition(id: string, version?: string): Promise<WorkflowDefinition | null>;
  listDefinitions(): Promise<WorkflowDefinition[]>;
}

/**
 * Interface for persisting Workflow Instances with atomic operations.
 */
export interface WorkflowInstanceStore {
  saveInstance(instance: WorkflowInstanceState): Promise<void>;
  getInstance(instanceId: string): Promise<WorkflowInstanceState | null>;
  listInstances(status?: string): Promise<WorkflowInstanceState[]>;
  claimStepAtomic(
    instanceId: string,
    stepId: string,
    workerId: string,
    expectedVersion?: number
  ): Promise<{ instance: WorkflowInstanceState; step: WorkflowStepState }>;
  transitionStepAtomic(
    instanceId: string,
    stepId: string,
    targetStatus: WorkflowStepStatus,
    expectedVersion?: number,
    patch?: Partial<WorkflowStepState>,
    instancePatch?: Partial<WorkflowInstanceState>
  ): Promise<WorkflowInstanceState>;
  rehydrateActiveInstances(): Promise<WorkflowInstanceState[]>;
}

/**
 * Authoritative PostgreSQL Workflow Store.
 * Direct persistence to PostgreSQL via Prisma. Fail-closed on database failure.
 */
export class PostgresWorkflowStore implements WorkflowDefinitionStore, WorkflowInstanceStore {
  private static instance: PostgresWorkflowStore;

  public static getInstance(): PostgresWorkflowStore {
    if (!PostgresWorkflowStore.instance) {
      PostgresWorkflowStore.instance = new PostgresWorkflowStore();
    }
    return PostgresWorkflowStore.instance;
  }

  // ---------------------------------------------------------
  // Definition Store Methods
  // ---------------------------------------------------------

  async saveDefinition(definition: WorkflowDefinition): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    await db.workflowDefinition.upsert({
      where: {
        id_version: {
          id: definition.id,
          version: definition.version || '1.0.0',
        },
      },
      create: {
        id: definition.id,
        version: definition.version || '1.0.0',
        name: definition.name,
        description: definition.description,
        steps: (definition.steps as any) ?? [],
      },
      update: {
        name: definition.name,
        description: definition.description,
        steps: (definition.steps as any) ?? [],
      },
    });
  }

  async getDefinition(id: string, version?: string): Promise<WorkflowDefinition | null> {
    const db = await requireAuthoritativeDatabase();
    const dbDef = await db.workflowDefinition.findFirst({
      where: {
        id,
        ...(version ? { version } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!dbDef) return null;

    return {
      id: dbDef.id,
      version: dbDef.version,
      name: dbDef.name,
      description: dbDef.description || '',
      objective: '',
      steps: (dbDef.steps as any) || [],
      dependencies: [],
      requiredApprovals: 0,
      allowedRoles: [],
      allowedSkills: [],
      expectedOutputs: [],
    };
  }

  async listDefinitions(): Promise<WorkflowDefinition[]> {
    const db = await requireAuthoritativeDatabase();
    const dbDefs = await db.workflowDefinition.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    return dbDefs.map((dbDef) => ({
      id: dbDef.id,
      version: dbDef.version,
      name: dbDef.name,
      description: dbDef.description || '',
      objective: '',
      steps: (dbDef.steps as any) || [],
      dependencies: [],
      requiredApprovals: 0,
      allowedRoles: [],
      allowedSkills: [],
      expectedOutputs: [],
    }));
  }

  // ---------------------------------------------------------
  // Instance Store Methods
  // ---------------------------------------------------------

  async saveInstance(instance: WorkflowInstanceState): Promise<void> {
    const db = await requireAuthoritativeDatabase();
    await db.workflowInstance.upsert({
      where: { id: instance.instanceId },
      create: {
        id: instance.instanceId,
        definitionId: instance.workflowId,
        version: instance.version || '1.0.0',
        stateVersion: instance.stateVersion ?? 0,
        claimedBy: instance.claimedBy || null,
        claimedAt: instance.claimedAt ? new Date(instance.claimedAt) : null,
        status: instance.status,
        objective: instance.objective || '',
        stepStates: (instance.stepStates as any) ?? {},
        context: {},
        error: instance.failureReason || null,
        startedAt: instance.createdAt ? new Date(instance.createdAt) : null,
        completedAt: instance.status === 'completed' && instance.updatedAt ? new Date(instance.updatedAt) : null,
      },
      update: {
        status: instance.status,
        stateVersion: instance.stateVersion ?? 0,
        claimedBy: instance.claimedBy || null,
        claimedAt: instance.claimedAt ? new Date(instance.claimedAt) : null,
        stepStates: (instance.stepStates as any) ?? {},
        context: {},
        error: instance.failureReason || null,
        completedAt: instance.status === 'completed' && instance.updatedAt ? new Date(instance.updatedAt) : null,
      },
    });
  }

  async getInstance(instanceId: string): Promise<WorkflowInstanceState | null> {
    const db = await requireAuthoritativeDatabase();
    const dbInst = await db.workflowInstance.findUnique({
      where: { id: instanceId },
    });

    if (!dbInst) return null;
    return this.mapPrismaToInstance(dbInst);
  }

  async listInstances(status?: string): Promise<WorkflowInstanceState[]> {
    const db = await requireAuthoritativeDatabase();
    const dbInsts = await db.workflowInstance.findMany({
      where: status ? { status } : undefined,
      orderBy: { updatedAt: 'desc' },
    });

    return dbInsts.map((dbInst) => this.mapPrismaToInstance(dbInst));
  }

  async claimStepAtomic(
    instanceId: string,
    stepId: string,
    workerId: string,
    expectedVersion?: number
  ): Promise<{ instance: WorkflowInstanceState; step: WorkflowStepState }> {
    const db = await requireAuthoritativeDatabase();
    return await db.$transaction(async (tx) => {
      const dbInst = await tx.workflowInstance.findUnique({
        where: { id: instanceId },
      });
      if (!dbInst) {
        throw new Error(`Workflow instance not found: ${instanceId}`);
      }

      if (expectedVersion !== undefined && dbInst.stateVersion !== expectedVersion) {
        throw new ConcurrencyConflictError(instanceId, expectedVersion, dbInst.stateVersion);
      }

      const stepStates: Record<string, WorkflowStepState> = (dbInst.stepStates as any) || {};
      const step = stepStates[stepId];
      if (!step) {
        throw new Error(`Step not found in workflow instance: ${stepId}`);
      }

      if (step.status !== 'ready') {
        throw new StepClaimError(instanceId, stepId, step.status, step.claimedBy);
      }

      if (step.claimedBy && step.claimedBy !== workerId) {
        throw new StepClaimError(instanceId, stepId, step.status, step.claimedBy);
      }

      validateStepTransition(step.status, 'running');

      const nowIso = new Date().toISOString();
      step.status = 'running';
      step.claimedBy = workerId;
      step.claimedAt = nowIso;
      if (!step.startedAt) {
        step.startedAt = nowIso;
      }
      stepStates[stepId] = step;

      let instanceStatus = dbInst.status;
      if (instanceStatus === 'pending' || instanceStatus === 'waiting') {
        validateInstanceTransition(instanceStatus as any, 'running');
        instanceStatus = 'running';
      }

      const nextVersion = (dbInst.stateVersion || 0) + 1;

      const updated = await tx.workflowInstance.update({
        where: { id: instanceId },
        data: {
          status: instanceStatus,
          stepStates: stepStates as any,
          stateVersion: nextVersion,
          claimedBy: workerId,
          claimedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return {
        instance: this.mapPrismaToInstance(updated),
        step,
      };
    });
  }

  async transitionStepAtomic(
    instanceId: string,
    stepId: string,
    targetStatus: WorkflowStepStatus,
    expectedVersion?: number,
    patch?: Partial<WorkflowStepState>,
    instancePatch?: Partial<WorkflowInstanceState>
  ): Promise<WorkflowInstanceState> {
    const db = await requireAuthoritativeDatabase();
    return await db.$transaction(async (tx) => {
      const dbInst = await tx.workflowInstance.findUnique({
        where: { id: instanceId },
      });
      if (!dbInst) {
        throw new Error(`Workflow instance not found: ${instanceId}`);
      }

      if (expectedVersion !== undefined && dbInst.stateVersion !== expectedVersion) {
        throw new ConcurrencyConflictError(instanceId, expectedVersion, dbInst.stateVersion);
      }

      const stepStates: Record<string, WorkflowStepState> = (dbInst.stepStates as any) || {};
      const step = stepStates[stepId];
      if (!step) {
        throw new Error(`Step not found in workflow instance: ${stepId}`);
      }

      validateStepTransition(step.status, targetStatus);

      const nowIso = new Date().toISOString();
      step.status = targetStatus;
      if (targetStatus === 'completed' || targetStatus === 'failed' || targetStatus === 'cancelled') {
        step.completedAt = nowIso;
        step.claimedBy = undefined;
      }
      if (patch) {
        Object.assign(step, patch);
      }
      stepStates[stepId] = step;

      let nextInstanceStatus = instancePatch?.status ?? dbInst.status;
      if (instancePatch?.status && instancePatch.status !== dbInst.status) {
        validateInstanceTransition(dbInst.status as any, instancePatch.status);
      }

      const nextVersion = (dbInst.stateVersion || 0) + 1;

      const updated = await tx.workflowInstance.update({
        where: { id: instanceId },
        data: {
          status: nextInstanceStatus,
          stepStates: stepStates as any,
          stateVersion: nextVersion,
          error: instancePatch?.failureReason ?? (targetStatus === 'failed' ? (step.error || 'Step failed') : dbInst.error),
          completedAt: (nextInstanceStatus === 'completed' || targetStatus === 'completed') ? new Date() : dbInst.completedAt,
          updatedAt: new Date(),
        },
      });

      return this.mapPrismaToInstance(updated);
    });
  }

  async rehydrateActiveInstances(): Promise<WorkflowInstanceState[]> {
    const db = await requireAuthoritativeDatabase();
    const activeStatuses = ['pending', 'running', 'waiting', 'blocked', 'awaiting_approval'];
    const dbInsts = await db.workflowInstance.findMany({
      where: {
        status: { in: activeStatuses },
      },
      orderBy: { updatedAt: 'asc' },
    });
    return dbInsts.map((inst) => this.mapPrismaToInstance(inst));
  }

  private mapPrismaToInstance(dbInst: any): WorkflowInstanceState {
    return {
      instanceId: dbInst.id,
      workflowId: dbInst.definitionId,
      version: dbInst.version,
      stateVersion: dbInst.stateVersion ?? 0,
      claimedBy: dbInst.claimedBy || undefined,
      claimedAt: dbInst.claimedAt ? dbInst.claimedAt.toISOString() : undefined,
      status: dbInst.status as any,
      objective: dbInst.objective,
      stepStates: (dbInst.stepStates as any) || {},
      createdAt: dbInst.createdAt.toISOString(),
      updatedAt: dbInst.updatedAt.toISOString(),
      outputs: {},
      evidenceReferences: [],
      failureReason: dbInst.error || undefined,
    };
  }

  clear(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Workflow records cannot be cleared in production.');
    }
  }
}

/**
 * Dual-Mode Workflow Store.
 * In Authoritative Mode: delegates directly to PostgresWorkflowStore (fail-closed).
 * In Test/Local Mode: uses fast in-memory maps with local file persistence.
 */
export class InMemoryWorkflowStore implements WorkflowDefinitionStore, WorkflowInstanceStore {
  public definitions: Map<string, WorkflowDefinition> = new Map();
  public instances: Map<string, WorkflowInstanceState> = new Map();

  private static instance: InMemoryWorkflowStore;

  private constructor() {
    this.loadFromDurableStorage();
  }

  public static getInstance(): InMemoryWorkflowStore {
    if (!InMemoryWorkflowStore.instance) {
      InMemoryWorkflowStore.instance = new InMemoryWorkflowStore();
    }
    return InMemoryWorkflowStore.instance;
  }

  public loadFromDurableStorage(): void {
    try {
      const persistedDefs = DurableFileStore.getInstance().readCollection<WorkflowDefinition>('workflow_definitions');
      for (const [key, def] of Object.entries(persistedDefs)) {
        this.definitions.set(key, def);
      }
      const persistedInsts = DurableFileStore.getInstance().readCollection<WorkflowInstanceState>('workflow_instances');
      for (const [id, inst] of Object.entries(persistedInsts)) {
        this.instances.set(id, inst);
      }
    } catch {
      // fallback
    }
  }

  // ---------------------------------------------------------
  // Definition Store Methods
  // ---------------------------------------------------------

  async saveDefinition(definition: WorkflowDefinition): Promise<void> {
    if (isAuthoritativeMode()) {
      return PostgresWorkflowStore.getInstance().saveDefinition(definition);
    }

    const key = `${definition.id}@${definition.version}`;
    this.definitions.set(key, definition);
    this.definitions.set(definition.id, definition);

    try {
      DurableFileStore.getInstance().saveItem('workflow_definitions', key, definition);
      DurableFileStore.getInstance().saveItem('workflow_definitions', definition.id, definition);
    } catch {}

    if (process.env.DATABASE_URL) {
      try {
        await prisma.workflowDefinition.upsert({
          where: {
            id_version: {
              id: definition.id,
              version: definition.version || '1.0.0',
            },
          },
          create: {
            id: definition.id,
            version: definition.version || '1.0.0',
            name: definition.name,
            description: definition.description,
            steps: (definition.steps as any) ?? [],
          },
          update: {
            name: definition.name,
            description: definition.description,
            steps: (definition.steps as any) ?? [],
          },
        });
      } catch {
        // Fallback safely for offline test environments
      }
    }
  }

  async getDefinition(id: string, version?: string): Promise<WorkflowDefinition | null> {
    if (isAuthoritativeMode()) {
      return PostgresWorkflowStore.getInstance().getDefinition(id, version);
    }

    const key = version ? `${id}@${version}` : id;
    const cached = this.definitions.get(key);
    if (cached) return cached;

    if (process.env.DATABASE_URL) {
      try {
        const dbDef = await prisma.workflowDefinition.findFirst({
          where: {
            id,
            ...(version ? { version } : {}),
          },
          orderBy: { updatedAt: 'desc' },
        });
        if (dbDef) {
          const mapped: WorkflowDefinition = {
            id: dbDef.id,
            version: dbDef.version,
            name: dbDef.name,
            description: dbDef.description || '',
            objective: '',
            steps: (dbDef.steps as any) || [],
            dependencies: [],
            requiredApprovals: 0,
            allowedRoles: [],
            allowedSkills: [],
            expectedOutputs: [],
          };
          this.definitions.set(key, mapped);
          return mapped;
        }
      } catch {
        // Fallback
      }
    }

    return null;
  }

  async listDefinitions(): Promise<WorkflowDefinition[]> {
    if (isAuthoritativeMode()) {
      return PostgresWorkflowStore.getInstance().listDefinitions();
    }

    const result = new Map<string, WorkflowDefinition>();
    for (const [key, def] of this.definitions.entries()) {
      if (!key.includes('@')) {
        result.set(def.id, def);
      }
    }
    return Array.from(result.values());
  }

  // ---------------------------------------------------------
  // Instance Store Methods
  // ---------------------------------------------------------

  async saveInstance(instance: WorkflowInstanceState): Promise<void> {
    if (isAuthoritativeMode()) {
      return PostgresWorkflowStore.getInstance().saveInstance(instance);
    }

    const clone = JSON.parse(JSON.stringify(instance));
    this.instances.set(instance.instanceId, clone);

    try {
      DurableFileStore.getInstance().saveItem('workflow_instances', instance.instanceId, clone);
    } catch {}

    if (process.env.DATABASE_URL) {
      try {
        await prisma.workflowInstance.upsert({
          where: { id: instance.instanceId },
          create: {
            id: instance.instanceId,
            definitionId: instance.workflowId,
            version: instance.version || '1.0.0',
            stateVersion: instance.stateVersion ?? 0,
            claimedBy: instance.claimedBy || null,
            claimedAt: instance.claimedAt ? new Date(instance.claimedAt) : null,
            status: instance.status,
            objective: instance.objective || '',
            stepStates: (instance.stepStates as any) ?? {},
            context: {},
            error: instance.failureReason || null,
            startedAt: instance.createdAt ? new Date(instance.createdAt) : null,
            completedAt: instance.status === 'completed' && instance.updatedAt ? new Date(instance.updatedAt) : null,
          },
          update: {
            status: instance.status,
            stateVersion: instance.stateVersion ?? 0,
            claimedBy: instance.claimedBy || null,
            claimedAt: instance.claimedAt ? new Date(instance.claimedAt) : null,
            stepStates: (instance.stepStates as any) ?? {},
            context: {},
            error: instance.failureReason || null,
            completedAt: instance.status === 'completed' && instance.updatedAt ? new Date(instance.updatedAt) : null,
          },
        });
      } catch {
        // Fallback safely in offline test environments
      }
    }
  }

  async getInstance(instanceId: string): Promise<WorkflowInstanceState | null> {
    if (isAuthoritativeMode()) {
      return PostgresWorkflowStore.getInstance().getInstance(instanceId);
    }

    const instance = this.instances.get(instanceId);
    if (instance) return JSON.parse(JSON.stringify(instance));

    if (process.env.DATABASE_URL) {
      try {
        const dbInst = await prisma.workflowInstance.findUnique({
          where: { id: instanceId },
        });
        if (dbInst) {
          const mapped: WorkflowInstanceState = {
            instanceId: dbInst.id,
            workflowId: dbInst.definitionId,
            version: dbInst.version,
            stateVersion: dbInst.stateVersion ?? 0,
            claimedBy: dbInst.claimedBy || undefined,
            claimedAt: dbInst.claimedAt ? dbInst.claimedAt.toISOString() : undefined,
            status: dbInst.status as any,
            objective: dbInst.objective,
            stepStates: (dbInst.stepStates as any) || {},
            createdAt: dbInst.createdAt.toISOString(),
            updatedAt: dbInst.updatedAt.toISOString(),
            outputs: {},
            evidenceReferences: [],
            failureReason: dbInst.error || undefined,
          };
          this.instances.set(mapped.instanceId, mapped);
          return mapped;
        }
      } catch {
        // Fallback
      }
    }

    return null;
  }

  async listInstances(status?: string): Promise<WorkflowInstanceState[]> {
    if (isAuthoritativeMode()) {
      return PostgresWorkflowStore.getInstance().listInstances(status);
    }

    const all = Array.from(this.instances.values());
    if (status) {
      return all.filter((i) => i.status === status);
    }
    return all;
  }

  async claimStepAtomic(
    instanceId: string,
    stepId: string,
    workerId: string,
    expectedVersion?: number
  ): Promise<{ instance: WorkflowInstanceState; step: WorkflowStepState }> {
    if (isAuthoritativeMode()) {
      return PostgresWorkflowStore.getInstance().claimStepAtomic(instanceId, stepId, workerId, expectedVersion);
    }

    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance not found: ${instanceId}`);
    }

    const currentVersion = instance.stateVersion ?? 0;
    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      throw new ConcurrencyConflictError(instanceId, expectedVersion, currentVersion);
    }

    const step = instance.stepStates[stepId];
    if (!step) {
      throw new Error(`Step not found in workflow instance: ${stepId}`);
    }

    if (step.status !== 'ready') {
      throw new StepClaimError(instanceId, stepId, step.status, step.claimedBy);
    }

    if (step.claimedBy && step.claimedBy !== workerId) {
      throw new StepClaimError(instanceId, stepId, step.status, step.claimedBy);
    }

    validateStepTransition(step.status, 'running');

    const nowIso = new Date().toISOString();
    step.status = 'running';
    step.claimedBy = workerId;
    step.claimedAt = nowIso;
    if (!step.startedAt) {
      step.startedAt = nowIso;
    }

    if (instance.status === 'pending' || instance.status === 'waiting') {
      validateInstanceTransition(instance.status, 'running');
      instance.status = 'running';
    }

    instance.stateVersion = currentVersion + 1;
    instance.claimedBy = workerId;
    instance.claimedAt = nowIso;
    instance.updatedAt = nowIso;

    const clone = JSON.parse(JSON.stringify(instance));
    this.instances.set(instanceId, clone);

    try {
      DurableFileStore.getInstance().saveItem('workflow_instances', instanceId, clone);
    } catch {}

    return {
      instance: clone,
      step: JSON.parse(JSON.stringify(step)),
    };
  }

  async transitionStepAtomic(
    instanceId: string,
    stepId: string,
    targetStatus: WorkflowStepStatus,
    expectedVersion?: number,
    patch?: Partial<WorkflowStepState>,
    instancePatch?: Partial<WorkflowInstanceState>
  ): Promise<WorkflowInstanceState> {
    if (isAuthoritativeMode()) {
      return PostgresWorkflowStore.getInstance().transitionStepAtomic(
        instanceId,
        stepId,
        targetStatus,
        expectedVersion,
        patch,
        instancePatch
      );
    }

    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance not found: ${instanceId}`);
    }

    const currentVersion = instance.stateVersion ?? 0;
    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      throw new ConcurrencyConflictError(instanceId, expectedVersion, currentVersion);
    }

    const step = instance.stepStates[stepId];
    if (!step) {
      throw new Error(`Step not found in workflow instance: ${stepId}`);
    }

    validateStepTransition(step.status, targetStatus);

    const nowIso = new Date().toISOString();
    step.status = targetStatus;
    if (targetStatus === 'completed' || targetStatus === 'failed' || targetStatus === 'cancelled') {
      step.completedAt = nowIso;
      step.claimedBy = undefined;
    }
    if (patch) {
      Object.assign(step, patch);
    }

    if (instancePatch?.status && instancePatch.status !== instance.status) {
      validateInstanceTransition(instance.status, instancePatch.status);
      instance.status = instancePatch.status;
    }
    if (instancePatch?.failureReason) {
      instance.failureReason = instancePatch.failureReason;
    }

    instance.stateVersion = currentVersion + 1;
    instance.updatedAt = nowIso;

    const clone = JSON.parse(JSON.stringify(instance));
    this.instances.set(instanceId, clone);

    try {
      DurableFileStore.getInstance().saveItem('workflow_instances', instanceId, clone);
    } catch {}

    return clone;
  }

  async rehydrateActiveInstances(): Promise<WorkflowInstanceState[]> {
    if (isAuthoritativeMode()) {
      return PostgresWorkflowStore.getInstance().rehydrateActiveInstances();
    }

    const activeStatuses: Set<string> = new Set(['pending', 'running', 'waiting', 'blocked', 'awaiting_approval']);
    const active = Array.from(this.instances.values())
      .filter((i) => activeStatuses.has(i.status))
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

    return JSON.parse(JSON.stringify(active));
  }

  clear() {
    this.definitions.clear();
    this.instances.clear();
    try {
      DurableFileStore.getInstance().clearCollection('workflow_definitions');
      DurableFileStore.getInstance().clearCollection('workflow_instances');
    } catch {}
  }
}

export function getWorkflowStore(): WorkflowDefinitionStore & WorkflowInstanceStore {
  if (isAuthoritativeMode()) {
    return PostgresWorkflowStore.getInstance();
  }
  return InMemoryWorkflowStore.getInstance();
}
