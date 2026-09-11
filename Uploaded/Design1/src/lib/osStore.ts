/**
 * SamJuniorsOS — shared operating state.
 * Client-only, persisted to localStorage. No metrics are simulated: everything here is
 * either a user-owned record (decisions, work, attention) or a real runtime state.
 */
import { useCallback, useRef, useSyncExternalStore } from "react";

export type AttentionKind = "decision" | "review" | "blocked" | "message" | "note";
export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  title: string;
  detail?: string;
  from: string;        // who raised it (agent id or "you")
  at: number;
  handled?: boolean;
  decisionId?: string;
};

export type DecisionStatus = "open" | "approved" | "deferred" | "declined";
export type Decision = {
  id: string;
  title: string;
  context: string;
  options: string[];
  raisedBy: string;
  at: number;
  status: DecisionStatus;
  chosen?: string;
  effect?: "toggle-voice" | "edit-context" | "activate-workforce";
};

export type Stage = "discovery" | "build" | "review" | "ship" | "done";
export type WorkState = "active" | "paused" | "blocked" | "done";
export type Workstream = {
  id: string;
  title: string;
  owner: string;       // agent id
  stage: Stage;
  state: WorkState;
  note?: string;
  at: number;
};

export type AgentState = "ready" | "working" | "waiting" | "offline";
export type Agent = {
  id: string;
  name: string;
  role: string;
  remit: string;
  canDo: string[];
  tools: string[];
  escalates: string;
  state: AgentState;
  current?: string;
  tint: string;   // tailwind text colour
  glow: string;   // rgba glow
};

export type Company = {
  name: string;
  oneLiner: string;
  focus: string;
  principles: string[];
  constraints: string[];
};

export type SophiaMode = "idle" | "attentive" | "thinking" | "speaking";

export type OSState = {
  attention: AttentionItem[];
  decisions: Decision[];
  work: Workstream[];
  agents: Agent[];
  company: Company;
  sophia: SophiaMode;
  lastSaid: string;
  sessionStart: number;
  log: { id: string; at: number; text: string }[];
};

export const STAGES: Stage[] = ["discovery", "build", "review", "ship", "done"];

/* ------------------------------------------------------------------ UI session seed
 *
 * This UI-only store is deliberately non-authoritative. It contains only the
 * implemented v1 execution primitive from PRODUCT.md; it must not imply live
 * telemetry, active assignments, or external integrations.
 */

const now = Date.now();
const uid = () => Math.random().toString(36).slice(2, 9);

const AGENTS: Agent[] = [
  {
    id: "sophia", name: "Sophia", role: "Planner",
    remit: "Plans founder directives, routes work to Thorne, and returns verified outcomes or decisions requiring Founder approval.",
    canDo: ["Plan directives", "Route work to Thorne", "Escalate decisions", "Brief the Founder"],
    tools: ["Directive planning", "Decision queue", "Workflow context"],
    escalates: "Any consequential action requiring authenticated Founder approval.",
    state: "ready", tint: "text-cyan-300", glow: "rgba(56,189,248,0.4)",
  },
  {
    id: "ops", name: "Thorne", role: "Systems Worker",
    remit: "Executes structured work planned by Sophia and produces a typed artifact for deterministic verification.",
    canDo: ["Execute structured work", "Produce typed artifacts", "Report blockers"],
    tools: ["Workflow runtime", "Verification context", "Artifact handoff"],
    escalates: "A failed verification, blocked workflow, or action requiring Founder approval.",
    state: "ready", tint: "text-amber-300", glow: "rgba(251,146,60,0.4)",
  },
];

const SEED: OSState = {
  attention: [],
  decisions: [],
  work: [],
  agents: AGENTS,
  company: {
    name: "SamJuniors",
    oneLiner: "Internal operating system for SamJuniors.",
    focus: "",
    principles: ["Multiply the Founder", "Bring verified outcomes or decisions", "Company truth is governed"],
    constraints: ["Consequential actions require authenticated Founder approval", "Unknown state remains unknown"],
  },
  sophia: "idle",
  lastSaid: "",
  sessionStart: now,
  log: [],
};

