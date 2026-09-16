# SAMJUNIORSOS — SOPHIA + JARVIS ARCHITECTURE AUDIT

**Date:** 2026-09-16  
**Status:** AUDIT COMPLETED — PENDING FOUNDER REVIEW  
**Scope:** Post-Sophia Phase 1 & Phase 2 Architecture Audit, OpenJarvis Codebase Inspection, Live Interaction Research Reconciliation, and Next-Phase Roadmap Recommendation  
**Source of Truth:** Current GitHub repository (`SamjuniorsOS` HEAD), local inspection of `upload/OpenJarvis`, and verified tests.

---

## 1. EXECUTIVE VERDICT

### What should happen next?

1. **Do NOT build a new cognitive brain, a new orchestrator, or a second Sophia.**  
   Sophia Phase 1 (`src/lib/server/sophia/intent-classifier.ts`, `server-gateway.ts`) and Phase 2 (`context-assembly.ts`, `entity-resolver.ts`) have successfully established a battle-tested, authority-partitioned cognitive executive with strict trust boundaries. Both test suites pass 100% (24/24 tests passing: 12 in Phase 1, 12 in Phase 2).

2. **The genuine missing capabilities after Phase 2 are exactly two:**
   - **Gap A (Modality Layer): Live Voice Interaction** — Neither streaming audio capture, Voice Activity Detection (VAD), Speech-to-Text (STT), Text-to-Speech (TTS), audio-level barge-in, nor WebSocket streaming transport exist in the production runtime. Currently, "voice" exists only as visual UI affordances (`micBtn` in prototypes) and research (`doc/RESEARCH_REPORT.md`).
   - **Gap B (State Layer): Persistent Conversation Session History** — While Sophia understands multi-turn dialogue within a request lifecycle (`history` parameter), conversational turns are passed client-side in memory and are not persisted to a relational database table (e.g. Prisma `Conversation` / `ChatMessage`).

3. **Architecture Mandate:**  
   Live Voice Interaction MUST be constructed strictly as a **stateless, streaming modality adapter** over the existing Sophia cognitive engine. Audio streams into the voice adapter, transcribes to text via streaming STT, and enters the exact same `SophiaIntentClassifier` and `SophiaServerGateway` pipeline. Replies stream back through TTS. The existing authorization gate (`SideEffectAuthorizationGate`), epistemic claim separation, company context assembly, and `MultiAgentOrchestrator` remain the single source of truth and authority.

---

## 2. CURRENT SOPHIA CAPABILITY MAP

The table below maps the 12 architectural layers across SamJuniorsOS based on direct repository code inspection:

