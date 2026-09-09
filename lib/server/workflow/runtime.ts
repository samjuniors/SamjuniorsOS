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
import { ConstitutionalVerifier } from '../orchestration/verifier';
import { resolveTargetRepository, executeGitHubIntelligence } from '../tools/providers/github';
import { mapSkillToProtocolStep } from './dynamic-dag';
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
  async createInstance(workflowId: string, version?: string, initialInputs?: Record<string, any>): Promise<WorkflowInstanceState> {
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
      outputs: { directive: definition.objective, ...(initialInputs || {}) },
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
        if (inputKey === 'directive' || inputKey === 'objective') {
          found = Boolean(instance.objective || def.objective);
        } else if (instance.outputs && instance.outputs[inputKey] !== undefined) {
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
          // An 'allowed' decision carrying APPROVED_BY_FOUNDER means the policy evaluator
          // matched an authoritative, Founder-decided approval record for this exact
          // step. The record is the authority; stepState.approvalState is a derived
          // cache of it. If the cache were allowed to veto the record, an approved
          // side-effect step would remain 'awaiting_approval' forever, because no
          // production path ever sets approvalState other than through this evaluation.
          const founderAuthorizedByRecord =
            decision.reasonCode === 'APPROVED_BY_FOUNDER' && Boolean(decision.approvalId);
          if (
            stepDef.requiresApproval &&
            stepState.approvalState !== 'approved' &&
            !founderAuthorizedByRecord
          ) {
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
    const anyReady = states.some(s => s.status === 'ready');
    const anyAwaitingApproval = states.some(s => s.status === 'awaiting_approval');
    const anyBlocked = states.some(s => s.status === 'blocked');
    
    let newStatus = instance.status;
    
    if (allCompleted) {
      newStatus = 'completed';
    } else if (anyFailed) {
      newStatus = 'failed';
    } else if (anyCancelled) {
      newStatus = 'cancelled';
    } else if (anyRunning) {
      newStatus = 'running';
    } else if (anyAwaitingApproval && !anyRunning && !anyReady) {
      newStatus = 'awaiting_approval';
    } else if (anyBlocked && !anyRunning && !anyReady) {
      newStatus = 'blocked';
    } else if (instance.status === 'pending' && anyReady) {
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
  async executeReadyStep(
    instanceId: string, 
    stepId: string, 
    workerId: string = 'worker-default',
    options?: { executeTools?: boolean }
  ): Promise<void> {
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
      
      // Assemble upstream outputs from dependencies and prior completed steps on the Blackboard
      const upstreamOutputs: Record<string, any> = {};
      for (const s of Object.values(instance.stepStates)) {
        if (s.outputs) {
          Object.assign(upstreamOutputs, s.outputs);
        }
      }

      // Check if this is a Constitutional Verification Step
      if (
        stepDef.skill === 'compliance_verification' || 
        stepDef.name.toLowerCase().includes('verification')
      ) {
        const deliverablesList: any[] = [];
        const researchState = instance.stepStates['step-research'];
        const financeState = instance.stepStates['step-finance'];
        const pmState = instance.stepStates['step-pm-prd'];

        if (researchState?.outputs?.result || researchState?.outputs?.toolIntelBrief) {
          const isGitHub = Boolean(researchState?.outputs?.toolEvidence);
          deliverablesList.push({
            id: 'deliv-step-research',
            name: isGitHub 
              ? 'Repository Intelligence & Technical Reconnaissance Brief' 
              : 'Market Intelligence & Technical Reconnaissance Brief',
            owner: 'Dr. Aris Thorne (Lead AI Researcher)',
            authorAgentId: 'researcher',
            authorName: 'Dr. Aris Thorne',
            type: 'research',
            protocolStep: 'research',
            content: String(researchState.outputs.toolIntelBrief || researchState.outputs.result),
            provenance: researchState.outputs?.provenance || {
              authorRole: 'researcher',
              authorName: 'Dr. Aris Thorne',
              confidence: 'verified_fact',
              evidenceBasis: isGitHub ? 'external_evidence' : 'empirical_test',
              immutable: true,
              timestamp: new Date().toISOString(),
            },
            updatedAt: new Date().toISOString(),
          });
        }
        if (financeState?.outputs?.result) {
          deliverablesList.push({
            id: 'deliv-step-finance',
            name: 'Financial Model & Unit Economics Assessment',
            owner: 'Julian Cruz (VP Finance)',
            authorAgentId: 'finance',
            authorName: 'Julian Cruz',
            type: 'financial',
            protocolStep: 'test',
            content: String(financeState.outputs.result),
            provenance: financeState.outputs?.provenance || {
              authorRole: 'finance',
              authorName: 'Julian Cruz',
              confidence: 'verified_fact',
              evidenceBasis: 'logical_proof',
              immutable: true,
              timestamp: new Date().toISOString(),
            },
            updatedAt: new Date().toISOString(),
          });
        }
        if (pmState?.outputs?.result) {
          deliverablesList.push({
            id: 'deliv-step-pm-prd',
            name: 'Product Requirements Document (PRD)',
            owner: 'Maya Lin (Principal PM)',
            authorAgentId: 'pm',
            authorName: 'Maya Lin',
            type: 'spec',
            protocolStep: 'build_execute',
            content: String(pmState.outputs.result),
            provenance: pmState.outputs?.provenance || {
              authorRole: 'pm',
              authorName: 'Maya Lin',
              confidence: 'verified_fact',
              evidenceBasis: 'logical_proof',
              immutable: true,
              timestamp: new Date().toISOString(),
            },
            updatedAt: new Date().toISOString(),
          });
        }

        const verificationResult = ConstitutionalVerifier.verify({
          directive: def.objective,
          deliverables: deliverablesList,
          specialistOutputs: {
            cooScope: upstreamOutputs['cooScope'] || upstreamOutputs['result'],
            researchFindings: upstreamOutputs['researchFindings'] || upstreamOutputs['market_intelligence_brief'],
            productSpecs: upstreamOutputs['productSpecs'] || upstreamOutputs['prd'],
            financeAssessment: upstreamOutputs['financeAssessment'] || upstreamOutputs['unit_economics'],
          },
        });

        if (!verificationResult.isCompliant) {
          const failReason = `Constitutional verification failed: ${verificationResult.checksFailed.join('; ')}`;
          await this.store.transitionStepAtomic(
            instanceId,
            stepId,
            'failed',
            expectedVersion,
            {
              error: failReason,
              outputs: {
                verificationResult,
                result: failReason,
                statusMessage: `[Sophia Vance - COO] Verification rejected: ${verificationResult.notes || failReason}`,
              },
            }
          );
          await this.evaluateInstanceStatus(instanceId);
          return;
        }

        const successOutputs = {
          verificationResult,
          result: 'All constitutional invariants verified: 80%+ gross margin floor, zero credential leaks, safe sandbox compliant.',
          statusMessage: '[Sophia Vance - COO] Deliverables verified against constitutional invariants and security bounds.',
        };

        await this.store.transitionStepAtomic(
          instanceId,
          stepId,
          'completed',
          expectedVersion,
          {
            outputs: successOutputs,
            evidenceReferences: ['audit-verification-passed'],
          }
        );

        await this.evaluateInstanceStatus(instanceId);
        await this.evaluateReadiness(instanceId);
        return;
      }

      // Check if this is a Researcher step with tool selection (GitHub intelligence)
      let toolEvidence: any = undefined;
      let toolIntelBrief: string | undefined = undefined;
      const shouldRunTools = options?.executeTools ?? (def.objective.toLowerCase().includes('github') || def.objective.toLowerCase().includes('repo'));
      if (step.assignedRole === 'researcher' && shouldRunTools) {
        try {
          const intelResult = await executeGitHubIntelligence(def.objective, {
            toolId: 'github_repository_read',
            sessionScope: {
              userId: 'founder-001',
              employeeRole: 'researcher',
              permittedToolIds: ['github_repository_read', 'github_issues_read'],
            },
            provenance: {
              taskId: `task-intel-${instanceId}`,
              agentId: 'researcher',
              agentName: 'Dr. Aris Thorne (Lead Researcher)',
              protocolStep: 'research',
              timestamp: new Date().toISOString(),
              modelUsed: 'gemini-2.5-pro',
              evidenceBasis: 'external_evidence',
              isVerified: true,
            },
          });
          toolEvidence = intelResult.evidence;
          toolIntelBrief = intelResult.epistemicBreakdown.briefMarkdown;
        } catch (toolErr: any) {
          console.warn('[WorkflowRuntime] Tool execution warning:', toolErr.message);
        }
      }

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
          // Map the step's skill NAME to its canonical protocol stage before crossing
          // the agent-executor boundary: AgentExecutionContext.protocolStep is a
          // genuine AgentWorkProtocolStep, not a skill name.
          const protocolStep = mapSkillToProtocolStep(step.skill);
          return this.executor.executeAgentTask(
            step.assignedRole,
            {
              directive: def.objective,
              protocolStep,
              taskTitle: stepDef.name,
              taskDescription: stepDef.description,
              upstreamContext: {
                cooScope: upstreamOutputs['cooScope'] || upstreamOutputs['result'],
                researchFindings: upstreamOutputs['researchFindings'] || upstreamOutputs['market_intelligence_brief'] || upstreamOutputs['result'],
                productSpecs: upstreamOutputs['productSpecs'] || upstreamOutputs['prd'] || upstreamOutputs['result'],
                financeAssessment: upstreamOutputs['financeAssessment'] || upstreamOutputs['unit_economics'] || upstreamOutputs['result'],
                verificationNotes: upstreamOutputs['verificationResult'] ? JSON.stringify(upstreamOutputs['verificationResult']) : undefined,
              },
            },
            `Execute workflow step: ${stepDef.name}`
          );
        }
      });

      if (!gateResult.allowed) {
        throw new Error(gateResult.error || 'Execution not authorized');
      }

      const agentResult = gateResult.result!;

      const stepOutputs: Record<string, any> = { 
        result: agentResult.outputContent,
        statusMessage: agentResult.statusMessage,
        structuredData: agentResult.structuredData,
        provenance: agentResult.provenance,
        retrievedContext: agentResult.retrievedContext,
      };

      if (toolEvidence) {
        stepOutputs.toolEvidence = toolEvidence;
      }
      if (toolIntelBrief) {
        stepOutputs.toolIntelBrief = toolIntelBrief;
        stepOutputs.researchFindings = toolIntelBrief;
        stepOutputs.market_intelligence_brief = toolIntelBrief;
      }

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
   * Executes a workflow instance to completion or until reaching a quiescent state (awaiting_approval, blocked, failed).
   * Dispatches ready steps wave by wave, supporting parallel execution of independent branches.
   */
  async executeWorkflow(
    instanceId: string,
    options?: {
      maxIterations?: number;
      workerId?: string;
      executeTools?: boolean;
    }
  ): Promise<WorkflowInstanceState> {
    const maxIterations = options?.maxIterations || 50;
    const workerId = options?.workerId || 'worker-dag-01';
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      // 1. Evaluate readiness of all steps
      await this.evaluateReadiness(instanceId);

      const instance = await this.store.getInstance(instanceId);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      // Check if instance reached terminal state
      if (instance.status === 'completed' || instance.status === 'failed' || instance.status === 'cancelled') {
        return instance;
      }

      // 2. Identify ready steps
      const readySteps = Object.values(instance.stepStates).filter(s => s.status === 'ready');

      if (readySteps.length === 0) {
        const awaitingApproval = Object.values(instance.stepStates).some(s => s.status === 'awaiting_approval');
        const blocked = Object.values(instance.stepStates).some(s => s.status === 'blocked');

        if (awaitingApproval) {
          if (instance.status !== 'awaiting_approval') {
            instance.status = 'awaiting_approval';
            instance.updatedAt = new Date().toISOString();
            await this.store.saveInstance(instance);
          }
          return instance;
        }

        if (blocked) {
          if (instance.status !== 'blocked') {
            instance.status = 'blocked';
            instance.updatedAt = new Date().toISOString();
            await this.store.saveInstance(instance);
          }
          return instance;
        }

        // Re-evaluate instance status and return
        await this.evaluateInstanceStatus(instanceId);
        return (await this.store.getInstance(instanceId))!;
      }

      // 3. Execute all ready steps concurrently (fan-out!)
      const stepExecutions = readySteps.map(step =>
        this.executeReadyStep(instanceId, step.stepId, workerId, options)
      );

      // Wait for the wave to finish (fan-in!)
      await Promise.allSettled(stepExecutions);

      // Re-evaluate instance status after the wave
      await this.evaluateInstanceStatus(instanceId);

      const refreshed = await this.store.getInstance(instanceId);
      if (!refreshed || refreshed.status === 'failed' || refreshed.status === 'completed' || refreshed.status === 'cancelled') {
        return refreshed || instance;
      }
    }

    return (await this.store.getInstance(instanceId))!;
  }

  /**
   * Resumes execution of a paused or awaiting-approval workflow instance from where it left off.
   */
  async resumeWorkflow(
    instanceId: string,
    options?: { maxIterations?: number; workerId?: string; executeTools?: boolean }
  ): Promise<WorkflowInstanceState> {
    return this.executeWorkflow(instanceId, options);
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

  public getStore(): WorkflowDefinitionStore & WorkflowInstanceStore {
    return this.store;
  }

  public getExecutor(): ServerAgentExecutor {
    return this.executor;
  }
}


