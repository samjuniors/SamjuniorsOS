# AGENTS.md — Universal SamJuniors Agent Contract

This file is the shared operating contract for EVERY AI coding agent
working in this repository.

Claude-specific instructions live in `CLAUDE.md`.
Product truth lives in `PRODUCT.md`.
Engineering history and current work state live in `WORKLOG.md`.

Do not duplicate these rules into agent-specific instructions.

---

## 1. BOOT SEQUENCE

At the start of every non-trivial task:

1. Read `AGENTS.md`.
2. Read `PRODUCT.md`.
3. Read `WORKLOG.md`.
4. If resuming previous work, read `CONTINUE.md`.
5. Inspect the relevant source code, tests, schemas, and configuration.
6. Check `git status` and recent relevant commits.
7. Cross-check documentation against the actual repository.

Never assume documentation is newer than the code.

If documentation conflicts with the repository, flag the conflict and
resolve the documentation from verified repository evidence before
continuing.

---

## 2. SOURCE OF TRUTH

Use this order:

1. Explicit current user requirement
2. Security / platform constraints
3. Actual repository implementation
4. `PRODUCT.md` for product and architectural decisions
5. `WORKLOG.md` for historical/current work state
6. Other project documentation
7. Agent assumptions

`WORKLOG.md` is a work record, NOT a substitute for inspecting code.

Never claim something is implemented because a document says it is.

---

## 3. BEFORE CHANGING CODE

Inspect first.

Determine:

- what already exists
- where the relevant behavior lives
- whether an existing abstraction already solves the problem
- what documents or decisions are affected
- what tests cover the behavior
- what security, persistence, concurrency, or compatibility risks exist

Prefer extending an existing correct implementation over creating a
parallel system.

Do not rewrite working architecture without evidence that it is needed.

---

## 4. SCOPE CONTROL

Build only what the current task requires.

Do not silently expand a task into:

- unrelated refactors
- new infrastructure
- new dependencies
- new products
- speculative abstractions
- duplicate systems

If implementation reveals a necessary larger architectural decision,
stop and document the issue rather than silently expanding scope.

---

## 5. SECURITY & DATA INTEGRITY

Security, authorization, privacy, least privilege, auditability,
failure recovery, and human approval are default requirements.

Never:

- trust client-side authorization
- bypass existing authorization gates
- weaken verification to make tests pass
- fabricate authoritative data
- silently fall back from durable storage to non-authoritative storage
- expose secrets
- delete historical audit information to hide failures

Unknown state must remain unknown.

Never turn an AI assumption into authoritative company truth without
the repository's required verification and authorization process.

---

## 6. VERIFICATION

Do not report completion based only on code inspection.

Verify according to the risk of the change:

- typecheck
- build
- unit tests
- integration tests
- database tests
- concurrency tests
- security tests
- manual UI verification when UI changes

Only report tests that actually ran.

Never invent results, coverage, deployment status, or production readiness.

---

## 7. DOCUMENT SYNCHRONIZATION

Documentation is part of the task.

After meaningful work:

1. Update `WORKLOG.md` with what actually changed.
2. Record verification results.
3. Record important findings, decisions, risks, and follow-ups.
4. Update `PRODUCT.md` only when a durable product/architecture
   decision changed.
5. Update `CONTINUE.md` only when the resume protocol itself changed.
6. Update other documentation when implementation changes make it stale.

Do not duplicate the same evolving status across multiple documents.

`WORKLOG.md` is the canonical operational history.

---

## 8. WORKLOG RULE

Before ending a meaningful task or session, `WORKLOG.md` must reflect:

- current phase/milestone
- what was completed
- what was actually verified
- current repository/commit when relevant
- unresolved problems
- remaining risks
- next recommended action

If work is incomplete, say so explicitly.

A fresh agent must be able to read `WORKLOG.md` and understand where
the previous agent stopped without relying on chat history.

---

## 9. AGENT HANDOFF

When switching agents:

The new agent must NOT rely on the previous agent's memory.

It must:

READ → VERIFY → CONTINUE

Specifically:

- read `AGENTS.md`
- read `PRODUCT.md`
- read `WORKLOG.md`
- inspect the current repository
- compare the worklog against the actual code
- continue only from verified state

---

## 10. GIT

Before committing:

- inspect `git diff`
- inspect `git status`
- remove debug/test artifacts
- check for secrets
- verify documentation changes are intentional
- ensure unrelated work is not included

Never rewrite history or force-push without explicit approval.

---

## 11. SPECIALIZED AGENTS

Use specialized agents only when their expertise is relevant.

Before creating a new agent:

Discover → Reuse → Adapt → Create

Do not create duplicate agents for responsibilities already covered by
existing project agents or skills.

Specialized agents must follow this file.

---

## 12. FINAL RULE

The required lifecycle is:

UNDERSTAND
→ INSPECT
→ PLAN
→ IMPLEMENT
→ VERIFY
→ REVIEW
→ SYNCHRONIZE DOCUMENTATION
→ REPORT

The repository is the truth.

Documentation explains the truth.

The worklog preserves the history.

No agent may silently allow those three to drift apart.