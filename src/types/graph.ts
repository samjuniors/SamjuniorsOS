/**
 * ============================================================================
 * SAMJUNIORS OS — GRAPH READ MODEL CONTRACT (PHASE 4.3A)
 * ============================================================================
 *
 * A strictly read-only, deterministic projection of authoritative server state
 * (Postgres AgentRun, ApprovalRecord, WorkflowInstance, EpistemicClaim)
 * into the Meaningful Company Topology.
 *
 * Invariants (AGENTS.md, DESIGN.md):
 * 1. The graph is an authoritative projection, NEVER an independent source of truth.
 * 2. Runtime state, governance state, epistemic validity, and UI presentation state
 *    must remain separate orthogonal domains.
 * 3. awaiting_founder_approval must remain semantically distinct from processing
 *    (the former is an authority boundary halt, not background computation).
 * 4. Progressive disclosure: primary canvas contains core topology; high-cardinality
 *    epistemic items belong to the contextual inspection drawer.
 * 5. Deterministic projection: identical server state yields identical graph DTO.
 */

// ---------------------------------------------------------------------------
// 1. Orthogonal Semantic State Domains
// ---------------------------------------------------------------------------

/**
 * Authoritative runtime lifecycle state of an execution unit (AgentRun or WorkflowInstance).
 */
export type GraphRuntimeState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'halted';

/**
 * Governance and authorization gate status (SideEffectAuthorizationGate / ApprovalRecord).
 */
export type GraphGovernanceState =
  | 'none'
  | 'awaiting_founder_approval'
  | 'approved'
  | 'rejected'
  | 'revoked'
  | 'expired';

/**
 * Epistemic validity status (EpistemicClaim / CanonicalFact).
 */
export type GraphEpistemicValidity =
  | 'unverified'
  | 'under_review'
  | 'promoted_to_fact'
  | 'active'
  | 'disputed'
  | 'superseded'
  | 'deprecated'
  | 'not_applicable';

/**
 * UI presentation state for Phase 4 visual nodes.
 * Explicitly mapped from the three semantic domains above.
 */
export type GraphPresentationState =
  | 'default'
  | 'hover'
  | 'selected'
  | 'active'
  | 'processing'
  | 'waiting'
  | 'success'
  | 'error'
  | 'disabled';

// ---------------------------------------------------------------------------
// 2. Node Taxonomy
// ---------------------------------------------------------------------------

export type GraphNodeType =
  | 'founder'
  | 'agent'
  | 'workflow'
  | 'verification'
  | 'approval'
  | 'outcome';

export type GraphNodeRole =
  | 'founder'
  | 'coo'
  | 'researcher'
  | 'pm'
  | 'finance'
  | 'verifier'
  | 'vault'
  | 'step';

export type NodeGeometryShape =
  | 'square'
  | 'rectangle'
  | 'circle'
  | 'squircle'
  | 'pill';

export interface GraphNodeGeometry {
  shape: NodeGeometryShape;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface GraphNodeMetadata {
  runId?: string;
  stepId?: string;
  durationMs?: number;
  error?: string;
  actionCount?: number;
  classification?: string;
  protocolStep?: string;
  evidenceCount?: number;
}

export interface GraphNodeDTO {
  id: string;
  type: GraphNodeType;
  role?: GraphNodeRole | string;
  title: string;
  subtitle?: string;
  activity?: string;
  owner?: string;

  // Orthogonal state domains
  runtimeState: GraphRuntimeState;
  governanceState: GraphGovernanceState;
  epistemicValidity: GraphEpistemicValidity;
  presentationState: GraphPresentationState;

  // Spatial geometry
  geometry: GraphNodeGeometry;
  relevance: number;

  // Safe non-sensitive metadata (no secrets, credentials, or raw prompts)
  metadata?: GraphNodeMetadata;
}

// ---------------------------------------------------------------------------
// 3. Relationship & Conduit Taxonomy
// ---------------------------------------------------------------------------

export type GraphRelationship =
  | 'delegates'
  | 'researches'
  | 'models_finance'
  | 'authors_prd'
  | 'checks'
  | 'synthesizes'
  | 'escalates-to'
  | 'feeds'
  | 'depends-on';

export type GraphEdgeStyle =
  | 'cyan'
  | 'white'
  | 'amber'
  | 'emerald'
  | 'rose'
  | 'blue';

export interface GraphEdgeDTO {
  id: string;
  source: string;
  target: string;
  relationship: GraphRelationship;
  runtimeState: GraphRuntimeState;
  presentationState: GraphPresentationState;
  style: GraphEdgeStyle;
  activity?: string;
  points?: [number, number][];
  arrow?: boolean;
}

// ---------------------------------------------------------------------------
// 4. Spatial Contextual Intent Cards
// ---------------------------------------------------------------------------

export interface GraphSpatialCardDTO {
  id: string;
  nodeId: string;
  x: number;
  y: number;
  actor: string;
  action: string;
  target?: string;
  tone: 'cyan' | 'amber' | 'emerald' | 'rose';
}

// ---------------------------------------------------------------------------
// 5. Contextual Inspection Drawer (Tiers 4 & 5)
// ---------------------------------------------------------------------------

export interface GraphInspectionContextDTO {
  recentRuns: Array<{
    runId: string;
    agentId: string;
    agentName: string;
    protocolStep: string;
    taskTitle: string;
    status: string;
    durationMs: number;
    timestamp: string;
  }>;
  pendingApprovals: Array<{
    id: string;
    classification: string;
    actionType: string;
    targetSystem: string;
    payloadHash?: string | null;
    requestedAt: string;
    employeeRole: string;
  }>;
  epistemicSummary: {
    claimsPendingVerification: number;
    activeFactsCount: number;
  };
}

// ---------------------------------------------------------------------------
// 6. Root Graph DTO
// ---------------------------------------------------------------------------

export interface GraphDTO {
  asOf: string;
  deterministicHash: string;
  topologyVersion: string;
  company: {
    name: string;
    focus: string;
  };
  summary: {
    totalNodes: number;
    totalEdges: number;
    activeWorkstreams: number;
    pendingApprovals: number;
    blockedItems: number;
  };
  nodes: GraphNodeDTO[];
  edges: GraphEdgeDTO[];
  spatialCards: GraphSpatialCardDTO[];
  inspectionContext?: GraphInspectionContextDTO;
}