/* ------------------------------------------------------------------ store */

const KEY = "samjuniors-os-v2-ui-session";

function load(): OSState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return SEED;
    const saved = JSON.parse(raw) as Partial<OSState>;
    return {
      ...SEED,
      ...saved,
      agents: (saved.agents ?? SEED.agents).map((a) => ({ ...SEED.agents.find((s) => s.id === a.id), ...a })) as Agent[],
      company: { ...SEED.company, ...(saved.company ?? {}) },
      sophia: "idle",
      sessionStart: Date.now(),
    };
  } catch {
    return SEED;
  }
}

let state: OSState = typeof window === "undefined" ? SEED : load();
let cachedAttention = state.attention.filter((a) => !a.handled);
let cachedDecisions = state.decisions.filter((d) => d.status === "open");
let cachedWork = state.work.filter((w) => w.state !== "done");

function updateCaches() {
  cachedAttention = state.attention.filter((a) => !a.handled);
  cachedDecisions = state.decisions.filter((d) => d.status === "open");
  cachedWork = state.work.filter((w) => w.state !== "done");
}

const listeners = new Set<() => void>();

function persist() {
  try {
    const { sophia: _s, sessionStart: _t, ...rest } = state;
    void _s; void _t;
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch { /* storage unavailable */ }
}

function set(patch: Partial<OSState> | ((s: OSState) => Partial<OSState>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  updateCaches();
  persist();
  listeners.forEach((l) => l());
}

function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }
  return false;
}

export function getOS() { return state; }
export function subscribeOS(l: () => void) { listeners.add(l); return () => listeners.delete(l); }
export function useOS<T>(selector: (s: OSState) => T): T {
  const cacheRef = useRef<{
    hasValue: boolean;
    state: OSState;
    selector: (s: OSState) => T;
    value: T;
  }>({
    hasValue: false,
    state: undefined as unknown as OSState,
    selector,
    value: undefined as unknown as T,
  });

  const getSnapshot = useCallback(() => {
    const c = cacheRef.current;
    if (!c.hasValue || c.state !== state || c.selector !== selector) {
      const next = selector(state);
      if (!c.hasValue || !shallowEqual(c.value, next)) {
        c.value = next;
      }
      c.state = state;
      c.selector = selector;
      c.hasValue = true;
    }
    return c.value;
  }, [selector]);

  return useSyncExternalStore(subscribeOS, getSnapshot, getSnapshot);
}

/* ---------------------------------------------------------------- actions */

function log(text: string) {
  set((s) => ({ log: [{ id: uid(), at: Date.now(), text }, ...s.log].slice(0, 40) }));
}

