import { 
  WorkflowDefinition, 
  WorkflowInstanceState, 
  WorkflowStepState,
  WorkflowStepStatus,
  WorkflowInstanceStatus
} from '../../../types/workflow';
import { SideEffectClassification, AuthorizationEvaluationRequest } from '@/types/authorization';
import { getWorkflowStore, WorkflowDefinitionStore, WorkflowInstanceStore } from './store';
import { ServerAgentExecutor } from '../agents/executor';
import { SideEffectAuthorizationGate } from '../authorization/gate';
import { validateStepTransition, validateInstanceTransition } from './state-machine';
import { generateLogicalIdempotencyKey } from '../idempotency/state-machine';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowRuntime {
  private store: WorkflowDefinitionStore & WorkflowInstanceStore;
  private executor: ServerAgentExecutor;
  private gate: SideEffectAuthorizationGate;

  constructor(store?: WorkflowDefinitionStore & WorkflowInstanceStore) {
    this.store = store || getWorkflowStore();
    this.executor = new ServerAgentExecutor();
    this.gate = SideEffectAuthorizationGate.getInstance();
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
        sideEffectClassification: step.sideEffectClassification,
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
    
    validateStepTransition(oldStatus, newStatus);

    if (oldStatus === newStatus) {
      return instance; // No-op
    }

    const stepPatch: Partial<WorkflowStepState> = {};
    if (payload?.error) stepPatch.error = payload.error;
    if (payload?.outputs) stepPatch.outputs = payload.outputs;
    if (payload?.evidenceReferences) {
      stepPatch.evidenceReferences = [...(step.evidenceReferences || []), ...payload.evidenceReferences];
    }

    await this.store.transitionStepAtomic(
      instanceId,
      stepId,
      newStatus,
      instance.stateVersion,
      stepPatch
    );

    // Evaluate instance status after step transition
    await this.evaluateInstanceStatus(instanceId);
    // Evaluate readiness of subsequent steps
    await this.evaluateReadiness(instanceId);

    return (await this.store.getInstance(instanceId))!;
  }

  /**
   * Evaluates and updates the readiness of all pending steps in an instance.
   * Enforces centralized Side-Effect Gate authorization policies before advancing to ready.
   */
  async evaluateReadiness(instanceId: string): Promise<void> {
    const instance = await this.store.getInstance(instanceId);
    if (!instance) return;

    const def = await this.store.getDefinition(instance.workflowId, instance.version);
    if (!def) return;

    let instanceChanged = false;

    for (const stepDef of def.steps) {
      const stepState = instance.stepStates[stepDef.id];
      if (
        stepState.status !== 'pending' && 
        stepState.status !== 'blocked' && 
        stepState.status !== 'awaiting_approval' && 
        stepState.status !== 'waiting'
      ) {
        continue; // Only pending, blocked, awaiting_approval, or waiting steps can become ready
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
      let inputsMet = true;
      for (const inputKey of stepDef.inputReferences) {
        let found = false;
        if (instance.outputs && instance.outputs[inputKey] !== undefined) {
          found = true;
        } else {
          for (const s of Object.values(instance.stepStates)) {
            if (s.status === 'completed' && s.outputs && (s.outputs[inputKey] !== undefined || s.outputs['result'] !== undefined)) {
              found = true;
              break;
            }
          }
        }
        if (!found) {
          inputsMet = false;
          break;
        }
      }

      if (dependenciesMet && inputsMet) {
        // Classify step side-effects
        let classification: SideEffectClassification = stepDef.sideEffectClassification || 'read_only';
        if (!stepDef.sideEffectClassification && stepDef.requiresApproval) {
          classification = 'external_communication';
        }

        const authRequest: AuthorizationEvaluationRequest = {
          employeeRole: stepDef.assignedRole,
          skillId: stepDef.skill,
          actionName: stepDef.name,
          classification,
          workflowContext: {
            workflowId: instance.workflowId,
            workflowInstanceId: instance.instanceId,
            stepId: stepDef.id,
            objective: def.objective,
          },
          target: stepDef.targetContext,
        };

        const decision = await this.gate.evaluateAuthorization(authRequest);
        stepState.authorizationReasonCode = decision.reasonCode;

        if (decision.effect === 'denied') {
          stepState.status = 'blocked';
          stepState.blockedReason = decision.reason;
          if (decision.approvalId) stepState.approvalId = decision.approvalId;
          instanceChanged = true;
        } else if (decision.effect === 'approval_required') {
          // If requires approval and not approved, create or link approval request
          if (stepState.approvalState !== 'approved') {
            const approvalRecord = await this.gate.requestApproval({
              actionName: stepDef.name,
              classification,
              workflowInstanceId: instance.instanceId,
              stepId: stepDef.id,
              employeeRole: stepDef.assignedRole,
              scope: stepDef.approvalScope,
              notes: stepDef.description,
              target: stepDef.targetContext,
              requestedBy: stepDef.assignedRole,
            });

            stepState.approvalId = approvalRecord.id;
            stepState.status = 'awaiting_approval';
            stepState.blockedReason = decision.reason;
            instanceChanged = true;
          } else {
            stepState.status = 'ready';
            instanceChanged = true;
          }
        } else if (decision.effect === 'allowed') {
          if (stepDef.requiresApproval && stepState.approvalState !== 'approved') {
            stepState.status = 'awaiting_approval';
            instanceChanged = true;
          } else {
            stepState.status = 'ready';
            stepState.approvalState = 'approved';
            if (decision.approvalId) stepState.approvalId = decision.approvalId;
            stepState.blockedReason = undefined;
            instanceChanged = true;
          }
        }
      }
    }

    if (instanceChanged) {
      instance.updatedAt = new Date().toISOString();
      await this.store.saveInstance(instance);
    }
  }

  /**
   * Approves a step that is awaiting approval by the Founder.
   */
  async approveStep(
    instanceId: string, 
    stepId: string, 
    decidedBy: string = 'founder', 
    reason?: string
  ): Promise<WorkflowInstanceState> {
    const instance = await this.store.getInstance(instanceId);
    if (!instance) throw new Error(`Instance not found: ${instanceId}`);
    
    const step = instance.stepStates[stepId];
    if (!step) throw new Error(`Step not found: ${stepId}`);

    if (step.status !== 'awaiting_approval') {
      throw new Error(`Step is not awaiting approval.`);
    }

    // Record decision in SideEffectAuthorizationGate
    if (step.approvalId) {
      await this.gate.decideApproval({
        approvalId: step.approvalId,
        decision: 'approved',
        decidedBy,
        reason: reason || 'Approved by Founder',
      });
    } else {
      // Create and immediately approve a new FounderApprovalRecord
      const def = await this.store.getDefinition(instance.workflowId, instance.version);
      const stepDef = def?.steps.find(s => s.id === stepId);
      const classification: SideEffectClassification = stepDef?.sideEffectClassification || 'external_communication';
      
      const record = await this.gate.requestApproval({
        actionName: stepDef?.name || stepId,
        classification,
        workflowInstanceId: instanceId,
        stepId,
        employeeRole: step.assignedRole,
        scope: stepDef?.approvalScope,
        requestedBy: step.assignedRole,
      });

      await this.gate.decideApproval({
        approvalId: record.id,
        decision: 'approved',
        decidedBy,
        reason: reason || 'Approved by Founder',
      });
      step.approvalId = record.id;
    }

    step.approvalState = 'approved';
    step.status = 'ready';
    step.blockedReason = undefined;
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
   * Execute a Ready step via SideEffectAuthorizationGate and existing orchestration.
   * Atomically claims the step before external execution and persists transitions atomically.
   */
  async executeReadyStep(instanceId: string, stepId: string, workerId: string = 'worker-default'): Promise<void> {
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

    // Side-Effect Gate Authorization Check prior to execution
    let classification: SideEffectClassification = stepDef.sideEffectClassification || 'read_only';
    if (!stepDef.sideEffectClassification && stepDef.requiresApproval) {
      classification = 'external_communication';
    }

    const authRequest: AuthorizationEvaluationRequest = {
      employeeRole: step.assignedRole,
      skillId: step.skill,
      actionName: stepDef.name,
      classification,
      workflowContext: {
        workflowId: instance.workflowId,
        workflowInstanceId: instance.instanceId,
        stepId: stepDef.id,
        objective: def.objective,
      },
      target: stepDef.targetContext,
      requestedBy: step.assignedRole,
    };

    const gateEvaluation = await this.gate.evaluateAuthorization(authRequest);
    if (gateEvaluation.effect !== 'allowed') {
      if (gateEvaluation.effect === 'denied') {
        await this.transitionStep(instanceId, stepId, 'blocked');
      } else if (gateEvaluation.effect === 'approval_required') {
        await this.transitionStep(instanceId, stepId, 'awaiting_approval');
      }
      throw new Error(`Side-effect execution prevented by authorization gate: ${gateEvaluation.reason}`);
    }

    // Atomically claim the step before execution
    const claimResult = await this.store.claimStepAtomic(
      instanceId,
      stepId,
      workerId,
      instance.stateVersion
    );
    const expectedVersion = claimResult.instance.stateVersion;

    try {
      const executionRef = `exec-${instanceId}-${stepId}-${Date.now()}`;
      
      // Execute through the SideEffectAuthorizationGate wrapper with durable idempotency
      const logicalOpId = `${instanceId}-${stepId}-v${instance.stateVersion}`;
      const canonicalKey = generateLogicalIdempotencyKey({
        actionName: stepDef.name,
        targetSystem: stepDef.targetContext?.targetSystem || 'internal_agent',
        logicalOpId,
      });

      const gateResult = await this.gate.executeWithGate({
        request: authRequest,
        executionRef,
        idempotency: {
          key: canonicalKey,
          targetSystem: stepDef.targetContext?.targetSystem || 'internal_agent',
          logicalOpId,
          payload: {
            directive: def.objective,
            protocolStep: step.skill,
            taskTitle: stepDef.name,
            taskDescription: stepDef.description,
          },
        },
        executeFn: async () => {
          return this.executor.executeAgentTask(
            step.assignedRole,
            {
              directive: def.objective,
              protocolStep: step.skill,
              taskTitle: stepDef.name,
              taskDescription: stepDef.description,
            },
            `Execute workflow step: ${stepDef.name}`
          );
        }
      });

      if (!gateResult.allowed) {
        throw new Error(gateResult.error || 'Execution not authorized');
      }

      const agentResult = gateResult.result!;

      const stepOutputs: Record<string, any> = { result: agentResult.outputContent };
      if (stepDef.outputReferences) {
        for (const k of stepDef.outputReferences) {
          stepOutputs[k] = agentResult.outputContent;
        }
      }

      // Transition to completed on success
      await this.store.transitionStepAtomic(
        instanceId,
        stepId,
        'completed',
        expectedVersion,
        {
          outputs: stepOutputs,
          evidenceReferences: [gateResult.auditId, ...(agentResult.provenance ? [agentResult.provenance.agentId] : [])],
        }
      );

      // Evaluate instance status after step transition
      await this.evaluateInstanceStatus(instanceId);
      // Evaluate readiness of subsequent steps
      await this.evaluateReadiness(instanceId);

    } catch (error: any) {
      // Transition to failed
      await this.store.transitionStepAtomic(
        instanceId,
        stepId,
        'failed',
        expectedVersion,
        {
          error: error.message || 'Execution failed'
        }
      );

      // Evaluate instance status after step transition
      await this.evaluateInstanceStatus(instanceId);
    }
  }

  /**
   * Rehydrates all active workflow instances from authoritative storage.
   */
  async rehydrate(): Promise<WorkflowInstanceState[]> {
    return this.store.rehydrateActiveInstances();
  }

  public getGate(): SideEffectAuthorizationGate {
    return this.gate;
  }
}

