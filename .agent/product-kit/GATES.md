<!-- Generated from gates.json by "node .agent/product-kit/kit.mjs render". Do not edit by hand. -->

# Gate roadmap

**Gates are bookkeeping groups of steps. They are NOT the order of work and nobody starts "a gate".** The order of work is the milestones in `MILESTONES.md`; the agent finds it by running `node .agent/product-kit/kit.mjs continue`. Live status: `node .agent/product-kit/kit.mjs status`.

## Dependency waves (reference only, not the order of work)

Which gates depend on which. Use it to understand dependencies; to know what to do next, run `continue`.

| Wave | Gates |
|---|---|
| 0 | G0 Direction and decisions; G1 Baseline integrity |
| 1 | G2 Persistence and deployment foundation (Phase 2.3C); G3 Security for real users; G4 Single company brain; G8 UX and UI production polish |
| 2 | G11 Memory system (personal, company, per-employee, persistent); G12 Decision engine; G5 Core loop v1 (Founder Operating Loop); G7 Windows node |
| 3 | G14 Capability layer (tools, skills, MCP); G13 AI workforce (employees Sofia manages); G6 Sofia live conversation; G9 Release readiness (private beta) |
| 4 | G15 Product ownership (Sofia runs a product end to end); G10 Public productization (conditional) |
| 5 | G16 Vision acceptance |

## G0 - Direction and decisions

Settle the founder decisions that block later gates. Agents prepare briefs; only the founder decides.

Requires: nothing

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G0.5 | quality | work | Independent fact-check of the decision briefs (a second agent session checks facts and sources) | - | A session that did not write the briefs checks every Verified and Reported claim in .agent/product-kit/briefs/ against its source, marks any it cannot confirm, and records PASS in the verify file. The briefs are drafted and do not block the founder's decisions. |
| G0.1 | founder | decision | DECISION: product boundary - internal-only or also a public product | - | Founder decision recorded via 'decide' (the brief in briefs/G0.1-product-boundary.md is pre-drafted). If internal-only, also run 'ack NA-G10'. PRODUCT.md section 1 is edited only with founder approval. |
| G0.2 | founder | decision | DECISION: ratify the Founder Operating Loop v1 release direction | - | Founder decision recorded; ROADMAP.md and PRODUCT.md updated to match. The Linear proposal must be read first; if it cannot be fetched, mark NOT READ. |
| G0.3 | founder | decision | DECISION: infrastructure - hosting model, database, RPO/RTO, backup retention, budget | - | Founder decision recorded with concrete values for each field. |
| G0.4 | founder | decision | DECISION: Sofia's name and title (COO or CEO) | - | Founder decision recorded. Any change to the COO boundary in PRODUCT.md is made only with the founder's approval and an ADR. |
| G0.6 | founder | decision | DECISION: first AI employee roles, their order, and each role's autonomy ceiling | - | Founder decision recorded: which roles to hire first and in what order, with a maximum autonomy level per role. Each hire still needs its own approval (PRODUCT.md section 2). |
| G0.7 | founder | decision | DECISION: autonomy policy limits - what Sofia may do alone, spend caps, public and customer-facing rules, deploy rules, kill-switch behaviour | - | Founder decision recorded with concrete numbers and rules for each action class in VISION.md section 6. |
| G0.8 | founder | decision | DECISION: which provider to try first for live open-topic conversation, and the monthly voice budget | - | Founder decision recorded: the candidates to measure first and a monthly voice budget. The final provider is chosen from the G6.2 measurements. Options are in briefs/G0.4-identity-title-provider.md (provider section). |
| G0.9 | founder | decision | DECISION: which product Sofia takes over first | - | Founder names the product. The persistence design calls Lumora 'Product 1 of SamJuniors'; confirm whether that is the one. |

## G1 - Baseline integrity

Make the repository trustworthy for agents and CI before anything new is built. No founder decision required.

