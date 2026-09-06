import { ScheduledWorkItem, ScheduledWorkFilter, ScheduledWorkStatus } from '../../../types/scheduling';

/**
 * Interface for persisting Scheduled Work items.
 */
export interface ScheduledWorkStore {
  save(item: ScheduledWorkItem): Promise<void>;
  get(id: string): Promise<ScheduledWorkItem | null>;
  listDue(asOfTime?: string): Promise<ScheduledWorkItem[]>;
  list(filter?: ScheduledWorkFilter): Promise<ScheduledWorkItem[]>;
  cancel(id: string, cancelledBy?: string, reason?: string): Promise<ScheduledWorkItem>;
  update(item: ScheduledWorkItem): Promise<void>;
  clear(): void;
}

/**
 * In-memory implementation of ScheduledWorkStore.
 */
export class InMemoryScheduledWorkStore implements ScheduledWorkStore {
  private items: Map<string, ScheduledWorkItem> = new Map();
  private static instance: InMemoryScheduledWorkStore;

  private constructor() {}

  public static getInstance(): InMemoryScheduledWorkStore {
    if (!InMemoryScheduledWorkStore.instance) {
      InMemoryScheduledWorkStore.instance = new InMemoryScheduledWorkStore();
    }
    return InMemoryScheduledWorkStore.instance;
  }

  async save(item: ScheduledWorkItem): Promise<void> {
    this.items.set(item.id, JSON.parse(JSON.stringify(item)));
  }

  async get(id: string): Promise<ScheduledWorkItem | null> {
    const item = this.items.get(id);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async listDue(asOfTime?: string): Promise<ScheduledWorkItem[]> {
    const cutoff = asOfTime ? new Date(asOfTime).getTime() : Date.now();
    const results: ScheduledWorkItem[] = [];

    for (const item of this.items.values()) {
      if (item.status === 'scheduled') {
        const executeTime = new Date(item.executeAt).getTime();
        if (!isNaN(executeTime) && executeTime <= cutoff) {
          results.push(JSON.parse(JSON.stringify(item)));
        }
      }
    }

    // Sort deterministically by executeAt ascending
    return results.sort((a, b) => new Date(a.executeAt).getTime() - new Date(b.executeAt).getTime());
  }

  async list(filter?: ScheduledWorkFilter): Promise<ScheduledWorkItem[]> {
    let results = Array.from(this.items.values());

    if (filter) {
      if (filter.workflowInstanceId) {
        results = results.filter(i => i.workflowInstanceId === filter.workflowInstanceId);
      }
      if (filter.stepId) {
        results = results.filter(i => i.stepId === filter.stepId);
      }
      if (filter.status) {
        results = results.filter(i => i.status === filter.status);
      }
      if (filter.scheduleType) {
        results = results.filter(i => i.scheduleType === filter.scheduleType);
      }
    }

    return results.map(i => JSON.parse(JSON.stringify(i)));
  }

  async cancel(id: string, cancelledBy: string = 'founder', reason?: string): Promise<ScheduledWorkItem> {
    const item = this.items.get(id);
    if (!item) {
      throw new Error(`Scheduled work item not found: ${id}`);
    }

    if (item.status === 'completed' || item.status === 'cancelled') {
      return JSON.parse(JSON.stringify(item));
    }

    const now = new Date().toISOString();
    item.status = 'cancelled';
    item.updatedAt = now;
    item.cancellationState = {
      cancelledAt: now,
      cancelledBy,
      reason: reason || 'Cancelled by request',
    };

    this.items.set(id, item);
    return JSON.parse(JSON.stringify(item));
  }

  async update(item: ScheduledWorkItem): Promise<void> {
    if (!this.items.has(item.id)) {
      throw new Error(`Scheduled work item not found: ${item.id}`);
    }
    item.updatedAt = new Date().toISOString();
    this.items.set(item.id, JSON.parse(JSON.stringify(item)));
  }

  clear(): void {
    this.items.clear();
  }
}
