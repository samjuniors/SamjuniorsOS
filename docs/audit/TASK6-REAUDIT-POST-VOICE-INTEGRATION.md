# Task 6 — Re-Audit After Voice Integration (Phase 6)

**Type:** Evidence-backed re-audit of Task 6 (SOFIA voice & desktop capability validation) against the post-voice-integration tree. Docs only; no production code changed; no merge, no deploy, no push.
**Audit target:** `feat/sofiaui-voice-integration` @ **`ae70d2bf2d3c88b52f41f324809325d31b23b66b`** (local branch, never pushed)
**Baselines compared:**
- `origin/development` @ **`a020cab4a75385f4f94d820dd2945f9d9f168e55`** — **unchanged** since the original Task 6 audit base (verified by fresh `git fetch origin` + `rev-parse`)
- `audit/sofia-voice-desktop-capability-validation` @ `1ea565c` (the original Task 6 deliverable: report + 15-assertion pin suite)
**Method:** Fresh inspection — no reliance on prior audit notes as current truth. Full diff read of all 43 changed files (+7,756/−101), direct source verification of every governance claim, one delegated read-only client-runtime sub-audit (T6REAUDIT-A), full re-run of the verification battery in an isolated worktree with an isolated SQLite database (`DATABASE_URL` overridden on every command; shared dev db mtime verified untouched), plus a differential run of the ORIGINAL Task 6 pin suite against the new tree.

---

## 0. Repository-state finding (headline — read first)

**The voice integration is NOT on `development`.** A fresh fetch shows `origin/development` still at `a020cab` — byte-identical to the original Task 6 audit base. The four voice commits exist only on the local branch `feat/sofiaui-voice-integration`:

```
a020cab (origin/development, unchanged)
  └─ 90b1424  Phase 2 — port SofiaUI voice-agent presence UI
     1b8de39  Phase 3 — integrate the voice runtime (amplitude, spoken replies, explicit cancellation)
     650caf3  Phase 4 — governance/security hardening (founder-scoped suppression, turnId validation, honest cancellation, key transport)
     ae70d2b  Phase 5 — parity validation + reversible retirement of the old voice path   ← audit target
```

