# SamJuniorsOS — Core V4 / From State Machine to Operating Intelligence

## 1. Overview & Vision

Core V4 evolves the Core V3 prototype beyond a "state-machine demo" into an
experience where the founder **operates an intelligent company system**.

V3 established the visual direction (cinematic dark spatial environment,
central glowing Core, Jarvis / Manual mode, contextual work surface,
progressive disclosure, founder command input, messenger, approval boundary).
V4 keeps that visual language and moves the founder-facing mental model from
seven operational states to a continuous operating loop:

```
FOUNDER INTENT → CORE UNDERSTANDS → ACTIVE WORK → AUTHORITY BOUNDARY
              → OUTCOME → PROVENANCE / LEARNING
```

The seven V3 states (READY, UNDERSTANDING, WORKING, WAITING_FOR_FOUNDER,
EXECUTING, COMPLETED, BLOCKED) still exist — but only INTERNALLY, driving the
Core orb's presence and visuals. The founder instead thinks in terms of:

- "What am I asking?" — FOUNDER INTENT
- "What is Core doing?" — ACTIVE WORK
- "What needs my attention?" — ATTENTION MODEL
- "What can Core do itself vs. what requires my approval?" — AUTHORITY BOUNDARY
- "What happened / what did we learn?" — OUTCOME + EVIDENCE + PROVENANCE

---

## 2. The Five Visible Layers

| Layer | Surface | What it answers |
| :--- | :--- | :--- |
| **1. FOUNDER INTENT** | Command bar → UNDERSTANDING pane ("YOU ASKED" / "CORE UNDERSTANDS" + context chips) | "What am I asking?" and "Did Core understand it?" |
| **2. ACTIVE WORK** | Persistent work surface: WHAT (title) · WHY · CURRENT STEP · EVIDENCE counts · NEXT · milestone checklist + Pause / Steer / Stop | "What is Core doing, why, where is it, what comes next?" (operational progress only — no chain-of-thought) |
| **3. ATTENTION MODEL** | "WHAT MATTERS NOW" strip + contextual header (`COMPANY · WORKING ON · ATTENTION · CLEAR`) | "What matters now?" — ATTENTION REQUIRED (n decisions) / WORK IN PROGRESS / WATCH (unresolved findings) / CLEAR |
| **4. AUTHORITY BOUNDARY** | FOUNDER DECISION REQUIRED pane: Core has prepared · Reason · Evidence · Recommendation → APPROVE / REDIRECT / REJECT / INSPECT | "What requires my authorization?" Core analyzes, prepares, recommends — it never self-authorizes consequential actions |
| **5. OUTCOME** | COMPLETED pane: Outcome · Evidence · REVIEW RESULT / INSPECT EVIDENCE / VIEW PROVENANCE / CONTINUE WORK | "What happened and what evidence supports it?" — WORK → RESULT → EVIDENCE → LEARNING |

---

## 3. V4 Interaction Capabilities

### A. Persistent Work Identity
Work lives in **work threads** that survive every Core state change. The
WORK THREADS dock (labeled `SIMULATION`) keeps every thread inspectable:
Continue / Pause / Steer / Stop / Inspect / Return later. A task never
disappears when Core changes state.

