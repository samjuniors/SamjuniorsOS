import type { ReactNode } from "react";
import type { Agent, Workstream, Decision, AttentionItem, OSState, Stage } from "./osStore";

/* ------------------------------------------------------------------ Surface Types */

export type SurfaceStatus = "healthy" | "active" | "waiting" | "blocked" | "offline" | "neutral";

export interface EntityItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  tint?: string;
  glow?: string;
  status: SurfaceStatus;
  statusLabel?: string;
  badges?: { label: string; tone?: "cyan" | "amber" | "rose" | "emerald" | "slate" }[];
  tags?: string[];
  meta?: Record<string, string | number>;
  onClick?: () => void;
}

export interface AttentionData {
  id: string;
  title: string;
  detail?: string;
  kind: "decision" | "review" | "blocked" | "message" | "note";
  from: string;
  at: number;
  handled?: boolean;
  decisionId?: string;
  onAction?: (actionId?: string) => void;
}

export interface WorkData {
  id: string;
  title: string;
  owner: string;
  stage: Stage;
  state: "active" | "paused" | "blocked" | "done";
  note?: string;
  at: number;
  onAdvance?: () => void;
  onStateChange?: (state: "active" | "paused" | "blocked" | "done") => void;
}

export interface DecisionData {
  id: string;
  title: string;
  context: string;
  options: string[];
  raisedBy: string;
  at: number;
  status: import("./osStore").DecisionStatus;
  chosen?: string;
  onDecide?: (option: string) => void;
}

export interface ActivityEvent {
  id: string;
  at: number;
  text: string;
  actor?: string;
  kind?: "info" | "warn" | "decision" | "work" | "security";
  tags?: string[];
  /** Phase 4.4C — server-authoritative projection fields. Present on events
   *  from GET /api/activity (the authoritative company Activity); absent on
   *  local ambient log entries (logToActivity), which are a browser-session
   *  supplement and are NEVER presented as company history. */
  category?: string;
  status?:
    | "completed"
    | "failed"
    | "awaiting_approval"
    | "in_flight"
    | "approved"
    | "rejected"
    | "pending"
    | "allowed"
    | "denied"
    | "paused"
    | "resumed"
    | "cancelled";
  /** Traceability pointers to the authoritative source records. */
  provenance?: {
    workstreamId?: string;
    workstreamTitle?: string;
    workflowInstanceId?: string;
    stepId?: string;
    agentRunId?: string;
    approvalId?: string;
    auditId?: string;
    scheduleId?: string;
    occurrenceId?: string;
    occurrenceNumber?: number;
  };
  /** True when the event is projected from server-authoritative records. */
  server?: boolean;
}

export interface MetricItem {
  id: string;
  label: string;
  value: string | number;
  unit?: string;
  change?: string;
  status?: SurfaceStatus;
  confidence?: "verified" | "inferred" | "unconfigured";
  source?: string;
}

export interface TimelineMilestone {
  id: string;
  title: string;
  subtitle?: string;
  at: number | string;
  status: "complete" | "current" | "upcoming" | "blocked";
  owner?: string;
}

export interface RelationshipLink {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  type: "delegates" | "depends-on" | "escalates-to" | "monitors";
}

/* ------------------------------------------------------------------ Adapters */

export function agentToEntity(agent: Agent, workCount = 0): EntityItem {
  const statusMap: Record<Agent["state"], SurfaceStatus> = {
    ready: "active",
    working: "healthy",
    waiting: "waiting",
    offline: "offline",
  };

  return {
    id: agent.id,
    title: agent.name,
    subtitle: agent.role,
    tint: agent.tint,
    glow: agent.glow,
    status: statusMap[agent.state],
    statusLabel: agent.current ?? agent.state,
    badges: [
      { label: agent.role, tone: "cyan" },
      ...(workCount > 0 ? [{ label: `${workCount} workstreams`, tone: "slate" as const }] : []),
    ],
    tags: agent.tools,
    meta: {
      Remit: agent.remit,
      Escalation: agent.escalates,
    },
  };
}

export function workstreamToWork(w: Workstream, onAdvance?: () => void, onStateChange?: (s: "active" | "paused" | "blocked" | "done") => void): WorkData {
  return {
    id: w.id,
    title: w.title,
    owner: w.owner,
    stage: w.stage,
    state: w.state,
    note: w.note,
    at: w.at,
    onAdvance,
    onStateChange,
  };
}

export function decisionToDecisionData(d: Decision, onDecide?: (opt: string) => void): DecisionData {
  return {
    id: d.id,
    title: d.title,
    context: d.context,
    options: d.options,
    raisedBy: d.raisedBy,
    at: d.at,
    status: d.status,
    chosen: d.chosen,
    onDecide,
  };
}

export function attentionToAttentionData(a: AttentionItem, onAction?: (actionId?: string) => void): AttentionData {
  return {
    id: a.id,
    title: a.title,
    detail: a.detail,
    kind: a.kind,
    from: a.from,
    at: a.at,
    handled: a.handled,
    decisionId: a.decisionId,
    onAction,
  };
}

