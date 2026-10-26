# Production quality bar

A step or a release is done only with evidence for every applicable item: a command and its result, a test name, a file path, or a screenshot. An item may be excepted only with a written exception approved by the founder. Items marked [PUBLIC] apply only if the founder decides on a public product (G0.1).

## Product and UX
- Q-UX-1 Every journey has designed empty, loading, error, offline and permission-denied states.
- Q-UX-2 No fabricated data, fake progress or simulated activity is shown as real.
- Q-UX-3 Degraded behavior is labelled honestly (deterministic fallback, voice offline, node unreachable).
- Q-UX-4 Approval and destructive actions state exactly what will happen and to what; irreversible actions need explicit confirmation.
- Q-UX-5 Errors say what happened and what to do next; no stack traces or raw provider errors.
- Q-UX-6 A new operator reaches first value without reading source code (cold-start walkthrough).

## Accessibility
- Q-A11Y-1 WCAG 2.2 AA on core journeys: keyboard operable, visible focus, contrast, labels, screen-reader names.
- Q-A11Y-2 Reduced-motion respected; nothing is conveyed by color or sound alone (voice presence states have a visible non-color indicator).

## Frontend
- Q-FE-1 Core Web Vitals in the "good" range on core journeys (LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1), measured, with budgets enforced in CI.
- Q-FE-2 Responsive from phone width to desktop, checked on real devices for each supported platform.
- Q-FE-3 The client holds no authority: no secrets, no invented business state.
- Q-FE-4 Design tokens used consistently (canonical visual language, ADR 0001).

## Backend and data
- Q-BE-1 Every privileged route authenticates server-side and fails closed; a test per route group.
- Q-BE-2 Input validated by schema at the boundary; outputs typed.
- Q-BE-3 Side effects are idempotent with unknown-outcome handling; tests for duplicate delivery and a crash mid-operation.
- Q-BE-4 State survives restart and multi-instance deployment; migrations are versioned and rehearsed.
- Q-BE-5 A restore has been performed successfully within the founder-approved RPO and RTO.
- Q-BE-6 External calls have timeouts and bounded retries; provider failure degrades gracefully.

## Security
- Q-SEC-1 Threat model against the current OWASP Top 10 for Agentic Applications and the LLM Top 10 (fetch the current lists); each risk has a control, a test, or a founder-accepted risk.
- Q-SEC-2 Text from untrusted sources (transcripts, webhooks, web pages, files, tool output, screen content) cannot trigger a side effect without the approval gate; automated tests per channel.
- Q-SEC-3 Approvals are bound to the exact payload hash; a tamper test fails closed.
- Q-SEC-4 No secrets in the repository, logs or client bundle; scanned in CI; rotation procedure tested.
- Q-SEC-5 Least privilege per agent and tool; third-party tools, MCP servers and skills vetted per `CAPABILITIES.md` before use; dependency audit in CI; lockfile enforced.
- Q-SEC-6 Rate and size limits; security headers and CSP; restricted CORS.
- Q-SEC-7 Audit log is append-only with tamper detection; retention and deletion flows verified.
- Q-SEC-8 LLM spend caps and runaway-loop protection.

## Reliability and operations
- Q-OPS-1 Structured logs with correlation ids; errors tracked; no secrets or personal data in logs.
- Q-OPS-2 Health checks and alerts on numeric SLOs approved by the founder.
- Q-OPS-3 Runbooks for deploy, rollback, restore and incident response, each exercised once.
- Q-OPS-4 The deployed environment is verified after each deploy, not only the local build.
- Q-OPS-5 Failure injection done: provider down, database down, crash mid-workflow, dropped voice session.

## Quality engineering
- Q-QA-1 One command runs every test and exits non-zero on failure; CI blocks merges on it.
- Q-QA-2 Each journey has an automated end-to-end test.
- Q-QA-3 Every fixed defect gets a regression test.
- Q-QA-4 Typecheck, lint and build are clean in CI.
- Q-QA-6 Before the founder tests a milestone, a QA pass is recorded in `qa/<M>.md`: every founder test step was run against the real running product by a session that did not build most of it; bugs found were fixed with regression tests or recorded as findings; steps an agent cannot check (real microphone, phone, live key) are listed as founder-only.
- Q-QA-5 LLM-dependent behavior (intent, retrieval, faithfulness) has an evaluation set, a recorded baseline and a regression threshold.

