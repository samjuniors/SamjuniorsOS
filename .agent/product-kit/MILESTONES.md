<!-- Generated from milestones.json by "node .agent/product-kit/kit.mjs render". Do not edit by hand. -->

# Milestones: what you can test, and what is left

Work happens one milestone at a time. When a milestone is finished the agent asks you to test it. After you accept it, the agent cleans it up and starts the next. Live status: `node .agent/product-kit/kit.mjs milestone status`.

| Milestone | After it you can | Steps | Decisions you make |
|---|---|---|---|
| M0 Baseline ready | Run every test with one command, see CI run, and start the app from a clean clone. | 9 | G0.1, G0.4 |
| M1 First Sofia you can talk to | Open the Sofia screen, get greeted, talk by voice or text, ask about yourself and about the company, stop her, and set a spend cap. | 10 | G0.8 |
| M2 Sofia works when your PC is off | Turn off your PC and still reach and talk to Sofia from another device; restart the cloud host and lose nothing. | 11 | G0.3 |
| M3 Sofia remembers you and knows your company | Tell her something, restart everything, and ask again; ask company questions with sources; delete a memory and see it gone. | 13 | - |
| M4 Sofia decides well, and you can stop her | See why she chose each action, make her ask when unsure, stop everything, and change limits in settings. | 10 | G0.7 |
| M5 Cockpit and voice that feel finished | Use the cockpit, interrupt Sofia mid-sentence, approve by panel and see voice refused, and check accessibility and speed. | 18 | G0.2 |
| M6 Tools, skills and MCP | Connect one tool and see Sofia use it with your approval; see that nothing installs itself. | 7 | - |
| M7 Sofia's first employee | Approve a hire, give the employee a task, and read its structured result and the team view. | 9 | G0.6 |
| M8 Sofia controls your PC by voice | Ask what is on screen, then have her do an approved action. | 5 | - |
| M9 Private beta ready | See dashboards, force a failure and watch it handled, and follow the docs from a clean machine. | 5 | - |
| M10 Sofia runs your first product, supervised | Watch each playbook complete a real cycle on your product. | 10 | G0.9, G15.1 |
| M11 Complete product acceptance | Run the acceptance scenarios A1 to A9 in VISION.md. | 3 | - |

## M0 - Baseline ready

The repository is trustworthy for agents and for CI before anything new is built.

**You test:**
1. Run the single test command from the README; it prints counts and ends in success.
2. Break one test on purpose and run it again; it must fail.
3. Open any pull request and watch CI run install, lint, typecheck, build, tests and the secret scan.
4. Start the app from a clean clone with SETUP.md; the dashboard opens. With no model credentials a reply is clearly labelled as fallback, not live.

**Not included yet:** No new features.

**Gate steps:** G0.1, G0.4, G0.5, G1.1, G1.2, G1.3, G1.4, G1.5, G1.6

## M1 - First Sofia you can talk to

A Sofia you can open, be greeted by, and talk to about anything, who answers personal and company questions from the memory that exists today, with a stop control and a spend setting. Runs on your PC.

**You test:**
1. Start the app and open the Sofia screen. She greets you; the badge says live (or fallback if no provider is set).
2. Talk to her about anything, by voice and by typing. Replies feel natural and are not canned.
3. Ask about yourself: she answers from what she knows or says she does not remember. Tell her a new fact: it is held for your confirmation.
4. Ask a company question: the answer lists its sources and uses no personal memory.
5. Press stop mid-reply, and say 'stop'. She freezes and asks before resuming.
6. In settings, set a spend cap and watch her stop when it is reached. With no cap set, nothing runs on its own.

**Not included yet:** No cloud: it runs on your PC only; No employees; No tools or MCP; No product takeover; No PC control; Memory is what exists today: no consolidation or supersession; Barge-in and a second provider come in M5

**Its own steps (lighter slices; the full versions stay in their later milestones):**