Requires: nothing

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G1.1 | quality | work | One canonical test command covering all test files, failing non-zero on any failure | - | A documented 'test' script runs every test file under tests/ (including .test.ts and the runner-specific suites); the exit code is 0 on a clean tree and non-zero when a test is deliberately broken; counts are printed; kit.config.json "checks" lists the real commands that must pass before anything lands on main (this test command, lint, typecheck, build); suites that only run under Bun are listed with the reason, per the runner divergence noted in PROGRESS.md. |
| G1.2 | platform | work | CI on pull requests: install, lint, typecheck, build, full tests, secret scan | G1.1, G1.3 | Workflow runs on a PR and is green; a failing step blocks. Only 4 test files run in CI today. |
| G1.3 | security | work | Full-history secret scan and classification of the 5 test-fixture hits | - | Scanner report over the full git history with every finding classified (fixture, revoked, or live); no unexplained finding; the chosen scanner and command are recorded so CI can reuse them. |
| G1.4 | quality | work | Reconcile documentation with code (voice status, README quickstart, SETUP.md) | - | Each contradiction listed with file evidence and resolved; no doc claims an unverified status; PROGRESS.md entry written. |
| G1.5 | platform | work | Honest fallback: a deterministic reply must never look like a live model reply | - | Reproduce on current main first. Fallback replies are visibly labelled in the UI and API; regression test added. If not reproducible, record evidence and close. |
| G1.6 | platform | work | Reproducible install: canonical package manager, clean-clone setup verified on Windows and Linux | - | Clean clone to running app verified in CI on Linux and by evidence on Windows; SETUP.md matches; the win32-only dependency handled per evidence. |

## G2 - Persistence and deployment foundation (Phase 2.3C)

Authoritative multi-instance persistence and a verified deploy path, per the approved Phase 2.3B design.

Requires: G1

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G2.1 | platform | work | Provision staging hosting and database per the infrastructure decision | needs G0.3, needs AUTH-2.3C | Staging environment reachable; configuration recorded without secrets. |
| G2.2 | platform | work | Prisma to PostgreSQL with versioned migrations | G2.1, needs AUTH-2.3C | prisma/migrations exists and applies cleanly to an empty database; schema matches the 2.3B design. |
| G2.3 | platform | work | Migrate file-backed stores (decisions, council, conversations, personal memory) with verified parity | G2.2, needs AUTH-2.3C | Parity tests old vs new; rollback rehearsed; no data loss on a seeded dataset. |
| G2.4 | platform | work | Multi-instance concurrency: shared leases replace the PID guard | G2.3, needs AUTH-2.3C | Two instances against one database pass the concurrency suite; the PID guard is no longer load-bearing. |
| G2.5 | platform | work | Backup and restore drill meeting the decided RPO/RTO | G2.3, needs G0.3, needs AUTH-2.3C | A real restore into a clean environment succeeded; measured RPO/RTO recorded against the decided targets. |
| G2.6 | platform | work | Deploy pipeline with post-deploy verification of the live environment | G2.2, needs AUTH-2.3C | Pipeline deploys to staging and verifies the deployed environment, not just the local build. |
| G2.7 | platform | work | ADR: scale-later seams (owner-scoped keys, provider-neutral interfaces, no code that assumes exactly one human). Design only. | - | ADR approved by the founder; a checklist of existing stores and tables with their owner-scoping status; findings opened for gaps; no multi-founder feature is built (founder decision 2026-10-20). |

## G3 - Security for real users

Close known auth gaps and test against the agentic threat model.

Requires: G1

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G3.1 | security | work | Close the two open auth gaps (live Clerk provisioning, gate.ts allowlist fix) | - | Both gaps reproduced, fixed, and covered by tests; unauthenticated calls to privileged routes fail closed. |
| G3.2 | security | work | Threat model against the current OWASP Top 10 for Agentic Applications and LLM Top 10 | G3.1 | Fetch the current official lists. Threat model against the OWASP Top 10 for Agentic Applications (ASI01-ASI10, Dec 2025) and the OWASP LLM Top 10 (2026 edition); use the OWASP Agent Control Standard (v0.1 preview) as a design reference only. Every risk maps to a control, a test, or an accepted risk signed off by the founder. |
| G3.3 | security | work | Untrusted-ingress regression tests: transcripts, webhooks, tool output, screen text | G3.1 | Automated tests show injected instructions in each channel cannot trigger a side effect without the approval gate. |
| G3.4 | security | work | Rate limits, request size limits, security headers and CSP, dependency audit in CI | G1.2 | Headers verified on a running build; limits tested; audit step in CI. |
| G3.5 | security | work | Production secrets handling and rotation procedure | - | No secret reaches the client bundle (verified by scan); written rotation runbook tested once. |
| G3.6 | security | work | Audit-log integrity, retention and deletion flows verified end to end | G3.1 | Tamper test fails closed; deletion flow leaves no resurrectable copy in any store. Include hash-chained or otherwise tamper-evident audit (none was found in the code on 2026-10-20). |