## Repository hygiene
- Q-GIT-1 The integration branch is always green: nothing lands until CI (when on) and the configured checks pass on the merged result; `main` only receives accepted milestones.
- Q-GIT-2 No force-push, no history rewriting, no secrets committed (checkpoint scans before committing).
- Q-GIT-3 After each milestone ships: working tree clean, no leftover step or QA branches or worktrees, a `milestone/<M>` tag exists.

## Simplicity
- Q-SIMPLE-1 Every step answers the smallest-change ladder (needed, already in the codebase, platform or dependency, not built, added) and the verifier names code that could be deleted or reused.
- Q-SIMPLE-2 No new dependency, abstraction layer or large new file without a written reason.

## Documentation
- Q-DOC-1 A new person can set up the system from the docs on a clean machine.
- Q-DOC-2 Docs state only what is verified; the rest says NOT VERIFIED.
- Q-DOC-3 Every architectural decision has an ADR (`AGENTS.md` section 14).
- Q-DOC-4 Before building a commodity part (voice turn-taking, a memory store, a policy layer, an MCP client, a coding engine), the ADR compares current open-source candidates and records borrow, adopt or build.

## Memory
- Q-MEM-1 Personal and company scopes are partitioned: an automated test proves a planted personal fact never appears in a company answer or in an employee's context.
- Q-MEM-2 Every recalled item carries its source; "I do not remember" is returned when nothing relevant is found.
- Q-MEM-3 Unconfirmed or unverified items are never recalled as fact; superseded items are never recalled as current.
- Q-MEM-4 Deletion removes derived copies (index, summary, embedding), verified by test.
- Q-MEM-5 Memory survives restart and redeploy (continuity evaluation passes before and after).

## Decision engine
- Q-DEC-1 Every decision is logged with inputs, route, confidence, policy result and outcome. No log entry, no action.
- Q-DEC-2 Policy is deterministic and table-tested; the model cannot change it.
- Q-DEC-3 Low confidence asks instead of acting; thresholds come from a calibration evaluation.
- Q-DEC-4 The kill switch halts autonomous action, including with the model provider down; drilled.
- Q-DEC-5 An unknown route fails closed.

## AI workforce
- Q-TEAM-1 No employee exists without founder approval; every version is inspectable and reversible.
- Q-TEAM-2 Delegation is structured; there is no free-form agent-to-agent chat; depth, fan-out, tokens and time are bounded.
- Q-TEAM-3 Each employee has its own scoped credentials, tools and memory; privilege tests pass.
- Q-TEAM-4 Each role has an evaluation baseline; any autonomy change cites evidence and a recorded founder decision.
- Q-TEAM-5 The team view shows real state only.

## Capability layer
- Q-CAP-1 No tool-call path bypasses the gateway.
- Q-CAP-2 Third-party tools, skills and MCP servers are vetted, version-pinned and founder-approved before activation; nothing installs itself.
- Q-CAP-3 Tools run with least privilege and network allowlists; secrets never reach the model.
- Q-CAP-4 Each integration has contract, failure-mode and unknown-outcome tests and a cost cap.

## Presence
- Q-PRES-1 Greetings and briefings use only real state; empty state gets a plain greeting.
- Q-PRES-2 One consistent persona; a conversation evaluation has a baseline; a fabricated-memory test fails the build.

## Scale later
- Q-SCALE-1 New stores carry an owner scope, no code assumes exactly one human, and interfaces stay provider-neutral. No multi-founder feature is built unless the founder decides otherwise (decision 2026-10-20).

## Public product only [PUBLIC]
- Q-PUB-1 Tenant isolation proven by tests at the data layer.
- Q-PUB-2 Privacy policy, terms, data export and deletion reviewed by a qualified person.
- Q-PUB-3 Per-tenant cost metering and caps; billing reconciles with provider cost.
- Q-PUB-4 Support channel, status page and abuse handling.
- Q-PUB-5 Incident and breach-notification obligations understood by a qualified person.