### B. Conversational Steering
`⇄ Steer` (during work) and `REDIRECT` (at the decision gate) open a
**conversational steering composer** — free-text instructions plus example
chips ("Focus on enterprise customers.", "Ignore pricing for now.",
"Prioritize the strongest verified evidence.", "Stop researching and give me
the current recommendation."). The instruction visibly modifies the work:
the WHY line updates, an "Adjusting to founder steering" milestone appears,
the thread card is flagged `⇄ steered`, and activity records the steering.

### C. Founder Interruption
Entering a new command while Core is working produces an honest
**WORK UPDATED** notice (previous direction → new founder direction →
"Redirecting…"), marks the old thread `Redirected` (kept in the dock), and
starts the new work. `Stop.`-prefixed commands halt active work without
creating new work.

### D. Honest Decision Semantics
- Consequential templates (Positioning Review, Market Opportunity
  Investigation, generic requests) stop at the decision gate.
- Non-consequential work (Company Review, Today's Priorities) completes
  without a decision — not everything is consequential, and the prototype
  says so.
- REJECT records "no action was taken. Core will not retry without a new
  instruction." — no fake execution, no invented approval rules, no
  cryptographic claims.

### E. Attention Model
`WHAT MATTERS NOW` is derived from the simulated state: pending decisions →
ATTENTION REQUIRED; running threads → WORK IN PROGRESS; threads with
unverified findings → WATCH; otherwise CLEAR. "Show me what needs my
attention." routes to the relevant surface (decisions sheet / active thread /
activity). The Company State sheet answers the four founder questions
(What is happening? What changed? What needs attention? What is being
worked on?) from the same simulated state.

### F. Jarvis vs. Manual — Same OS
- **JARVIS** is an AI interaction mode (natural-language intent). It is NOT
  the operating system.
- **MANUAL** is direct module navigation — the same governed OS, unmediated.
  All 8 modules (Company, Work, Decisions, Research, Workforce, Activity,
  Audit, Messenger) are fully functional without Jarvis.
- AI credits gate AI capability, never OS access: when depleted, Jarvis
  commands are honestly refused while Manual remains 100% usable.

### G. Provenance & Evidence
Outcome → INSPECT EVIDENCE / VIEW PROVENANCE opens the Level-3 provenance
inspector scoped to that thread: `SOURCE → SIGNAL → CLAIM → FACT → DECISION
→ OUTCOME` with honest statuses (PENDING VERIFICATION, AWAITING FOUNDER,
RATIFIED BY FOUNDER, RECORDED WITH EVIDENCE).

---

## 4. Demo Data Safety (non-negotiable)

- Persistent footer watermark: `DEMO STATE · NO LIVE COMPANY DATA CONNECTED`.
- Work threads dock, sheets, messenger and provenance carry `SIMULATION` /
  `DEMO` labels.
- Workforce shows only the repository-confirmed v1 roster (Sophia — planner,
  Thorne — systems worker) with generic "governed worker" semantics; standby
  roles are labeled target-state non-v1. No model names, performance scores,
  employee counts, revenue, customers, or pricing exist anywhere.
- Messenger messages are explicitly simulated.
- Learning is NOT claimed as persisted: the outcome pane states the
  production system would record outcomes into company memory.
- No backend, APIs, database, auth, or production files are touched. All
  state is client-side JavaScript.

---

## 5. How to Test & Review

- **Dev server**: navigate to `/prototype/v4/` (V3 remains at
  `/prototype/`).
- **Suggested demo flow** (the canonical lifecycle):
  1. Enter "Continue the positioning review." → UNDERSTANDING → work
     milestones with evidence ticking → decision gate.
  2. REDIRECT → steering composer → "Prioritize the strongest verified
     evidence." → work resumes, re-prepares the recommendation.
  3. APPROVE → executing → COMPLETED outcome with evidence.
  4. VIEW PROVENANCE → the full Source→Outcome chain.
  5. Enter a new command while another thread runs → WORK UPDATED.
  6. "Review what changed in the company." → completes WITHOUT a decision
     and adds a WATCH item.
  7. Toggle MANUAL mode → all modules without Jarvis.
  8. Toggle AI credits → Jarvis pauses honestly, Manual stays usable.
- **Hotkeys**: `C` Company · `W` Workforce · `A` Activity · `D` Decisions ·
  `M` Messenger · `Escape` close surfaces.
- **Footer**: `⟲ Reset Demo` restores the clean initial state.

---

## 6. Scope & What is Intentionally NOT Implemented

- No backend/API execution — all steering, transitions and events are
  client-side simulation.
- No database, Prisma, auth, cryptographic gates, or runtime changes.
- No fake liveness: the stream only moves when the simulation acts.
- No Jarvis voice, no autonomous assistant, no persistent conversation
  memory — those are separate future work.