| # | Cognitive / Architectural Layer | Current Implementation | Evidence in Codebase | Status | Genuine Gap / Nuance |
|---|---|---|---|---|---|
| **1** | **Cognitive Ingress** | Contextual semantic classification across 7 candidate intent kinds (`conversation`, `informational_query`, `operational_inspection`, `directive_proposal`, `steering_proposal`, `approval_proposal`, `clarification_prompt`). Encloses founder utterance in `<founder_utterance>` XML tags; multi-tone support (`professional`, `casual`, `flirty`); deterministic fallback analyzer. | `src/lib/server/sophia/intent-classifier.ts#L19-L130`<br>`src/lib/server/sophia/types.ts#L79-L134`<br>`src/app/api/agent-chat/route.ts#L207-L244` | **EXISTS** | No streaming audio ingress (text-only). Does not support real-time token/audio streaming at ingress boundary. |
| **2** | **Grounding & Context Assembly** | Selective, partitioned context slices across 10 `SophiaAuthorityClass` levels. Dynamic retrieval from 7 authoritative stores. Strict ~1,800-token dynamic payload ceiling. Tri-state deterministic entity resolver (`SophiaEntityResolver`). Fail-soft store degradation (`[UNAVAILABLE / DEGRADED]`). | `src/lib/server/sophia/context-assembly.ts#L31-L377`<br>`src/lib/server/sophia/entity-resolver.ts#L39-L299`<br>`src/lib/server/sophia/types.ts#L12-L50` | **EXISTS** | Complete for operational state, workflows, approvals, knowledge, memory, and facts. |
| **3** | **Conversation Continuity** | Accepts recent dialogue history via `opts.history`, formatted into chat turns, budgeted in context assembly (~250 tokens), used for pronoun resolution and entity matching. | `src/app/api/agent-chat/route.ts#L208-L221`<br>`src/lib/server/sophia/intent-classifier.ts#L94-L104`<br>`tests/sophia/phase1_conversational_executive.test.ts#L368-L407` | **PARTIALLY EXISTS** | **Gap:** History is passed client-side in memory. No server-side relational persistence (`Conversation` / `ChatMessage` Prisma models) to survive full disconnects or cross-device handoffs. |
| **4** | **Executive Reasoning** | Server-side persona instructions defining the COO persona, operating invariants, epistemic truthfulness rules, anti-poisoning defenses. Model output strictly treated as an untrusted proposal. | `src/lib/server/sophia/intent-classifier.ts#L42-L92`<br>`src/lib/server/sophia/server-gateway.ts#L48-L245`<br>`src/lib/server/advisor/` | **EXISTS** | Operates on turn completion. No eager/partial-utterance reasoning during streaming input. |
| **5** | **Decision Support** | Structured informational query resolution across company metrics, epistemic facts, and workstreams; structured clarification prompting with 2-3 discrete options for ambiguous commands. | `src/lib/server/sophia/server-gateway.ts#L173-L244`<br>`src/lib/server/sophia/intent-classifier.ts#L55`<br>`src/lib/server/context/company-context.ts` | **EXISTS** | Fully functional in synchronous request path. |
| **6** | **Planning & Decomposition** | 9-step DAG decomposition protocol (`DECOMPOSITION_PROPOSAL`, `EXECUTIVE_DEBATE`, `EXECUTION`, `SYNTHESIS`, `DELIVERY`) across Executive Council roles (`coo`, `researcher`, `pm`, `finance`). | `src/lib/server/orchestration/orchestrator.ts#L87-L450`<br>`src/lib/server/workflow/` | **EXISTS** | Sophia dispatches directives to the orchestrator; multi-turn interactive conversational plan refinement before dispatch is minimal. |
| **7** | **Execution** | Tool execution engine (`web_research`, GitHub read tools), `ServerAgentExecutor`, run state tracking and checkpointing in `AgentRunStore`. | `src/lib/server/orchestration/orchestrator.ts#L30-L86`<br>`src/lib/server/agents/executor.ts`<br>`src/lib/server/agents/run-store.ts` | **EXISTS** | Mutation adapters (GitHub issue creation, financial transfer) are gated stubs awaiting external credentials. |
| **8** | **Verification** | `ConstitutionalVerifier` enforcing deterministic invariant checks; Output provenance tracking (`OutputProvenance`); Epistemic verification lifecycle. | `src/lib/server/orchestration/verifier.ts`<br>`src/lib/server/orchestration/orchestrator.ts#L26-L28`<br>`src/types/os.ts` | **EXISTS** | Invariants halt unauthorized mutations and malformed artifacts deterministically. |
| **9** | **Persistent Company Understanding** | `CompanyKnowledgeStore` (SOPs, PRDs), `CompanyMemoryStore` (precedents), `EpistemicClaimStore` (Source→Signal→Claim→Fact lineage), `CompanyContextProvider`. | `src/lib/server/knowledge/knowledge-store.ts`<br>`src/lib/server/memory/memory-store.ts`<br>`src/lib/server/epistemic/claim-store.ts`<br>`src/lib/server/context/company-context.ts` | **EXISTS** | Backed by atomic `DurableFileStore` and Prisma schema. Vector search (`pgvector`) is scheduled for future scale. |
| **10** | **Operational Learning** | `OperationalLearningLoop` retrieves historical precedents with keyword/category matching, enforces strict 4-way separation (Current Evidence vs Historical Memory vs AI Inference vs Founder Decision), prevents self-authorizing loops. | `src/lib/server/memory/learning-loop.ts#L64-L296`<br>`src/lib/server/memory/memory-store.ts#L201-L230`<br>`tests/scheduler/phase4_4e_epistemic.test.ts` | **EXISTS** | Precedents commit upon workflow completion. Live conversational insights are not yet auto-distilled into memory. |
| **11** | **Governance & Authorization** | `SideEffectAuthorizationGate` with cryptographic SHA-256 payload binding (`verifyApprovalPayloadBinding`); `InMemoryApprovalStore`; principal binding in `getAuthenticatedFounder()`; gateway policy evaluation. | `src/lib/server/authorization/gate.ts`<br>`src/lib/server/authorization/approval-store.ts`<br>`src/lib/server/sophia/server-gateway.ts#L56-L92` | **EXISTS** | Non-bypassable. Model proposals attempting to forge authority or credentials are stripped and fail closed. |
| **12** | **Live Interaction** | Visual prototypes only (`old/prototypes/core-v4`, `core-v5`, `old/legacy-ui`); audio capture button (`micBtn`) and text speech line (`coreSpeechLine`) in DOM; research report (`doc/RESEARCH_REPORT.md`). | `old/prototypes/core-v5/prototype.js`<br>`doc/RESEARCH_REPORT.md` | **MISSING** | **Zero voice runtime code.** No VAD, no STT, no TTS, no audio streaming WebSocket, no barge-in cancellation, no interruption text reconciliation. |

