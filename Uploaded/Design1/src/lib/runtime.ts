/**
 * SamJuniorsOS — real runtime adapter (Phase 3.4).
 *
 * Thin client-side read model / command adapter over the EXISTING server APIs:
 *   POST /api/orchestrate          — Founder directive → MultiAgentOrchestrator (9-step council)
 *   POST /api/agent-chat           — conversational interaction with the authoritative personas
 *   GET  /api/agents               — authoritative workforce roster (definitions.ts)
 *   GET  /api/agents/runs          — durable per-step agent execution records (AgentRunStore)
 *   GET  /api/workflow/approvals   — Founder approval gate records (SideEffectAuthorizationGate)
 *   POST /api/workflow/approvals   — approve / reject a real approval record
 *
 * The UI store (osStore) is fed from this adapter; the store never invents
 * server state and the graph therefore only ever visualizes authoritative
 * workflow/agent state. No backend domain model is duplicated here — the
 * types below are UI-side projections (read models) of server responses.
 */
import { os, presentationFor } from "./osStore";
import type { Agent, AttentionItem, Decision, Workstream, Stage } from "./osStore";

/* ------------------------------------------------------------------ id mapping
 * UI graph/persona ids (used since the graph phase) ↔ authoritative AgentRole
 * ids from lib/server/agents/definitions.ts.
 */
const UI_TO_SERVER: Record<string, string> = {
  sophia: "coo",
  thorne: "researcher",
  maya: "pm",
  julian: "finance",
};
const SERVER_TO_UI: Record<string, string> = {
  coo: "sophia",
  researcher: "thorne",
  pm: "maya",
  finance: "julian",
};

export const toServerAgentId = (uiId: string): string => UI_TO_SERVER[uiId] ?? uiId;
export const toUiAgentId = (serverId: string): string => SERVER_TO_UI[serverId] ?? serverId;

/* ------------------------------------------------------------------ read-model types */

export interface ServerAgentDef {
  id: string;
  name: string;
  role: string;
  department: string;
  responsibilities: string[];
  skills: string[];
  capabilities: string[];
}

export interface AgentRunRecord {
  runId: string;
  agentId: string;
  agentName: string;
  protocolStep: string;
  taskTitle: string;
  directive: string;
  status: "running" | "completed" | "failed" | "halted";
  durationMs: number;
  outputContent: string;
  timestamp: string;
}

export interface ApprovalRecord {
  id: string;
  decision: "pending" | "approved" | "rejected" | "revoked" | "expired";
  actionName: string;
  classification: string;
  workflowInstanceId: string;
  stepId: string;
  employeeRole: string;
  requestedAt: string;
  notes?: string;
  target?: { summary?: string; targetSystem?: string };
  workflowObjective?: string;
}

export interface OrchestrationRun {
  id: string;
  directive: string;
  timestamp: string;
  status: string;
  title: string;
  summary: string;
  liveAi?: boolean;
  plan: Array<{ stage: number; title: string; agentId: string; protocolStep: string; status: string }>;
  messages: Array<{ id: string; sender: string; text: string; type: string; protocolStep?: string }>;
  deliverables: Array<{ name: string; owner: string }>;
  executiveResult?: {
    recommendation: string;
    verificationStatus: string;
    executionOutcome: string;
    founderDecision?: { required: boolean; title: string; recommendation: string; why: string; impact: string; status: string };
  };
  verificationResult?: { isCompliant: boolean; checksFailed: string[] };
  executionSummary?: { totalAgentsInvoked: number; agentsInvoked: string[]; totalTasksExecuted: number; executionMode: string };
}

/* ------------------------------------------------------------------ protocol → stage */

const STEP_STAGE: Record<string, Stage> = {
  understand: "discovery",
  research: "discovery",
  analyze: "discovery",
  plan: "build",
  build_execute: "build",
  test: "build",
  verify: "review",
  review: "review",
  report: "ship",
};