/** Local ambient log entry → Activity-shaped event. This is the BROWSER-SESSION
 *  supplement (Phase 4.4C): never the authoritative company Activity — that is
 *  the server projection fetched via GET /api/activity and set with
 *  os.setServerActivity. */
export function logToActivity(l: { id: string; at: number; text: string }): ActivityEvent {
  return {
    id: l.id,
    at: l.at,
    text: l.text,
    kind: "info",
    server: false,
  };
}

/** Server-authoritative Activity projection event (GET /api/activity) →
 *  Activity-shaped event for the Activity surface. `at` is the authoritative
 *  event time from the source record. */
export function serverActivityToEvent(
  e: import("@/types/activity").ActivityEventDTO
): ActivityEvent {
  return {
    id: e.id,
    at: new Date(e.at).getTime(),
    text: e.summary,
    actor: e.actor,
    kind: categoryToKind(e.category),
    category: e.category,
    status: e.status,
    provenance: e.provenance,
    server: true,
  };
}

function categoryToKind(category: string): ActivityEvent["kind"] {
  switch (category) {
    case "work_started":
    case "work_completed":
    case "work_failed":
    case "scheduled_execution":
      return "work";
    case "approval_requested":
    case "approval_approved":
    case "approval_rejected":
      return "decision";
    case "side_effect_authorized":
    case "side_effect_denied":
    case "automation_paused":
    case "automation_resumed":
    case "automation_cancelled":
      return "security";
    default:
      return "info";
  }
}

export function generateSystemMetrics(state: OSState): MetricItem[] {
  const activeWork = state.work.filter((w) => w.state === "active").length;
  const blockedWork = state.work.filter((w) => w.state === "blocked").length;
  const openDecisions = state.decisions.filter((d) => d.status === "open").length;
  // Execution state is server-authoritative (fed by lib/runtime.ts from
  // /api/agents/runs + /api/workflow/approvals). Local-only counts occur
  // only when the server read model has not synced yet.
  const serverSynced = state.work.some((w) => w.origin === "server") || state.decisions.some((d) => d.approvalId);
  const stateSource = serverSynced ? "Server read model (/api/agents/runs)" : "Awaiting server sync";

  return [
    {
      id: "execution-primitive",
      label: "Execution primitive",
      value: "Council · 9-step protocol",
      status: "healthy",
      confidence: "verified",
      source: "orchestrator.ts (MultiAgentOrchestrator)",
    },
    {
      id: "decisions",
      label: "Open Decisions",
      value: openDecisions,
      status: openDecisions > 0 ? "waiting" : "healthy",
      confidence: "verified",
      source: state.decisions.some((d) => d.approvalId) ? "Server: /api/workflow/approvals" : stateSource,
    },
    {
      id: "active-work",
      label: "Active Workstreams",
      value: activeWork,
      status: blockedWork > 0 ? "blocked" : "active",
      confidence: "verified",
      source: stateSource,
    },
    {
      id: "workforce",
      label: "Employed AI roles",
      value: `${state.agents.length || 4}`,
      unit: "agents",
      status: "active",
      confidence: "verified",
      source: "Server: /api/agents → definitions.ts",
    },
  ];
}

export function generateCompanyMilestones(): TimelineMilestone[] {
  return [
    { id: "m1", title: "Foundation execution primitive", subtitle: "Founder → Sophia → 4-agent council → verified artifact", at: "Implemented", status: "complete" },
    { id: "m2", title: "Verification and Founder approval", subtitle: "Deterministic verification and authenticated approval are wired", at: "Implemented", status: "complete" },
    { id: "m3", title: "Company Brain and Role Brains", subtitle: "TARGET-STATE — not implemented", at: "Target-state", status: "upcoming" },
    { id: "m4", title: "Market intelligence", subtitle: "TARGET-STATE — not implemented", at: "Target-state", status: "upcoming" },
  ];
}

export function generateAgentRelationships(): RelationshipLink[] {
  return [
    { id: "r1", fromId: "sophia", fromName: "Sophia Vance", toId: "thorne", toName: "Dr. Aris Thorne", type: "delegates" },
    { id: "r2", fromId: "sophia", fromName: "Sophia Vance", toId: "maya", toName: "Maya Lin", type: "delegates" },
    { id: "r3", fromId: "sophia", fromName: "Sophia Vance", toId: "julian", toName: "Julian Cruz", type: "delegates" },
    { id: "r4", fromId: "maya", fromName: "Maya Lin", toId: "thorne", toName: "Dr. Aris Thorne", type: "depends-on" },
    { id: "r5", fromId: "thorne", fromName: "Dr. Aris Thorne", toId: "sophia", toName: "Sophia Vance", type: "escalates-to" },
    { id: "r6", fromId: "maya", fromName: "Maya Lin", toId: "sophia", toName: "Sophia Vance", type: "escalates-to" },
    { id: "r7", fromId: "julian", fromName: "Julian Cruz", toId: "sophia", toName: "Sophia Vance", type: "escalates-to" },
  ];
}