## G4 - Single company brain

One authoritative read/write path for company state and knowledge.

Requires: G1

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G4.1 | platform | work | Company Brain as the single read and write path; retire parallel legacy paths | - | Static and runtime proof that no code path reads or writes company state outside the Brain; old paths removed. |
| G4.2 | platform | work | First-class versioned Artifact model | G4.1 | Artifact model with versions, provenance and approval linkage; tests; no fabricated artifacts. |
| G4.3 | platform | work | GitHub adapter with idempotency key and unknown-outcome handling | G4.1 | Duplicate delivery produces one effect; unknown outcome is surfaced, not assumed; tests. |
| G4.4 | quality | work | Memory retrieval benchmark as a regression gate in CI | G1.2 | Existing benchmark runs in CI with a recorded baseline and a failing threshold. |

## G11 - Memory system (personal, company, per-employee, persistent)

Persistent memory that lets Sofia talk like one continuous person while keeping the personal and company scopes apart.

Requires: G2, G4

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G11.1 | platform | work | ADR: memory architecture - scopes, partition and access rules, owner-scoped keys, provenance, confidence and supersession fields | - | ADR approved by the founder; scope-by-reader access matrix with a test plan; states that the Personal Mind and Company Brain stay partitioned (PRODUCT.md) and are read only through the routed, audited path; builds on the existing stores, adds no second store. Includes a comparison with Mem0, Graphiti, Letta and Cognee and a recorded borrow-or-adopt decision; adding a second store needs an ADR approved by the founder. |
| G11.2 | platform | work | Memory types and write policy: semantic facts, episodic summaries, procedural notes; consent rules; size and retention limits | G11.1 | Write-policy tests pass; unconfirmed candidates are never recalled as fact; personal memories keep the existing explicit-confirmation flow. |
| G11.3 | platform | work | Scope-aware retrieval: budgeted recall, ranking, source attribution, and an honest 'I do not remember' | G11.2 | Retrieval benchmark with a recorded baseline; every recalled item carries a source id; abstains when nothing relevant is found. |
| G11.4 | platform | work | Consolidation and forgetting: episodic into semantic, contradiction and supersession handling, deletion that removes derived copies | G11.3 | Tests show superseded facts are not recalled as current; after deletion no recall path (index, summary, embedding) returns the item. |
| G11.5 | platform | work | Role Brains: per-employee memory projected from the Company Brain plus the employee's own working and experience memory | G11.3 | Isolation tests: one employee cannot read another's working memory or the Personal Mind; projection is rebuilt deterministically from the Company Brain; a Role Brain never becomes company truth. |
| G11.6 | security | work | Memory poisoning and cross-scope leakage tests | G11.3 | Automated tests show untrusted text cannot become trusted memory and personal facts never appear in company artifacts or employee context; failures close, not open. |
| G11.7 | quality | work | Continuity evaluation: remembers last week, invents nothing, survives restart and redeploy | G11.4 | Scripted multi-session evaluation with founder-approved pass thresholds, run before and after a restart. |

## G12 - Decision engine

Decides what Sofia does with each input. The model proposes; deterministic policy disposes. Extends the existing intent classifier; it must not create a second router.

