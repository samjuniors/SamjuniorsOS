import crypto from 'crypto';
import {
  GraphDTO,
  GraphNodeDTO,
  GraphEdgeDTO,
  GraphSpatialCardDTO,
  GraphInspectionContextDTO,
  GraphRuntimeState,
  GraphGovernanceState,
  GraphEpistemicValidity,
  GraphPresentationState,
  GraphRelationship,
  GraphEdgeStyle,
} from '@/types/graph';
import { AgentRunStore, AgentRunRecord } from '@/lib/server/agents/run-store';
import { SideEffectAuthorizationGate } from '@/lib/server/authorization/gate';
import { FounderApprovalRecord } from '@/types/authorization';
import { getWorkflowStore } from '@/lib/server/workflow/store';
import { EpistemicClaimStore } from '@/lib/server/epistemic/claim-store';
import { CompanyContextProvider } from '@/lib/server/context/company-context';
import { WorkflowInstanceState } from '@/types/workflow';

/**
 * ============================================================================
 * SAMJUNIORS OS — AUTHORITATIVE GRAPH READ MODEL (PHASE 4.3A)
 * ============================================================================
 *
 * A strictly READ-ONLY projection of authoritative server state into the
 * Meaningful Company Topology:
 *
 *   Founder / Inputs
 *     └── delegates ──> Sophia (COO & Orchestrator)
 *                         ├── delegates ──> Active Specialists (Thorne, Cruz, Lin)
 *                         │                   └── researches/models/authors ──> Active Protocol Steps
 *                         │                                                       └── checks ──> Verifier
 *                         │                                                                        └── feeds ──> Governed Vault
 *                         └── (if consequential) ──> escalates-to ──> Approval Gate ──> Founder
 *
 * Invariants:
 * 1. Read-only: Mutates NO database or runtime state.
 * 2. Fail-closed: Throws GraphReadError if any authoritative source is unreachable.
 * 3. Deterministic: deriveGraphProjection(inputs) yields identical topology, IDs,
 *    coordinates, and SHA-256 hash for identical inputs.
 * 4. Separate state domains: runtime state, governance state, epistemic validity,
 *    and UI presentation state are maintained independently.
 * 5. awaiting_founder_approval maps to UI state 'waiting', NEVER 'processing'.
 * 6. No synthetic packet decoration or fabricated entities when idle.
 */

export class GraphReadError extends Error {
  public constructor(
    public readonly source: string,
    public readonly cause?: unknown
  ) {
    super(
      `Authoritative graph read failed for '${source}': ${
        cause instanceof Error ? cause.message : String(cause)
      }`
    );
    this.name = 'GraphReadError';
  }
}

export interface AuthoritativeGraphInputs {
  agentRuns: AgentRunRecord[];
  approvals: FounderApprovalRecord[];
  workflows: WorkflowInstanceState[];
  claimsPendingCount: number;
  factsActiveCount: number;
  company: {
    name: string;
    focus: string;
  };
  now?: number; // deterministic timestamp injection for tests
}

// ---------------------------------------------------------------------------
// Pure State Mapping Functions
// ---------------------------------------------------------------------------

/**
 * Deterministically maps orthogonal semantic domains to Phase 4 UI presentation state.
 * Crucial: awaiting_founder_approval MUST remain distinct from processing.
 */
export function mapSemanticToPresentationState(
  runtime: GraphRuntimeState,
  governance: GraphGovernanceState,
  epistemic: GraphEpistemicValidity
): GraphPresentationState {
  // 1. Governance halt takes absolute precedence at authority boundary
  if (governance === 'awaiting_founder_approval') {
    return 'waiting'; // Amber authorization seal, NEVER processing
  }

  // 2. Failure / Invariant rejection takes precedence
  if (runtime === 'failed' || epistemic === 'disputed') {
    return 'error'; // Alert rose boundary
  }

  // 3. Actively running
  if (runtime === 'running') {
    return 'active'; // Vibrant cyan pulse
  }

  // 4. Paused or halted (without active approval)
  if (runtime === 'paused' || runtime === 'halted') {
    return 'waiting';
  }

  // 5. Completed & verified
  if (runtime === 'completed' || epistemic === 'promoted_to_fact') {
    return 'success'; // Emerald halo
  }

  // 6. Calm idle baseline
  return 'default'; // Quiet obsidian glass
}

// ---------------------------------------------------------------------------
// Layout Helpers (Deterministic & Collision-Aware)
// ---------------------------------------------------------------------------

