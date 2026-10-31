# ADR 0010: Capability Registry, Manifest Schema, and Single Execution Gateway

- **STATUS:** ACCEPTED & BINDING
- **DECISION:** Implement a unified Capability Registry and Single Execution Gateway (`CapabilityGateway`) governing all tools, skills, and Model Context Protocol (MCP) servers. Every capability must provide an authoritative manifest specifying permissions, side-effect class, trust tier, version pin, and cost model. All capability invocations must route through the gateway and pass deterministic policy and approval gates before dispatch. Direct unmediated tool execution is strictly forbidden and verified via static CI checks.
- **SCOPE:** Gate G14.1 (Milestone M6 — Tools, skills and MCP)
- **AUTHORITY:** Highest engineering priority per `AGENTS.md` Sections 3, 4, 11, and 14.

---

## 1. CONTEXT & PROBLEM STATEMENT

As SamJuniorsOS advances into Milestone M6, Sophia and executive specialists require capabilities to query external systems, execute analytical workflows, and interface with standard Model Context Protocol (MCP) servers. 

However, allowing arbitrary, ad-hoc, or direct tool execution introduces catastrophic operational, security, and financial hazards:
1. **Tool Squatting & Shadowing:** Third-party community skills or rogue MCP servers could redefine core functions (e.g. shadow "approve_budget" or "read_file").
2. **Side-Effect Bypass:** Direct calls could execute destructive, external, or financial mutations without evaluating the `AutonomyPolicyEngine` or passing cryptographic founder approval gates (`SideEffectAuthorizationGate`).
3. **Prompt Injection & Over-Privilege:** Tools requesting broad ambient permissions (e.g. unbounded network or file system access) could be exploited via untrusted ingress transcripts.
4. **Unbounded Model Spend:** Tool invocations without explicit cost models or token rate-limiting could deplete company spend ceilings.

To prevent architectural drift and uphold the core invariant of **ONE Sophia, ONE Authoritative State, Deterministic Governance** (`AGENTS.md` §3), we require a formal capability registry and single execution gateway.

---

## 2. INDUSTRY REFERENCE ARCHITECTURES & COMPARATIVE ANALYSIS

In evaluating our design, we benchmark against two prominent industry patterns: **GitLab's AI Catalog** and **OpenClaw's Skill Load Precedence**.

### 2.1 GitLab's AI Catalog Pattern
- **Overview:** GitLab’s AI Catalog establishes a centralized, versioned repository of AI agents, prompt flows, and MCP servers with organizational group/subgroup permission controls and lifecycle stages (`experimental`, `beta`, `ga`).
- **Strengths:** 
  - Versioned immutability: components are tied to specific release tags and cryptographic manifests.
  - Granular group policies: enterprise teams can enforce allowlists specifying which MCP servers and tools can be mounted by specific projects.
- **Comparison & Adaptations for SamJuniorsOS:**
  - *Adopted:* SamJuniorsOS adopts GitLab's concept of an immutable, manifest-driven catalog with explicit lifecycle states, cryptographic version pinning, and granular permission declarations.
  - *Divergence:* While GitLab uses multi-tenant organizational group hierarchies, SamJuniorsOS is the private company OS for a single founder company. Our governance is anchored in deterministic single-founder authority, cryptographic SHA-256 bound approvals, and executive council orchestration rather than multi-tenant project groups.

### 2.2 OpenClaw's Skill Load Precedence Pattern
- **Overview:** OpenClaw employs a strict cascading hierarchy for discovering and resolving skills:
  `System Built-in Skills -> Workspace Registered Skills -> User/Personal Skills`.
- **Strengths:**
  - Predictable resolution order: higher-precedence tiers always shadow or supersede lower tiers deterministically.
  - Clear isolation between system-critical capabilities and experimental workspace add-ons.
- **Comparison & Adaptations for SamJuniorsOS:**
  - *Adopted:* SamJuniorsOS implements a strict 4-tier trust model (`core` > `verified_partner` > `community` > `untrusted`).
  - *Key Defense (Anti-Shadowing Invariant):* Unlike open systems where user skills can shadow core tools, **SamJuniorsOS strictly prohibits shadowing core system capabilities**. Any attempt by a community skill or external MCP server to register an alias or identifier belonging to a `core` or `verified_partner` namespace fails closed immediately at load time.

---

## 3. CORE ARCHITECTURAL SPECIFICATION

