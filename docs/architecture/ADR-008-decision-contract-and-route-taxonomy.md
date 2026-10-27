# ADR 0008: Decision Contract and 10-Route Taxonomy for Sophia

- **STATUS:** ACCEPTED (Ratified for Gate G12.1 / Milestone M4 on 2026-10-27)
- **DECISION:** Extend Sophia's route taxonomy to 10 canonical routes with typed entry conditions, allowed memory scopes, and side-effect classifications.
- **SCOPE:** Gate G12.1 (Decision contract and route taxonomy) under Milestone M4 ("Sofia decides well, and you can stop her").
- **AUTHORITY:** Binding per `.agent/product-kit/MASTER_PROMPT.md` and `AGENTS.md`.

---

## 1. Context and Problem Statement

In Milestone M1 (step M1.2), Sophia introduced a minimal 5-route router (`converse`, `recall-personal`, `recall-company`, `ask-clarify`, `refuse`) to demonstrate basic conversational separation between personal preferences and company truth.

Milestone M4 establishes Sophia as the Chief Operating Officer and persistent company intelligence capable of:
1. Deep multi-source research without side effects (`research`).
2. Deterministic workspace and external system inspection via tools (`use-tool`).
3. Commissioning specialized AI employees and multi-agent councils (`delegate`).
4. Initiating and managing recurring workflows and cron jobs (`schedule`).
5. Submitting high-consequence operations to founder governance gates (`propose-for-approval`).

To prevent unauthorized side-effects, prompt-injection bypasses, and cross-scope memory pollution, every route must carry:
- **Strict Entry Conditions:** When the route is eligible to be chosen.
- **Allowed Memory Scopes:** Which memory partitions (`personal`, `company`, `role_brain`, `none`) may be retrieved or cited. Personal memory must never bleed into company, delegation, or tool execution.
- **Side-Effect Class:** Deterministic operation classification (`read_only`, `internal_write`, `external_reversible`, `external_hard_to_reverse`, `financial_legal`, `destructive_security`).
- **Fail-Closed Fallback:** An unknown route, malformed generation, or uncalibrated confidence must fail closed to structured clarification (`ask-clarify`).
- **Single Router Invariant:** Extensions must build upon the existing `SophiaIntentClassifier` and `src/lib/server/sophia/types.ts`. Creating a parallel or secondary router is strictly forbidden.

---

## 2. Decision: The 10-Route Taxonomy

The canonical `SophiaRoute` union is formally extended from 5 to 10 routes:

```typescript
export const SOPHIA_ROUTES = [
  'converse',
  'recall-personal',
  'recall-company',
  'research',
  'use-tool',
  'delegate',
  'schedule',
  'ask-clarify',
  'propose-for-approval',
  'refuse',
] as const;

export type SophiaRoute = (typeof SOPHIA_ROUTES)[number];
```

### Detailed Route Specifications