---

## 3. GENUINE CAPABILITY GAPS

Based strictly on code inspection and test execution, here are the ONLY confirmed gaps:

1. **Audio Ingress & Transport (Live Interaction)**
   - No AudioWorklet mic capture in browser.
   - No WebSocket endpoint for streaming binary audio frames.
   - No client or server Voice Activity Detection (Silero VAD).

2. **Speech Processing Engines (STT / TTS)**
   - No STT integration (Faster-Whisper or Deepgram Flux STT).
   - No TTS integration (Kokoro TTS or Deepgram Flux TTS).

3. **Interruption & Context Reconciliation**
   - In text chat, interrupting is just typing a new message. In live voice, interrupting requires:
     - Sub-200ms audio cancellation (stopping browser audio buffer).
     - Reporting `text_spoken` vs `text_remaining` back to server.
     - Truncating conversational history to what the founder actually heard before speaking.

4. **Durable Conversation Session Storage**
   - The current dialogue history is passed in the request body from client memory. A dropped connection or browser reload resets chat state unless cached in client localStorage.
   - Server lacks an append-only conversation log table linked to the authenticated founder session.

5. **Conversational Plan Refinement Loop**
   - When a directive is proposed, Sophia currently outputs a `directive_proposal` with `prepare_only` mode. If the founder wants to adjust scope in dialogue ("Make it 3 competitors, not 5"), it currently relies on general conversational history rather than an explicit draft-revision state machine.

---

## 4. JARVIS FINDINGS

### Repository Inspection Note
Inspection of `upload/OpenJarvis` reveals that the directory structure and crate layout (`openjarvis-core`, `openjarvis-engine`, `openjarvis-a2a`, etc.) were copied as scaffolding, but almost all crates are **empty directories**. The only actual code files present in `upload/OpenJarvis` are:
- `src/openjarvis/prompt/builder.py` (`SystemPromptBuilder`)
- `tests/prompt/test_builder.py`, `test_persona_scope.py`, `test_system_prompt_builder_few_shot.py`
- `frontend/tsconfig.tsbuildinfo`

Below is the verified breakdown:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ EVIDENCE CLASSIFICATION:                                                    │
│ [VERIFIED FROM JARVIS REPO]    - Directly inspected in upload/OpenJarvis     │
│ [VERIFIED FROM SAMJUNIORS]     - Inspected in SamjuniorsOS production code   │
│ [PRIOR RESEARCH ONLY]          - Extracted from doc/RESEARCH_REPORT.md       │
│ [INFERENCE]                    - Architectural deduction                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Capability 1: Prompt & Context Structure (Frozen Prefix vs Dynamic Suffix)
- **[VERIFIED FROM JARVIS REPO]**: `SystemPromptBuilder` in `upload/OpenJarvis/src/openjarvis/prompt/builder.py#L10-L65` partitions system prompts into `frozen_prefix` (agent persona, soul, memory, user profile, skill catalog) and `dynamic_suffix` (session context, previous state).
- **[VERIFIED FROM SAMJUNIORS]**: `SophiaContextAssembler` in `src/lib/server/sophia/context-assembly.ts` already separates static system instructions from authority-partitioned dynamic context slices with token budgeting (~1,800 tokens).
- **Gap**: SamJuniors prompt structure does not explicitly align with provider-level KV-cache boundaries (e.g. Anthropic/OpenAI prompt caching headers).
- **Recommendation**: **ADAPT**. Structure Sophia's prompt sections so static system instructions and durable company knowledge sit in the cacheable prefix, while operational telemetry and recent messages sit in the suffix.