Requires: G1, G4

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G12.1 | platform | work | Decision contract and route taxonomy: converse, recall personal, recall company, research, use tool, delegate, schedule, ask to clarify, propose for approval, refuse | - | Typed schema and ADR that extend the existing intent kinds; every route lists entry conditions, allowed memory scopes and side-effect class; an unknown route fails closed to clarification. Compare against the existing intent kinds first; no second router. |
| G12.2 | platform | work | Router: model proposes a route with confidence, deterministic validation, deterministic fallback | G12.1 | Founder-reviewed labelled set; accuracy per route recorded; invalid model output falls back deterministically. |
| G12.3 | platform | work | Context assembly per route: choose memory scopes and budget, attach sources, enforce the Personal and Company partition | G12.2, G11.3 | Tests show company questions never pull personal memory unless the founder asked, and every answer can list which scopes it read. |
| G12.4 | security | work | Autonomy policy engine: deterministic table of action class x autonomy level x limits deciding auto, needs approval, or forbidden | G12.1, needs G0.7 | Table-driven tests; the model cannot change the policy; changing a level requires a recorded founder decision. Compare with open-source policy layers (Latch, AgentPolicy, AgentLedger) and borrow rolling per-agent action budgets if they fit. |
| G12.5 | quality | work | Routing evaluation and calibration: reliability curve and Brier score per route; thresholds that trigger clarification | G12.2 | Report with a baseline and a CI regression threshold; low-confidence routes ask instead of acting. |
| G12.6 | platform | work | Decision log and explanation: inputs, route, confidence, policy result and outcome for every decision | G12.2 | Log schema and query; 'why did you do that' is answered from log entries that are cited; no log entry means no action. |
| G12.7 | security | work | Kill switch and safe mode: one command by voice or panel freezes autonomous action and drops to read-only | G12.4 | Drill passes: stop works mid-run, workers halt, state is recorded; it also works with the model provider unavailable. |
| G12.8 | platform | work | Settings for autonomy and spend limits: editable in the app and enforced deterministically; with no value set, no autonomous model spend runs | G12.4 | A settings page edits the limits; a test proves an unset cap means no autonomous model spend and that lowering the cap stops a running task; every change is logged as a founder action. The founder said on 2026-10-20 that the daily spend cap will be adjusted in settings. |

## G14 - Capability layer (tools, skills, MCP)

One gateway through which every tool, skill and MCP server is registered, vetted, limited and audited.

Requires: G3, G12

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G14.1 | platform | work | ADR: capability registry and single gateway. Every tool, skill and MCP server has a manifest and every call passes the policy engine | - | ADR and manifest schema (permissions, side-effect class, trust tier, version pin, cost); a static check proves no direct tool-call path exists. Compare with GitLab's AI Catalog pattern (versioned agents, flows and MCP servers with group controls) and OpenClaw's skill load precedence. |
| G14.2 | platform | work | MCP client behind the gateway on the current spec revision | G14.1 | Confirm the current spec revision and SDK at implementation time (2026-07-28 was the stable one when this was written); works with one real and one fake server; calls are self-contained; an audit record per call. |
| G14.3 | platform | work | Skills loader for the SKILL.md format: versioned, reviewed, loaded on demand; skills are instructions, never authority | G14.1 | Loads a skill by name and description; a skill cannot grant permissions; activation needs a review record; version pinned. Follow the open Agent Skills spec (agentskills.io); treat community skills as untrusted. |
| G14.4 | security | work | Vetting and install pipeline for third-party tools, skills and MCP servers: provenance, permission review, sandbox, pin; no runtime self-install | G14.1 | Installing without founder confirmation is impossible; each item has a review record; community skills are treated as untrusted because malicious ones have been reported. |
| G14.5 | security | work | Sandbox and egress control: least-privilege tools, network allowlists, secrets injected at call time and never shown to the model | G14.1 | Test shows a tool cannot reach a non-allowlisted host or read another tool's secret. |
| G14.6 | platform | work | First integrations chosen by the founder (for example email, calendar, social, payments, code host), each approval-by-default | G14.2, G14.5, needs G0.7 | Each integration has a contract test, a failure-mode test and a policy row; at least one side-effect integration passes unknown-outcome tests. |
| G14.7 | quality | work | Capability evaluation: contract tests, injection through tool output, cost caps | G14.6 | CI suite; instructions injected through tool output cannot trigger an unapproved action; a cost cap stops a runaway tool loop. |

## G13 - AI workforce (employees Sofia manages)

A real team: each employee has a charter, tools, a budget, its own memory and a record, all supervised by Sofia. A managed team, not a free swarm.

