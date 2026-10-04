# Plan: Windows-first Jev-inspired decision layer

**Status:** PROPOSED — research and feasibility gate not complete.  
**Owner:** Founder + SamJuniors engineering agent  
**Scope:** SamjuniorsOS, with Sophia/SOFIA boundaries preserved.  
**Rule:** Do not begin broad implementation until Phase 0 is complete and the findings are reported.

## Objective

Evaluate and, only if justified, implement a small decision capability that improves Sophia/SamJuniorsOS task routing, classification, scoring, and policy checks without replacing the existing assistant, orchestration, or authorization systems.

## Guardrails

1. Windows-first. macOS-only code is not acceptable in the default path.
2. Free-first. The app must continue to start and work without optional external API keys.
3. Inspect the current SamjuniorsOS repository before coding; current code is the source of truth.
4. Clone and inspect `https://github.com/henryklunaris/hey-jev` as a reference. Check license and provenance before copying or porting code.
5. Do not assume Jev's hosted API, model weights, pricing, free credits, or key access are available. Verify current official docs and terms at implementation time.
6. Do not train a new model yet. Start with rules and existing local-model abstractions; consider fine-tuning only after a measured quality gap and a viable data/evaluation plan.
7. The decision layer may propose decisions; it cannot independently authorize side effects, bypass approvals, or mutate authoritative workflow state.
8. No secrets in frontend code, source control, logs, tests, screenshots, or docs.
9. Avoid creating a second provider chain or parallel runtime when existing SamjuniorsOS abstractions can be extended.
10. Keep this plan and the research document updated as decisions change.

## Phase 0 — repository and product audit (required first)

### Tasks

- [ ] Inspect current SamjuniorsOS branch, status, README, architecture docs, and existing provider/orchestration abstractions.
- [ ] Clone `hey-jev` into a temporary/reference location; do not merge it directly into the app.
- [ ] Record the repository's license, dependencies, build scripts, macOS-specific APIs, permissions, and data flows.
- [ ] Identify the smallest reusable concept/component, if any; separate product UI from reusable decision logic.
- [ ] Check existing Sophia/SOFIA workflow and decision paths for duplication.
- [ ] Review current official TypeSafe documentation for supported request schema, key handling, access, terms, pricing, limits, and model versioning if a hosted experiment is still relevant.
- [ ] Identify 1–3 concrete decisions where better routing/scoring would measurably improve a current user workflow.

### Deliverable

Add a dated audit section to this research document or a linked report with exact repository paths, license findings, platform constraints, and integration points. Mark unknowns explicitly.

### Exit gate

**STOP and report to the founder** if the license is incompatible/unclear, Windows porting is substantial, no clear user problem exists, or the new layer would duplicate existing orchestration.

## Phase 1 — define the contract before selecting a model

If Phase 0 passes:

- [ ] Define a small internal interface for typed decisions.
- [ ] Define a versioned schema for each use case (allowed labels, score range, meaning, and invalid-output behavior).
- [ ] Include provenance: decision type/version, backend, model/rule version, timestamp, and evaluation metadata where appropriate.
- [ ] Treat untrusted content as data, not instructions to the decision engine.
- [ ] Validate every result at the boundary. Invalid, missing, timed-out, or contradictory outputs must not be silently accepted.
- [ ] Define a safe fallback for every decision: deterministic default, ask user, or human approval.
- [ ] Keep decision generation separate from execution and authorization.

**Acceptance:** A contract test suite demonstrates schema validation, invalid output rejection, timeout handling, and safe fallback behavior without requiring external credentials.

## Phase 2 — establish a free local baseline

