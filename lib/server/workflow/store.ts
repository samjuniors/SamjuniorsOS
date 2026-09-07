import { WorkflowDefinition, WorkflowInstanceState } from '../../../types/workflow';
import { prisma } from '@/lib/server/db/prisma';

/**
 * Interface for persisting Workflow Definitions.
 */
export interface WorkflowDefinitionStore {
  saveDefinition(definition: WorkflowDefinition): Promise<void>;
  getDefinition(id: string, version?: string): Promise<WorkflowDefinition | null>;
  listDefinitions(): Promise<WorkflowDefinition[]>;
}

/**
 * Interface for persisting Workflow Instances.
 */
export interface WorkflowInstanceStore {
  saveInstance(instance: WorkflowInstanceState): Promise<void>;
  getInstance(instanceId: string): Promise<WorkflowInstanceState | null>;
  listInstances(status?: string): Promise<WorkflowInstanceState[]>;
}

/**
 * Durable Workflow Store backed by PostgreSQL / Prisma with in-memory caching.
 */
export class InMemoryWorkflowStore implements WorkflowDefinitionStore, WorkflowInstanceStore {
  private definitions: Map<string, WorkflowDefinition> = new Map();
  private instances: Map<string, WorkflowInstanceState> = new Map();

  private static instance: InMemoryWorkflowStore;

  private constructor() {}

  public static getInstance(): InMemoryWorkflowStore {
    if (!InMemoryWorkflowStore.instance) {
      InMemoryWorkflowStore.instance = new InMemoryWorkflowStore();
    }
    return InMemoryWorkflowStore.instance;
  }

  // ---------------------------------------------------------
  // Definition Store Methods
  // ---------------------------------------------------------

  async saveDefinition(definition: WorkflowDefinition): Promise<void> {
    const key = `${definition.id}@${definition.version}`;
    this.definitions.set(key, definition);
    this.definitions.set(definition.id, definition);

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
        // Fallback safely for offline environments
      }
    }
  }

  async getDefinition(id: string, version?: string): Promise<WorkflowDefinition | null> {
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
    this.instances.set(instance.instanceId, JSON.parse(JSON.stringify(instance)));

    if (process.env.DATABASE_URL) {
      try {
        await prisma.workflowInstance.upsert({
          where: { id: instance.instanceId },
          create: {
            id: instance.instanceId,
            definitionId: instance.workflowId,
            version: instance.version || '1.0.0',
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
            stepStates: (instance.stepStates as any) ?? {},
            context: {},
            error: instance.failureReason || null,
            completedAt: instance.status === 'completed' && instance.updatedAt ? new Date(instance.updatedAt) : null,
          },
        });
      } catch {
        // Fallback safely
      }
    }
  }

  async getInstance(instanceId: string): Promise<WorkflowInstanceState | null> {
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
    const all = Array.from(this.instances.values());
    if (status) {
      return all.filter((i) => i.status === status);
    }
    return all;
  }

  // Test helper
  clear() {
    this.definitions.clear();
    this.instances.clear();
  }
}