| Step | Lane | What | Slice of | Deferred |
|---|---|---|---|---|
| M1.1 | platform | Live conversation path: a provider-neutral adapter and the provider chosen in G0.8, so Sofia answers on any topic | G6.1 | a second provider and the full adapter contract tests |
| M1.2 | platform | Minimal router on the existing classifier: converse, recall-personal, recall-company, ask-clarify, refuse; invalid output falls back to clarification | G12.1, G12.2 | the delegate, use-tool and schedule routes, the labelled evaluation set, and calibration |
| M1.3 | platform | Scope-aware context: personal questions read only the Personal Mind, company questions read only the Company Brain with sources, and nothing found gives an honest 'I do not remember' | G12.3, G11.3 | ranking quality, the retrieval benchmark, supersession and consolidation |
| M1.4 | platform | Voice loop: speak with the existing streaming speech-to-text and hear the replies; push-to-talk; latency measured and recorded | G6.2 | barge-in, turn detection and latency optimisation |
| M1.5 | frontend | Greeting on open and honest indicators: a greeting from real state (plain if none), a live-or-fallback badge, and a chip showing which memory scopes an answer used | G6.6 | the proactive briefing and the persona evaluation |
| M1.6 | platform | Minimal decision log: every turn records route, scopes read, confidence and outcome, and a 'why' view reads it | G12.6 | policy-result fields and replay |
| M1.7 | security | Stop control: 'stop' by voice or panel freezes in-flight turns and scheduled work; deterministic; works with the provider down | G12.7 | integration with the full policy engine |
| M1.8 | platform | Spend settings: a model-spend cap editable in settings; with no value set, no autonomous model spend runs; interactive spend is counted and shown; reaching the cap stops and says so | G12.8 | per-employee caps and cost dashboards |
| M1.9 | quality | One-command smoke test of the whole M1 path with a fake provider | - | everything in the later milestones |

**Gate steps:** G0.8

## M2 - Sofia works when your PC is off

The always-on cloud brain with durable storage, backups and sign-in, so she keeps working with your PC off.

**You test:**
1. Turn off your PC. From another device open the cloud address; Sofia answers and greets you.
2. Restart the cloud host; her memories and conversations are still there.
3. Look at the backup restore drill evidence and the measured recovery time against your targets.
4. Try the cloud address without signing in; it refuses.
5. Confirm no secret appears in the browser (the agent shows the scan).

**Not included yet:** No new Sofia abilities; the same abilities as M1, now always on and safe to expose

**Gate steps:** G0.3, G2.1, G2.2, G2.3, G2.4, G2.5, G2.6, G2.7, G3.1, G3.4, G3.5

## M3 - Sofia remembers you and knows your company

Persistent personal and company memory, kept apart, that survives restarts and can forget.

**You test:**
1. Tell her a fact about you; restart everything; ask next day. She remembers.
2. Correct the fact. She uses the new one and does not recall the old one as current.
3. Ask a company question. The answer cites its sources and never uses your personal memory.
4. Ask something she cannot know. She says she does not remember instead of guessing.
5. Delete a memory. Ask about it. No trace remains.
6. Paste text containing hidden instructions. It does not become a trusted memory.

**Not included yet:** No employees yet, so no per-employee memory in use

**Gate steps:** G4.1, G4.2, G4.3, G4.4, G11.1, G11.2, G11.3, G11.4, G11.5, G11.6, G11.7, G3.3, G3.6

## M4 - Sofia decides well, and you can stop her

The full decision engine, the autonomy policy, the kill switch, and spend limits you control.

**You test:**
1. Ask for something needing a tool or a delegate. She shows the route she chose and why.
2. Ask something ambiguous. She asks a clarifying question.
3. Stop by voice and by panel. Everything freezes; resume needs your confirmation, even with the provider down.
4. Lower the spend cap. A running task stops. With no cap, no autonomous spend runs.
5. Put injected instructions in a document. She does not act on them.
6. Try to raise an autonomy level without a recorded decision. It is impossible.