Requires: G3, G11, G12

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G13.1 | platform | work | ADR: employee model - identity and charter, permissions, Role Brain, budget, supervisor, performance record, version history | needs G0.6 | ADR approved by the founder; consistent with PRODUCT.md sections 7 and 8 (self-improving is not self-authorizing). Includes a comparison with Paperclip's org chart, budget hard-stop and pause/terminate model; adopting it would add a second orchestration engine and needs an ADR approved by the founder. The founder said on 2026-10-20 that Paperclip can be used for onboarding in future: the ADR must evaluate adopting it as the employee execution substrate and state the second-engine risk. |
| G13.2 | platform | work | Employee lifecycle: propose, founder approval, create, configure, evaluate, retire, with immutable versions and rollback | G13.1 | A test proves an employee cannot be created without founder approval; each version is inspectable; rollback restores the earlier behaviour. |
| G13.3 | platform | work | Delegation protocol: structured task (goal, boundaries, budget, deadline, acceptance criteria, scoped context) and structured result with evidence | G13.1, G12.6 | Schema and tests; free-form agent-to-agent chat is not possible; every delegation is written to the decision log. |
| G13.4 | platform | work | Team topology rules: orchestrator-worker, bounded depth and fan-out, token and time budgets, effort scaling; single-threaded work for shared-context tasks such as coding | G13.3 | Fan-out and runaway tests; a budget stops a run in a test; a written rule says which task types run in parallel and which do not, backed by this system's own evaluations. Include a per-employee spend cap with a hard stop (not identified in the code on 2026-10-20). |
| G13.5 | security | work | Per-employee identity and least privilege: own scoped credentials, tool allowlist and memory partition | G13.1, G14.1 | Privilege tests: an employee cannot use another's tools or credentials; revocation is immediate. |
| G13.6 | quality | work | Per-role evaluation harness: task quality, cost per task, error rate, feeding autonomy decisions | G13.3 | Harness runs for every active role with a recorded baseline and regression gates. |
| G13.7 | platform | work | Hire employee 1 (role from G0.6) end to end, then stop and evaluate before hiring the next | G13.2, G13.5, G13.6, needs G0.6 | One role live in supervised mode with its Role Brain, evaluation baseline and founder sign-off; a gate-style report before employee 2. |
| G13.8 | frontend | work | Team view: what each employee is doing, status, cost and blockers, from authoritative state only | G13.3 | The panel shows only real state and matches the decision log; no simulated activity. |

## G5 - Core loop v1 (Founder Operating Loop)

The smallest end-to-end loop that delivers real value, with real data and real UX.

Requires: G3, G4

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G5.1 | quality | work | Write acceptance journeys and success metrics for the v1 loop | needs G0.2 | Journeys in plain language with measurable success criteria, approved by the founder. |
| G5.2 | frontend | work | UX flows for Cockpit, Decisions, Approvals and Activity including empty, loading and error states | G5.1 | Flows implemented against server state only; every state designed; no fabricated data. |
| G5.3 | platform | work | Implement the loop vertical slice end to end with real data | G5.1 | The journeys run against a real environment with real approvals and a real audit trail. |
| G5.4 | quality | work | End-to-end browser tests for every journey | G5.3 | Automated tests pass in CI for every journey; if the browser tool cannot launch, record why and use an alternative. |

## G6 - Sofia live conversation

Open-topic live voice that routes through the same governance pipeline. Voice never approves.