/** A directive is considered in-flight while any of its runs landed this recently. */
const IN_FLIGHT_WINDOW_MS = 150_000;

/* ------------------------------------------------------------------ fetch helpers */

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status} ${url})`);
  }
  return body as T;
}

/* ------------------------------------------------------------------ roster */

export async function fetchRoster(): Promise<ServerAgentDef[]> {
  const data = await jsonFetch<{ success: boolean; agents: ServerAgentDef[] }>("/api/agents");
  return data.agents ?? [];
}

/* ------------------------------------------------------------------ agent runs */

export async function fetchRuns(limit = 200): Promise<AgentRunRecord[]> {
  const data = await jsonFetch<{ success: boolean; runs: AgentRunRecord[] }>(`/api/agents/runs?limit=${limit}`);
  return data.runs ?? [];
}

/* ------------------------------------------------------------------ approvals */

export async function fetchApprovals(): Promise<ApprovalRecord[]> {
  const data = await jsonFetch<{ totalCount: number; approvals: ApprovalRecord[] }>("/api/workflow/approvals?status=pending");
  return data.approvals ?? [];
}

export async function decideApproval(approvalId: string, action: "approve" | "reject", reason?: string): Promise<void> {
  await jsonFetch("/api/workflow/approvals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, approvalId, reason: reason || `Founder decision via SamJuniorsOS (${action})` }),
  });
}

/* ------------------------------------------------------------------ chat */

export interface ChatReply {
  reply: string;
  liveAi: boolean;
  intent: string;
  name: string;
}

export async function agentChat(opts: { agentId: string; message: string; history?: Array<{ sender: "user" | "agent"; text: string }> }): Promise<ChatReply> {
  const data = await jsonFetch<ChatReply & { success: boolean }>("/api/agent-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: opts.agentId,
      message: opts.message,
      history: (opts.history ?? []).slice(-10),
    }),
  });
  return { reply: data.reply, liveAi: !!data.liveAi, intent: data.intent, name: data.name };
}

/* ------------------------------------------------------------------ directive dispatch */

/** Mirrors the backend's explicit-directive heuristics (agent-chat route) closely
 *  enough to route founder commands from the ask bar to the real orchestration path. */
export function looksLikeDirective(text: string): boolean {
  const clean = text.trim().toLowerCase();
  const patterns = [
    /\b(research|investigate|analyze|evaluate|audit|model|draft|design|create|build|prepare|synthesize|simulate|spec|spec out)\b.+\b(and (give|provide|recommend|write|report|present|model)|recommendation|proposal|prd|spec|plan|deliverable|architecture|breakdown|forecast|strategy)\b/i,
    /^(research|investigate|analyze|evaluate|audit|model|draft|design|create|build|prepare|synthesize|simulate)\s+(the|our|a|an|all)\s+/i,
    /\b(give me a recommendation|give me a plan|create a prd|draft a prd|model the unit economics|model our pricing|audit compute burn|conduct a research|run an analysis|synthesize a proposal)\b/i,
    /^(execute|orchestrate|launch task|run task|start initiative)\b/i,
    /^(prepare|research|analyze|build|create|model|draft|evaluate|audit|generate)\b/i,
    /^(work|start)\b/i,
  ];
  return patterns.some((p) => p.test(clean));
}

export async function orchestrate(directive: string, agents?: string[]): Promise<OrchestrationRun> {
  const data = await jsonFetch<{ success: boolean; data: OrchestrationRun; liveAi?: boolean }>("/api/orchestrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directive: directive.trim(), agents: agents ?? ["coo", "researcher", "pm", "finance"] }),
  });
  return data.data;
}

/** Dispatch a founder directive to the real orchestration path. While the council
 *  executes (~minutes), polls the durable agent-run store so the OS surfaces and
 *  the operating graph visualize REAL step-by-step progress — never simulated. */
export async function dispatchDirective(directive: string, opts?: { agents?: string[] }): Promise<OrchestrationRun> {
  const poll = setInterval(() => {
    syncFromServer({ quiet: true }).catch(() => { /* transient poll failure — next tick retries */ });
  }, 3000);
  try {
    const run = await orchestrate(directive, opts?.agents);
    clearInterval(poll);
    applyOrchestrationRun(run);
    await syncFromServer();
    return run;
  } catch (err) {
    clearInterval(poll);
    // Sync whatever steps actually persisted server-side before the failure,
    // then surface the honest error — no fake local success.
    await syncFromServer().catch(() => undefined);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** One-line real summary of a completed run (for Sophia's reply). */
export function summarizeRun(run: OrchestrationRun): string {
  const verified = run.verificationResult?.isCompliant;
  const outcome = run.executiveResult?.executionOutcome ?? run.status;
  const parts: string[] = [];
  parts.push(run.liveAi === false ? "Council executed in safe unconfigured mode." : `Directive executed: ${run.title}.`);
  if (verified === true) parts.push("Constitutional verification passed.");
  if (verified === false) parts.push(`Verification rejected: ${(run.verificationResult?.checksFailed ?? ["unknown"]).join("; ")}.`);
  if (run.executionSummary) parts.push(`${run.executionSummary.totalTasksExecuted} protocol steps · ${run.executionSummary.agentsInvoked.length} agents · ${run.deliverables.length} deliverables.`);
  if (run.executiveResult?.founderDecision?.required) parts.push(`A decision is waiting for you: ${run.executiveResult.founderDecision.title}.`);
  parts.push(`Outcome: ${outcome}.`);
  return parts.join(" ");
}

/* ------------------------------------------------------------------ run → read-model mapping */

function hashId(prefix: string, text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${prefix}-${(h >>> 0).toString(36)}`;
}

