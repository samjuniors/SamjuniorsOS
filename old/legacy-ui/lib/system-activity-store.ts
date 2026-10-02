/**
 * System Activity & Agent Heartbeat Store
 * Tracks active agent task execution, system processing state,
 * and real-time pulse telemetry for SamJuniors OS.
 */

export interface ActiveAgentTask {
  id: string;
  agentId: string;
  agentName: string;
  taskDescription: string;
  startedAt: number;
}

export interface SystemActivityState {
  isProcessing: boolean;
  activeTasks: ActiveAgentTask[];
  pulseRateBpm: number;
  lastHeartbeat: number;
}

// In-memory state for client session
let activeTasks: ActiveAgentTask[] = [];
const listeners = new Set<() => void>();

function calculateBpm(): number {
  if (activeTasks.length === 0) return 68; // Resting / Standby rate
  // Increase pulse rate based on concurrent agent load (95 - 130 bpm)
  return Math.min(130, 95 + (activeTasks.length - 1) * 12);
}

function notify(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('[SystemActivityStore] Listener error:', e);
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('samjuniors-activity-updated', {
        detail: {
          isProcessing: activeTasks.length > 0,
          activeTasks: [...activeTasks],
          pulseRateBpm: calculateBpm(),
        },
      })
    );
  }
}

export const SystemActivityStore = {
  getState(): SystemActivityState {
    const isProcessing = activeTasks.length > 0;
    return {
      isProcessing,
      activeTasks: [...activeTasks],
      pulseRateBpm: calculateBpm(),
      lastHeartbeat: Date.now(),
    };
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Start tracking an agent task. Returns a cleanup function to end the task.
   */
  startTask(id: string, agentId: string, agentName: string, taskDescription: string): () => void {
    // Avoid duplicate task ids
    activeTasks = activeTasks.filter((t) => t.id !== id);
    activeTasks.push({
      id,
      agentId,
      agentName,
      taskDescription,
      startedAt: Date.now(),
    });
    notify();

    return () => {
      this.endTask(id);
    };
  },

  endTask(id: string): void {
    const prevLen = activeTasks.length;
    activeTasks = activeTasks.filter((t) => t.id !== id);
    if (activeTasks.length !== prevLen) {
      notify();
    }
  },

  clearAllTasks(): void {
    if (activeTasks.length > 0) {
      activeTasks = [];
      notify();
    }
  },
};