```
                           SOPHIA / AGENT RUNTIME
                                     ↓
                          [Invokes Intent / Tool]
                                     ↓
                         CAPABILITY GATEWAY (Single)
                                     ↓
        ┌────────────────────────────┴────────────────────────────┐
        ↓                                                         ↓
1. Validate Manifest Schema                               2. Evaluate Policy
   - ID & Name Format                                        - Check Autonomy Level
   - Version Pin (semver)                                    - Check Action Class Budget
   - Trust Tier Verification                                 - Check Spend Cap
   - Permission Scope Check                                  - SideEffectAuthorizationGate
        │                                                         │
        └────────────────────────────┬────────────────────────────┘
                                     ↓
                         [Approved & Authorized?]
                                     ↓
                 ┌───────────────────┴───────────────────┐
                 │ YES                                   │ NO
                 ↓                                       ↓
        Dispatch Execution                      Fail-Closed / Queue Approval
   - Tool (Deterministic Code)             - If pending founder approval:
   - Skill (Specialist Prompt Flow)          return awaiting_founder_approval
   - MCP Server (JSON-RPC Protocol)        - If denied: reject with honest error
                 │                                       │
                 └───────────────────┬───────────────────┘
                                     ↓
                         SIDE-EFFECT AUDIT LEDGER
                   (Immutable WORM / SHA-256 Chained)
```

### 3.1 Five Pillars of the Capability Manifest Schema
Every capability (Tool, Skill, MCP Server) registered in SamJuniorsOS must provide an authoritative manifest declaring:

1. **Permissions (`permissions: CapabilityPermission[]`)**:
   Explicit granular capabilities requested by the component (e.g. `fs:read`, `net:outbound:api.github.com`, `process:exec`). Ambient wildcard permissions (`*`) are disallowed for `community` and `untrusted` tiers.
2. **Side-Effect Classification (`sideEffectClass: RouteSideEffectClass`)**:
   - `read_only`: No state mutation; safe to execute within automated loops.
   - `internal_write`: Mutates internal company memory or draft items; reversible.
   - `external_reversible`: Creates external tickets or non-destructive drafts (e.g. GitHub issue draft).
   - `external_hard_to_reverse`: Public communications, external deployments, permanent repository changes.
   - `financial_legal`: Moves funds, approves invoices, accepts legal terms.
   - `destructive_security`: Deletes production data, revokes credentials, alters access policies.
3. **Trust Tier (`trustTier: CapabilityTrustTier`)**:
   - `core`: First-party, authoritatively audited code built directly into SamJuniorsOS.
   - `verified_partner`: Audited integrations with cryptographic verification.
   - `community`: Third-party tools with sandboxed execution constraints.
   - `untrusted`: Quarantined; read-only inspection only.
4. **Version Pinning (`version: string`)**:
   Strict semantic versioning (`major.minor.patch`). Floating tags (`latest`, `^1.0.0`, `*`) are strictly rejected.
5. **Cost Accounting (`cost: CapabilityCostModel`)**:
   Financial and operational accounting per call (fixed cents and/or token multipliers), integrated directly into the company daily spend cap.

### 3.2 Single Gateway Invariant
1. **Zero Direct Execution:** No agent, background worker, or LLM turn may execute a tool, spawn an MCP transport, or execute a skill directly. All execution MUST route through `CapabilityGateway.invoke()`.
2. **Deterministic Pre-Flight Authorization:** The gateway enforces policy engine checks (`AutonomyPolicyEngine.evaluate`) and approval routing (`SideEffectAuthorizationGate.decideApproval`) before dispatching any capability logic.
3. **Fail-Closed Default:** Unregistered tools, invalid manifests, version mismatches, or unapproved side-effects halt execution immediately and fail closed.
4. **Tamper-Evident Audit:** Every invocation produces an immutable record in `SideEffectAuditStore` with invocation timestamp, caller identity, payload hash, and outcome.

---

## 4. STATIC CHECK ENFORCEMENT

To guarantee adherence, Gate G14.1 introduces an automated static AST and source check (`scripts/verify-capability-gateway.mjs` and `tests/capabilities/g14_1_capability_gateway_static_check.test.ts`):
- Audits the entire codebase for forbidden direct tool execution patterns (such as unmediated child process execution or direct MCP stdio connections).
- Verifies that all registered capabilities strictly conform to `CapabilityManifestSchema`.
- Fails the CI pipeline if any unmediated execution path is introduced.

---

## 5. RISKS & MITIGATIONS

| Risk | Mitigation |
|---|---|
| Latency overhead from gateway validation | Pre-compile Zod schemas and cache validated manifests in memory; validation executes in $< 1\text{ ms}$. |
| Developer friction from strict manifest schema | Provide standard manifest helper constructors (`defineCoreTool`, `defineCoreSkill`, `defineMcpServer`). |
| External MCP protocol divergence | Wrap MCP communication in standard JSON-RPC 2.0 client adapter adhering to Model Context Protocol specification. |

---

## 6. VERDICT & NEXT ACTIONS

- **Verdict:** RATIFIED AND AUTHORITATIVE.
- **Immediate Implementation:**
  1. Codify `CapabilityManifest` and `CapabilityManifestSchema` in `src/types/capability.ts`.
  2. Implement `CapabilityRegistry` and `CapabilityGateway` in `src/lib/server/capabilities/`.
  3. Author static verification check and automated regression suite.
