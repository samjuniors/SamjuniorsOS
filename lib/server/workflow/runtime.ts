import { 
  WorkflowDefinition, 
  WorkflowInstanceState, 
  WorkflowStepState,
  WorkflowStepStatus,
  WorkflowInstanceStatus
} from '../../../types/workflow';
import { InMemoryWorkflowStore } from './store';
import { ServerAgentExecutor } from '../agents/executor';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowRuntime {
  private store: InMemoryWorkflowStore;
  private executor: ServerAgentExecutor;

  constructor() {
    this.store = InMemoryWorkflowStore.getInstance();
    this.executor = new ServerAgentExecutor();
  }

  /**
   * Registers a new immutable Workflow Definition.
   */
  async registerWorkflow(definition: WorkflowDefinition): Promise<void> {
    await this.store.saveDefinition(definition);
  }

  /**
   * Creates a new Workflow Instance from a Definition.
   */
  async createInstance(workflowId: string, version?: string): Promise<WorkflowInstanceState> {
    const definition = await this.store.getDefinition(workflowId, version);
    if (!definition) {
      throw new Error(`Workflow definition not found: ${workflowId}`);
    }

    const instanceId = `wf-inst-${uuidv4()}`;
    const now = new Date().toISOString();

    const stepStates: Record<string, WorkflowStepState> = {};
    for (const step of definition.steps) {
      stepStates[step.id] = {
        stepId: step.id,
        status: 'pending',
        assignedRole: step.assignedRole,
        skill: step.skill,
        outputs: {},
        evidenceReferences: [],
        retryCount: 0,
      };
      
      // If step has no dependencies, it might be ready. We evaluate readiness later.
    }

    const instance: WorkflowInstanceState = {
      instanceId,
      workflowId: definition.id,
      version: definition.version,
      objective: definition.objective,
      status: 'pending',
      stepStates,
      createdAt: now,
      updatedAt: now,
      outputs: {},
      evidenceReferences: [],
    };

    await this.store.saveInstance(instance);
    
    // Evaluate readiness for all steps
    await this.evaluateReadiness(instanceId);

    return (await this.store.getInstance(instanceId))!;
  }

  /**
   * Central state-transition mechanism for steps.
   */
  async transitionStep(
    instanceId: string, 
    stepId: string, 
    newStatus: WorkflowStepStatus, 
    payload?: { error?: string, outputs?: Record<string, any>, evidenceReferences?: string[] }
  ): Promise<WorkflowInstanceState> {
    const instance = await this.store.getInstance(instanceId);
    if (!instance) throw new Error(`Instance not found: ${instanceId}`);
    
    const step = instance.stepStates[stepId];
    if (!step) throw new Error(`Step not found: ${stepId} in instance ${instanceId}`);

    const oldStatus = step.status;

    // Validate Transitions
    if (oldStatus === 'completed' && newStatus === 'running') {
      throw new Error(`Invalid transition: Cannot transition from completed to running.`);
    }
    if (oldStatus === 'cancelled' && newStatus === 'running') {
      throw new Error(`Invalid transition: Cannot transition from cancelled to running.`);
    }
    if (oldStatus === 'failed' && newStatus === 'completed') {
      throw new Error(`Invalid transition: Cannot transition from failed to completed directly without retry/recovery.`);
    }
    if (oldStatus === 'awaiting_approval' && newStatus === 'completed') {
      // Must go to approved -> ready/running first, or check approvalState
      if (step.approvalState !== 'approved') {
        throw new Error(`Invalid transition: Cannot complete step awaiting approval without approval.`);
      }
    }
    if (oldStatus === 'blocked' && newStatus === 'running') {
      // Must be unblocked to ready first, or condition resolved
      throw new Error(`Invalid transition: Cannot run a blocked step without resolving condition.`);
    }
    
    if (oldStatus === newStatus) {
      return instance; // No-op
    }

    // Apply Transition
    step.status = newStatus;
    instance.updatedAt = new Date().toISOString();

    if (newStatus === 'running' && oldStatus !== 'running') {
      step.startedAt = instance.updatedAt;
    }
    if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'cancelled') {
      step.completedAt = instance.updatedAt;
    }

    if (payload?.error) step.error = payload.error;
    if (payload?.outputs) step.outputs = { ...step.outputs, ...payload.outputs };
    if (payload?.evidenceReferences) step.evidenceReferences.push(...payload.evidenceReferences);

    await this.store.saveInstance(instance);

    // Evaluate instance status after step transition
    await this.evaluateInstanceStatus(instanceId);
    // Evaluate readiness of subsequent steps
    await this.evaluateReadiness(instanceId);

    return (await this.store.getInstance(instanceId))!;
  }

  /**
   * Evaluates and updates the readiness of all pending steps in an instance.
   */
  async evaluateReadiness(instanceId: string): Promise<void> {
    const instance = await this.store.getInstance(instanceId);
    if (!instance) return;

    const def = await this.store.getDefinition(instance.workflowId, instance.version);
    if (!def) return;

    let instanceChanged = false;

    for (const stepDef of def.steps) {
      const stepState = instance.stepStates[stepDef.id];
      if (stepState.status !== 'pending' && stepState.status !== 'blocked' && stepState.status !== 'awaiting_approval') {
        continue; // Only pending, blocked, or awaiting_approval steps can become ready
      }

      let dependenciesMet = true;
      for (const depId of stepDef.dependencies) {
        const depState = instance.stepStates[depId];
        if (!depState || depState.status !== 'completed') {
          dependenciesMet = false;
          break;
        }
      }

      // Check inputs existing (simulated for now by checking previous outputs if specified in dependencies)
      // For a rigorous check, we'd look at def.inputReferences vs instance.outputs
      let inputsMet = true;
      for (const inputKey of stepDef.inputReferences) {
        // Find if inputKey exists in any completed step's outputs
        let found = false;
        for (const s of Object.values(instance.stepStates)) {
          if (s.status === 'completed' && s.outputs && s.outputs[inputKey] !== undefined) {
            found = true;
            break;
          }
        }
        if (!found) {
          inputsMet = false;
          break;
        }
      }

      if (dependenciesMet && inputsMet) {
        if (stepDef.requiresApproval && stepState.approvalState !== 'approved') {
          if (stepState.status !== 'awaiting_approval') {
            stepState.status = 'awaiting_approval';
            instanceChanged = true;
          }
        } else {
          stepState.status = 'ready';
          instanceChanged = true;
        }
      }
    }

    if (instanceChanged) {
      instance.updatedAt = new Date().toISOString();
      await this.store.saveInstance(instance);
    }
  }

  /**
   * Approves a step that is awaiting approval.
   */
  async approveStep(instanceId: string, stepId: string): Promise<WorkflowInstanceState> {
    const instance = await this.store.getInstance(instanceId);
    if (!instance) throw new Error(`Instance not found: ${instanceId}`);
    
    const step = instance.stepStates[stepId];
    if (!step) throw new Error(`Step not found: ${stepId}`);

    if (step.status !== 'awaiting_approval') {
      throw new Error(`Step is not awaiting approval.`);
    }

    step.approvalState = 'approved';
    step.status = 'ready';
    instance.updatedAt = new Date().toISOString();
    
    await this.store.saveInstance(instance);
    return instance;
  }

  /**
   * Re-evaluate overall workflow instance status.
   */
  private async evaluateInstanceStatus(instanceId: string): Promise<void> {
    const instance = await this.store.getInstance(instanceId);
    if (!instance) return;

    const states = Object.values(instance.stepStates);
    
    const allCompleted = states.every(s => s.status === 'completed');
    const anyFailed = states.some(s => s.status === 'failed');
    const anyCancelled = states.some(s => s.status === 'cancelled');
    const anyRunning = states.some(s => s.status === 'running');
    
    let newStatus = instance.status;
    
    if (allCompleted) {
      newStatus = 'completed';
    } else if (anyFailed) {
      newStatus = 'failed';
    } else if (anyCancelled) {
      newStatus = 'cancelled';
    } else if (anyRunning) {
      newStatus = 'running';
    } else if (instance.status === 'pending' && states.some(s => s.status === 'ready')) {
      newStatus = 'running';
    }

    if (newStatus !== instance.status) {
      instance.status = newStatus;
      instance.updatedAt = new Date().toISOString();
      await this.store.saveInstance(instance);
    }
  }

  /**
   * Execute a Ready step via existing orchestration.
   */
  async executeReadyStep(instanceId: string, stepId: string): Promise<void> {
    const instance = await this.store.getInstance(instanceId);
    if (!instance) throw new Error(`Instance not found: ${instanceId}`);
    
    const step = instance.stepStates[stepId];
    if (!step) throw new Error(`Step not found: ${stepId}`);

    const def = await this.store.getDefinition(instance.workflowId, instance.version);
    if (!def) throw new Error(`Workflow definition not found`);
    const stepDef = def.steps.find(s => s.id === stepId);
    if (!stepDef) throw new Error(`Step definition not found`);

    if (step.status !== 'ready') {
      throw new Error(`Step is not ready for execution. Current status: ${step.status}`);
    }

    // Transition to running
    await this.transitionStep(instanceId, stepId, 'running');

    try {
      // Delegate to existing ServerAgentExecutor
      const result = await this.executor.executeAgentTask(
        step.assignedRole,
        {
          directive: def.objective,
          protocolStep: step.skill,
          taskTitle: stepDef.name,
          taskDescription: stepDef.description,
        },
        `Execute workflow step: ${stepDef.name}`
      );

      // Transition to completed on success
      await this.transitionStep(instanceId, stepId, 'completed', {
        outputs: { result: result.outputContent },
        evidenceReferences: result.provenance ? [result.provenance.agentId] : [], // Simplification for evidence
      });

    } catch (error: any) {
      // Transition to failed
      await this.transitionStep(instanceId, stepId, 'failed', {
        error: error.message || 'Execution failed'
      });
    }
  }
}