export const os = {
  setSophia(mode: SophiaMode) { if (state.sophia !== mode) set({ sophia: mode }); },
  setLastSaid(text: string) { set({ lastSaid: text }); },

  addAttention(item: Omit<AttentionItem, "id" | "at">) {
    const a: AttentionItem = { ...item, id: uid(), at: Date.now() };
    set((s) => ({ attention: [a, ...s.attention] }));
    log(`Attention: ${a.title}`);
    return a;
  },
  handleAttention(id: string) {
    set((s) => ({ attention: s.attention.map((a) => (a.id === id ? { ...a, handled: true } : a)) }));
  },
  clearHandled() { set((s) => ({ attention: s.attention.filter((a) => !a.handled) })); },

  addDecision(title: string, context = "", options: string[] = ["Approve", "Defer"], raisedBy = "you") {
    const d: Decision = { id: uid(), title, context, options, raisedBy, at: Date.now(), status: "open" };
    set((s) => ({ decisions: [d, ...s.decisions] }));
    os.addAttention({ kind: "decision", title, detail: context || undefined, from: raisedBy, decisionId: d.id });
    return d;
  },
  resolveDecision(id: string, chosen: string) {
    const d = state.decisions.find((x) => x.id === id);
    if (!d) return;
    const lower = chosen.toLowerCase();
    const status: DecisionStatus = /later|defer|standby|hold/.test(lower) ? "deferred" : /decline|no\b|reject/.test(lower) ? "declined" : "approved";
    set((s) => ({
      decisions: s.decisions.map((x) => (x.id === id ? { ...x, status, chosen } : x)),
      attention: s.attention.map((a) => (a.decisionId === id ? { ...a, handled: true } : a)),
    }));
    log(`Decision "${d.title}" → ${chosen}`);
    if (d.effect === "activate-workforce" && status === "approved") os.activateWorkforce();
    return status;
  },

  addWork(title: string, owner = "ops", note?: string) {
    const w: Workstream = { id: uid(), title, owner, stage: "discovery", state: "active", note, at: Date.now() };
    set((s) => ({ work: [w, ...s.work] }));
    os.assign(owner, title);
    log(`Work started: ${title} (${owner})`);
    return w;
  },
  advanceWork(id: string) {
    set((s) => ({
      work: s.work.map((w) => {
        if (w.id !== id) return w;
        const i = STAGES.indexOf(w.stage);
        const stage = STAGES[Math.min(STAGES.length - 1, i + 1)];
        return { ...w, stage, state: stage === "done" ? "done" : w.state === "done" ? "active" : w.state };
      }),
    }));
    os.refreshAgents();
  },
  setWorkState(id: string, st: WorkState) {
    set((s) => ({ work: s.work.map((w) => (w.id === id ? { ...w, state: st } : w)) }));
    const w = state.work.find((x) => x.id === id);
    if (w && st === "blocked") os.addAttention({ kind: "blocked", title: `Blocked: ${w.title}`, detail: `${agentName(w.owner)} needs a call from you.`, from: w.owner });
    os.refreshAgents();
  },
  removeWork(id: string) { set((s) => ({ work: s.work.filter((w) => w.id !== id) })); os.refreshAgents(); },

  assign(agentId: string, current: string) {
    set((s) => ({ agents: s.agents.map((a) => (a.id === agentId ? { ...a, state: "working", current } : a)) }));
  },
  setAgentOffline(agentId: string, offline: boolean) {
    set((s) => ({
      agents: s.agents.map((a) => (a.id === agentId ? { ...a, state: offline ? "offline" : "ready", current: offline ? undefined : a.current } : a)),
      work: offline ? s.work.map((w) => (w.owner === agentId && w.state === "active" ? { ...w, state: "paused" } : w)) : s.work,
    }));
    if (!offline) os.refreshAgents();
    log(`${agentName(agentId)} ${offline ? "taken offline" : "back online"}`);
  },
  refreshAgents() {
    set((s) => ({
      agents: s.agents.map((a) => {
        if (a.id === "sophia" || a.state === "offline") return a;
        const mine = s.work.filter((w) => w.owner === a.id && w.state !== "done");
        const blocked = mine.find((w) => w.state === "blocked");
        if (blocked) return { ...a, state: "waiting", current: blocked.title };
        const active = mine.find((w) => w.state === "active");
        if (active) return { ...a, state: "working", current: active.title };
        return { ...a, state: "ready", current: undefined };
      }),
    }));
  },
  activateWorkforce() {
    os.refreshAgents();
    log("Workforce activated");
  },

  setCompany(patch: Partial<Company>) {
    set((s) => ({ company: { ...s.company, ...patch } }));
    if (patch.focus !== undefined) {
      set((s) => ({
        decisions: s.decisions.map((d) => (d.effect === "edit-context" && d.status === "open" ? { ...d, status: "approved", chosen: "Set focus" } : d)),
        attention: s.attention.map((a) => (a.decisionId === "d-focus" ? { ...a, handled: true } : a)),
      }));
      log(`Focus set: ${patch.focus}`);
    }
  },

  /** Natural-language entry from the ask bar. Returns what Sophia should say. */
  ask(raw: string): string {
    const text = raw.trim();
    if (!text) return "";
    const lower = text.toLowerCase();
    const strip = (re: RegExp) => text.replace(re, "").trim().replace(/^[:\-–—]\s*/, "");

    if (/^(decide|decision)\b/.test(lower)) {
      const t = strip(/^(decide|decision)\b/i);
      os.addDecision(t || "Untitled decision");
      return `Added a decision: ${t || "untitled"}. It's in your queue.`;
    }
    if (/^(work|start|build|do)\b/.test(lower)) {
      const t = strip(/^(work( on)?|start|build|do)\b/i);
      os.addWork(t || "Untitled workstream", "ops");
      return `Started a workstream: ${t || "untitled"}. Operations owns it.`;
    }
    if (/^(focus|this week)\b/.test(lower)) {
      const t = strip(/^(focus( is| on)?|this week)\b/i);
      if (t) { os.setCompany({ focus: t }); return `Focus set. Everything will be ranked against: ${t}.`; }
      return state.company.focus ? `Your focus is: ${state.company.focus}.` : "No focus set yet. Say 'focus' followed by one sentence.";
    }
    if (/^(status|brief|what('s| is) up|update)\b/.test(lower)) return os.brief();
    if (/^(note|remember)\b/.test(lower)) {
      const t = strip(/^(note|remember)\b/i);
      os.addAttention({ kind: "note", title: t || "Note", from: "you" });
      return "Noted.";
    }
    // default: capture as a message for triage
    os.addAttention({ kind: "message", title: text, from: "you" });
    return "Got it. I've put that in your attention list for triage.";
  },

  /** One-line spoken/text briefing derived from real state. */
  brief(): string {
    const open = state.attention.filter((a) => !a.handled).length;
    const decisions = state.decisions.filter((d) => d.status === "open").length;
    const active = state.work.filter((w) => w.state === "active").length;
    const blocked = state.work.filter((w) => w.state === "blocked").length;
    const parts: string[] = [];
    if (decisions) parts.push(`${decisions} decision${decisions > 1 ? "s" : ""} waiting for you`);
    if (blocked) parts.push(`${blocked} workstream${blocked > 1 ? "s" : ""} blocked`);
    if (active) parts.push(`${active} in progress`);
    if (!parts.length && !open) return state.company.focus ? `All quiet. Focus: ${state.company.focus}.` : "All quiet. Nothing needs you.";
    if (!parts.length) return `${open} item${open > 1 ? "s" : ""} in your attention list.`;
    return parts.join(", ") + ".";
  },

  /** Ambient line for the core — null means stay silent. */
  ambient(): string | null {
    const decisions = state.decisions.filter((d) => d.status === "open").length;
    const blocked = state.work.filter((w) => w.state === "blocked").length;
    if (blocked) return `${blocked} workstream${blocked > 1 ? "s are" : " is"} blocked and waiting on you.`;
    if (decisions) return `${decisions} decision${decisions > 1 ? "s are" : " is"} waiting for you.`;
    const quiet = ["All quiet.", "Nothing needs you right now.", "I'm here."];
    return Math.random() < 0.5 ? quiet[Math.floor(Math.random() * quiet.length)] : null;
  },

  reset() {
    try { localStorage.removeItem(KEY); } catch { /* noop */ }
    state = { ...SEED, sessionStart: Date.now(), attention: SEED.attention.map((a) => ({ ...a })), decisions: SEED.decisions.map((d) => ({ ...d })), work: SEED.work.map((w) => ({ ...w })), agents: SEED.agents.map((a) => ({ ...a })) };
    updateCaches();
    listeners.forEach((l) => l());
  },
};

export function agentName(id: string) {
  return state.agents.find((a) => a.id === id)?.name ?? (id === "you" ? "You" : id);
}

export function openAttention(_s: OSState) { return cachedAttention; }
export function openDecisions(_s: OSState) { return cachedDecisions; }
export function activeWork(_s: OSState) { return cachedWork; }
