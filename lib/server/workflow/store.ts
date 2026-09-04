import { WorkflowDefinition, WorkflowInstanceState } from '../../../types/workflow';

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

// In-memory implementation for Phase 12.1
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

  // Definition Store Methods
  async saveDefinition(definition: WorkflowDefinition): Promise<void> {
    const key = `${definition.id}@${definition.version}`;
    this.definitions.set(key, definition);
    // Also store as latest
    this.definitions.set(definition.id, definition);
  }

  async getDefinition(id: string, version?: string): Promise<WorkflowDefinition | null> {
    const key = version ? `${id}@${version}` : id;
    return this.definitions.get(key) || null;
  }

  async listDefinitions(): Promise<WorkflowDefinition[]> {
    // Return all latest definitions
    const result = new Map<string, WorkflowDefinition>();
    for (const [key, def] of this.definitions.entries()) {
      if (!key.includes('@')) {
        result.set(def.id, def);
      }
    }
    return Array.from(result.values());
  }

  // Instance Store Methods
  async saveInstance(instance: WorkflowInstanceState): Promise<void> {
    this.instances.set(instance.instanceId, JSON.parse(JSON.stringify(instance)));
  }

  async getInstance(instanceId: string): Promise<WorkflowInstanceState | null> {
    const instance = this.instances.get(instanceId);
    return instance ? JSON.parse(JSON.stringify(instance)) : null;
  }

  async listInstances(status?: string): Promise<WorkflowInstanceState[]> {
    const all = Array.from(this.instances.values());
    if (status) {
      return all.filter(i => i.status === status);
    }
    return all;
  }
  
  // Test helper
  clear() {
    this.definitions.clear();
    this.instances.clear();
  }
}