#### Capability 2: Conversation & Audio Architecture (VAD, STT, TTS, Interruption)
- **[VERIFIED FROM JARVIS REPO]**: Crate directories `openjarvis-engine`, `openjarvis-skills`, and `openjarvis-sessions` are **empty stubs**; no audio, VAD, or streaming code exists in the repository.
- **[PRIOR RESEARCH ONLY]**: Prior research evaluated OpenJarvis as a Tauri desktop shell with local Python/Rust execution, and SamJuniors Core V4/V5 prototypes as text simulations with a central orb and state machine.
- **[VERIFIED FROM SAMJUNIORS]**: Prototypes `old/prototypes/core-v4` and `core-v5` implement a 7-state interaction model (`ready`, `understanding`, `working`, `waiting`, `executing`, `completed`, `blocked`), an animated orb, and `coreSpeechLine` dialogue bubbles, but zero audio streaming.
- **Recommendation**: **ADOPT METAPHOR, BUILD REAL BACKEND**. Adopt the 7-state machine and visual orb language for UI feedback; build the streaming audio backend cleanly using mature commodity streaming components.

#### Capability 3: Tool & Execution Boundaries
- **[VERIFIED FROM JARVIS REPO]**: `openjarvis-tools` is an empty directory stub.
- **[VERIFIED FROM SAMJUNIORS]**: `MultiAgentOrchestrator`, `SideEffectAuthorizationGate`, and `ConstitutionalVerifier` enforce cryptographic payload binding and deterministic invariant validation.
- **Recommendation**: Retain SamJuniors' control plane exclusively. OpenJarvis has nothing to contribute here.

---

## 5. LIVE INTERACTION RESEARCH EVALUATION

Based on `doc/RESEARCH_REPORT.md` and industry technical benchmarks:

### Technology Evaluation & Decisions

| Technology / Pattern | Problem Solved | Relevance to SamJuniors | Decision | Rationale |
|---|---|---|---|---|
| **Cascaded Pipeline (VAD → STT → LLM → TTS)** | Converts voice to text and text to voice while preserving the text reasoning layer | **High** (Matches architecture requirement that voice is a modality, not a second brain) | **ADOPT** | Preserves 100% of Sophia's cognitive pipeline, authorization gates, and epistemic fact separation. Provides full auditability. |
| **End-to-End Speech-to-Speech (GPT-4o Realtime / Gemini Live)** | Sub-400ms latency, native prosody and emotional nuances | Low (Direct violation of core principles) | **REJECT** | Creates a "second Sophia" that bypasses intent classification, context assembly, authorization gates, and company state. Completely un-auditable black box. |
| **Silero VAD (WebAssembly / ONNX)** | Client-side Voice Activity Detection with <10ms latency | **High** | **ADOPT** | Lightweight, open-source (MIT), runs directly in the browser via WASM (`@ricky0123/vad-web`). Eliminates continuous network streaming of silence. |
| **Deepgram Flux STT & TTS** | Fast streaming transcription (<200ms) and interruptible synthesis | **High** (Developer velocity for v1) | **ADAPT / INTEGRATE (v1)** | Excellent streaming WebSocket API. Low operational overhead for single founder. Can migrate to self-hosted Faster-Whisper + Kokoro later if privacy/cost demands. |
| **`text_spoken` / `text_remaining` Interruption Pattern** | Synchronizes LLM dialogue context with what the human actually heard before interrupting | **Critical** | **ADOPT** | Without this, on barge-in the LLM assumes the user heard the entire response, causing hallucinations and broken conversation continuity. |
| **Pipecat / LiveKit Frameworks** | End-to-end voice agent orchestration | Moderate | **DEFER / REJECT for v1** | Heavy infrastructure (WebRTC SFU, Python runtime). Overkill for single-founder web app. A lightweight WebSocket adapter in Next.js/Node is significantly simpler and faster to maintain. |
| **Push-to-Talk as Default** | Avoids accidental microphone capture of ambient background speech | **Critical** (Single-founder security & privacy) | **ADOPT** | Safe default. Tap orb or hold spacebar to speak. Always-listening can be an opt-in toggle. |

---

## 6. ARCHITECTURE DECISION

### Architecture Diagram: Sophia Live Modality Adapter

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BROWSER / CLIENT UI                              │
│                                                                             │
│   ┌───────────────┐     ┌───────────────┐     ┌────────────────────────┐    │
│   │ Audio Capture │────▶│  Silero VAD   │────▶│ WebSocket Client       │    │
│   │ (Worklet 16k) │     │ (WASM in web) │     │ (Binary PCM frames)    │    │
│   └───────────────┘     └───────────────┘     └───────────┬────────────┘    │
│                                                           │                 │
│   ┌─────────────────────────────────────────┐             │ Audio &         │
│   │ Visual Feedback: Jarvis Orb Metaphor    │             │ Events          │
│   │ (IDLE → LISTENING → THINKING → SPEAKING)│             │                 │
│   └────────────────────▲────────────────────┘             │                 │
│                        │ Playback & Interrupt             ▼                 │
│   ┌────────────────────┴───────────────────────────────────────────────┐    │
│   │ AudioContext Player (Instant barge-in mute; reports text_spoken)   │    │
│   └────────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ WebSocket (WSS) over TLS
                                    │ Authenticated Founder Session