function layoutColumn(
  nodes: GraphNodeDTO[],
  centerY: number,
  gap: number
): void {
  if (nodes.length === 0) return;
  const totalH =
    nodes.reduce((acc, n) => acc + n.geometry.height, 0) + (nodes.length - 1) * gap;
  let curY = centerY - totalH / 2;

  for (const n of nodes) {
    n.geometry.y = Math.round(curY + n.geometry.height / 2);
    curY += n.geometry.height + gap;
  }
}

function deterministicIdHash(prefix: string, text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return `${prefix}-${(h >>> 0).toString(36)}`;
}

function truncateTitle(text: string, max = 50): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Pure Projection Engine (Deterministic)
// ---------------------------------------------------------------------------

export function deriveGraphProjection(inputs: AuthoritativeGraphInputs): GraphDTO {
  const {
    agentRuns,
    approvals,
    workflows,
    claimsPendingCount,
    factsActiveCount,
    company,
  } = inputs;

  const nodes: GraphNodeDTO[] = [];
  const edges: GraphEdgeDTO[] = [];
  const spatialCards: GraphSpatialCardDTO[] = [];

  // Filter pending approvals (consequential escalation boundary)
  const pendingApprovals = approvals.filter((a) => a.decision === 'pending');
  const hasOpenApprovals = pendingApprovals.length > 0;

  // Group durable agent runs by directive (canonical workstreams)
  const directiveGroups = new Map<string, AgentRunRecord[]>();
  for (const r of agentRuns) {
    const key = r.directive?.trim();
    if (!key) continue;
    const list = directiveGroups.get(key) ?? [];
    list.push(r);
    directiveGroups.set(key, list);
  }

  // Derive workstreams from groups
  interface DerivedWorkstream {
    id: string;
    directive: string;
    title: string;
    latestRun: AgentRunRecord;
    owner: string;
    stepStage: 'discovery' | 'build' | 'review' | 'ship' | 'done';
    runtimeState: GraphRuntimeState;
    hasFailed: boolean;
    hasReport: boolean;
  }

  const workstreams: DerivedWorkstream[] = [];
  for (const [directive, group] of directiveGroups) {
    const sorted = [...group].sort((a, b) => {
      const ta = (a as any).timestamp || (a as any).createdAt ? new Date((a as any).timestamp || (a as any).createdAt).getTime() : 0;
      const tb = (b as any).timestamp || (b as any).createdAt ? new Date((b as any).timestamp || (b as any).createdAt).getTime() : 0;
      return ta - tb;
    });
    const latest = sorted[sorted.length - 1];
    const hasReport = sorted.some((r) => r.protocolStep === 'report');
    const hasFailed = sorted.some((r) => r.status === 'failed' || !!r.error);
    const hasRunning = sorted.some((r) => r.status === 'running');

    const specialistRuns = sorted.filter((r) => r.agentId !== 'coo');
    const latestSpecialist = specialistRuns[specialistRuns.length - 1];
    const owner = latestSpecialist ? latestSpecialist.agentId : 'researcher';

    let stepStage: DerivedWorkstream['stepStage'] = 'discovery';
    if (hasReport) {
      stepStage = 'done';
    } else if (latest.protocolStep === 'review' || latest.protocolStep === 'verify') {
      stepStage = 'review';
    } else if (latest.protocolStep === 'plan' || latest.protocolStep === 'build_execute' || latest.protocolStep === 'test') {
      stepStage = 'build';
    } else if (latest.protocolStep === 'report') {
      stepStage = 'ship';
    }

    const runtimeState: GraphRuntimeState = hasFailed
      ? 'failed'
      : hasReport
      ? 'completed'
      : hasRunning
      ? 'running'
      : 'paused';

    workstreams.push({
      id: deterministicIdHash('ws', directive),
      directive,
      title: truncateTitle(directive),
      latestRun: latest,
      owner,
      stepStage,
      runtimeState,
      hasFailed,
      hasReport,
    });
  }

  // Cross-reference durable WorkflowInstances
  for (const wf of workflows) {
    if (workstreams.some((w) => w.directive === wf.objective)) continue;
    const isDone = wf.status === 'completed';
    const isFailed = wf.status === 'failed';
    const isRunning = wf.status === 'running';
    workstreams.push({
      id: deterministicIdHash('wf', wf.instanceId),
      directive: wf.objective,
      title: truncateTitle(wf.objective),
      latestRun: {
        runId: wf.instanceId,
        agentId: 'coo',
        agentName: 'Sophia Vance',
        protocolStep: 'plan',
        taskTitle: wf.objective,
        directive: wf.objective,
        status: wf.status as any,
        durationMs: 0,
        outputContent: '',
        timestamp: wf.createdAt || new Date().toISOString(),
        provenance: {
          agentId: 'coo',
          agentName: 'Sophia Vance',
          taskId: wf.instanceId,
          protocolStep: 'plan',
          timestamp: wf.createdAt || new Date().toISOString(),
          isVerified: true,
          evidenceBasis: 'calculation',
        },
      },
      owner: 'coo',
      stepStage: isDone ? 'done' : 'build',
      runtimeState: isFailed ? 'failed' : isDone ? 'completed' : isRunning ? 'running' : 'idle',
      hasFailed: isFailed,
      hasReport: isDone,
    });
  }

  const activeWorkstreams = workstreams.filter((w) => w.runtimeState === 'running');
  const failedWorkstreams = workstreams.filter((w) => w.runtimeState === 'failed');
  const completedWorkstreams = workstreams.filter((w) => w.runtimeState === 'completed');

  const hasActiveWork = activeWorkstreams.length > 0;
  const hasFailedWork = failedWorkstreams.length > 0;
  const hasCompletedWork = completedWorkstreams.length > 0;
  const hasReviewWork = workstreams.some(
    (w) => (w.stepStage === 'review' || w.stepStage === 'ship') && w.runtimeState === 'running'
  );

  // -------------------------------------------------------------------------
  // Column 0: Founder / Inputs (Human Authority Boundary)
  // -------------------------------------------------------------------------
  const founderGovernance: GraphGovernanceState = hasOpenApprovals
    ? 'awaiting_founder_approval'
    : 'none';
  const founderNode: GraphNodeDTO = {
    id: 'founder',
    type: 'founder',
    role: 'founder',
    title: 'Founder / Inputs',
    subtitle: company.focus ? `Focus: ${company.focus}` : 'Directives & Authority',
    activity: hasOpenApprovals
      ? `${pendingApprovals.length} Approval${pendingApprovals.length > 1 ? 's' : ''} Awaiting Review`
      : undefined,
    runtimeState: 'idle',
    governanceState: founderGovernance,
    epistemicValidity: 'not_applicable',
    presentationState: mapSemanticToPresentationState('idle', founderGovernance, 'not_applicable'),
    geometry: { shape: 'rectangle', width: 124, height: 80, x: 180, y: 440 },
    relevance: hasOpenApprovals ? 1.0 : 0.6,
    metadata: { actionCount: pendingApprovals.length },
  };
  nodes.push(founderNode);

  // -------------------------------------------------------------------------
  // Column 1: Sophia Vance (COO & Master Orchestrator)
  // -------------------------------------------------------------------------
  const sophiaRuntime: GraphRuntimeState = hasFailedWork
    ? 'failed'
    : hasActiveWork
    ? 'running'
    : 'idle';
  const sophiaGovernance: GraphGovernanceState = hasOpenApprovals
    ? 'awaiting_founder_approval'
    : 'none';

  const coreNode: GraphNodeDTO = {
    id: 'coo',
    type: 'agent',
    role: 'coo',
    title: 'Sophia',
    subtitle: 'COO & Orchestrator',
    activity: hasActiveWork
      ? `Orchestrating ${activeWorkstreams.length} workstream${activeWorkstreams.length > 1 ? 's' : ''}`
      : hasFailedWork
      ? 'Workstream halted on invariant error'
      : hasOpenApprovals
      ? 'Awaiting founder ratification'
      : undefined,
    owner: 'coo',
    runtimeState: sophiaRuntime,
    governanceState: sophiaGovernance,
    epistemicValidity: 'not_applicable',
    presentationState: mapSemanticToPresentationState(sophiaRuntime, sophiaGovernance, 'not_applicable'),
    geometry: { shape: 'squircle', width: 214, height: 96, x: 430, y: 440 },
    relevance: 1.0,
  };
  nodes.push(coreNode);

  // Conduit: Founder ──> Sophia
  const founderToCooPresentation = mapSemanticToPresentationState(
    sophiaRuntime,
    sophiaGovernance,
    'not_applicable'
  );
  edges.push({
    id: 'e-founder-coo',
    source: 'founder',
    target: 'coo',
    relationship: 'delegates',
    runtimeState: sophiaRuntime,
    presentationState: founderToCooPresentation,
    style: hasActiveWork ? 'cyan' : hasFailedWork ? 'rose' : hasOpenApprovals ? 'amber' : 'white',
    activity: hasActiveWork ? 'Dispatching directives' : undefined,
    points: [
      [180 + 124 / 2, 440],
      [430 - 214 / 2, 440],
    ],
    arrow: true,
  });

  // -------------------------------------------------------------------------
  // Column 2: Specialists Column (Collision-Aware)
  // -------------------------------------------------------------------------
  const specialistNodes: GraphNodeDTO[] = [];

  // Dr. Aris Thorne (Research & Intelligence) — permanent workforce member
  const thorneWork = activeWorkstreams.find(
    (w) => w.owner === 'researcher' || w.owner === 'ops' || w.owner === 'coo'
  );
  const thorneFailed = failedWorkstreams.find(
    (w) => w.owner === 'researcher' || w.owner === 'ops'
  );
  const thorneRuntime: GraphRuntimeState = thorneFailed
    ? 'failed'
    : thorneWork
    ? 'running'
    : 'idle';

  const thorneNode: GraphNodeDTO = {
    id: 'researcher',
    type: 'agent',
    role: 'researcher',
    title: 'Dr. Aris Thorne',
    subtitle: 'Research & Intelligence',
    activity: thorneWork
      ? thorneWork.title
      : thorneFailed
      ? 'Blocked on research invariant'
      : undefined,
    owner: 'researcher',
    runtimeState: thorneRuntime,
    governanceState: 'none',
    epistemicValidity: 'not_applicable',
    presentationState: mapSemanticToPresentationState(thorneRuntime, 'none', 'not_applicable'),
    geometry: { shape: 'circle', width: 112, height: 88, x: 710, y: 440 },
    relevance: thorneWork || thorneFailed ? 1.0 : 0.7,
  };
  specialistNodes.push(thorneNode);

  // Julian Cruz (Finance & Unit Economics) — revealed when relevant
  const financeWork = workstreams.find((w) => w.owner === 'finance');
  let financeNode: GraphNodeDTO | undefined;
  if (financeWork) {
    const finRuntime = financeWork.runtimeState;
    financeNode = {
      id: 'finance',
      type: 'agent',
      role: 'finance',
      title: 'Julian Cruz',
      subtitle: 'Finance & Economics',
      activity: financeWork.title,
      owner: 'finance',
      runtimeState: finRuntime,
      governanceState: 'none',
      epistemicValidity: 'not_applicable',
      presentationState: mapSemanticToPresentationState(finRuntime, 'none', 'not_applicable'),
      geometry: { shape: 'circle', width: 112, height: 88, x: 710, y: 440 },
      relevance: 1.0,
    };
    specialistNodes.push(financeNode);
  }

  // Maya Lin (Product Architecture & PRD) — revealed when relevant
  const pmWork = workstreams.find((w) => w.owner === 'pm');
  let pmNode: GraphNodeDTO | undefined;
  if (pmWork) {
    const pmRuntime = pmWork.runtimeState;
    pmNode = {
      id: 'pm',
      type: 'agent',
      role: 'pm',
      title: 'Maya Lin',
      subtitle: 'Product Architecture',
      activity: pmWork.title,
      owner: 'pm',
      runtimeState: pmRuntime,
      governanceState: 'none',
      epistemicValidity: 'not_applicable',
      presentationState: mapSemanticToPresentationState(pmRuntime, 'none', 'not_applicable'),
      geometry: { shape: 'circle', width: 112, height: 88, x: 710, y: 440 },
      relevance: 1.0,
    };
    specialistNodes.push(pmNode);
  }

  // Apply deterministic collision-free layout to specialists
  layoutColumn(specialistNodes, 440, 24);
  specialistNodes.forEach((n) => nodes.push(n));

  // Specialist conduits
  edges.push({
    id: 'e-coo-researcher',
    source: 'coo',
    target: 'researcher',
    relationship: 'delegates',
    runtimeState: thorneRuntime,
    presentationState: mapSemanticToPresentationState(thorneRuntime, 'none', 'not_applicable'),
    style: thorneRuntime === 'running' ? 'cyan' : thorneRuntime === 'failed' ? 'rose' : 'white',
    activity: thorneWork ? 'Delegating research' : undefined,
    points: [
      [coreNode.geometry.x + coreNode.geometry.width / 2, coreNode.geometry.y],
      [thorneNode.geometry.x - thorneNode.geometry.width / 2, thorneNode.geometry.y],
    ],
    arrow: true,
  });

  if (financeNode) {
    edges.push({
      id: 'e-coo-finance',
      source: 'coo',
      target: 'finance',
      relationship: 'models_finance',
      runtimeState: financeNode.runtimeState,
      presentationState: financeNode.presentationState,
      style: financeNode.runtimeState === 'running' ? 'cyan' : financeNode.runtimeState === 'failed' ? 'rose' : 'white',
      activity: 'Modeling unit economics',
      points: [
        [coreNode.geometry.x + coreNode.geometry.width / 2, coreNode.geometry.y],
        [financeNode.geometry.x - financeNode.geometry.width / 2, financeNode.geometry.y],
      ],
      arrow: true,
    });
  }

  if (pmNode) {
    edges.push({
      id: 'e-researcher-pm',
      source: 'researcher',
      target: 'pm',
      relationship: 'authors_prd',
      runtimeState: pmNode.runtimeState,
      presentationState: pmNode.presentationState,
      style: pmNode.runtimeState === 'running' ? 'cyan' : pmNode.runtimeState === 'failed' ? 'rose' : 'white',
      activity: 'Feeding research into PRD',
      points: [
        [thorneNode.geometry.x, thorneNode.geometry.y + thorneNode.geometry.height / 2],
        [pmNode.geometry.x, pmNode.geometry.y - pmNode.geometry.height / 2],
      ],
      arrow: true,
    });
  }

  // -------------------------------------------------------------------------
  // Column 3: Contextual Protocol Steps (Revealed for active/open workstreams)
  // -------------------------------------------------------------------------
  const protocolStepNodes: GraphNodeDTO[] = [];
  const activeOrRecentWork = workstreams
    .filter((w) => w.runtimeState !== 'completed')
    .slice(0, 5);

  activeOrRecentWork.forEach((w) => {
    let stepLabel = 'Research & Reconnaissance';
    let assignedSpecialistId = 'researcher';
    let relationship: GraphRelationship = 'researches';

    if (w.stepStage === 'discovery') {
      stepLabel = 'Market Reconnaissance';
      assignedSpecialistId = 'researcher';
      relationship = 'researches';
    } else if (w.stepStage === 'build') {
      if (w.owner === 'finance' && financeNode) {
        stepLabel = 'Unit Economics Audit';
        assignedSpecialistId = 'finance';
        relationship = 'models_finance';
      } else {
        stepLabel = 'Product Architecture & PRD';
        assignedSpecialistId = pmNode ? 'pm' : 'researcher';
        relationship = 'authors_prd';
      }
    } else if (w.stepStage === 'review') {
      stepLabel = 'Council Peer Review';
      assignedSpecialistId = 'researcher';
      relationship = 'checks';
    } else if (w.stepStage === 'ship') {
      stepLabel = 'Executive Synthesis';
      assignedSpecialistId = 'researcher';
      relationship = 'synthesizes';
    }

    const stepNode: GraphNodeDTO = {
      id: `step-${w.id}`,
      type: 'workflow',
      role: 'step',
      title: w.title,
      subtitle: stepLabel,
      activity: w.runtimeState === 'running'
        ? `${stepLabel} in progress`
        : w.runtimeState === 'failed'
        ? 'Invariant check failed'
        : undefined,
      owner: w.owner,
      runtimeState: w.runtimeState,
      governanceState: 'none',
      epistemicValidity: 'unverified',
      presentationState: mapSemanticToPresentationState(w.runtimeState, 'none', 'unverified'),
      geometry: { shape: 'rectangle', width: 160, height: 76, x: 1010, y: 440 },
      relevance: w.runtimeState === 'running' || w.runtimeState === 'failed' ? 1.0 : 0.5,
      metadata: {
        runId: w.latestRun.runId || (w.latestRun as any).id,
        protocolStep: w.latestRun.protocolStep,
        durationMs: w.latestRun.durationMs,
        error: w.latestRun.error ?? undefined,
      },
    };
    protocolStepNodes.push(stepNode);

    // Edge from assigned specialist to this protocol step
    const assignedNode = specialistNodes.find((s) => s.id === assignedSpecialistId) || thorneNode;
    const edgeStyle: GraphEdgeStyle =
      w.runtimeState === 'failed' ? 'rose' : w.runtimeState === 'running' ? 'cyan' : 'white';

    edges.push({
      id: `e-spec-${w.id}`,
      source: assignedNode.id,
      target: stepNode.id,
      relationship,
      runtimeState: w.runtimeState,
      presentationState: stepNode.presentationState,
      style: edgeStyle,
      activity: w.title,
      points: [
        [assignedNode.geometry.x + assignedNode.geometry.width / 2, assignedNode.geometry.y],
        [stepNode.geometry.x - stepNode.geometry.width / 2, stepNode.geometry.y],
      ],
      arrow: true,
    });
  });

  // Apply deterministic collision-free layout to protocol steps
  if (protocolStepNodes.length > 0) {
    layoutColumn(protocolStepNodes, 440, 22);
    protocolStepNodes.forEach((n) => nodes.push(n));
  }

  // -------------------------------------------------------------------------
  // Column 4: Constitutional Verifier (Governance & Invariant Engine)
  // -------------------------------------------------------------------------
  const verifierRuntime: GraphRuntimeState = hasFailedWork
    ? 'failed'
    : hasReviewWork
    ? 'running'
    : hasCompletedWork
    ? 'completed'
    : 'idle';

  const verifierNode: GraphNodeDTO = {
    id: 'verifier',
    type: 'verification',
    role: 'verifier',
    title: 'Verifier',
    subtitle: 'Constitutional Safety',
    activity: hasReviewWork
      ? 'Auditing gross margin floor ≥ 80.0%'
      : hasFailedWork
      ? 'Invariant check failed — execution blocked'
      : undefined,
    runtimeState: verifierRuntime,
    governanceState: 'none',
    epistemicValidity: 'not_applicable',
    presentationState: mapSemanticToPresentationState(verifierRuntime, 'none', 'not_applicable'),
    geometry: { shape: 'circle', width: 120, height: 84, x: 1280, y: 440 },
    relevance: hasReviewWork || hasFailedWork ? 1.0 : 0.5,
  };
  nodes.push(verifierNode);

  // Conduits from protocol steps to Verifier (or calm baseline when idle)
  if (protocolStepNodes.length === 0) {
    edges.push({
      id: 'e-researcher-verifier',
      source: 'researcher',
      target: 'verifier',
      relationship: 'checks',
      runtimeState: 'idle',
      presentationState: 'default',
      style: 'white',
      points: [
        [thorneNode.geometry.x + thorneNode.geometry.width / 2, thorneNode.geometry.y],
        [verifierNode.geometry.x - verifierNode.geometry.width / 2, verifierNode.geometry.y],
      ],
      arrow: false,
    });
  } else {
    protocolStepNodes.forEach((stepNode) => {
      const isReview =
        stepNode.runtimeState === 'running' &&
        (stepNode.subtitle?.includes('Review') || stepNode.subtitle?.includes('Synthesis'));
      const isFailed = stepNode.runtimeState === 'failed';
      const edgeStyle: GraphEdgeStyle = isFailed ? 'rose' : isReview ? 'cyan' : 'white';

      edges.push({
        id: `e-ver-${stepNode.id}`,
        source: stepNode.id,
        target: 'verifier',
        relationship: 'checks',
        runtimeState: stepNode.runtimeState,
        presentationState: stepNode.presentationState,
        style: edgeStyle,
        points: [
          [stepNode.geometry.x + stepNode.geometry.width / 2, stepNode.geometry.y],
          [verifierNode.geometry.x - verifierNode.geometry.width / 2, verifierNode.geometry.y],
        ],
        arrow: true,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Column 5: Governed Outcome / Immutable Vault
  // -------------------------------------------------------------------------
  const vaultRuntime: GraphRuntimeState = hasCompletedWork ? 'completed' : 'idle';
  const vaultNode: GraphNodeDTO = {
    id: 'vault',
    type: 'outcome',
    role: 'vault',
    title: 'Governed Vault',
    subtitle: 'Immutable Memory',
    activity: hasCompletedWork
      ? `${completedWorkstreams.length} deliverable${completedWorkstreams.length > 1 ? 's' : ''} verified`
      : undefined,
    runtimeState: vaultRuntime,
    governanceState: 'none',
    epistemicValidity: 'active',
    presentationState: mapSemanticToPresentationState(vaultRuntime, 'none', 'active'),
    geometry: { shape: 'rectangle', width: 130, height: 78, x: 1500, y: 440 },
    relevance: hasCompletedWork ? 1.0 : 0.35,
    metadata: {
      actionCount: completedWorkstreams.length,
      evidenceCount: factsActiveCount,
    },
  };
  nodes.push(vaultNode);

  // Conduit: Verifier ──> Vault
  edges.push({
    id: 'e-verifier-vault',
    source: 'verifier',
    target: 'vault',
    relationship: 'feeds',
    runtimeState: vaultRuntime,
    presentationState: mapSemanticToPresentationState(vaultRuntime, 'none', 'active'),
    style: hasCompletedWork ? 'emerald' : 'white',
    points: [
      [verifierNode.geometry.x + verifierNode.geometry.width / 2, verifierNode.geometry.y],
      [vaultNode.geometry.x - vaultNode.geometry.width / 2, vaultNode.geometry.y],
    ],
    arrow: true,
  });

  // -------------------------------------------------------------------------
  // Contextual Escalation Gate: Founder Approval Gate (ONLY when pending)
  // -------------------------------------------------------------------------
  if (hasOpenApprovals) {
    const primaryApproval = pendingApprovals[0] as any;
    const actionLabel = primaryApproval?.actionName || primaryApproval?.actionType || 'Consequential Action Ratification';
    const approvalNode: GraphNodeDTO = {
      id: 'approval',
      type: 'approval',
      title: 'Founder Approval Gate',
      subtitle: `${pendingApprovals.length} Approval${pendingApprovals.length > 1 ? 's' : ''} Pending`,
      activity: actionLabel,
      owner: primaryApproval?.employeeRole || 'coo',
      runtimeState: 'halted', // execution halted at authority boundary
      governanceState: 'awaiting_founder_approval',
      epistemicValidity: 'not_applicable',
      presentationState: 'waiting', // Amber authorization seal, NEVER processing
      geometry: { shape: 'rectangle', width: 180, height: 84, x: 570, y: 680 },
      relevance: 1.0,
      metadata: {
        actionCount: pendingApprovals.length,
        classification: primaryApproval?.classification,
      },
    };
    nodes.push(approvalNode);

    // Sophia escalates to Approval Gate
    edges.push({
      id: 'e-coo-approval',
      source: 'coo',
      target: 'approval',
      relationship: 'escalates-to',
      runtimeState: 'halted',
      presentationState: 'waiting',
      style: 'amber',
      activity: 'Escalating decision to Founder',
      points: [
        [coreNode.geometry.x, coreNode.geometry.y + coreNode.geometry.height / 2],
        [coreNode.geometry.x, approvalNode.geometry.y],
        [approvalNode.geometry.x - approvalNode.geometry.width / 2, approvalNode.geometry.y],
      ],
      arrow: true,
    });

    // Approval Gate escalates to Founder
    edges.push({
      id: 'e-approval-founder',
      source: 'approval',
      target: 'founder',
      relationship: 'escalates-to',
      runtimeState: 'halted',
      presentationState: 'waiting',
      style: 'amber',
      activity: 'Requires Founder Ratification',
      points: [
        [approvalNode.geometry.x - approvalNode.geometry.width / 2, approvalNode.geometry.y],
        [founderNode.geometry.x, approvalNode.geometry.y],
        [founderNode.geometry.x, founderNode.geometry.y + founderNode.geometry.height / 2],
      ],
      arrow: true,
    });
  }

  // -------------------------------------------------------------------------
  // Spatial Intent Cards (Real Operational Statements Only)
  // -------------------------------------------------------------------------
  if (hasActiveWork) {
    spatialCards.push({
      id: 'sp-coo',
      nodeId: 'coo',
      x: coreNode.geometry.x,
      y: coreNode.geometry.y - coreNode.geometry.height / 2 - 24,
      actor: 'Sophia Vance',
      action: 'Delegating research',
      target: 'Dr. Aris Thorne',
      tone: 'cyan',
    });
  }
  if (thorneWork) {
    spatialCards.push({
      id: 'sp-researcher',
      nodeId: 'researcher',
      x: thorneNode.geometry.x,
      y: thorneNode.geometry.y - thorneNode.geometry.height / 2 - 24,
      actor: 'Dr. Aris Thorne',
      action: thorneWork.title,
      tone: 'cyan',
    });
  }
  if (financeNode && financeWork && financeWork.runtimeState === 'running') {
    spatialCards.push({
      id: 'sp-finance',
      nodeId: 'finance',
      x: financeNode.geometry.x,
      y: financeNode.geometry.y - financeNode.geometry.height / 2 - 24,
      actor: 'Julian Cruz',
      action: 'Stress-testing gross margin floor ≥ 80.0%',
      tone: 'cyan',
    });
  }
  if (pmNode && pmWork && pmWork.runtimeState === 'running') {
    spatialCards.push({
      id: 'sp-pm',
      nodeId: 'pm',
      x: pmNode.geometry.x,
      y: pmNode.geometry.y - pmNode.geometry.height / 2 - 24,
      actor: 'Maya Lin',
      action: 'Drafting PRD & architecture specs',
      tone: 'cyan',
    });
  }
  if (hasReviewWork) {
    spatialCards.push({
      id: 'sp-verifier',
      nodeId: 'verifier',
      x: verifierNode.geometry.x,
      y: verifierNode.geometry.y - verifierNode.geometry.height / 2 - 24,
      actor: 'Constitutional Verifier',
      action: 'Auditing gross margin invariant ≥ 80.0%',
      tone: 'emerald',
    });
  } else if (hasFailedWork) {
    spatialCards.push({
      id: 'sp-verifier-error',
      nodeId: 'verifier',
      x: verifierNode.geometry.x,
      y: verifierNode.geometry.y - verifierNode.geometry.height / 2 - 24,
      actor: 'Constitutional Verifier',
      action: 'Deterministic check failed — blocked',
      tone: 'rose',
    });
  }
  if (hasOpenApprovals) {
    spatialCards.push({
      id: 'sp-approval',
      nodeId: 'approval',
      x: 570,
      y: 618,
      actor: 'Waiting',
      action: 'Founder decision required',
      target: 'Founder',
      tone: 'amber',
    });
  }

  // -------------------------------------------------------------------------
  // Contextual Inspection Drawer (Tiers 4 & 5)
  // -------------------------------------------------------------------------
  const inspectionContext: GraphInspectionContextDTO = {
    recentRuns: agentRuns.slice(0, 10).map((r: any) => ({
      runId: r.runId || r.id,
      agentId: r.agentId,
      agentName: r.agentName,
      protocolStep: r.protocolStep,
      taskTitle: r.taskTitle,
      status: r.status,
      durationMs: r.durationMs,
      timestamp: r.timestamp || (r.createdAt ? new Date(r.createdAt).toISOString() : ''),
    })),
    pendingApprovals: pendingApprovals.map((a: any) => ({
      id: a.id,
      classification: a.classification,
      actionType: a.actionName || a.actionType || 'Consequential Action',
      targetSystem: a.target?.targetSystem || a.targetSystem || '',
      payloadHash: a.payloadHash,
      requestedAt: a.requestedAt || (a.createdAt ? new Date(a.createdAt).toISOString() : ''),
      employeeRole: a.employeeRole,
    })),
    epistemicSummary: {
      claimsPendingVerification: claimsPendingCount,
      activeFactsCount: factsActiveCount,
    },
  };

  // Sort nodes and edges deterministically
  nodes.sort((a, b) => {
    if (a.geometry.x !== b.geometry.x) return a.geometry.x - b.geometry.x;
    if (a.geometry.y !== b.geometry.y) return a.geometry.y - b.geometry.y;
    return a.id.localeCompare(b.id);
  });
  edges.sort((a, b) => a.id.localeCompare(b.id));

  // Compute deterministic SHA-256 fingerprint over topology
  const canonicalData = JSON.stringify({
    nodes: nodes.map((n) => ({
      id: n.id,
      r: n.runtimeState,
      g: n.governanceState,
      e: n.epistemicValidity,
      p: n.presentationState,
      x: n.geometry.x,
      y: n.geometry.y,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      s: e.source,
      t: e.target,
      r: e.runtimeState,
      p: e.presentationState,
    })),
  });

  const deterministicHash = crypto
    .createHash('sha256')
    .update(canonicalData)
    .digest('hex');

  return {
    asOf: new Date(inputs.now ?? Date.now()).toISOString(),
    deterministicHash,
    topologyVersion: '1.0.0',
    company,
    summary: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      activeWorkstreams: activeWorkstreams.length,
      pendingApprovals: pendingApprovals.length,
      blockedItems: failedWorkstreams.length,
    },
    nodes,
    edges,
    spatialCards,
    inspectionContext,
  };
}

// ---------------------------------------------------------------------------
// Server-Side Store Readers (Fail-Closed)
// ---------------------------------------------------------------------------

export async function getGraphOverview(): Promise<GraphDTO> {
  // Read authoritative stores fail-closed
  let agentRuns: AgentRunRecord[];
  try {
    agentRuns = await AgentRunStore.getInstance().listRuns({ limit: 50 });
  } catch (err) {
    throw new GraphReadError('agent-runs', err);
  }

  let approvals: FounderApprovalRecord[];
  try {
    approvals = await SideEffectAuthorizationGate.getInstance().listApprovals({
      status: 'pending',
    });
  } catch (err) {
    throw new GraphReadError('approvals', err);
  }

  let workflows: WorkflowInstanceState[];
  try {
    workflows = await getWorkflowStore().listInstances();
  } catch (err) {
    throw new GraphReadError('workflow-instances', err);
  }

  let claimsPendingCount = 0;
  let factsActiveCount = 0;
  try {
    const claims = await EpistemicClaimStore.getInstance().listClaims({
      status: 'pending',
    });
    claimsPendingCount = claims.length;
    const facts = await EpistemicClaimStore.getInstance().listActiveFacts();
    factsActiveCount = facts.length;
  } catch (err) {
    // Non-fatal if epistemic claims fail, but fail-closed if in authoritative mode
    throw new GraphReadError('epistemic-store', err);
  }

  let company = {
    name: 'SamJuniors Ecosystem',
    focus: 'AI-Native Operating Environment',
  };
  try {
    const canonical = CompanyContextProvider.getCanonicalContext();
    if (canonical?.constitution?.name) {
      company.name = canonical.constitution.name;
    }
  } catch {
    // Fall back to default organization name if company context is empty
  }

  return deriveGraphProjection({
    agentRuns,
    approvals,
    workflows,
    claimsPendingCount,
    factsActiveCount,
    company,
  });
}
