/** Copy for SamJuniorsOS / Sophia. UI-only — no APIs, no fake KPIs. */

export const OS = {
  name: "SamJuniorsOS",
  short: "SJOS",
  operator: "Sam Junior",
  companion: "Sophia",
  version: "1.0",
};

export const SOPHIA_PHRASES = [
  "I'm here",
  "Listening",
  "On it",
  "Noted",
  "Ready when you are",
  "Holding that",
  "Attention is clear",
  "I'll keep watch",
  "Understood",
  "Standing by",
  "The desk is open",
  "What needs a decision",
];

export const BOOT_LINES = [
  "SamJuniorsOS",
  "waking Sophia…",
  "restoring the desk…",
  "workforce present.",
  "session open.",
];

export const OS_NOTES = [
  { t: "Decision waiting", d: "Sophia held the partnership brief for you." },
  { t: "Work moved", d: "Atlas finished today's ops sweep." },
  { t: "Research filed", d: "Iris left a short note on the open question." },
  { t: "Record kept", d: "Voss archived yesterday's decisions." },
  { t: "Draft ready", d: "Reed has a reply waiting for your word." },
  { t: "Attention clear", d: "Nothing urgent. The house is quiet." },
];

export const OS_STATES = [
  { label: "Session", value: "Open" },
  { label: "Attention", value: "Listening" },
  { label: "Decisions", value: "2 waiting" },
  { label: "Work", value: "In motion" },
  { label: "Workforce", value: "Present" },
];

export type WorkTag = "you" | "desk" | "soon" | "held";

export const DEFAULT_WORK = [
  { id: 1, text: "Read Sophia's morning brief", done: true, tag: "desk" as WorkTag, due: "Done" },
  { id: 2, text: "Decide on the partnership note", done: false, tag: "you" as WorkTag, due: "Waiting" },
  { id: 3, text: "Approve Reed's draft reply", done: false, tag: "you" as WorkTag, due: "Today" },
  { id: 4, text: "Let Voss archive last week", done: true, tag: "desk" as WorkTag, due: "Kept" },
  { id: 5, text: "Iris follow-up on the open question", done: false, tag: "soon" as WorkTag, due: "Soon" },
];