The local `development` ref (d9212f8) is *behind* origin (pre-PR#5 state). "The current development branch after the voice integration work" therefore means: **development (a020cab) + the audited integration branch (ae70d2b)**. No merge, push, or deploy has occurred — consistent with the standing no-merge rule. Everything below audits ae70d2b.

## 1. Verdict summary

The voice-integration work is a **net governance and reliability improvement** over the a020cab baseline on every axis the original Task 6 audit measured, with the original audit's two top risks (R1, R2) substantially addressed and pinned by tests. No authorization regression exists: auth still fails closed ahead of every new behavior, retirement never weakens a control, and the canonical single-brain convergence is preserved. The re-audit found **no new server-side defect of severity ≥ Medium**, one incomplete application of the new hardening (ask-route turnId), four small client-side runtime defects/risks, and a set of process gaps (CI wiring, env documentation, transitional duplication) — all classified and prioritized in §5.

## 2. Task 6 original acceptance criteria vs. current state

The original Task 6 scope of record (Founder task text; no in-repo roadmap defines Task 6) was: source-grounded audit of the real voice execution path, interruption/cancellation/retries/idempotency, authorization boundaries, tools/desktop inventory; docs + narrowly scoped tests only; no merge/deploy. That deliverable stands (1ea565c). This section re-grades its findings against ae70d2b:

| Original finding | Status at ae70d2b | Evidence |
|---|---|---|
| **R1** Interruption never cancels downstream work (no cancellation token; WS INTERRUPT state-only; SOFIA abort stops rendering, not execution) | **Substantially addressed — deliberate design.** `executeSophiaTurn` now accepts `signal?: AbortSignal`; INTERRUPT aborts a per-socket `AbortController`; the executor settles at 5 stage boundaries with `cancelled:true` and persists a `(turn interrupted)` marker under the `${turnId}:assistant` idempotency key **exactly when the founder message already landed** — closing the idempotency loop across cancellation (retry replays the cancel, not the directive). Gateway-internal provider calls still run to completion (documented limitation, see §4-c). | `turn-executor.ts:17-45,72-125,255,270-277,298-304,359-367`; `live/server.ts:240-300`; pinned by `phase4_governance_hardening` G3, `phase5_voice_parity` E5/E8, `sofiaui_voice_runtime` B2 |
| **R2** OS ribbon interim captions can never display (`startPtt(turnId)` ignored; TS2554 at `liveCompanionBridge.ts:138`) | **Fixed.** Bridge mints `voice_turn_<ms>_<n>`, client honors the caller-supplied id, store guard now matches interims; the compiler diagnostic is GONE (tsc evidence §6). End-to-end trace verified in source + pinned (`sofiaui_voice_runtime` D1/D2). | tsc diff §6 (TS2554 removed, zero added); `liveCompanionBridge.ts:205-216`; `live-client.ts:316-337` |
| **A2** Post-interrupt late-final race (interrupted turn still executes) | **Closed.** INTERRUPT marks the turn in a **founder-scoped** `processedTurnIds` map + an INTERRUPTED-state belt guard before canonical execution; late finals never reach the executor. | `live/server.ts:263-276,417-433`; pinned `sofiaui_voice_runtime` B2 |
| **R3** Misleading `cancel()` comment ("the turn stops generating") | **Resolved by re-contextualization.** The ask route comment now states the truth for the SSE-abort path ("the canonical turn still completes and persists server-side") — which remains accurate for fetch-abort; explicit INTERRUPT cancellation is the new, separately-documented mechanism. | `sofia/ask/route.ts:116-119` |
| **R4** In-memory idempotency locks/tickets/sessions (process-bound) | **Unchanged, now formally documented** as Founder decision §3.1 in `docs/audit/PHASE4-VOICE-GOVERNANCE-SECURITY-REVIEW.md` (cross-process exactly-once, incl. the split-process WS+ask double-execution window). | Phase 4 review §3.1 |
| **R5** Gemini API key in URL query string (two sites) | **Fixed.** Both sites moved to `x-goog-api-key` header; source-level tripwires + fetch-capture test pin it. | `gemini-provider.ts:131-144`; `realtime/turn/route.ts:144-155`; test G6 |
| **R6** image-generator Pollinations URL overstatement | **Unchanged** (orphaned route, no new consumers, disposition deferred with the other orphaned routes). | unchanged files |
| **§6.1** Desktop control of a real machine — does not exist | **Still true.** No computer-use/nut.js/robotjs anywhere; new voice path adds no OS-level capability. The 2,848-line orb/ visual layer is raw WebGL2 with zero external imports and no system access. | grep-verified |
| **§6.3/§6.4/§6.5** Orphaned browser routes; vestigial SSE machinery; dead client TTS/STT libs | **Carried forward as the documented Phase 5 removal set** (retirement is reversible-flag-gated pending hardware verification). Still dead: `tts-speaker.ts` (437), `browser-stt.ts` (295), `camera-capture.ts` (107) — zero importers, verified again. | `docs/audit/PHASE5-PARITY-CHECKLIST.md` |
| **§6.8** `SPEAKING` never set server-side (ribbon can't show "Sophia speaking" from server truth) | **By design, resolved client-side:** the new runtime owns a client speaking overlay (`voiceRuntime.speaking` + drain-settled), documented as such. Server-side `SPEAKING` remains unimplemented (ADR-001 target state, unchanged). | `voiceRuntime.ts:243-312,377-397` |

## 3. Voice-integration changes vs. company architecture & governance

Verified point-by-point:

- **Single canonical brain preserved.** The new voice path routes through the same `executeSophiaTurn` → ConversationStore → assembler → classifier → gateway pipeline via the WS gateway's `turnExecutor` seam (default = the real executor). No second Sophia, no alternate trust path. `live/server.ts:19-31,485-492`.
- **Authorization.** Every new/changed surface fails closed: TTS fetch (`/api/sofia/tts`) is founder-session-gated server-side; WS upgrade authenticates before `handleConnection`; founder identity never originates from frames/bodies. The legacy retirement guard fires **after** auth on every retired route (401 before 410 in production misconfig) — pinned H2. `voice-legacy.ts:24-26`; `phase5_voice_parity` H1-H4.
- **Approval/governance gates.** Both voice ingresses keep `executeDirective` semantics through the same gateway (FOUNDER-role check, approval corroboration with untrusted-ID rules, SHA-256 payload-bound approvals, `executeWithGate` policy+audit). Nothing in the voice path can ratify, execute, or bypass a gate that the text path couldn't. Re-verified: `server-gateway.ts:77-271` unchanged; `turn-executor.ts:346`.
- **Idempotency.** Turn-scoped replay unchanged; the WS duplicate-final suppression is now founder-scoped (`${founderId}:${turnId}`) — closing a cross-founder poisoning vector that existed **only inside the Phase 3 commit** (1b8de39; never on development; fixed in 650caf3, pinned G1). New turnId validation (`[A-Za-z0-9_-]{1,128}`, `:` reserved) at START_PTT/INTERRUPT protects the durable key composition (pinned G2). Cancellation closes the idempotency loop via the persisted marker (§2-R1).
- **Persistence.** Voice turns persist founder message + assistant reply (or cancelled marker) under the same idempotency keys; `scheduleSophiaMemoryCapture` is correctly skipped for cancelled turns (checkpoint 4 precedes it).
- **Auditability.** Side-effect audit records live in the approval/audit store independent of the conversational reply, so a cancelled turn that had already executed a gated side effect inside the gateway still leaves the authoritative audit trail; the conversation shows the founder message + marker. (Nuance in §5-F10.)
- **Recovery.** Reconnect (1.2s base, ×2 backoff, capped, honest exhaustion), 60s resume window, ticket re-issue, STT re-arm on resume, fatal-vs-recoverable error routing (STT init failure now `fatal:true` + zombie cleanup — G5), device-loss teardown (`track.onended` → `MIC_NOT_FOUND`), `devicechange` backstop, ownership-guarded settle (G3), shutdown aborts in-flight executions.
- **Adjacent security fix (beyond voice scope, justified):** `/api/browser/read` was re-routed through the hardened `net.ts` pipeline (DNS-rebinding-safe lookup, per-hop re-vetted redirects, 2MB cap) — the old inline guard blocked only 3 metadata hostnames. Founder-gated and orphaned (no UI callers), but a real SSRF surface reachable by direct HTTP; fix verified against source.

## 4. Classification of all findings

Legend: **[VD]** verified defect · **[RG]** regression introduced by voice integration · **[ED]** existing (pre-voice) defect · **[DR]** design risk requiring a Founder decision · **[UH]** unverified hypothesis.

**(a) No regressions on the canonical server path.** [RG] — none found. tsc: zero new diagnostics; the only delta is a *removed* error (the R2 TS2554). All 17 suites green incl. the full governance battery. The one intra-branch regression that ever existed (Phase 3's global-keyspace suppression poisoning) was introduced and fixed *within* the branch (1b8de39 → 650caf3) and never reached development.

**(b) Authorization — no weaknesses.** Re-verified end-to-end (routes, upgrade auth, role gates, sanitized untrusted IDs, retirement-after-auth). The Phase 4 review's documented deployment-posture exceptions (§3.2 dev fallback when gateway lacks `NODE_ENV=production`; §3.3 cross-process ticket store; §3.4 no rate limits) are **[DR]**, pre-existing, and unchanged.

**(c) Cancellation granularity inside the gateway** — [DR, documented]. Provider calls / gated work already dispatched inside `SophiaServerGateway.process` run to completion; the reply is discarded and the marker persisted. Combined with (F10) below: an approval ratified mid-turn remains valid in the approval store with its audit record, while the conversation record shows only `(turn interrupted)`. Not a bypass (the founder's spoken intent was the authorization; all gates ran), but the conversational trace understates what happened. Documented in executor docs + Phase 4 review §1.3; unchanged by this audit.

**(d) F1 — `/api/sofia/ask` turnId still unvalidated** — [VD, incomplete hardening; the only server-side defect found]. `turn-id.ts`'s own header claims coverage of "the live voice protocol **and the SOFIA ask ingress**", but the ask route only trims the client-supplied `turnId` (`sofia/ask/route.ts:102-105`): unbounded length is persisted as durable idempotency keys, and `:`-carrying ids can alias another turn's `${turnId}:assistant` key — the exact class the WS boundary now rejects. Founder-session-gated (single-tenant self-inflicted surface; the only active UI client is the flag-gated legacy tab), so **severity Low**, but it is a trust boundary the new validation module explicitly claims and doesn't cover — a doc/code mismatch plus an unfinished hardening. Cost: ~5 lines + a G2-style pin.

**(e) F2 — PTT barge-in does not cut playback** — [VD, client]. Holding the mic/Space while Sophia speaks: visuals enter barge-in (`useVoicePresence.ts:267-274`) but audio keeps playing; `onStoreChange` stops only on `!enabled | interrupted | disconnected` (`voiceRuntime.ts:222-238`), `startPtt` never stops speaking (`liveCompanionBridge.ts:205-216`), and the client-side VAD barge-in guard is dead code on this path (requires client state `SPEAKING`, which the server never sets; `live-client.ts:223-235`). The old SOFIA scene cut TTS on speech start — this is a **parity gap the Phase 5 checklist did not catch** (E5/E8 pin interrupt paths only; no PTT-during-speaking case). **Severity Medium (UX), zero security impact.** Cost: small (stop speaking on `startPtt`/`listening` transition) + one test.

**(f) F3 — `speakPending` clobber race** — [VD, client, Low]. An aborted `speak()`'s `finally { this.speakPending = 0 }` zeroes the pending count of a newer overlapping `speak()`; a drain during a later fetch gap then settles the overlay early (orb/pill show idle while remaining sentences play). `voiceRuntime.ts:255-263,294-297,380-384`. Transient, self-correcting. Fix: guard the reset with the invocation's controller identity.

**(g) F4 — `settleSpeaking` stomps a newer `listening` status** — [VD, client, Low-Med]. Unconditional `status:'idle'` write on settle; starting a PTT hold during the last audio drain flips the pill idle mid-hold until release. `voiceRuntime.ts:387-397`. Cosmetic, self-corrects.

**(h) F5 — `speechSynthesis` fallback lacks a watchdog** — [DR, client, Low-Med]. If `onend`/`onerror` never fires (known Chrome quirks), the await hangs and the speaking overlay sticks until interrupt/next reply. The dead `tts-speaker.ts:47-49` carried exactly this keepalive machinery. `voiceRuntime.ts:341-375`.

**(i) F6 — zombie transport when the widget is unmounted** — [DR, Low-Med; pre-existing shape, elevated exposure]. `detach()` unsubscribes bridge events, so a WS drop while unmounted (design-system route / legacy tab) arms no reconnect; `bridge.client` is never nulled on close, so a later `startPtt` silently no-ops on a dead socket and the status wedges in `thinking` until the user toggles voice off/on. `liveCompanionBridge.ts:165-171`; `voiceRuntime.ts:131-159`.

**(j) F7 — CI not extended** — [DR, process]. The only workflow is `sophia-response-path-regression.yml` (unchanged from base; triggers on `src/lib/server/sophia/**` — which the voice branch *does* touch). None of the three new voice suites, nor r0/m0/m3/phase1/2/4a-c, run in CI; `src/lib/server/live/**` changes trigger nothing. GitHub Actions status remains unverifiable from this sandbox (documented limitation, same as prior audits). All "CI evidence" for the voice work is therefore local-execution evidence (this re-audit re-ran it — §6).

**(k) F8 — operational docs not updated** — [VD-lite, doc]. `SAMJUNIORS_VOICE_LEGACY` is absent from `.env.example`; ARCHITECTURE.md/ADR set has no entry for the reversible-retirement decision (it lives in `voice-legacy.ts` + the Phase 5 checklist only). The root page is now `force-dynamic` (per-request SSR for a runtime flag) — intended trade-off, worth an ADR line when the flag's fate is decided.

**(l) F9 — transitional triple-TTS duplication** — [DR, by design, time-boxed]. Three spoken-output stacks now coexist: new `voicePlayback`/`voiceRuntime`, legacy `src/sofia/lib/tts.ts` (flag-gated), dead `tts-speaker.ts`; three sentence-splitters; two `speechSynthesis` wrappers. Acceptable **only** until the documented Phase 5 removal set executes (post hardware verification); if the flag lingers, this becomes debt.

**(m) F10 — cancelled turn after gateway discards the executed reply** — [DR, documented]. See (c). Conversation shows the marker; approval/audit stores keep the authoritative records.

**(n) Known limitations, verified honest** — PORT-NOTES' open items were re-verified against code and are accurate: interrupt-during-held-PTT needs release+re-press (server closes the STT session on INTERRUPT); cross-process ticket gap; rendering/transforming orb states untriggered; no real hardware exercised in sandbox. **Undocumented** items are exactly F2/F3/F4/F5/F6 above (the client-runtime defects the checklist missed).

**(o) Differential run of the ORIGINAL Task 6 suite** — expected-fail evidence. The original 15-assertion pin suite (1ea565c), run unmodified against ae70d2b, fails at **A1.3** ("in-flight Sophia turn NOT cancelled by interruption — response still delivered"): the interrupted turn is now cancelled and no SOPHIA_RESPONSE is delivered (server log: "Turn … cancelled by client interrupt; no reply delivered"). Every failing pin corresponds to an old *defect* pin that the integration deliberately reversed (A1.3 non-cancellation, A2.3/A2.4 late-final execution, A3/A4 interim drop) — each now re-pinned as a positive contract in the new suites. The original suite is thus **obsolete against ae70d2b by design**; it must not be re-adopted without inverting those pins.

**(p) Unverified hypotheses — explicitly none raised beyond the documented ones.** Real-mic streaming STT and audible playback remain physically unverifiable in this sandbox (no hardware, no `DEEPGRAM_API_KEY`) — unchanged from Phase 5, honestly recorded.

## 5. Prioritized findings & remediation cost

| # | Finding | Class | Severity | User impact | Security | Cost |
|---|---|---|---|---|---|---|
| 1 | **F2** PTT barge-in doesn't cut playback | VD (new client) | **Medium** | Direct, default surface | None | Small |
| 2 | **F1** ask-route turnId unvalidated (doc/code mismatch) | VD (hardening gap) | Low | None (founder-only) | Hygiene | Trivial (~5 lines + pin) |
| 3 | **F4** settle stomps `listening` | VD (new client) | Low-Med | Visible flicker | None | Small |
| 4 | **F3** `speakPending` clobber race | VD (new client) | Low | Transient wrong status | None | Small |
| 5 | **F5** speechSynthesis watchdog missing | DR | Low-Med | Stuck overlay (recoverable) | None | Small |
| 6 | **F6** unmounted-widget zombie transport | DR (pre-existing shape) | Low-Med | Requires manual toggle | None | Medium |
| 7 | **F7** CI not wired for voice suites | DR (process) | Med (process) | Slower regression catch | Neutral | Medium (workflow file) |
| 8 | **F8** `.env.example`/ADR gaps for the flag | Doc | Low | Operator confusion | None | Trivial |
| 9 | **F9** triple-TTS duplication until removal set | DR (time-boxed) | Low (grows with time) | None | None | Already documented; execute on flag removal |
| 10 | **(b)** deployment posture: gateway NODE_ENV, cross-process tickets, rate limits | DR (pre-existing) | Med in production | — | Deployment-dependent | Founder decisions, already recorded |
| 11 | **(c)/(m)** cancellation granularity + reply discard nuance | DR (documented) | Low | Marker understates executed side effect | None (audit trail intact) | Large if ever threaded into gateway; document-only for now |

**Regression watch (explicit):** zero server regressions; the client items 1/3/4 are the only new-code defects, all in `voiceRuntime.ts`'s speaking lifecycle, all small to fix, none blocking a merge decision on governance grounds.

## 6. Verification record (this re-audit, all on ae70d2b, isolated db, no shared state)

| Check | Result |
|---|---|
| `sofiaui_voice_runtime` (new) | **30/0**, exit 0 |
| `phase4_governance_hardening` (new) | **29/0**, exit 0 |
| `phase5_voice_parity` (new) | **57/0**, exit 0 |
| `r0_route_auth` (suite sets its own legacy flag; also run explicitly flag-on) | **81/0**, exit 0 (both runs) |
| `realtime_governance_audit` | 11/11, exit 0 |
| `r0_realtime_gate` | 6/0 |
| `m0_idempotency_expiry` | 7/0 |
| `m3_authority_hardening` | 10/0 |
| `phase1_intent_contract` | 22/0 |
| `phase2_grounding_context` | 12/0 |
| `production_response_path_regression` | 4/0 |
| `m3_conversation_convergence` | 14/0 |
| `phase4a` / `phase4b` / `phase4c` / `phase4c_c` | 27/0 · 42/0 · 57/0 · 65/0 |
| `realtime_lab_provider` | 5/5 |
| `tsc --noEmit` (vs pristine a020cab worktree, position-normalized diff) | **152 errors vs 153** (156 vs 157 normalized): **zero new**; **one removed** — `liveCompanionBridge.ts TS2554` = the R2 fix, compiler-confirmed |
| `bun run lint` | exit 0, 0 problems |
| `bunx next build` | **Compiled successfully, 30/30 pages, exit 0** (root dynamic per flag — intended) |
| Original t6 pin suite (1ea565c) vs new tree | Fails only at old defect pins (A1.3 first) — differential proof the pinned behaviors deliberately reversed (§4-o) |
| Isolation | Every command `DATABASE_URL=file:/home/z/audit-t6-wt/.data/audit-t6-reaudit.db`; shared `db/custom.db` mtime unchanged (09:32, before first command); main worktree `git status` clean throughout |
| CI | Local evidence only (see F7); GitHub Actions unverifiable from sandbox — no claim made |

## 7. Recommended next action (awaiting Founder approval — nothing executed)

**One targeted fix commit on `feat/sofiaui-voice-integration`, then hold for hardware verification before any merge to development.**

1. **Fix F2 (+F3/F4 in the same file):** cut playback when PTT starts / status enters `listening` (and guard `speakPending` reset + conditional settle) — `voiceRuntime.ts` only, ~3 small changes, plus one new parity pin ("PTT during speaking cuts audio"). This is the only user-visible capability gap on the default surface, same rationale as the original R2 recommendation.
2. **Close F1:** apply `isValidTurnId` to the ask route's client-supplied `turnId` (reject with 400) + a G2-style pin; fixes the turn-id.ts doc/code mismatch in the direction the doc already claims.
3. **F8:** add `SAMJUNIORS_VOICE_LEGACY` to `.env.example` (one line).
4. **Do not merge yet.** Merge to development should be gated on the Founder's real-machine verification of the two Phase 5 residues (live mic → streaming STT; audible playback), which also unlocks the documented removal set (F9). Wire the three voice suites + r0 into CI as part of the merge PR (F7).

Estimated effort for items 1-3: a single small commit, all pin-tested, no architectural change.

---

## Appendix: artifacts & worktrees

- This report: `docs/audit/TASK6-REAUDIT-POST-VOICE-INTEGRATION.md` (committed on `audit/task6-reaudit-post-voice-integration`, based on ae70d2b; docs-only; not pushed).
- Verification worktree `/home/z/audit-t6-wt` @ ae70d2b (retained for re-runs; contains `.data/battery.sh` + isolated db; removable via `git worktree remove`).
- Pristine baseline worktree `/home/z/baseline-a020cab` @ a020cab (tsc comparison; removable).
- The original Task 6 pin suite was run as an **untracked** copy (`t6_voice_capability_audit_ORIG.test.ts`, removed after the run) — the voice branch's tracked tree was never modified by this audit.
- Main worktree `/home/z/my-project` (branch `main`): untouched, clean; the dev server was not running during this audit (no `dev.log` activity; nothing was started or stopped).