Requires: G2, G5, G11, G12

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G6.1 | platform | work | Provider-neutral adapter for streamed open-topic conversation | needs G0.8 | Adapter behind the existing provider interfaces; works with one provider and a fake; no provider name in core logic. |
| G6.2 | platform | work | Streaming reply into speech with barge-in and a measured latency budget | G6.1 | End-to-end latency measured on Windows with p50 and p95 recorded; barge-in verified by test. Before building barge-in or turn detection, evaluate Pipecat and LiveKit Agents (VISION.md section 12) and record the decision. |
| G6.3 | platform | work | Route conversation and operational intents through one cognitive ingress | G6.1 | Single path proven by test; operational intents still pass classifier and gateway. |
| G6.4 | security | work | Approvals only through panel or phone; voice can propose, never approve | G6.3 | A test proves a spoken approval cannot satisfy the approval gate. |
| G6.5 | frontend | work | Panel fallback when voice is unavailable, with honest presence states | G6.2 | Every presence state designed and tested, including offline. |
| G6.6 | frontend | work | Greeting on open, grounded in real state: time, last session, pending approvals, alerts. It never invents. | G6.3 | On opening the app Sofia greets within the latency budget using only real state; with no state she greets plainly; tested with empty and full state. First check whether any greeting behaviour already exists (NOT VERIFIED today). |
| G6.7 | quality | work | Persona specification and conversation-quality evaluation: natural, concise, consistent, no fabricated memories, one persona for COO and voice | G6.3, needs G0.4 | Written persona spec approved by the founder; conversation evaluation with a recorded baseline; a fabricated-memory test fails the build. |
| G6.8 | platform | work | Proactive briefing: a short, interruptible summary of what changed since the last session | G6.6 | Briefing built from the decision log and approvals only; interruptible by voice; can be turned off. |

## G7 - Windows node

Authenticated local node: read-only first, then writes behind approval.

Requires: G2, G3

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G7.1 | security | work | ADR and threat model for the authenticated local node | G14.1, needs G0.4 | ADR in doc/adr/ following the repo template; trust boundary and capability allowlist defined; node actions registered as capabilities behind the G14 gateway; founder approved. |
| G7.2 | platform | work | Read-only node: active window, window list, UI tree | G7.1 | Works on a real Windows machine; no write capability present in the build; audit record per call. |
| G7.3 | platform | work | Write actions (focus, invoke, type) each behind approval | G7.2 | Each action bound to an approved payload hash; denied without approval; tested on Windows. |
| G7.4 | platform | work | Vision fallback, sample-gated, only where the UI tree cannot identify the target | G7.3 | Sampling policy enforced and tested; frames not stored by default. |
| G7.5 | security | work | Red-team: instructions embedded in screen content | G7.3 | Documented attempts and results; all fail to trigger an unapproved action, or the failure is a blocking finding. |

## G8 - UX and UI production polish

Consistent, accessible, fast interface.

Requires: G1

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G8.1 | frontend | work | Design-system audit against the canonical visual language and fix drift | - | List of drift items with before/after evidence; tokens used consistently. |
| G8.2 | frontend | work | Accessibility audit to WCAG 2.2 AA and fixes | G5.2 | Automated and manual keyboard and screen-reader checks recorded; no open AA failures on core journeys. |
| G8.3 | frontend | work | Performance budgets enforced in CI (LCP, INP, CLS, JavaScript size) | G5.3 | Budgets set from measured baselines and enforced; core journeys meet LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1 on a mid-range test profile. |
| G8.4 | frontend | work | Responsive layout and Android path decision (PWA or native client) | needs G0.2 | Decision brief approved by the founder; chosen path verified on a real device. |
| G8.5 | frontend | work | Copy, empty states and error messages pass | G5.2 | Every error state states what happened and what to do; no raw errors shown. |

## G9 - Release readiness (private beta)

Operability and an evidence-based go/no-go.

Requires: G2, G3, G4, G5, G8, G11, G12

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G9.1 | platform | work | Observability: structured logs, metrics, error tracking, LLM cost tracking with caps | - | Dashboards or queries exist; a forced failure is visible; a spend cap stops a runaway loop in a test. |
| G9.2 | platform | work | SLOs, alerts, runbooks and incident response | G9.1 | Numeric targets approved by the founder; an alert fires in a drill; runbooks tested once. |
| G9.3 | quality | work | Failure-injection and load tests; repeat the restore drill | G9.1 | Results recorded; every failure fixed or accepted by the founder in writing. |
| G9.4 | quality | work | Operator documentation, onboarding and changelog | - | A new person can run the system from the docs alone, verified by a cold-start walkthrough. |
| G9.5 | quality | work | Release checklist run against QUALITY_BAR.md with evidence; go/no-go report | G9.2, G9.3, G9.4 | Every applicable QUALITY_BAR item has evidence or a signed exception; report delivered to the founder. |

## G15 - Product ownership (Sofia runs a product end to end)

