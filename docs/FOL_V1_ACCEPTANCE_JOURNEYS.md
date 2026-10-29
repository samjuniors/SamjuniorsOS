# FOL_V1_ACCEPTANCE_JOURNEYS.md — Founder Operating Loop v1 Acceptance Journeys & Success Metrics

**Status:** AUTHORITATIVE & RATIFIED SPECIFICATION (Step G5.1)  
**Governing Authority:** `AGENTS.md`, `PRODUCT.md`, `VISION.md`, Founder Ratification `G0.2` (Option C)  
**Scope:** Founder Operating Loop v1 (Cockpit, Decisions, Approvals, Activity, Executive Council, Epistemic Brain)  

---

## 1. Executive Summary & Purpose

The **Founder Operating Loop (FOL)** is the first-release operating cycle and company nervous system for SamJuniorsOS. It operationalizes the core company loop:
$$\text{Observe} \longrightarrow \text{Understand} \longrightarrow \text{Decide} \longrightarrow \text{Execute} \longrightarrow \text{Measure} \longrightarrow \text{Learn} \longrightarrow \text{Improve}$$

Per the Founder's ratified decision on **G0.2 (Option C)**, FOL v1 delivers a thin, cohesive, end-to-end slice uniting the four primary surfaces:
1. **Cockpit:** Single situational-awareness screen answering *"What needs attention right now?"*
2. **Decisions:** Structured governance inbox presenting reasoned strategic and operational choices.
3. **Approvals:** Cryptographic side-effect gate holding consequential actions until signed off by the Founder.
4. **Activity:** Chronological, append-only, server-authoritative audit trail of company events.

This document formalizes the **User Acceptance Journeys (J1–J5)** and **Measurable Success Metrics** required to certify the v1 loop as complete, trustworthy, and ready for daily operations.

---

## 2. Invariants & Non-Negotiable Boundaries

Every journey in this specification must satisfy these non-negotiable architectural rules (`AGENTS.md`):

