# ADR 0011: AI Employee Model, Governance Boundaries, and Execution Substrate Evaluation

- **STATUS:** PROPOSED & READY FOR FOUNDER APPROVAL
- **DECISION:** Implement a unified 7-pillar AI Employee Model natively within SamJuniorsOS, governed by strict deterministic boundaries per `PRODUCT.md` Sections 7 and 8 (`Role Brain != Company Truth` and `Self-Improving != Self-Authorizing`). Adopt Paperclip's organizational strengths (hierarchical org chart, supervisor reporting lines, hard-stop budgets, and pause/terminate states) into our native schema, but explicitly reject adopting Paperclip as a second execution runtime to eliminate the **Second-Engine Risk**. Paperclip is retained solely as an optional onboarding/import specification for future employee declarations.
- **SCOPE:** Gate G13.1 (Milestone M7 — Sofia's first employee)
- **AUTHORITY:** Highest engineering priority per `AGENTS.md` Sections 1, 3, 4, 7, 11, 14, and `PRODUCT.md` Sections 7 & 8.

---

## 1. CONTEXT & PROBLEM STATEMENT

With Milestone M6 (Capability Registry, MCP Client, Skills Loader, Sandbox, and Gateway Budget Guards) successfully closed and shipped to `main`, SamJuniorsOS advances to Milestone M7: **Sofia's first employee**.

Historically, AI agents across existing open-source frameworks operate either as uncoordinated prompt loops, chaotic agent-to-agent chat meshes, or isolated bots with ambient unrestricted access. These approaches introduce critical organizational and architectural vulnerabilities:
1. **Unbounded Autonomy & Spend:** Autonomous agents spinning in unsupervised loops without hard-stop financial ceilings or supervisor kill-switches.
2. **Memory Poisoning & Hallucination:** Agents mistaking subjective working scratchpads for authoritative company truth, contaminating shared knowledge bases.
3. **Self-Authorization Vulnerability:** Agents modifying their own tool grants, elevating their own permission scopes, or bypassing founder approval under the guise of "self-improvement".
4. **Second-Engine Drift:** Introducing third-party agent orchestration frameworks that introduce parallel state stores, competing schedulers, and duplicate communication buses.

To establish a resilient, production-ready foundation for AI employees, SamJuniorsOS requires an authoritative architecture decision governing the **Employee Model**, enforcing non-negotiable governance principles from `PRODUCT.md`, and formally resolving the execution substrate strategy regarding Paperclip.

---

## 2. THE SEVEN PILLARS OF THE EMPLOYEE MODEL

Every AI employee instantiated in SamJuniorsOS is governed by a typed, immutable aggregate model comprised of seven distinct pillars:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AI EMPLOYEE MODEL                               │
├────────────────────────────────────────────────────────────────────────┤
│ 1. IDENTITY & CHARTER      Role, Title, Mission, Boundaries, L0-L3     │
│ 2. PERMISSIONS             Capability Allowlists, Least Privilege      │
│ 3. ROLE BRAIN (G11.5)      Working & Experience Memory, Isolated       │
│ 4. BUDGET & HARD-STOPS     Monthly/Daily Spend Caps, Max Task Cost     │
│ 5. SUPERVISOR HIERARCHY    Sophia Supervision, Structured Delegation   │
│ 6. PERFORMANCE RECORD      Evaluations, Graded Outputs, Error Rates    │
│ 7. VERSION & ROLLBACK      Semver vX.Y.Z, Immutable History, Rollback  │
└────────────────────────────────────────────────────────────────────────┘
```

### Pillar 1: Identity & Charter
- **Role & Identifier:** Stable identifier (e.g. `employee:engineer:codex_1`, `employee:support:helper_1`, `researcher`, `pm`, `finance`).
- **Charter & Mission:** Explicit, bounded statement of purpose and operational scope.
- **Boundaries & Prohibited Actions:** Hard constraints specifying what the employee may NEVER do (e.g., an Engineer cannot deploy directly to production; a Support employee cannot issue refunds without approval).
- **Autonomy Ceiling:** Formal level assignment (`L0: Read-Only / Inactive`, `L1: Draft / Assist`, `L2: Autonomous within Sandbox / Branch`, `L3: High Autonomy with Pre-Approved Thresholds`). Initial hires are strictly bounded at L1 or L2 (branch only) per G0.6.

### Pillar 2: Permissions & Least Privilege
- **Capability Allowlist:** Explicit list of capability IDs (`tool:*`, `skill:*`, `mcp:*`) that the employee is permitted to invoke through `CapabilityGateway`.
- **Egress Network Domains:** Bound to specific domain allowlists established in Gate G14.5.
- **Zero Client / Ambient Secrets:** Employees have NO direct access to API credentials, private keys, or raw tokens. All credentials are injected transiently at runtime by the gateway.
- **Side-Effect Interception:** Mutations classify into `read_only`, `internal_write`, `external_reversible`, `external_hard_to_reverse`, `financial_legal`, or `destructive_security`. Any non-read-only action requires founder approval unless explicitly covered by a ratified autonomy policy.

### Pillar 3: Role Brain & Memory Partitioning (G11.5)
- **Scoped Context:** Per-employee memory projected strictly from the authoritative `CompanyBrain` plus the employee's own `working` and `experience` memories.
- **Strict Isolation:** An employee cannot inspect another employee's working scratchpad or experience logs.
- **Personal Mind Exclusion:** AI employees have ZERO read or write access to the Founder's Personal Mind (`SophiaMemoryStore`).
- **Epistemic Invariant (`Role Brain != Company Truth`):** Subjective task notes and draft findings remain confined to the Role Brain and never mutate `CompanyKnowledge`, `CanonicalFact`, or `CompanyMemory` without verified epistemic promotion or founder approval.

### Pillar 4: Budget & Hard-Stop Controls
- **Hard-Stop Monthly & Daily Caps:** Exact financial spend ceilings in cents (e.g. `$50.00` monthly, `$5.00` daily).
- **Per-Task Limits:** Max tool call count (e.g. 25 calls) and max execution cost (e.g. 500¢) enforced deterministically by `CapabilityBudgetGuard`.
- **Deterministic Halt:** When a budget cap is reached, execution halts immediately with `CapabilityBudgetExceededError`. The system refuses further probabilistic spend without founder authorization.
- **Pause & Terminate Controls:** Operational switches (`active`, `paused`, `terminated`, `retired`) that can freeze an employee mid-flight with zero model dependency.

### Pillar 5: Supervisor Hierarchy & Reporting Lines
- **Sophia as Persistent Supervisor:** Sophia (persistent COO/CEO) is the primary supervisor for all company employees.
- **Structured Delegation Only:** Tasks dispatched to employees follow the strict Delegation Protocol (Gate G13.3): goal, boundaries, budget, deadline, acceptance criteria, and scoped context.
- **No Unmediated Agent-to-Agent Meshes:** Employees do NOT chat informally in peer-to-peer free-for-all loops. All cross-functional collaboration is coordinated through Sophia, structured Council deliberations, or deterministic workflow instances.
- **Structured Results:** Deliverables must be returned as typed, evidence-backed artifacts with deterministic verification.

### Pillar 6: Performance Record & Evaluation Metrics
- **Continuous Evaluation:** Tracking task outcomes, execution costs, latency, tool error streaks, and human review scores.
- **Evaluation Baseline (G13.6):** Before an employee is deployed to live work or graduated to higher autonomy, it must pass an automated benchmark suite with measurable pass/fail thresholds.
- **Audit Logging:** Every delegation, tool call, decision, and evaluation grade is immutably written to `DecisionLogStore` and `SideEffectAuditStore`.

### Pillar 7: Immutable Version History & Deterministic Rollback
- **Semantic Versioning:** Each configuration change (charter update, prompt refinement, tool grant) creates an immutable new version `vX.Y.Z`.
- **Full State Snapshot:** Every version stores a complete cryptographic snapshot of the employee's configuration, prompt templates, and capability grants.
- **Instant Rollback:** If an updated employee exhibits degraded performance or unwanted drift, the founder can trigger a single deterministic command to roll back immediately to any prior verified version.

---

## 3. GOVERNANCE BOUNDARIES: PRODUCT.MD SECTIONS 7 & 8

This architecture decision explicitly adopts and operationalizes the core safety principles established in `PRODUCT.md`:

### 3.1 Section 7: `ROLE BRAIN != COMPANY TRUTH`
- **Principle:** `CompanyBrain` is the governed, shared source of company truth: canonical facts, verified policies, strategic priorities, and historical decisions. `Role Brains` are per-employee derived context built *from* the Company Brain.
- **Enforcement:**
  1. An employee's internal reasoning, draft summaries, and working memory records are classified as subjective scratchpads.
  2. Subjective records cannot directly overwrite canonical company state.
  3. Knowledge synthesized by an employee must traverse the epistemic pipeline (`Source -> Signal -> Claim -> Verified Fact`) or obtain founder approval before becoming company truth.

### 3.2 Section 8: `SELF-IMPROVING != SELF-AUTHORIZING`
- **Principle:** AI employees should improve over time through structured learning loops (work -> measure -> evaluate -> identify gaps -> propose upgrade -> evaluate -> founder approve -> deploy -> measure). However, **self-improving must NEVER mean self-authorizing**.
- **Enforcement:**
  1. An employee may propose skill improvements, suggest prompt adjustments, or request additional tool access.
  2. An employee can **NEVER** silently grant itself new permissions, elevate its autonomy level, increase its spend caps, bypass founder approval gates, or modify historical records.
  3. Every permission modification and version advancement requires deterministic verification and explicit founder authorization.

---

## 4. COMPARATIVE EVALUATION: PAPERCLIP AS EXECUTION SUBSTRATE VS NATIVE SUBSTRATE

On 2026-10-20, the founder noted:
> *"first product take over by sofia but yes for future we can use paperclip onboarding"*

In accordance with Gate G13.1 exit requirements, this section evaluates adopting Paperclip as the employee execution substrate versus SamJuniorsOS's native execution architecture, and formally assesses the **Second-Engine Risk**.

### 4.1 Overview of Paperclip's Strengths
Paperclip provides a compelling organizational model for agentic companies:
- **Org Chart & Reporting Lines:** Clear hierarchical relationships between agents, managers, and directors.
- **Budget Hard-Stops:** Strict spend thresholds that pause agent activity when monthly budgets are exhausted.
- **Pause/Terminate Lifecycle:** Explicit operational states allowing administrators to pause or kill agent execution.
- **Role Charters:** Declarative specifications of agent purpose, responsibilities, and allowed tools.

### 4.2 The Second-Engine Risk Analysis

Adopting Paperclip as an **active execution engine** alongside SamJuniorsOS introduces unacceptable architectural complexity and risks:

| Dimension | SamJuniorsOS Native Substrate | Paperclip as Execution Substrate | Second-Engine Risk Assessment |
|---|---|---|---|
| **Authoritative State** | Single PostgreSQL / SQLite store (`Prisma`, `CompanyBrainStore`) | Dual stores: SamJuniorsOS DB + Paperclip internal database | **CRITICAL:** High risk of split-brain state, desynchronized memory, and orphaned task runs. |
| **Scheduler & Concurrency** | Deterministic `SchedulerEngine` with distributed shared leases | Paperclip background daemon / event loop | **HIGH:** Competing background workers, lock contention, and divergent task scheduling. |
| **Governance & Approvals** | `SideEffectAuthorizationGate` with cryptographic SHA-256 bound payloads | Paperclip built-in approval hooks | **CRITICAL:** Bypasses canonical `payloadHash` binding, weakening the tamper-evident audit ledger. |
| **Cognitive Ingress** | Unified `executeSophiaTurn` cognitive pipeline | Parallel Paperclip agent loop | **HIGH:** Breaks the "ONE Sophia" invariant (`AGENTS.md` §3), creating parallel brains. |
| **Epistemic Truth** | Native claim verification (`CanonicalFact`, `EpistemicClaim`) | Untyped agent memory / message logs | **HIGH:** Bypasses the epistemic pipeline; allows unverified agent claims to leak across the system. |
| **Maintenance Overhead** | Single integrated TypeScript codebase | External multi-service orchestration layer | **HIGH:** Divergent dependency lifecycles, complex local/cloud sync, and duplicate tooling. |

### 4.3 Architectural Verdict & Founder Guidance Reconciliation

**VERDICT: REJECT Paperclip as an active runtime execution engine; ADOPT Paperclip as an external Onboarding & Declaration Specification.**

1. **Native Execution Substrate:** All employee execution, task scheduling, capability routing, memory recall, and budget gating remain 100% native to SamJuniorsOS (`WorkflowRuntime`, `CapabilityGateway`, `RoleBrainStore`, `SideEffectAuthorizationGate`). This maintains the non-negotiable invariant of **ONE Sophia, ONE Company State, and Deterministic Governance** (`AGENTS.md` §3).
2. **Paperclip Concept Assimilation:** We natively implement Paperclip's best organizational patterns directly in `src/types/employee.ts` and `src/lib/server/employees/`:
   - Hierarchical org chart reporting to Sophia.
   - Deterministic hard-stop daily and monthly spend budgets.
   - Pause, terminate, and rollback switches.
   - Structured charter definitions.
3. **Paperclip Onboarding Adapter (Future):** In alignment with the founder's guidance, we will provide an onboarding schema importer (`PaperclipEmployeeImporter`) that can ingest Paperclip-formatted role declarations and transpile them into native `EmployeeModel` definitions without running Paperclip's orchestration runtime.

---

## 5. DATA CONTRACTS & TYPE ARCHITECTURE

The employee model is codified in `src/types/employee.ts` with strict Zod validation:

```typescript
// Core Employee Model Contract (src/types/employee.ts)
export interface EmployeeModel {
  id: string;                                   // e.g. "employee:engineer:codex_1"
  version: string;                              // Semantic version "1.0.0"
  status: EmployeeStatus;                       // "draft" | "pending_approval" | "active" | "paused" | "terminated" | "retired"
  identity: EmployeeIdentity;                   // Name, title, avatar, created timestamp
  charter: EmployeeCharter;                     // Mission, responsibilities, boundaries, autonomy ceiling
  permissions: EmployeePermissions;             // Capability allowlists, memory scopes, side-effect rules
  roleBrainConfig: EmployeeRoleBrainConfig;     // Working memory capacity, projection rules
  budget: EmployeeBudget;                       // Monthly/daily hard stops, task caps, active spend
  supervisor: EmployeeSupervisor;               // Supervisor ID (Sophia), review policy
  performanceRecord: EmployeePerformanceRecord; // Evaluation history, error rates, task metrics
  versionHistory: EmployeeVersionRecord[];      // Immutable cryptographic snapshots
  updatedAt: string;
}
```

---

## 6. RISK & MITIGATION MATRIX

| Risk | Impact | Mitigation in this ADR |
|---|---|---|
| **Rogue Capability Expansion** | High | Capabilities must be explicitly enumerated in `permissions.allowedCapabilities`. Any attempt to call unauthorized tools fails closed in `CapabilityGateway`. |
| **Runaway Spend** | High | Deterministic daily and monthly budget caps in cents. Hard stop halts execution immediately when breached without model involvement. |
| **Memory Drift & Poisoning** | High | `Role Brain != Company Truth`. Working scratchpads are strictly isolated. Promoting claims to company truth requires founder approval or the epistemic pipeline. |
| **Unapproved Self-Modification** | High | `Self-Improving != Self-Authorizing`. Version upgrades, charter modifications, and tool grants require cryptographic founder approval. |
| **Second-Engine Complexity** | High | Paperclip rejected as an execution substrate; concepts integrated natively; Paperclip scoped solely to optional onboarding declarations. |

---

## 7. DOWNSTREAM ROADMAP & NEXT ACTIONS

Upon founder approval of this ADR:
1. **G13.2 (Employee Lifecycle):** Implement employee creation, founder approval gate, activation, pause, terminate, and deterministic rollback to prior versions.
2. **G13.3 (Delegation Protocol):** Build structured task contracts (goal, boundaries, budget, acceptance criteria) and evidence-backed structured results.
3. **G13.4 (Team View & Performance Record):** Expose real-state team dashboards showing employee status, costs, latency, and decision log links.
4. **G13.5 (Per-Employee Least Privilege):** Enforce strict capability allowlists and isolated memory partitions per employee.
5. **G13.6 (Evaluation Baseline):** Construct the pre-deployment benchmark suite measuring role accuracy and safety boundaries.
6. **G13.7 (First Employee Hired):** Hire and evaluate the first AI employee (e.g. Engineer or existing specialist) against the baseline.
7. **G13.8 (Employee Evaluation Gate):** Final verification and founder review of the operational employee.