Build, operate, market and support a real product under the autonomy ladder, starting supervised.

Requires: G9, G13, G14

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G15.1 | founder | decision | DECISION: pilot charter - success metrics, budget and kill criteria for the product named in G0.9 | needs G0.9 | Founder decision recorded with success metrics, a budget and conditions for stopping, for the product named in G0.9. |
| G15.2 | platform | work | Product as a first-class object: charter, goals, metrics, roadmap, owner, budget, risk tier, kill criteria | G15.1 | Model and tests; the pilot is created from it; no product state lives outside it. |
| G15.3 | platform | work | Build playbook: specification, implementation by a single-threaded coding agent, tests, review, deploy; production deploy behind founder approval | G15.2 | Runs on the pilot; CI gates apply; a deploy without approval is impossible. Evaluate OpenHands (MIT, sandboxed) as the engine for the Engineer employee and run it only inside its sandbox. |
| G15.4 | platform | work | Operate playbook: monitoring, incident triage, and changes through the same gates | G15.3 | A forced incident is detected, triaged and handled within the policy limits. |
| G15.5 | platform | work | Market playbook: positioning, content calendar, drafts in the brand voice, publishing only after approval, platform terms respected | G15.2 | Drafts produced for the pilot; nothing publishes without approval; brand voice is stored as memory. |
| G15.6 | security | work | Support playbook: inbox triage, drafts, escalation, resolution; customer data minimised; replies approval-gated until graduated | G15.2 | Pilot support flow works with real or realistic tickets; personal data handling reviewed; whether customers must be told they are talking to an AI is reviewed by a qualified person. |
| G15.7 | quality | work | Closed loop: metrics, decisions, actions and measured outcomes feed the decision log and employee evaluations | G15.3, G15.5, G15.6 | One full loop demonstrated on the pilot with recorded before-and-after metrics. |
| G15.8 | security | work | Autonomy graduation: raise a domain's level only by a recorded founder decision using evaluation evidence; spend caps; a kill-switch drill each time | G15.7, needs G0.7 | Every level change has a decision record, evidence and a passed drill; no automatic promotion exists. |
| G15.9 | quality | work | Supervised pilot run for a founder-set period with weekly reports; go or no-go on wider autonomy | G15.8 | Report with outcomes, incidents, cost and open risks; founder decision recorded. |

## G16 - Vision acceptance

Prove the founder's vision, in the founder's own words, on the real system.

Requires: G6, G7, G15

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G16.1 | quality | work | Turn the acceptance scenarios in VISION.md section 10 into measurable pass criteria and get them approved | - | Founder-approved scenarios with a numeric or yes-no criterion each. |
| G16.2 | quality | work | Run every scenario on the real system; fix or accept with signed exceptions | G16.1 | Recorded results per scenario with evidence. |
| G16.3 | quality | work | Final report: each vision statement against its evidence, open risks, running cost, what remains; go or no-go for daily use | G16.2 | Report delivered; founder decision recorded. |

## G10 - Public productization (conditional)

Everything a public product needs that an internal tool does not.

Requires: G9  
Conditional: Applies only if the G0.1 decision is public. If internal-only, run: node .agent/product-kit/kit.mjs ack NA-G10

| Step | Lane | Type | What | After | Exit evidence |
|---|---|---|---|---|---|
| G10.1 | founder | decision | Validate the narrow customer and problem with real users before building | - | Founder-run interviews or design partners with recorded findings; a narrow ICP and one problem statement approved. |
| G10.2 | security | work | Multi-tenancy and data isolation with tests | needs G10.1 | Cross-tenant access tests fail closed; isolation verified at the data layer. |
| G10.3 | security | work | Multi-user auth and role-based access | G10.2 | Roles enforced server-side; tests for privilege escalation. |
| G10.4 | platform | work | Billing, metering and per-tenant cost controls | G10.2 | Metered usage reconciles with provider cost; caps tested. |
| G10.5 | founder | decision | Privacy policy, terms, data export and deletion; legal review by a qualified person | G10.2 | Documents reviewed by a qualified human; export and deletion tested. |
| G10.6 | platform | work | Support channel, status page and abuse controls | G10.3 | Status page live; abuse controls tested. |