1. **One Authoritative Company Intelligence:** Sophia is the Chief Operating Officer and single central intelligence. She is not an isolated chatbot, and realtime voice is an ephemeral interface, not a second Sophia.
2. **Deterministic Governance Over Models:** Probabilistic models propose; deterministic server code verifies, authorizes, gates, and commits.
3. **Zero Fabricated Data:** Telemetry, metrics, and activity events must originate from verified server persistence (`Prisma` / SQLite / PostgreSQL / Durable store). Mock arrays and client simulations must never be displayed as real company state.
4. **Cryptographic Payload Binding:** Consequential side effects require SHA-256 canonical tuple hashing (`payloadHash = sha256(canonical(workflowInstanceId, stepId, payload))`). Tampering with a single byte fails closed.
5. **Voice Refusal on Approvals:** Approvals cannot be granted through voice commands. Voice can propose, but only the authenticated visual panel with Founder identity can authorize side effects.
6. **Strict Memory Partitioning:** Sophia Personal Mind (founder's private notes and preferences) and SamJuniors Company Brain (verified facts and institutional memory) remain strictly isolated. AI employees access only projected Company Brain slices.
7. **Append-Only Durability:** Every decision, approval, state change, and agent run survives process restarts, crashes, and redeployments.

---

## 3. Acceptance Journeys

### Journey 1 (J1): Cockpit Morning Ingress & Situational Awareness
*The founder opens SamJuniorsOS at the start of the day to understand immediate company health, open alerts, and active work without noise.*

```
+-----------------------------------------------------------------------------------+
| FOUNDER (Sam)                                                                     |
|   | 1. Opens app / browser                                                        |
|   v                                                                               |
| [ COCKPIT SURFACE ]                                                               |
|   |-- Synchronizes telemetry with server (GET /api/system/health, /api/attention) |
|   |-- Renders Sophia Voice/Presence badge ("Active", "Healthy")                   |
|   |-- Displays Attention Deck:                                                    |
|   |     * Blocked workflows                                                       |
|   |     * Pending decisions awaiting choice                                       |
|   |     * Side effects awaiting cryptographic sign-off                            |
|   |-- Renders Company Health & Spend:                                             |
|   |     * Model token spend vs. daily ceiling ($X / $Y)                           |
|   |     * Scheduler heartbeat status (Fresh, running background monitors)         |
|   \-- Shows Active Workstreams (no synthetic node animations)                     |
+-----------------------------------------------------------------------------------+
```

#### Detailed Execution Steps
1. **Access:** Founder navigates to the root application (`/`) via browser or desktop shell.
2. **Telemetry Ingress:** The client dispatches authenticated requests to `/api/system/health`, `/api/attention`, `/api/workstreams`, and `/api/activity`.
3. **Presence Greeting:** Sophia displays an honest greeting based on real persistent state (e.g., *"Good morning Sam. 1 decision requires your input, and 2 scheduled monitors executed overnight."*). If no prior state exists, she greets plainly without inventing history.
4. **Attention Deck Triage:** 
   - Displays unhandled items sorted by urgency (Blocked > Decision > Approval > Review).
   - Founder clicks on any item to open the contextual deep-dive in the Inspector panel or jump directly to the Decisions/Approvals surface.
5. **Autonomous Spend & Boundary Visibility:**
   - Visual counter displays daily LLM/tool spend against the configured budget limit.
   - If the budget is exhausted, autonomous operations pause and an explicit amber warning is shown.

#### Acceptance & Pass Criteria
- [ ] **Data Authenticity:** All displayed items correspond 1:1 with database records (`AttentionItem`, `Workstream`, `ScheduledWorkItem`). Zero mock fixtures appear.
- [ ] **Empty State Clarity:** When no alerts or decisions are pending, Cockpit displays a clean, calming empty state (*"All operations nominal. No pending decisions."*) rather than placeholder cards.
- [ ] **Ingress Latency:** Full Cockpit surface renders interactive state within $\le 1500\text{ ms}$ on local/LAN connections.

---

### Journey 2 (J2): Executive Directive to Structured Council Deliberation
*The founder issues a strategic directive; Sophia coordinates bounded deliberation across specialist roles to produce a verified, high-quality specification.*

```
+-----------------------------------------------------------------------------------+
| FOUNDER (Sam)                                                                     |
|   | 1. Issues verbal or text directive:                                           |
|   |    "Analyze adding Stripe Billing for Lumora subscriptions"                   |
|   v                                                                               |
| [ SOPHIA / COO ENGINE ]                                                           |
|   |-- Router classifies intent as `directive` (G12 decision engine)               |
|   |-- Ingests bounded context from Company Brain (not Personal Mind)              |
|   v                                                                               |
| [ EXECUTIVE COUNCIL DISPATCH ]                                                    |
|   |-- Dr. Aris Thorne (Researcher): Analyzes API requirements & webhook models    |
|   |-- Maya Lin (Product Manager): Drafts structured PRD & acceptance criteria      |
|   |-- Julian Cruz (Finance): Models transaction fees & margin impact              |
|   v                                                                               |
| [ CONSTITUTIONAL VERIFIER (Deterministic) ]                                       |
|   |-- Validates artifact schema, token bounds, and policy invariants              |
|   \-- Halts if verification fails; emits verified artifacts if compliant          |
|   v                                                                               |
| [ COCKPIT / WORKSTREAM UPDATE ]                                                   |
|   \-- Surfaces completed PRD & financial model for founder review                 |
+-----------------------------------------------------------------------------------+
```

#### Detailed Execution Steps
1. **Directive Ingress:** Founder enters a directive via Sophia chat bar or pushes to talk.
2. **Router Evaluation:** `/api/orchestrate` invokes the Decision Engine. Intent is parsed deterministically into route `directive`.
3. **Specialist Execution:**
   - **Dr. Aris Thorne:** Conducts technical research using verified external/internal tools and drafts a research memo citing sources.
   - **Maya Lin:** Translates research into a structured PRD with measurable acceptance criteria and user journey definitions.
   - **Julian Cruz:** Analyzes operational cost, unit margins, and billing gateway fees.
4. **Deterministic Verification:** `ConstitutionalVerifier` evaluates output artifacts against invariant rules (no hallucinated endpoints, schema conformity, bounded token size). If breached, deliberation halts with `status: verification_rejected`.
5. **Durable Commitment:** On pass, outputs are saved to `AgentRunStore` and projected into the active Workstream.

#### Acceptance & Pass Criteria
- [ ] **Role Boundedness:** All three specialist agents (Thorne, Maya, Julian) produce role-specific artifacts without cross-role leakage.
- [ ] **Zero Autonomous Mutations:** No external write or billing API call is executed during deliberation. All outputs remain typed draft proposals.
- [ ] **Verifiable Rejection:** If an agent artifact violates policy (e.g. invalid schema or policy violation), `ConstitutionalVerifier` deterministically stops execution.

---

### Journey 3 (J3): Consequential Action & Cryptographic Approval Gate
*An execution workflow proposes an external side effect (e.g., deploying code, committing to GitHub, charging a card, or sending a customer broadcast). The system locks execution behind a tamper-proof cryptographic approval gate.*

```
+-----------------------------------------------------------------------------------+
| ACTIVE WORKFLOW                                                                   |
|   | Proposes external side effect: `github_create_pull_request`                   |
|   v                                                                               |
| [ SIDEEFFECT AUTHORIZATION GATE ]                                                 |
|   |-- Computes canonical tuple hash:                                              |
|   |     payloadHash = SHA256(canonical(workflowId, stepId, payload))              |
|   |-- Persists approval record with status `awaiting_founder_approval`            |
|   \-- Halts workflow execution pending sign-off                                   |
|   v                                                                               |
| [ APPROVALS SURFACE (UI) ]                                                        |
|   |-- Displays amber badge ("Waiting on Founder")                                 |
|   |-- Renders exact diff / payload for inspection                                 |
|   v                                                                               |
| FOUNDER INTERACTION                                                               |
|   |-- Case A: Voice attempt ("Approve that PR") -> Explicit Voice Refusal         |
|   \-- Case B: Founder clicks "Approve" on authenticated UI panel                  |
|   v                                                                               |
| [ GATE VERIFICATION & EXECUTION ]                                                 |
|   |-- Server authenticates Founder session (fails closed for non-founder)         |
|   |-- Recomputes SHA-256 payload hash and compares with approval record           |
|   |-- Executes external action idempotently with unique IdempotencyRecord         |
|   \-- Appends immutable execution record to Activity Audit Ledger                 |
+-----------------------------------------------------------------------------------+
```

#### Detailed Execution Steps
1. **Proposal Generation:** A workflow step triggers a mutating integration tool.
2. **Gating:** `SideEffectAuthorizationGate` intercepts the tool call, generates a deterministic canonical SHA-256 hash of the payload, creates an `ApprovalRecord`, and transitions the step to `awaiting_founder_approval`.
3. **UI Presentation:** The Approvals surface updates in real time. The canvas node and cockpit card display the amber seal (`waiting`).
4. **Voice Rejection Test:** If Founder says *"Sophia, approve the GitHub PR"*, Sophia responds: *"Consequential actions cannot be approved by voice. Please sign off on the Approvals panel."*
5. **Panel Sign-Off:** Founder reviews payload in Approvals modal, clicks **Approve**.
6. **Cryptographic Validation:** The server endpoint (`/api/approval/decide`) verifies Founder credentials, verifies that the payload has not changed by a single bit, marks the record `approved`, and unblocks workflow execution.
7. **Idempotent Dispatch:** The external adapter executes the side effect with an idempotency key.

#### Acceptance & Pass Criteria
- [ ] **Cryptographic Integrity:** Tampering with the payload body causes immediate verification failure (`400 Bad Request / PayloadTamperedError`).
- [ ] **Zero Voice Approval:** Absolute 0% success rate of approving side-effects via audio/voice channels.
- [ ] **Presentation Alignment:** Awaiting approvals NEVER render as active or processing (`waiting` amber only).
- [ ] **Idempotent Retry:** Resubmitting the same approval action returns cached result without duplicate execution.

---

### Journey 4 (J4): Strategic Decision Resolution & Branching
*Sophia identifies an architectural or business fork requiring founder direction. She structures a formal Decision Brief and routes the company according to the Founder's choice.*

```
+-----------------------------------------------------------------------------------+
| SOPHIA / MONITORING SYSTEM                                                        |
|   | Detects fork: "Choose database hosting model (Cloud SQL vs Supabase vs Neon)" |
|   v                                                                               |
| [ DECISIONS INBOX ]                                                               |
|   |-- Renders Decision Card:                                                      |
|   |     * Title & Context                                                         |
|   |     * Option A, B, C with pros/cons and financial cost                        |
|   |     * Sophia's Reasoned Recommendation                                        |
|   |     * Downstream impact & unblocked roadmap steps                             |
|   v                                                                               |
| FOUNDER RESOLUTION                                                                |
|   |-- Founder selects Option B ("Supabase") via UI or Spotlight                   |
|   v                                                                               |
| [ DECISION STORE & REASONING LEDGER ]                                             |
|   |-- Writes choice, timestamp, and founder identity to `DecisionRecord`          |
|   |-- Closes Decision inbox item                                                  |
|   |-- Dispatches downstream event to unblock dependent roadmap steps              |
|   \-- Emits Activity entry with full provenance link                              |
+-----------------------------------------------------------------------------------+
```

#### Detailed Execution Steps
1. **Decision Registration:** A system workflow or Sophia registers a decision brief (`POST /api/decisions`).
2. **Inbox Notification:** The item appears in Cockpit Attention Deck and Decisions Surface.
3. **Founder Review:** Founder inspects options, trade-offs, and Sophia's recommendation.
4. **Commitment:** Founder selects an option. The client dispatches `POST /api/decisions/:id/resolve` with `{ selectedOption: "B" }`.
5. **Downstream Unblocking:** The decision store durably commits the selection. Dependent workflows subscribed to this decision ID automatically advance.

#### Acceptance & Pass Criteria
- [ ] **Structured Options:** Every decision presents at least 2 distinct mutually exclusive choices plus context.
- [ ] **Durable Recording:** Decision selection persists across restarts. Once resolved, it cannot be mutated without a formal supersession record.
- [ ] **Activity Provenance:** An activity event is emitted linking directly to `decisionId`.

---

### Journey 5 (J5): Epistemic Truth, Durable Audit & Crash Recovery
*The system experiences an unexpected crash or container restart while an approval is pending and background tasks are running. The system recovers with 100% data integrity.*

```
+-----------------------------------------------------------------------------------+
| RUNNING SYSTEM (Pending Approvals, In-Flight Workstreams, Unread Activity)        |
|   |                                                                               |
|   x ---> SIMULATED CRASH / PROCESS TERMINATION (SIGKILL)                          |
|                                                                                   |
| SYSTEM RESTART                                                                    |
|   | 1. Server boots up (`npm start` / Express startup)                            |
|   | 2. Re-establishes Prisma / DurableFileStore connection                        |
|   | 3. Runs Startup Recovery:                                                     |
|   |    * Re-indexes `ApprovalRecord` table (all `awaiting` state preserved)       |
|   |    * Verifies Activity ledger hash chain anchor                               |
|   |    * Resumes scheduler heartbeat                                              |
|   v                                                                               |
| FOUNDER RE-CONNECTS                                                               |
|   |-- Cockpit loads state: 0 items lost, 0 corrupted records                      |
|   \-- Approvals remain in exact same state awaiting sign-off                      |
+-----------------------------------------------------------------------------------+
```

#### Detailed Execution Steps
1. **Crash Simulation:** System process is killed while approvals are queued and activity events are logging.
2. **Cold Boot:** The server boots up cleanly.
3. **Ledger Integrity Check:** Audit store verifies the integrity of the append-only event log and anchor sequences.
4. **State Reconciliation:** Workflows previously in `awaiting_founder_approval` maintain their exact state and payload hashes.
5. **Re-connection:** Founder reloads the web application. Cockpit and Approvals reflect the true, uncorrupted server state.

#### Acceptance & Pass Criteria
- [ ] **Zero Data Loss:** 100% of approved, pending, and resolved records survive process restarts.
- [ ] **Ledger Hash Consistency:** Audit chain anchor validation passes cleanly without sequence drift.
- [ ] **No Zombie Executions:** Workflows paused for approval do not execute behind the scenes during downtime.

---

## 4. Measurable Success Metrics

The following metrics define the strict quantitative bar for v1 loop release acceptance:

| Metric Category | Target Value | Verification Method | Enforcement Layer |
|---|---|---|---|
| **Data Authenticity** | **100% server-authoritative** (0% mock/synthetic fixtures displayed as real) | Code audit of all UI fetch hooks + payload contract testing | Server API + UI Adapter |
| **Side-Effect Gating** | **100% fail-closed** (0 side-effects execute without valid approval record) | Automated security fuzzing & unapproved execution test | `SideEffectAuthorizationGate` |
| **Payload Binding** | **100% SHA-256 match** (1 bit change $\rightarrow$ reject) | Unit tests with corrupted payloads | `verifyApprovalPayloadBinding` |
| **Voice Approval Resistance** | **0% voice authorization rate** (100% voice attempts refused) | Speech-to-intent test cases with approval directives | Realtime Gateway + Sophia Router |
| **Cockpit Telemetry Latency** | **$P_{95} \le 1500\text{ ms}$** on local/staging networks | Automated performance benchmark suite | Express Route Handlers |
| **Decision Dispatch Latency** | **$P_{95} \le 800\text{ ms}$** (local router) / $\le 2500\text{ ms}$ (remote LLM) | Telemetry metric logging (`turn_latency_ms`) | Decision Engine Router |
| **Audit Ledger Integrity** | **100% hash chain validity** across reboots and compaction | Cryptographic hash sequence verification test | `AuditTrailStore` |
| **Crash Recovery Parity** | **0% state loss** across simulated restart | Pre- and post-restart automated state diff test | `DurableFileStore` / Prisma |

---

## 5. UI Surface State Matrices

To ensure UX clarity (preventing jarring flashes or misleading UI states), each surface must implement the three mandatory operational states (`StandardSurfaces.tsx`):

### 1. Cockpit
- **Loading:** Pulsing cyan telemetry loader with message *"Synchronizing company operational state..."*
- **Empty:** *"All operations nominal. No unhandled alerts or pending decisions."*
- **Error:** *"Telemetry Stream Disrupted. Could not synchronize state with authoritative server."* + `Retry Sync` button.

### 2. Decisions
- **Loading:** *"Retrieving open decision briefs..."*
- **Empty:** *"No open decisions. The company is operating within verified parameters."*
- **Error:** *"Failed to retrieve decision inbox. Governance queue inaccessible."* + `Retry` button.

### 3. Approvals
- **Loading:** *"Verifying pending cryptographic authorization gates..."*
- **Empty:** *"No pending approvals. Zero consequential actions are waiting for sign-off."*
- **Error:** *"Authorization gate unreachable. Consequential operations held locked."* (Fails closed!).

### 4. Activity
- **Loading:** *"Streaming immutable audit ledger..."*
- **Empty:** *"No activity recorded for this period."*
- **Error:** *"Audit stream unavailable. System activity view temporarily disconnected."*

---

## 6. Founder Verification & Sign-Off Protocol

To close Step G5.1 and advance the milestone, this document requires explicit review by the Founder:
1. Verify the five acceptance journeys represent the desired v1 Founder Operating Loop.
2. Confirm the measurable success criteria and performance thresholds.
3. Ratify this document as the binding contract for downstream steps G5.2 (UX flows), G5.3 (vertical slice implementation), and G5.4 (browser testing).