**Not included yet:** Tools and employees are not connected yet

**Gate steps:** G0.7, G12.1, G12.2, G12.3, G12.4, G12.5, G12.6, G12.7, G12.8, G3.2

## M5 - Cockpit and voice that feel finished

The cockpit (decisions, approvals, activity), polished voice with barge-in, and a UI that is accessible and fast.

**You test:**
1. Open the cockpit. Decisions, approvals and activity come from real data.
2. Talk to her and interrupt mid-sentence. She stops and listens.
3. Approve an action on the panel. Try to approve by voice. Voice approval is refused.
4. Turn voice off. The panel works fully.
5. Check the greeting and the short briefing of what changed since last time.
6. Use the app with the keyboard only; check reduced motion and page speed.

**Not included yet:** Employees, tools and PC control are not connected yet

**Gate steps:** G0.2, G5.1, G5.2, G5.3, G5.4, G6.1, G6.2, G6.3, G6.4, G6.5, G6.6, G6.7, G6.8, G8.1, G8.2, G8.3, G8.4, G8.5

## M6 - Tools, skills and MCP

One gateway through which every tool, skill and MCP server is vetted, limited and audited.

**You test:**
1. Connect one tool you choose. Sofia uses it and asks for approval on side effects.
2. Try to install a tool without confirming. It is impossible.
3. Return injected instructions through a tool result. No unapproved action happens.
4. A cost cap stops a runaway tool loop.

**Not included yet:** Employees are not using tools yet

**Gate steps:** G14.1, G14.2, G14.3, G14.4, G14.5, G14.6, G14.7

## M7 - Sofia's first employee

One AI employee with a charter, tools, budget and its own memory, hired with your approval and managed by Sofia.

**You test:**
1. Approve one hire. See its charter, tools, budget and memory.
2. Give it a task. Get a structured result with evidence.
3. Open the team view; it matches the decision log and shows cost.
4. Revoke its access; it stops at once. Roll back a version.

**Not included yet:** Only one employee; more are hired one at a time later

**Gate steps:** G0.6, G13.1, G13.2, G13.3, G13.4, G13.5, G13.6, G13.7, G13.8

## M8 - Sofia controls your PC by voice

The Windows node: read-only first, then actions you approve.

**You test:**
1. Ask which window is active. She answers (read-only).
2. Ask her to open an app and type text. An approval card appears; approve and it happens; deny and it does not.
3. Show a page with hidden instructions on screen. She does not follow them.

**Not included yet:** No actions without an approval

**Gate steps:** G7.1, G7.2, G7.3, G7.4, G7.5

## M9 - Private beta ready

Operability: logs, alerts, runbooks, failure drills and docs, with an evidence-based go or no-go.

**You test:**
1. Look at logs, errors and model cost. Force a failure and see it appear.
2. Run the failure drills (provider down, database down).
3. Follow the docs from a clean machine to a running system.
4. Read the go or no-go report.

**Not included yet:** Sofia is not running a product yet

**Gate steps:** G9.1, G9.2, G9.3, G9.4, G9.5

## M10 - Sofia runs your first product, supervised

Build, operate, market and support the first product, with approvals and a measured pilot.

**You test:**
1. Name the product and read its charter.
2. Over the pilot period each playbook completes a real cycle, with approvals where required.
3. The weekly report shows outcomes, cost and incidents.
4. Raise or keep each autonomy level by your own decision.

**Not included yet:** Supervised only until you raise a level

**Gate steps:** G0.9, G15.1, G15.2, G15.3, G15.4, G15.5, G15.6, G15.7, G15.8, G15.9

## M11 - Complete product acceptance

Prove the whole vision, in your own words, on the real system.

**You test:**
1. Run scenarios A1 to A9. Each passes or has a signed exception.
2. Read the final report and decide whether to use it every day.

**Not included yet:** Public productization (gate G10) is not applicable

**Gate steps:** G16.1, G16.2, G16.3