const titleOf = (directive: string) => (directive.length > 60 ? `${directive.slice(0, 58)}…` : directive);

/** Groups durable agent-run records by directive and derives honest workstreams:
 *  stage from the furthest real protocol step, owner from the latest specialist
 *  that actually executed, and state from real recency. */
export function workstreamsFromRuns(runs: AgentRunRecord[], dismissed: string[] = []): Workstream[] {
  const groups = new Map<string, AgentRunRecord[]>();
  for (const r of runs) {
    const key = r.directive?.trim();
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const work: Workstream[] = [];
  for (const [directive, group] of groups) {
    const sorted = [...group].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const latest = sorted[sorted.length - 1];
    const id = hashId("srv", directive);
    if (dismissed.includes(id)) continue;

    const specialistRuns = sorted.filter((r) => r.agentId !== "coo");
    const latestSpecialist = specialistRuns[specialistRuns.length - 1];
    const owner = latestSpecialist ? toUiAgentId(latestSpecialist.agentId) : "sophia";

    const hasReport = sorted.some((r) => r.protocolStep === "report");
    const lastStep = latest.protocolStep;
    const age = Date.now() - new Date(latest.timestamp).getTime();
    const inFlight = !hasReport && age < IN_FLIGHT_WINDOW_MS;

    const stage: Stage = hasReport ? "done" : STEP_STAGE[lastStep] ?? "discovery";
    const state: Workstream["state"] = hasReport ? "done" : inFlight ? "active" : "paused";

    work.push({
      id,
      title: titleOf(directive),
      owner,
      stage,
      state,
      note: `${sorted.length} real protocol steps · last: ${latest.taskTitle}`,
      at: new Date(latest.timestamp).getTime(),
      origin: "server",
      directive,
    });
    if (work.length >= 5) break; // most recent directives only — groups arrive in run-recency order
  }
  return work;
}

/** Real agent runtime state from durable run records. Only agents currently
 *  participating in an in-flight directive show "working"; everything else
 *  decays to ready. Founder's local offline choices are preserved by osStore. */
export function agentStatesFromRuns(runs: AgentRunRecord[], work: Workstream[]): Record<string, { state: Agent["state"]; current?: string }> {
  const out: Record<string, { state: Agent["state"]; current?: string }> = {};
  const active = work.some((w) => w.state === "active");
  if (!active) return out;

  for (const r of runs) {
    const uiId = toUiAgentId(r.agentId);
    if (out[uiId]?.state === "working") continue;
    const age = Date.now() - new Date(r.timestamp).getTime();
    if (age < IN_FLIGHT_WINDOW_MS) {
      out[uiId] = { state: "working", current: r.taskTitle };
    }
  }
  return out;
}

/* ------------------------------------------------------------------ full sync */

let syncing: Promise<void> | null = null;

/** Pulls roster + runs + approvals from the server and feeds the OS store.
 *  Server-origin state REPLACES local projections; local founder records
 *  (notes, focus, offline choices) are preserved. */
export async function syncFromServer(opts?: { quiet?: boolean }): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const [roster, runs, approvals] = await Promise.all([fetchRoster(), fetchRuns(), fetchApprovals()]);
      applyServerReadModel({ roster, runs, approvals });
    } catch (err) {
      if (!opts?.quiet) {
        // Honest signal — never fake a successful sync.
        os.log(`Server sync unavailable: ${err instanceof Error ? err.message : String(err)}`);
      }
      throw err;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

function applyServerReadModel(input: { roster: ServerAgentDef[]; runs: AgentRunRecord[]; approvals: ApprovalRecord[] }) {
  const { roster, runs, approvals } = input;
  const dismissed = os.getDismissed();
  const work = workstreamsFromRuns(runs, dismissed);
  const agentStates = agentStatesFromRuns(runs, work);

  // Agents: authoritative identity (existence/name/role) from the server roster,
  // presentation copy from the UI's own constants, runtime state from real runs.
  const agents: Agent[] = roster.map((def) => {
    const uiId = toUiAgentId(def.id);
    const presentation = presentationFor(uiId);
    const rt = agentStates[uiId];
    return {
      ...presentation,
      id: uiId,
      name: def.name,
      role: def.role,
      state: rt?.state ?? "ready",
      current: rt?.current,
    };
  });

  // Decisions + attention from REAL pending approval gate records.
  const decisions: Decision[] = approvals.map((a) => ({
    id: a.id,
    title: a.actionName,
    context: a.target?.summary || a.notes || `${a.classification} · ${a.workflowInstanceId}`,
    options: ["Approve", "Reject"],
    raisedBy: SERVER_TO_UI[a.employeeRole] ?? a.employeeRole,
    at: new Date(a.requestedAt).getTime(),
    status: "open",
    approvalId: a.id,
  }));

  const attention: AttentionItem[] = approvals.map((a) => ({
    id: `att-${a.id}`,
    kind: "decision",
    title: a.actionName,
    detail: a.target?.summary || a.notes,
    from: SERVER_TO_UI[a.employeeRole] ?? a.employeeRole,
    at: new Date(a.requestedAt).getTime(),
    decisionId: a.id,
    server: true,
  }));

  os.applyServerState({ agents, work, decisions, attention });
}

/** Ingests a just-completed orchestration run (full fidelity from the response). */
export function applyOrchestrationRun(run: OrchestrationRun) {
  // Founder decision request surfaced as real attention from the run.
  const fd = run.executiveResult?.founderDecision;
  if (fd?.required && fd.status === "pending") {
    os.addAttention({
      kind: "decision",
      title: fd.title,
      detail: `${fd.why} · ${fd.impact}`,
      from: "sophia",
    });
  }
  os.log(`Directive executed: ${titleOf(run.directive)} (${run.executionSummary?.totalTasksExecuted ?? 0} steps, ${run.deliverables.length} deliverables)`);
}