| Route | Title | Description | Entry Conditions | Allowed Memory Scopes | Side-Effect Class | Requires Approval |
|---|---|---|---|---|---|---|
| **`converse`** | Conversational Dialogue | Casual chat, greetings, pleasantries, banter, open-ended discussion with zero side-effects. | Utterance is general conversational chat, greeting, or open dialogue not seeking structured operational action or data query. | `['none']` | `read_only` | No |
| **`recall-personal`** | Personal Mind Recall | Retrieval of Founder personal preferences, habits, personal notes, or private schedule. | Utterance explicitly targets Founder personal habits, preferences, private notes, family/pets, or personal routines. | `['personal']` | `read_only` | No |
| **`recall-company`** | Company Brain Recall | Retrieval of company operational state, financial metrics (MRR/ARR/burn/runway), canonical facts, SOPs, PRDs, precedent, or activity. | Utterance queries company status, metrics, verified facts, knowledge, active workflows, or past incident precedents. | `['company']` | `read_only` | No |
| **`research`** | Deep Domain Research | Multi-source fact-finding, market exploration, literature review, or analytical synthesis without external mutations. | Utterance requests research, investigation, synthesis, or competitive/technical domain analysis. | `['company', 'role_brain']` | `read_only` | No |
| **`use-tool`** | Deterministic Tool Execution | Invocation of an authorized tool or workspace reader (e.g., GitHub read, file system inspection, database query). | Utterance requires querying or inspecting an external system, repo, or workspace via a defined tool interface. | `['company']` | `read_only` (or `internal_write`) | No for read; Yes if mutating |
| **`delegate`** | Specialist Role Delegation | Assignment of a structured directive or workflow to an AI employee specialist (`researcher`, `pm`, `finance`, `coo`). | Utterance commissions a multi-step project, task, PRD authorship, financial model, or specialist deliverable. | `['company', 'role_brain']` | `internal_write` | No for dispatch; steps policy-gated |
| **`schedule`** | Workflow Automation Scheduling | Creation, modification, pausing, or management of recurring workflows (`ScheduledWorkItem`) and heartbeats. | Utterance requests recurring cadence, timed reminders, calendar routines, or periodic monitoring schedules. | `['company']` | `internal_write` | No for draft; Yes for live external triggers |
| **`ask-clarify`** | Structured Clarification | Presentation of structured options when intent is ambiguous, parameters are missing, or model output is invalid. | Utterance has open scope boundaries, references multiple candidate targets, or upstream model output failed the shape/route gate. | `['none']` | `read_only` | No |
| **`propose-for-approval`** | Governance Gate Proposal | Formal proposal of high-impact side effects, external mutations, financial expenditures, or production deploys for Founder sign-off. | Utterance ratifies, rejects, or triggers an action that crosses a governance side-effect boundary (financial, public, deploy, destructive). | `['company']` | `external_communication` / `financial_action` / `high_impact_action` | **Yes (Always)** |
| **`refuse`** | Security Refusal | Deterministic rejection of hostile prompt injections, privilege escalations, gate bypasses, or out-of-bounds actions. | Utterance contains instruction override patterns, attempts to extract credentials/secrets, requests unauthorized financial transfers, or violates invariants. | `['none']` | `read_only` | No |

---

## 3. Core Architectural Invariants

### 3.1 Personal Memory Exclusion
The Founder's Personal Mind (`SophiaMemoryStore`) is strictly accessible **only** under `recall-personal`. It is prohibited under `recall-company`, `research`, `use-tool`, `delegate`, and `schedule`. AI employees, council directives, and tools have **zero** access to Personal Mind.

### 3.2 Single Router / No Parallel Dispatcher
All conversational ingress passes through `SophiaIntentClassifier`. The router evaluates semantic intent, enforces pre-routing filters, invokes the model within structural trust boundaries (`<founder_utterance>`), and validates output through `isValidProposalShape`. No secondary or shadow router is permitted.

### 3.3 Fail-Closed to Clarification
Any output from a live model that:
1. Returns a route outside `KNOWN_ROUTES`,
2. Fails JSON schema validation or shape gates,
3. Emits a non-numeric or out-of-bounds confidence score (`[0, 1]`), or
4. Fails to parse completely,
**immediately fails closed** to `ask-clarify`. Under no circumstances may an unknown route default to `converse`, execute tools, or trigger mutations.

### 3.4 Pre-Classification Security Immunity
Prompt injection attempts (`INJECTION_PATTERN`) and ambiguous open-ended requests (`AMBIGUOUS_PATTERNS`) are intercepted deterministically **before** model invocation, guaranteeing consistent safety and reliability even when LLM providers are offline.

---

## 4. Consequences and Validation

- **Backward Compatibility:** All 5 existing M1.2 routes remain valid and unchanged in their core behavior.
- **Verification:**
  - Unit tests covering all 10 routes in `tests/sophia/g12_1_decision_contract_and_route_taxonomy.test.ts`.
  - Regression verification of M1.2 routes in `tests/sophia/m1_2_minimal_router.test.ts`.
  - Fail-closed verification for unknown routes and invalid output formats.