┌───────────────────────────────────▼─────────────────────────────────────────┐
│              SOPHIA LIVE INTERACTION SERVER (MODALITY ADAPTER)              │
│                                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │ Session & Interruption Manager                                     │    │
│   │ - Manages connection lifecycle & state transitions                 │    │
│   │ - On barge-in: cancels active TTS synthesis, truncates context     │    │
│   └──────────────────┬──────────────────────────────▲──────────────────┘    │
│                      │ Audio frames                 │ Audio chunks          │
│                      ▼                              │                       │
│   ┌──────────────────────────────────┐   ┌──────────────────────────────┐   │
│   │ Streaming STT (Deepgram/Whisper) │   │ Streaming TTS (Kokoro/Flux)  │   │
│   └──────────────────┬───────────────┘   └──────────▲───────────────────┘   │
│                      │ Final transcript             │ Streaming tokens /    │
│                      │ text string                  │ sentences             │
│                      ▼                              │                       │
│   ┌─────────────────────────────────────────────────┴──────────────────┐    │
│   │              SOPHIA COGNITIVE & EXECUTIVE ENGINE                   │    │
│   │                 (EXISTING — 100% REUSED)                           │    │
│   │                                                                    │    │
│   │  1. SophiaContextAssembler.assemble({ message, history })          │    │
│   │     - 7 Authoritative Stores (State, Epistemic, Memory, etc.)      │    │
│   │     - ~1,800-token dynamic payload ceiling                         │    │
│   │  2. SophiaIntentClassifier.classify()                              │    │
│   │     - Contextual semantic classification                           │    │
│   │  3. SophiaServerGateway.process()                                  │    │
│   │     - Trust boundary, principal binding, policy enforcement        │    │
│   └──────────────────┬─────────────────────────────────────────────────┘    │
└──────────────────────┼──────────────────────────────────────────────────────┘
                       │ Validated Commands
                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXISTING SAMJUNIORSOS CONTROL PLANE                      │
│                                                                             │
│   MultiAgentOrchestrator       SideEffectAuthorizationGate                  │
│   CompanyContextProvider       ConstitutionalVerifier                       │
│   EpistemicClaimStore          AgentRunStore & Durable Persistence          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Invariants Preserved:
1. **Zero Cognitive Duplication:** The voice adapter does not make decisions, parse intents, or invoke tools. It transcribes audio to text and synthesizes text to audio.
2. **Deterministic Governance:** Spoken approvals ("I approve Julian's migration") MUST generate an `approval_proposal` candidate that passes through `SophiaServerGateway` and `SideEffectAuthorizationGate`. Voice never auto-executes mutations.
3. **Auditability:** Every spoken interaction generates an auditable text turn in history.

---

## 7. WHAT NOT TO BUILD

To prevent over-engineering and architectural drift:

1. **DO NOT build an end-to-end Speech-to-Speech (S2S) model integration.** (Bypasses control plane and authorization).
2. **DO NOT build a second orchestrator for voice.** (`MultiAgentOrchestrator` handles all multi-agent work).
3. **DO NOT build a "Voice Memory Store".** (All memory is recorded via `OperationalLearningLoop` into `CompanyMemoryStore`).
4. **DO NOT build an unauthenticated voice WebSocket.** (Must require founder session authentication).
5. **DO NOT build a complex WebRTC SFU / telephony mesh.** (Single-founder browser app only requires a simple WebSocket with binary PCM/Opus).
6. **DO NOT build custom STT/TTS models from scratch.** (Use mature commodity models: Deepgram / Faster-Whisper / Kokoro).
7. **DO NOT build local-only desktop hooks (Tauri/Rust) unless the founder specifically pivots to desktop.**

---

## 8. RISKS & MITIGATIONS