- [ ] Start with deterministic rules where the policy is straightforward.
- [ ] Reuse the existing local LLM provider abstraction for tasks that need model judgment; do not build a parallel provider chain.
- [ ] Ensure setup instructions and scripts work on Windows first.
- [ ] Keep the baseline usable without network access when the selected local backend is available.
- [ ] Build a small, versioned evaluation dataset from representative and adversarial cases, excluding secrets and unnecessary personal data.
- [ ] Measure quality, latency, memory/compute needs, failure rates, and operational complexity.
- [ ] Test prompt injection, ambiguous inputs, out-of-domain inputs, malformed results, retries, and duplicate requests.

**Acceptance:** Reproducible baseline metrics and a documented failure analysis. Do not claim quality or performance without measurements.

## Phase 3 — optional hosted API comparison

Only if Phase 2 identifies a meaningful quality, latency, or operational gap:

- [ ] Verify official TypeSafe documentation, access, pricing, terms, limits, and current model names.
- [ ] Implement behind an explicit server-side adapter and feature/config flag.
- [ ] Keep it disabled when the key is absent; the app must still start and core workflows must still work.
- [ ] Store keys using the existing environment/configuration approach; never expose them client-side.
- [ ] Set request timeouts, bounded retries with backoff, rate-limit handling, and cost/usage telemetry that avoids logging sensitive input.
- [ ] Pin a model version for reproducible production evaluations if supported; do not rely on a moving alias without drift checks.
- [ ] Compare the hosted API against rules and local model on the same evaluation set.
- [ ] Ask the founder before introducing any non-zero recurring cost or making the hosted provider a required dependency.

**Acceptance:** Evidence that the optional provider materially improves the target use case enough to justify cost, privacy, availability, and vendor dependency.

## Phase 4 — decision gate: build, adapt, or stop

Choose one:

- **Adopt a small open-source component** if license, maintenance, platform compatibility, and security are acceptable.
- **Adapt existing SamjuniorsOS abstractions** if they already cover most of the need.
- **Keep a rules + local-model decision layer** if it meets the quality target.
- **Run a limited hosted API experiment** only if it wins on measured criteria.
- **Defer model training** until there is enough labeled data and a demonstrated gap that simpler approaches cannot close.

Training a Jev-like model is a separate research project, not part of this initial implementation plan. It requires an explicit dataset strategy, evaluation protocol, compute estimate, licensing review, and success criteria.

## Phase 5 — hardening and documentation

Before any production rollout:

- [ ] Add tests for schema contracts, fallbacks, provider outages, timeouts, retries, and Windows paths/commands.
- [ ] Verify the UI cannot override authoritative server state.
- [ ] Verify decision output alone cannot bypass approval, authorization, idempotency, or audit controls.
- [ ] Document privacy/data retention and which information is sent to an external provider.
- [ ] Document setup, disabling the integration, troubleshooting, and rollback.
- [ ] Update architecture records and the roadmap with the final decision and evidence.
- [ ] Run relevant tests/build and report exact commands/results; label untested areas as NOT VERIFIED.

## Rollback

The optional decision layer must be removable or disableable through configuration without corrupting persisted workflow state. If a provider is down or produces invalid outputs, use the defined safe fallback; never retry side effects blindly.

## Required agent report format

Return:

- **VERDICT:** proceed / proceed with constraints / stop
- **CURRENT REPO EVIDENCE:** exact files and existing abstractions
- **HEY-JEV AUDIT:** license, dependencies, platform compatibility, reusable pieces
- **WINDOWS STATUS:** commands run and actual results
- **FREE-START STATUS:** behavior with no optional keys
- **EVALUATION:** dataset, baseline, metrics, failure cases
- **SECURITY / PRIVACY:** risks and mitigations
- **COST / VENDOR DEPENDENCY:** verified terms and assumptions
- **CHANGES MADE:** exact files and diff summary
- **TESTS:** exact commands and outputs
- **NOT VERIFIED:** explicit list
- **NEXT ACTION:** one concrete next step

**Current next action:** Complete Phase 0 only. Do not implement a model, provider integration, or UI feature before reporting findings and waiting for founder review.