| Risk Domain | Risk Description | Severity | Concrete Mitigation |
|---|---|---|---|
| **Technical** | High latency (>1200ms) making speech feel unnatural and sluggish. | Medium | Stream tokens directly from LLM to TTS on the first sentence boundary; use browser-side VAD (Silero) so speech-end is detected in <250ms. |
| **Security** | Ambient audio or unauthorized voices triggering actions ("Approve the transfer"). | **High** | 1. Push-to-talk default.<br>2. Voice approvals require explicit confirmation prompt.<br>3. Consequential actions still require visual button signature on high-risk gates. |
| **Operational** | STT transcribes words incorrectly, causing unintended classification. | Medium | Display live transcript in the UI alongside audio playback; ambiguous inputs trigger `clarification_prompt`. |
| **Product** | Founder feels voice is gimmicky compared to fast keyboard commands. | Low | Voice is an optional modality. Full keyboard navigation and text chat remain 100% available at all times. |
| **Cost** | Third-party streaming STT/TTS costs accumulating during long sessions. | Low | At founder scale (30-60 min/day), Deepgram API costs ~$15–$50/mo. If higher, swap to self-hosted Faster-Whisper + Kokoro. |
| **Scaling** | Concurrency and state synchronization on WebSocket reconnects. | Low | Single active voice connection per founder session; state re-synchronizes from server-side dialogue history. |

---

## 9. OPEN QUESTIONS FOR FOUNDER DECISION

1. **Modality Priority vs Foundation Completion:**  
   Should we proceed directly with **Sophia Phase 3: Live Voice Interaction (Cascaded Pipeline)**, OR should we first complete **Relational Database Persistence (PostgreSQL/Prisma migration for Conversation & Audit logs)** per `ROADMAP.md`?
2. **STT / TTS Provider Choice for v1:**  
   Do you prefer starting with **Deepgram API** (zero DevOps, instant setup, ~$0.03/min) or a **Self-Hosted Local Stack** (Faster-Whisper + Kokoro TTS, requires local GPU/server resources)?
3. **Approval Boundary on Voice:**  
   When the founder speaks "I approve Julian's migration", should Sophia:
   - *Option A:* Directly resolve the pending approval gate (since founder principal is authenticated on the WebSocket)?
   - *Option B:* Verbally ask for confirmation ("Confirming: approve migration of Julian's database?"), then resolve?
   - *Option C:* Require a physical click on the Decision Gate panel for high-risk mutations? *(Recommended: Option B for medium risk, Option C for high risk).*

---

## 10. RECOMMENDED ROADMAP

```
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: SOPHIA CONVERSATIONAL PERSISTENCE & SESSION MANAGEMENT        │
│ Scope: Prisma Conversation & ChatMessage models, durable turn logging, │
│ multi-turn session continuity across browser reloads.                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ PHASE 4: SOPHIA LIVE INTERACTION (VOICE MODALITY ADAPTER)              │
│ - Slice 4.1: AudioWorklet capture + Silero VAD (WASM) in browser       │
│ - Slice 4.2: WebSocket Voice Gateway with authenticated founder session│
│ - Slice 4.3: Streaming STT & TTS pipeline integration                  │
│ - Slice 4.4: Sub-200ms barge-in and text_spoken context reconciliation │
│ - Slice 4.5: Jarvis visual orb state integration (listening/thinking)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ PHASE 5: INTERACTIVE PLAN REFINEMENT & VOICE STEERING                  │
│ Scope: Multi-turn conversational drafting of directives before dispatch│
│ into MultiAgentOrchestrator.                                           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 11. EXACT NEXT ACTION

**STOP AND AWAIT FOUNDER REVIEW.**  
Do not write implementation code for voice or database migrations until the Founder reviews this audit report and provides direction on:
1. Scope choice: Voice Modality (Phase 4) vs Conversation DB Persistence (Phase 3).
2. STT/TTS provider preference (Deepgram API vs Self-hosted).

---

## 12. DOCUMENTATION CHANGES & DURABLE RECORD

- **ADR Created / Updated:** No ADR was created or superseded in this step because this is an audit/research gate. An ADR will be created when the Founder selects the implementation path.
- **Roadmap:** Updated durable record in `doc/SOPHIA_JARVIS_AUDIT.md` and documented audit results in `WORKLOG.md`.
- **Source Verification:** Confirmed that tests in `tests/sophia/phase1_conversational_executive.test.ts` (12/12) and `tests/sophia/phase2_grounding_context.test.ts` (12/12) pass with 100% success. Verified `upload/OpenJarvis` is scaffolding stubs with only `SystemPromptBuilder` implemented.
