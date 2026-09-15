# SOPHIA LIVE INTERACTION — RESEARCH REPORT

**Version:** 1.0.0 — Research-only, pre-implementation  
**Date:** 2026-09-15  
**Status:** Pending Founder Review  
**Scope:** Architecture research for a Deepgram/Siri/Alexa-class realtime conversational voice layer above the existing Sophia cognitive architecture  

> **IMPORTANT:** This document is research and architecture only. No implementation has been done or should begin until the Founder reviews and approves an implementation plan derived from this research.

---

## TABLE OF CONTENTS

1. [Verdict](#1-verdict)
2. [Experience Benchmark](#2-experience-benchmark)
3. [Deepgram Analysis](#3-deepgram-analysis)
4. [Deepgram Talk Demo Analysis](#4-deepgram-talk-demo-analysis)
5. [Jarvis Analysis](#5-jarvis-analysis)
6. [Hermes / Existing Agent Analysis](#6-hermes--existing-agent-analysis)
7. [Open-Source Landscape](#7-open-source-landscape)
8. [Architecture Options](#8-architecture-options)
9. [Recommended Architecture](#9-recommended-architecture)
10. [Latency Model](#10-latency-model)
11. [Memory / Context Model](#11-memory--context-model)
12. [Security Model](#12-security-model)
13. [Market Benchmark](#13-market-benchmark)
14. [Failure Modes](#14-failure-modes)
15. [Cost Model](#15-cost-model)
16. [Build vs Buy](#16-build-vs-buy)
17. [What to Adopt / Adapt / Reject](#17-what-to-adopt--adapt--reject)
18. [Phased Implementation Plan](#18-phased-implementation-plan)
19. [Open Questions](#19-open-questions)

---

## 1. VERDICT

**A cascaded pipeline (VAD → STT → LLM → TTS) is the correct architecture for Sophia Live Interaction**, with the voice layer sitting above the existing Sophia cognitive architecture as a modality layer — not a second intelligence.

**Why cascaded over multimodal speech-to-speech:**
- The existing Sophia system already has a mature cognitive pipeline (intent classification → context assembly → server gateway → orchestration → authorization) that produces text-based structured proposals. A speech-to-speech model would bypass this entire stack, creating exactly the "second Sophia" the requirements forbid.
- Cascaded pipelines give full auditability: text exists at every boundary (STT output, LLM input/output, TTS input). This is critical for a system with authorization gates, epistemic fact separation, and provenance tracking.
- The latency gap has narrowed significantly. A well-engineered cascaded pipeline achieves ~600–800ms end-of-turn to first-audio, which is within the "natural conversation" threshold.
- Component-level swap is possible: STT, TTS, and LLM can each be upgraded independently without rebuilding the voice stack.

**Primary technology recommendation:**
- **VAD:** Silero VAD (browser via @ricky0123/vad-web, server via Python/Node ONNX)
- **STT:** Faster-Whisper (self-hosted) or Deepgram Flux STT (API, if cost acceptable)
- **Turn Detection:** Semantic model-native (Deepgram Flux) or heuristic VAD + silence threshold
- **LLM:** Existing Sophia pipeline (SophiaIntentClassifier → SophiaServerGateway → Orchestrator)
- **TTS:** Kokoro TTS (self-hosted, open-source, 82M params, Hindi support) or Deepgram Flux TTS (API)
- **Framework:** Pipecat (Python, transport-agnostic, composable pipeline)
- **Transport:** WebSocket with raw PCM/opus audio frames

---

## 2. EXPERIENCE BENCHMARK

The target Sophia voice interaction should match or exceed these characteristics:

| Metric | Target | Benchmark Source |
|:---|:---|:---|
| End-of-turn to first audio | < 800ms | Deepgram industry standard |
| Barge-in latency | < 200ms | Deepgram Flux |
| Turn detection accuracy | < 5% false interruptions | Deepgram Flux (~30% reduction) |
| Voice naturalness | MOS ≥ 4.0 | Kokoro/Flux TTS benchmarks |
| Interruption reconciliation | Track text_spoken vs text_remaining | Deepgram Flux pattern |
| Session reconnect | Transparent to Founder | Requirement |
| Text fallback | Automatic on voice failure | Requirement |
| Hindi support | Functional STT + TTS | Requirement |
| Listening/Speaking/Thinking states | Visible to Founder | Requirement |

---

## 3. DEEPGRAM ANALYSIS

### 3.1 Architecture Overview

**[VERIFIED FACT]** Deepgram's Flux architecture integrates STT, turn detection, and TTS into a conversational state machine rather than treating them as independent services.

**[VERIFIED FACT]** Flux STT handles both transcription and turn-taking natively. It uses semantic + acoustic cues, not just silence detection, reducing false interruptions by ~30%.

**[VERIFIED FACT]** Flux TTS (`/v2/speak`) operates as an interruptible, stateful conversation stream with these events:
- `SpeechStarted` — synthesis begins
- `SpeechMetadata` — progress tracking
- `SpeechInterrupted` → `text_spoken` + `text_remaining`
- `Flushed` — turn complete

**[VERIFIED FACT]** The `Interrupt` command from client → server causes immediate TTS cancellation and returns the exact split between spoken/remaining text. This is the key innovation for LLM context synchronization.

**[VERIFIED FACT]** Deepgram recommends 80ms audio chunk size for streaming STT. Transport is WebSocket throughout.

**[VERIFIED FACT]** The Voice Agent API bundles STT + orchestration + TTS through a single WebSocket connection, reducing inter-service network hops.

### 3.2 What Makes It Feel Natural

**[EXPERIENCE PATTERN]** Five factors create natural-feeling interaction:
1. **Semantic turn detection** — Model understands when the human is genuinely done vs. pausing mid-thought. Pure silence-based VAD clips speakers mid-sentence.
2. **Streaming token-to-audio** — LLM tokens flow directly to TTS as they're generated. The agent starts speaking before the full response exists.
3. **Interruption reconciliation** — The system knows exactly what was heard. The LLM context stays synchronized with reality.
4. **Sub-300ms barge-in** — When the Founder speaks, TTS stops nearly instantly. No "talking over" the agent.
5. **No dead air** — The gap between Founder stopping and agent starting is minimized through tight pipeline coupling.

### 3.3 Deepgram Pricing Impact

**[VERIFIED FACT]** Current pricing (post Sept 13 2026):
- STT streaming: ~$0.0077/min
- TTS (Aura-2): ~$0.030/1K chars
- Voice Agent API (bundled): $0.065–$0.163/min
- $200 free credit for new accounts

**[INFERENCE]** For a single-founder usage pattern (perhaps 30–60 min/day of voice interaction), monthly cost would be $60–$300/month on the Voice Agent API, or $15–$50/month using STT + TTS separately with a self-hosted LLM.

---

## 4. DEEPGRAM TALK DEMO ANALYSIS

**[VERIFIED FACT — inspected via browser]** `https://talk.deepgram.com/` is a production demo of Flux TTS with real-time voice conversation.

### Architecture (from page source):
```
Browser → <voice-widget> custom element
        → FluxAgentClient(wsUrl)
        → WebSocket: /ws/deepgram/voiceagent
        → Bun server (same-origin)
        → Deepgram APIs
```

### Key observations:
- **Custom Web Component**: `<voice-widget>` encapsulates the entire voice UI
- **Agent abstraction**: `createAgent: () => new FluxAgentClient(wsUrl)` — clean factory pattern
- **Events**: `voice-connected`, `transcript`, `voice-ended`, `voice-error`, `feedback`
- **Graceful fallback**: If WebSocket can't open, falls back to a built-in mock
- **Minimal surface**: The entire page is the voice widget (full viewport `position: fixed; inset: 0`)
- **Voice personas**: Multiple voices (Alexis, Kit, Gemma, Kai, Haley, Cliff, Brooke) with accent/locale info
- **Scenario presets**: Default, Pet Hospital, Customer Service, Car Dealership, Script (TTS sandbox)
- **Visual design**: 3D animated orb (`<molten-orb>`), dark mode, zero-friction "Click to talk"

### Relevant patterns for Sophia:
- The `<voice-widget>` custom element encapsulation is clean and reusable
- Event-driven architecture (`voice-connected`, `transcript`, etc.) maps well to state management
- Feedback collection endpoint (`/feedback`) for continuous improvement
- The fallback-to-mock pattern is directly useful for development/testing

---

## 5. JARVIS ANALYSIS

**[VERIFIED FACT]** "Jarvis" in SamJuniorsOS is NOT a voice system. It is an AI interaction mode (natural-language text intent) as opposed to "Manual" (direct module navigation). Both share the same OS, authorization, and data layer.

### Component-by-component assessment from Core V4/V5 prototypes:

| Component | What Exists | Verdict | Justification |
|:---|:---|:---|:---|
| **Interaction model** | Text command → understanding → active work → decision gate → outcome | **ADOPT** | This is the exact cognitive loop. Voice adds a modality, not a new loop. |
| **State machine** | 7 internal states (ready, understanding, working, waiting, executing, completed, blocked) | **ADOPT** | Maps directly to Sophia listening/thinking/speaking states for voice |
| **Work threads** | Persistent, survive state changes, inspectable | **ADOPT** | Voice should reference active threads, not create parallel tracking |
| **Founder interruption** | New command redirects active work with WORK UPDATED notice | **ADAPT** | Voice barge-in needs faster interruption than text; same semantics, tighter timing |
| **Conversational steering** | Free-text modifier to active work | **ADOPT** | Voice steering is identical — spoken instruction modifies active work |
| **Decision boundary** | Consequential actions require explicit founder approval | **ADOPT** | Voice must not bypass this. "I approve" via speech must hit the same SideEffectAuthorizationGate |
| **Attention model** | "What matters now" strip | **ADOPT** | Voice can proactively surface attention items |
| **Visual orb/presence** | Animated core with state-aware particles and frequency wave | **ADAPT** | Voice UI needs visual feedback (listening/thinking/speaking animation) — reuse this visual language |
| **Client-side simulation** | All state is JS, no backend | **REJECT for voice** | Voice requires real server-side processing (STT/TTS). Prototype pattern doesn't apply. |
| **Core V5 speech line** | `coreSpeechLine` — Core speaks text to founder in dialogue bubbles | **ADAPT** | This is the text precursor to voice. Voice replaces rendered text with spoken audio, but can show transcript alongside. |
| **Mic button** | `micBtn` element exists in V5 DOM | **ADOPT** | UI affordance for voice input already anticipated |
| **VAD / STT / TTS** | None exist in the codebase | N/A | Greenfield — nothing to adopt or reject |
| **Streaming** | No audio streaming exists | N/A | Greenfield |
| **Memory** | No persistent conversation memory in prototypes | **REJECT** | Use existing server-side CompanyMemoryStore and EpistemicPipeline instead |

### Summary:
The Jarvis prototypes establish the correct **interaction semantics** (intent → work → decision → outcome) and **visual language** (animated orb, state colors, dialogue-first). Voice should extend this, not replace it. The prototypes are client-side simulations with no voice infrastructure — everything below the UX metaphor is greenfield.

---

## 6. HERMES / EXISTING AGENT ANALYSIS

**[VERIFIED FACT]** "Hermes" appears only as a package-lock dependency (`hermes-engine`), likely React Native related. There is no standalone Hermes agent system in this repository.

**[VERIFIED FACT]** The actual agent/cognitive architecture that matters is the Sophia server stack:

### Existing systems that the voice layer MUST reuse (not duplicate):

| System | Location | What It Does | Voice Integration Point |
|:---|:---|:---|:---|
| **SophiaIntentClassifier** | `src/lib/server/sophia/intent-classifier.ts` | Evaluates founder utterance → CandidateIntentProposal (7 kinds) | STT transcript feeds directly here instead of text input |
| **SophiaContextAssembler** | `src/lib/server/sophia/context-assembly.ts` | Assembles authority-partitioned context slices with token budgeting | No change needed — voice doesn't change what context is assembled |
| **SophiaServerGateway** | `src/lib/server/sophia/server-gateway.ts` | Trust boundary: strips untrusted fields, binds verified principal, dispatches | Voice must route through here. No direct tool execution. |
| **SophiaEntityResolver** | `src/lib/server/sophia/entity-resolver.ts` | Tri-state entity resolution (resolved/unresolved/ambiguous) | No change needed |
| **MultiAgentOrchestrator** | `src/lib/server/orchestration/orchestrator.ts` | Multi-agent execution with verification and authorization gates | Voice triggers orchestration through normal path |
| **CompanyContextProvider** | `src/lib/server/context/company-context.ts` | Operational state projection | Voice reads company state through this, not independently |
| **EpistemicPipeline** | `src/lib/server/epistemic/pipeline.ts` | Source→Signal→Claim→Fact lifecycle with provenance | Voice-derived facts follow the same epistemic path |
| **EpistemicClaimStore** | `src/lib/server/epistemic/claim-store.ts` | Claim storage with verification status | No change needed |
| **CompanyMemoryStore** | `src/lib/server/memory/memory-store.ts` | Historical precedent with epistemic confidence tags | Voice conversation summaries feed into here |
| **CompanyKnowledgeStore** | `src/lib/server/knowledge/knowledge-store.ts` | Durable reference SOPs, PRDs, architecture docs | Voice queries against this, doesn't create a parallel store |
| **SideEffectAuthorizationGate** | `src/lib/server/authorization/gate.ts` | Authorization with payload binding | Voice approvals MUST go through this gate |
| **ConstitutionalVerifier** | `src/lib/server/orchestration/verifier.ts` | Deterministic invariant checks | No change needed |

### Key architectural types already defined:

```
SophiaAuthorityClass: 10 authority levels
  CONVERSATIONAL_RECORD | AUTHORITATIVE_OPERATIONAL_STATE | EPISTEMIC_FACT |
  CANONICAL_FACT | UNVERIFIED_CLAIM | ACTIVE_WORKFLOW_STATE |
  PENDING_GOVERNANCE_STATE | COMPANY_KNOWLEDGE | HISTORICAL_PRECEDENT | RECENT_ACTIVITY

CandidateIntentProposal: 7 intent kinds
  conversation | informational_query | operational_inspection |
  directive_proposal | steering_proposal | approval_proposal | clarification_prompt

ValidatedSophiaCommand: 7 command types
  CONVERSATION_REPLY | RESOLVED_INFORMATION | DISPATCH_INSPECTION |
  DISPATCH_DIRECTIVE | RESOLVE_APPROVAL | PRESENT_CLARIFICATION | REGISTER_STEERING

TurnMetrics: Existing latency tracking
  contextAssemblyMs | retrievalMs | modelMs | gatewayValidationMs | totalTurnMs
```

### Critical constraint:
The voice layer adds **only**:
1. Audio capture → text (STT)
2. Text → audio (TTS)
3. Session/transport management (WebSocket, interruption state)
4. Voice-specific UI state (listening, thinking, speaking)

Everything else flows through the existing Sophia stack unchanged.

---

## 7. OPEN-SOURCE LANDSCAPE

### 7.1 Component Comparison Matrix

#### VAD (Voice Activity Detection)

| Option | License | CPU Only? | Latency | Quality | Hindi | Browser | Node/Python | Maturity |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **Silero VAD** | MIT | ✅ | < 10ms | Excellent | Language-agnostic | ✅ (ONNX/WASM) | ✅ | Production |
| WebRTC VAD | BSD | ✅ | < 5ms | Moderate | Language-agnostic | ✅ | ✅ | Legacy |
| Cobra (Picovoice) | Commercial | ✅ | < 10ms | Excellent | ✅ | ✅ | ✅ | Production |

**Recommendation:** Silero VAD — gold standard, open-source, runs in browser via WASM.

#### STT (Speech-to-Text)

| Option | License | GPU Required? | Streaming | Latency | Quality | Hindi | Browser | Cost |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **Faster-Whisper** | MIT | GPU preferred | ✅ (chunked) | 150–400ms | Excellent | ✅ | ❌ (server) | Free (self-hosted) |
| Whisper.cpp | MIT | CPU ok | ✅ (chunked) | 200–600ms | Excellent | ✅ | ✅ (WASM) | Free |
| **Deepgram Flux STT** | Proprietary API | N/A | ✅ (native) | 150–300ms | Excellent+ | ✅ | ❌ (API) | $0.0077/min |
| Google Chirp | Proprietary API | N/A | ✅ | 100–250ms | Excellent | ✅ | ❌ (API) | $0.012/min |
| Sarvam AI (Indic) | Proprietary | N/A | ✅ | ~200ms | Excellent (Hindi) | ✅✅ | ❌ (API) | Varies |

**Recommendation:** Start with Faster-Whisper (self-hosted, free, good Hindi). Fall back to Deepgram Flux STT if quality/latency insufficient.

#### Turn Detection

| Option | Approach | Latency | False-interrupt Rate | Integration |
|:---|:---|:---|:---|:---|
| **Silence threshold** (VAD-based) | Acoustic only | 300–700ms silence → end-of-turn | High (clips mid-pause) | Simple |
| **Deepgram Flux native** | Semantic + acoustic | Model-determined | ~30% lower | Deepgram API only |
| **LLM-assisted** | Send partial transcript → LLM judges "done?" | +200–400ms | Low | Custom, adds latency |

**Recommendation:** VAD silence threshold (500ms default, tunable) for v1. Explore semantic turn detection in v2.

#### TTS (Text-to-Speech)

| Option | License | Size | GPU? | Streaming | Latency (TTFA) | Quality | Hindi | Cost |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **Kokoro TTS** | Apache 2.0 | 82M params | Optional | ✅ | < 100ms (GPU) | High (MOS ~4.0) | ✅ | Free |
| XTTS-v2 (Coqui) | CPML | ~1.5B params | Required | ✅ | 200–500ms | Very High (MOS ~4.3) | ✅ | Free (restrictive license) |
| **Deepgram Flux TTS** | Proprietary API | N/A | N/A | ✅ (native) | < 200ms | Very High | Limited | $0.030/1K chars |
| Piper TTS | MIT | ~40M params | CPU ok | ✅ | < 50ms | Moderate | Limited | Free |
| Edge TTS (Microsoft) | Free API | N/A | N/A | ✅ | ~150ms | High | ✅ | Free (unofficial) |

**Recommendation:** Kokoro TTS — open-source, lightweight, Hindi support, excellent latency. Edge TTS as zero-cost backup for development.

#### Orchestration Frameworks

| Framework | License | Language | Transport | Strength | Weakness |
|:---|:---|:---|:---|:---|:---|
| **Pipecat** | BSD | Python | Agnostic (WebSocket, Daily, LiveKit) | Clean composable pipeline, easy provider swap | Python-only |
| **LiveKit Agents** | Apache 2.0 | Python + Go | Native WebRTC SFU | Production scale, built-in SIP, jitter buffering | Heavier infrastructure |
| Vocode | MIT | Python | WebSocket, Twilio | Simple API | Less maintained |
| Custom (from scratch) | N/A | TypeScript | WebSocket | Full control | Significant engineering effort |

**Recommendation:** Pipecat for v1 prototyping (simplest, most flexible). Evaluate LiveKit if scaling to multi-user or telephony.

### 7.2 Transport Layer

| Option | Latency | Browser Support | Complexity | Cost |
|:---|:---|:---|:---|:---|
| **Raw WebSocket** | Low (~10–30ms overhead) | ✅ | Low | Free |
| WebRTC (via LiveKit) | Lowest (~5ms, jitter-buffered) | ✅ | High | LiveKit Cloud or self-hosted |
| Server-Sent Events + POST | Moderate | ✅ | Low | Free |

**Recommendation:** WebSocket for v1. WebRTC if sub-100ms transport matters later.

---

## 8. ARCHITECTURE OPTIONS

### Option A: Cascaded Pipeline (Recommended)

```
Browser (Mic → AudioWorklet → PCM chunks)
  ↓ WebSocket
Server (VAD → STT → transcript)
  ↓
Sophia Cognitive Layer
  (SophiaIntentClassifier → SophiaContextAssembler →
   SophiaServerGateway → Orchestrator)
  ↓
TTS (text → streaming audio)
  ↓ WebSocket
Browser (AudioContext → speaker playback)
```

**Pros:**
- Text at every boundary → full audit trail
- Reuses 100% of existing Sophia stack
- Components independently swappable
- Cost-controllable (self-hosted options for every layer)
- Hindi support at each layer
- Interruption handling is well-understood

**Cons:**
- Higher end-to-end latency than S2S (~600–800ms vs ~300–500ms)
- Multiple serialization/deserialization steps
- Turn detection is acoustic-only unless using Deepgram

**Risk:** Latency may feel sluggish if poorly optimized. Mitigation: aggressive streaming at every stage.

### Option B: Realtime Multimodal (Speech-to-Speech)

```
Browser (Mic → raw audio)
  ↓ WebSocket
GPT-4o Realtime / Gemini Live (audio → audio)
  ↓ WebSocket
Browser (speaker playback)
```

**Pros:**
- Lowest possible latency (~300–500ms)
- Native prosody, emotional coloring, backchanneling
- Simplest pipeline (fewest components)

**Cons:**
- **Creates a second Sophia** — bypasses intent classification, context assembly, authorization gate, epistemic pipeline, orchestration. Violates the core requirement.
- No text boundary for audit/logging without additional STT
- Locked to a single vendor (OpenAI or Google)
- Extremely expensive ($0.06+/min for audio tokens)
- Limited tool-calling reliability through audio interface
- Hindi quality varies by model
- Black-box: can't inspect or modify reasoning

**REJECTED** — Directly contradicts the architectural constraint that voice is a modality, not a new intelligence.

### Option C: Hybrid (S2S frontend + Cascaded backend)

```
Browser → S2S model handles audio ↔ audio for "feel"
          BUT reasoning/tool-calling routes through Sophia backend
```

**Pros:**
- Best "feel" (natural prosody)
- Can potentially get text from the S2S model for audit

**Cons:**
- Dual-brain problem: the S2S model has its own reasoning that may conflict with Sophia's
- Context synchronization between S2S model and Sophia is unsolved
- Still vendor-locked for the S2S component
- Complexity of maintaining two reasoning paths
- Cost of running two LLMs per interaction

**REJECTED** for v1 — adds complexity with unclear benefit over a well-optimized cascaded pipeline. Could be re-evaluated once S2S models expose clean "reasoning bypass" APIs.

---

## 9. RECOMMENDED ARCHITECTURE

### Architecture: Cascaded Pipeline with Aggressive Streaming

```
┌──────────────────────────────────────────────────────────┐
│                    BROWSER CLIENT                         │
│                                                          │
│  ┌─────────┐   ┌──────────┐   ┌────────────┐           │
│  │ Mic API │──▶│ AudioWorklet │──▶│ Silero VAD │          │
│  │ (PCM)   │   │ (16kHz)  │   │ (WASM)     │           │
│  └─────────┘   └──────────┘   └──────┬─────┘           │
│                                       │                   │
│  Speech detected? ────────────────────┤                   │
│                                       ▼                   │
│  ┌─────────────────────────────────────────────────┐     │
│  │ WebSocket Transport (audio chunks ↑↓ audio)     │     │
│  └──────────────────┬──────────────────────────────┘     │
│                     │                                     │
│  ┌──────────────────┴──────────────────────────────┐     │
│  │ Session State Machine                            │     │
│  │ States: IDLE → LISTENING → THINKING → SPEAKING   │     │
│  │         ← INTERRUPTED ← RECONNECTING            │     │
│  └──────────────────────────────────────────────────┘     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐     │
│  │ TTS Playback (AudioContext + interruption logic) │     │
│  │ Tracks: text_spoken / text_remaining on barge-in │     │
│  └──────────────────────────────────────────────────┘     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐     │
│  │ Visual Feedback (Core orb + state indicator)     │     │
│  └──────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
                          │
                    WebSocket (PCM audio ↑↓ opus audio)
                          │
┌──────────────────────────────────────────────────────────┐
│                VOICE INTERACTION SERVER                    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐     │
│  │ Session Manager (per-connection state)           │     │
│  │ - connection lifecycle                           │     │
│  │ - interruption state machine                     │     │
│  │ - text_spoken / text_remaining tracking          │     │
│  │ - reconnection / session resume                  │     │
│  └──────────────────┬───────────────────────────────┘     │
│                     │                                     │
│  ┌──────────────────┴───────────────────┐                │
│  │ STT Engine                           │                │
│  │ (Faster-Whisper or Deepgram API)     │                │
│  │ - streaming partial transcripts      │                │
│  │ - final transcript on end-of-turn    │                │
│  └──────────────────┬───────────────────┘                │
│                     │ transcript text                     │
│                     ▼                                     │
│  ┌──────────────────────────────────────────────────┐     │
│  │              SOPHIA COGNITIVE LAYER               │     │
│  │  (EXISTING — NO MODIFICATIONS FOR VOICE)         │     │
│  │                                                   │     │
│  │  SophiaIntentClassifier.classify(transcript)      │     │
│  │  SophiaContextAssembler.assemble(message, session)│     │
│  │  SophiaServerGateway.process(proposal, session)   │     │
│  │  → MultiAgentOrchestrator (if directive)          │     │
│  │  → SideEffectAuthorizationGate (if consequential) │     │
│  └──────────────────┬───────────────────────────────┘     │
│                     │ reply text (streaming)              │
│                     ▼                                     │
│  ┌──────────────────────────────────────────────────┐     │
│  │ TTS Engine                                       │     │
│  │ (Kokoro or Deepgram Flux TTS)                    │     │
│  │ - streaming text → audio chunks                   │     │
│  │ - interruptible (cancel on barge-in)              │     │
│  │ - reports text_spoken on interruption             │     │
│  └──────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
                          │
                    Uses existing stores (NO DUPLICATION)
                          │
┌──────────────────────────────────────────────────────────┐
│             EXISTING SAMJUNIORS OS BACKEND                │
│                                                          │
│  CompanyContextProvider    EpistemicPipeline              │
│  CompanyMemoryStore        CompanyKnowledgeStore          │
│  EpistemicClaimStore       AgentRunStore                  │
│  InMemoryApprovalStore     SideEffectAuthorizationGate    │
│  ConstitutionalVerifier    ActivityProjection             │
│  DurableFileStore          Prisma/Postgres                │
└──────────────────────────────────────────────────────────┘
```

### Why This Architecture

1. **Voice is a modality adapter** — it converts audio↔text at the edges and feeds the existing Sophia text pipeline. Zero cognitive duplication.
2. **Interruption reconciliation** — the Session Manager tracks what was spoken vs. remaining. On barge-in, it truncates the LLM context to match what was actually heard.
3. **Authorization preserved** — speech-triggered approvals flow through the same `SideEffectAuthorizationGate` with the same payload binding.
4. **Streaming throughout** — STT streams partial transcripts, LLM streams tokens, TTS streams audio chunks. No stage blocks waiting for the full output of the previous stage.
5. **Component-swappable** — replace STT (Whisper → Deepgram), TTS (Kokoro → Flux), or transport (WebSocket → WebRTC) without touching Sophia.

### Strongest Counterargument

**"A well-optimized cascaded pipeline will still feel ~300ms slower than GPT-4o Realtime, and that gap is perceptible."**

This is true. The counterpoint: GPT-4o Realtime is a black box that can't be audited, can't use SamJuniors' company context, can't enforce the authorization gate, and costs 3–5x more. The 300ms gap is the cost of governance, and it's within the "natural conversation" threshold (< 800ms).

If S2S models later expose a clean "text reasoning pass-through" mode where the voice model handles prosody but delegates reasoning to an external system, this architecture can adopt it by replacing STT+TTS with the S2S endpoint while keeping the Sophia cognitive layer. The architecture is forward-compatible.

---

## 10. LATENCY MODEL

### Critical Path

```
Founder starts speaking
  ↓
[~10ms]  Mic → AudioWorklet → PCM frames
  ↓
[~30ms]  WebSocket transport (browser → server)
  ↓
[0ms]    VAD (already running in browser, flags speech start)
  ↓
[ongoing] STT processes audio chunks incrementally
  ↓
Founder stops speaking
  ↓
[200-500ms] End-of-turn detection (silence threshold)
  ↓
[50-100ms]  STT finalizes transcript
  ↓
[30ms]   WebSocket: transcript → Sophia
  ↓
[100-300ms] SophiaIntentClassifier + ContextAssembly + Gateway
  ↓
[200-500ms] LLM first token (Gemini/GPT streaming)
  ↓
[50-100ms]  TTS first audio chunk from first text tokens
  ↓
[30ms]   WebSocket: audio chunk → browser
  ↓
[~10ms]  AudioContext playback begins
```

### Latency Budget Summary

| Stage | Time | Dominates? |
|:---|:---|:---|
| Audio capture + transport | ~40ms | No |
| End-of-turn detection | 200–500ms | **YES** — largest single contributor |
| STT finalization | 50–100ms | Minor |
| Sophia cognitive processing | 100–300ms | Moderate |
| LLM first token | 200–500ms | **YES** — second largest |
| TTS first audio | 50–100ms | Minor |
| Audio transport + playback | ~40ms | No |
| **Total: end-of-turn → first audio** | **~640–1540ms** | |
| **Optimized target** | **< 800ms** | |

### What Dominates

1. **End-of-turn detection** — The gap between "Founder stopped" and "system decides Founder is done." Pure silence-based VAD needs 300–500ms of silence. Semantic detection (Deepgram Flux) can reduce this to ~150ms.
2. **LLM time-to-first-token** — Model inference latency. Mitigated by using streaming models and starting TTS immediately on the first token.

### Recommended Benchmarks to Measure

| Benchmark | What It Measures | Target |
|:---|:---|:---|
| **EOT-to-First-Audio (E2FA)** | End of founder utterance → first audio playback | < 800ms |
| **Barge-in Latency** | Founder starts speaking → TTS stops | < 200ms |
| **Transcript Latency** | Audio chunk received → partial transcript available | < 300ms |
| **LLM TTFT** | Transcript finalized → first LLM token | < 400ms |
| **TTS TTFA** | First LLM token → first audio chunk | < 100ms |
| **Round-trip** | Founder stops → Sophia starts speaking | < 1000ms |
| **False interruption rate** | % of pauses misdetected as end-of-turn | < 5% |

> **WARNING:** These targets are estimates based on published benchmarks, not SamJuniors-specific measurements. The actual numbers depend on model selection, hardware, network conditions, and the specific Sophia pipeline latency. Do not treat these as verified facts.

---

## 11. MEMORY / CONTEXT MODEL

### Principle: Voice Conversations Are Just Another Input to the Existing Memory System

The voice layer should NOT create:
- A "voice memory store"
- A "conversation transcript store" separate from existing dialogue history
- A parallel context assembly pipeline
- A separate epistemic claim path

### How Voice Interacts With Existing Systems

| System | Voice Interaction | Mechanism |
|:---|:---|:---|
| **SophiaContextAssembler** | Voice transcript enters as `message` parameter, identical to text chat | No change |
| **Dialogue History** | Voice turns are appended to the same dialogue history array used by text chat | Existing `history` param in SophiaIntentClassifier |
| **CompanyMemoryStore** | If a voice conversation produces a decision or outcome, it's recorded via the existing `OperationalLearningLoop` | No change |
| **EpistemicPipeline** | Voice-derived information enters as EvidenceSource with `provenanceKind: 'live_operational'` | No change |
| **CompanyKnowledgeStore** | Voice queries match against existing knowledge | No change |
| **CompanyContextProvider** | Voice reads operational state through existing provider | No change |

### Voice-Specific State (minimal, ephemeral)

The voice layer manages only:
1. **Session state**: connection status, current turn state (listening/thinking/speaking)
2. **Interruption state**: text_spoken vs text_remaining for the current TTS output
3. **Audio buffer**: small circular buffer for pre-VAD audio (last ~500ms)
4. **Partial transcript**: current in-progress STT output

All of this is ephemeral, per-session, in-memory. It does NOT persist to company memory. The only thing that persists is the finalized dialogue turn (founder message + Sophia reply), which goes through the existing path.

### Handling "What did I just say?" / Conversation Continuity

The existing `SophiaIntentClassifier` already receives a `history` parameter with recent dialogue turns. Voice simply adds transcribed turns to this same history. If the session drops and reconnects, the server-side dialogue history (same as text chat) provides continuity.

---

## 12. SECURITY MODEL

### 12.1 Microphone Permissions

| Risk | Mitigation |
|:---|:---|
| Browser requires explicit mic permission | Standard — `navigator.mediaDevices.getUserMedia()` with clear UI prompt |
| Permission can be revoked mid-session | Handle `devicechange` event; degrade to text gracefully |
| Background mic capture | Voice UI must show clear LISTENING indicator; stop capture when not in LISTENING state |
| Recording without consent | Do NOT record or persist raw audio. Only persist text transcripts. |

### 12.2 Audio Privacy

| Risk | Mitigation |
|:---|:---|
| Audio transmitted to third-party STT | If using self-hosted Faster-Whisper: audio never leaves SamJuniors infrastructure. If using Deepgram API: audio is processed by Deepgram (review their data policy). |
| Audio at rest | Do NOT store raw audio. Transcripts only. |
| Audio in transit | WebSocket over TLS (WSS). No unencrypted audio transport. |

### 12.3 Prompt Injection Through Speech

| Risk | Severity | Mitigation |
|:---|:---|:---|
| Founder says "Ignore previous instructions and..." | Medium | The existing `SophiaIntentClassifier` already encapsulates user input in `<founder_utterance>` XML tags and has anti-poisoning defenses. Voice transcripts enter the same path. |
| Ambient audio injection (TV, other people speaking) | Medium | VAD filters non-speech; but targeted injection is possible. Mitigation: explicit "talk" button (push-to-talk option) in addition to always-listening mode. |
| Adversarial audio (ultrasonic/phonetic tricks) | Low (single-founder scenario) | Not a realistic threat for a single-founder system. Monitor if multi-user is added. |
| Background conversation captured as founder intent | Medium | Push-to-talk mode as default; always-listening as opt-in. VAD should discard ambient conversation that doesn't meet confidence threshold. |

### 12.4 Tool Authorization

**CRITICAL: Voice MUST NOT bypass the authorization gate.**

| Risk | Mitigation |
|:---|:---|
| "I approve" spoken → auto-executes without SideEffectAuthorizationGate | Voice approval maps to `approval_proposal` CandidateIntentProposal, which goes through SophiaServerGateway.process() → existing auth path. No shortcut. |
| Ambiguous approval ("yeah, do it") | Existing SophiaIntentClassifier handles ambiguity → generates `clarification_prompt`. Voice gets the same treatment. |
| Voice session has no authenticated principal | Session MUST be authenticated. Voice WebSocket connection requires the same session/auth token as the existing HTTP routes (Clerk middleware or equivalent per §7 of PRODUCT_ARCHITECTURE). |

### 12.5 Session Security

| Risk | Mitigation |
|:---|:---|
| Unauthenticated WebSocket | WebSocket upgrade request must carry authenticated session token. Reject unauthenticated connections. |
| Session replay | WebSocket connections are stateful and ephemeral. Transcript history is server-side. No replay vector. |
| Stale tool results after reconnect | On reconnect, re-fetch current state from existing providers (CompanyContextProvider, etc.). Do NOT cache and replay stale state. |
| Duplicate actions from reconnect | Existing idempotency mechanisms (idempotency cache on /api/orchestrate) protect against duplicate execution. |

### 12.6 Race Conditions

| Risk | Mitigation |
|:---|:---|
| Interruption during consequential action | Interruption cancels TTS and pending LLM generation. It does NOT cancel already-dispatched side effects (those are idempotent and recorded). |
| Concurrent voice + text sessions | Design decision needed: allow both, or make voice exclusive? Recommendation: single active modality. Text fallback is automatic when voice disconnects. |
| Overlapping approvals | Same as existing: approval is bound to exact payload hash. Two concurrent approval attempts for the same action resolve idempotently. |

---

## 13. MARKET BENCHMARK

### Interaction Pattern Comparison

| Feature | Deepgram | Siri | Alexa | SamJuniors Jarvis (current) | Target Sophia Voice |
|:---|:---|:---|:---|:---|:---|
| **Input modality** | Voice (streaming) | Voice (wake word) | Voice (wake word) | Text only | Voice (push-to-talk + always-listen option) |
| **Turn detection** | Semantic + acoustic | Acoustic | Acoustic + NLU | N/A (text) | VAD + silence (v1), semantic (v2) |
| **Barge-in** | Yes (< 200ms) | Yes (limited) | Yes (limited) | N/A | Yes (< 200ms target) |
| **Interruption reconciliation** | text_spoken/text_remaining | Unknown (opaque) | Unknown (opaque) | N/A | text_spoken/text_remaining (adopt Deepgram pattern) |
| **Streaming response** | Yes | Yes | Yes (chunked) | Text streaming exists | Yes (token → audio streaming) |
| **Thinking indicator** | Implied (latency) | Visual animation | Light ring animation | Text "thinking" state | Orb animation (reuse Jarvis visual language) |
| **Context depth** | Shallow (conversation) | Shallow (single request) | Shallow (skills) | Deep (company state, epistemic facts, knowledge, memory, provenance) | Deep (same as text Sophia) |
| **Authorization** | None (demo) | Apple account | Amazon account + skills | Founder identity + auth gate | Founder identity + auth gate (no change) |
| **Multi-turn** | Yes | Limited | Limited (routines) | Yes | Yes |
| **Tool execution** | Demo only | Limited (HomeKit, etc.) | Extensive (skills) | Full (web research, GitHub, orchestration) | Same as text Sophia |
| **Text fallback** | Yes (transcript) | Yes (on-screen) | Yes (app) | Primary mode | Automatic on voice failure |

### Useful Patterns Extracted (Not Product Architecture)

| Pattern | Source | Why Useful |
|:---|:---|:---|
| `text_spoken` / `text_remaining` on interruption | Deepgram Flux | Keeps LLM context synchronized with what was actually heard |
| Visual orb/animation for agent state | Siri, Deepgram Talk, Jarvis V4/V5 | Users need visual confirmation of system state |
| Scenario presets / system prompts | Deepgram Talk | Could map to Sophia "modes" (strategic, operational, casual) |
| Push-to-talk as primary, always-listen as option | Various | Avoids ambient capture issues; clearer intent signal |
| Graceful text fallback | All | Mic permission denied, network issues, or preference → text works |
| Wake word optional | Alexa pattern | Could add "Hey Sophia" later, but not required for single-founder |

---

## 14. FAILURE MODES

| Failure | Impact | Mitigation |
|:---|:---|:---|
| **Mic permission denied** | No voice input | Degrade to text. Clear prompt explaining why mic is needed. |
| **WebSocket disconnect** | Session drops | Auto-reconnect with exponential backoff. Resume from server-side dialogue history. |
| **STT returns garbage** | Bad transcript → wrong intent | Show transcript to Founder for verification. "Did I hear you correctly?" confirmation for consequential actions. |
| **STT engine unavailable** | No transcription | Fall back to text. Show error state. |
| **TTS engine unavailable** | No audio output | Show text response instead. Visual indicator that voice is degraded. |
| **LLM timeout** | No response | Same as text: timeout → error message. "I'm having trouble thinking right now. Try again?" |
| **Barge-in race condition** | TTS keeps playing briefly after interruption | Buffer 2–3 audio chunks client-side. On interrupt, discard buffered chunks immediately. Accept ~50ms of overlap as acceptable. |
| **Network latency spike** | Perceived delay > 2s | Show "Thinking..." indicator. If > 5s, show "Connection seems slow. Want to switch to text?" |
| **Audio echo / feedback** | Sophia hears herself | Echo cancellation via AudioContext/WebAudio API. Mute mic during TTS playback (simple), or use acoustic echo cancellation (complex). |
| **Hindi/English code-switching** | STT confusion | Whisper handles code-switching reasonably. For production Hindi quality, evaluate Indic-specific models. |

---

## 15. COST MODEL

### Self-Hosted Stack (Lowest Cost)

| Component | Infrastructure Cost | Marginal Cost |
|:---|:---|:---|
| Silero VAD | Browser (free) | $0 |
| Faster-Whisper (self-hosted) | GPU server ($50–200/mo for a small GPU instance) | $0/min |
| Sophia/LLM | Existing Gemini API cost | Same as text (no change) |
| Kokoro TTS (self-hosted) | Same GPU server | $0/min |
| WebSocket server | Existing Next.js/Node server | $0 |
| **Total incremental** | **~$50–200/mo (GPU instance)** | **$0/min beyond LLM** |

### API-Based Stack (Easiest)

| Component | Cost |
|:---|:---|
| Silero VAD | $0 (browser) |
| Deepgram Flux STT | $0.0077/min |
| Sophia/LLM | Same as text |
| Deepgram Flux TTS | ~$0.02–0.03/min |
| **Total marginal** | **~$0.03–0.04/min** (+ LLM costs) |

### Usage Estimate (Single Founder)

| Scenario | Monthly Minutes | Self-Hosted | API-Based |
|:---|:---|:---|:---|
| Light (15 min/day) | ~450 min | $50–200/mo (fixed) | ~$18/mo |
| Moderate (45 min/day) | ~1350 min | $50–200/mo (fixed) | ~$54/mo |
| Heavy (90 min/day) | ~2700 min | $50–200/mo (fixed) | ~$108/mo |

**Recommendation:** Start with API-based (Deepgram) for development speed. Migrate to self-hosted (Faster-Whisper + Kokoro) once the UX is validated and costs matter.

---

## 16. BUILD VS BUY

| Layer | Build | Buy | Recommendation |
|:---|:---|:---|:---|
| **VAD** | ❌ No reason | ✅ Silero (open-source, free) | **Use Silero** |
| **STT** | ❌ Enormous effort | ✅ Faster-Whisper (self-host) or Deepgram API | **Use existing model** |
| **Turn Detection** | ✅ Simple heuristic (v1) | ✅ Deepgram native (v2) | **Build simple, buy better later** |
| **LLM / Cognition** | ✅ Already built (Sophia) | ❌ Don't buy another brain | **Already built** |
| **TTS** | ❌ Enormous effort | ✅ Kokoro (self-host) or Deepgram API | **Use existing model** |
| **Interruption logic** | ✅ Custom state machine | Partial (Deepgram provides events) | **Build** |
| **WebSocket transport** | ✅ Standard engineering | ❌ Not worth buying | **Build** |
| **Session management** | ✅ Custom for Sophia | ❌ Generic solutions don't fit | **Build** |
| **Voice UI** | ✅ Extends existing Jarvis orb UI | ❌ No off-the-shelf match | **Build** |
| **Orchestration framework** | Evaluate: Pipecat (open-source) vs. custom | ✅ Pipecat (free, composable) | **Use Pipecat for prototyping** |

---

## 17. WHAT TO ADOPT / ADAPT / REJECT

### ADOPT (Use As-Is)

| Item | Source | Why |
|:---|:---|:---|
| Silero VAD | Open-source | Gold standard, runs in browser, MIT license |
| Faster-Whisper / Deepgram STT | Open-source / API | Best-in-class accuracy and streaming support |
| Kokoro TTS | Open-source | Best speed/quality ratio, Hindi support, Apache 2.0 |
| `text_spoken` / `text_remaining` interruption pattern | Deepgram | Solves context synchronization on barge-in |
| `<voice-widget>` encapsulation pattern | Deepgram Talk | Clean Web Component boundary for voice UI |
| Existing SophiaIntentClassifier | SamJuniors repo | Voice transcript enters same path as text |
| Existing SophiaServerGateway | SamJuniors repo | Trust boundary preserved for voice |
| Existing SophiaContextAssembler | SamJuniors repo | Context assembly unchanged for voice |
| Existing CompanyMemoryStore | SamJuniors repo | No parallel voice memory store |
| Existing EpistemicPipeline | SamJuniors repo | Voice-derived information follows same epistemic path |

### ADAPT (Modify for Voice)

| Item | Source | Adaptation Needed |
|:---|:---|:---|
| Jarvis V4/V5 orb animation | SamJuniors prototypes | Add listening/thinking/speaking visual states for voice feedback |
| Jarvis state machine (7 states) | SamJuniors prototypes | Map to voice session states: IDLE, LISTENING, THINKING, SPEAKING, INTERRUPTED |
| Founder interruption model | Jarvis V4 | Faster interruption (audio-level, not text-level). Same semantics, tighter timing. |
| `SophiaIntentClassifier` streaming support | SamJuniors repo | Currently processes full messages. May need to process partial transcripts for "eager" mode (start thinking before Founder finishes). This is an optimization, not a v1 requirement. |
| Dialogue history format | SamJuniors repo | Add voice-specific metadata (was this turn spoken or typed?) to existing history entries |
| Push-to-talk UX | Deepgram Talk "Click to talk" | Adapt to Sophia's orb metaphor: tap orb to start, release to finish, or auto-detect end-of-turn |

### REJECT (Do Not Use)

| Item | Source | Why Rejected |
|:---|:---|:---|
| GPT-4o Realtime / Gemini Live as primary pipeline | Various | Creates a second Sophia. Bypasses authorization, context, epistemic pipeline. |
| Separate "voice memory store" | Generic pattern | CompanyMemoryStore already handles this. Don't create parallel state. |
| Client-side simulation approach | Jarvis V4/V5 prototypes | Voice requires real server-side processing. Simulation pattern doesn't apply. |
| Wake-word detection | Alexa/Siri pattern | Unnecessary for single-founder browser app. Push-to-talk suffices. |
| Full Pipecat/LiveKit framework for v1 | Open-source | Over-engineered for single-user. Custom WebSocket + STT/TTS is simpler. Evaluate frameworks for scale-out. |
| Separate voice orchestrator | Various voice agent patterns | SamJuniors already has `MultiAgentOrchestrator`. Voice uses it, doesn't replace it. |
| Telephony/SIP integration | LiveKit, Twilio | Not needed for browser-based single-founder interaction. Future scope if needed. |

---

## 18. PHASED IMPLEMENTATION PLAN

### Phase 0: Prerequisites (Before Voice Work Begins)
- [ ] **§0 Deployment Decision** from PRODUCT_ARCHITECTURE must be made — voice session management depends on whether the app is local-only or hosted
- [ ] **§7 Auth boundary** must be closed — voice WebSocket needs authenticated session
- [ ] **§6 Durable persistence** must be in place — voice session state and dialogue history must survive restarts

### Phase 1: Proof of Concept (2–3 weeks)
**Goal:** Founder speaks → Sophia responds via audio in the browser. Interruption works.

- [ ] Browser: Mic capture → AudioWorklet → PCM frames at 16kHz
- [ ] Browser: Silero VAD (WASM) for speech detection
- [ ] Server: WebSocket endpoint for audio streaming
- [ ] Server: Faster-Whisper (self-hosted) or Deepgram API for STT
- [ ] Server: Feed transcript to existing `SophiaIntentClassifier.classify()`
- [ ] Server: Kokoro TTS or Edge TTS for response audio
- [ ] Server: Stream audio chunks back via WebSocket
- [ ] Browser: AudioContext playback with basic interruption (mute on speech detection)
- [ ] Browser: Visual state indicator (LISTENING / THINKING / SPEAKING)
- [ ] Latency measurement: instrument E2FA, barge-in latency, TTFT

### Phase 2: Natural Interaction (2–3 weeks)
**Goal:** Feels natural. Interruption is seamless. Text fallback works.

- [ ] Interruption reconciliation: track text_spoken / text_remaining
- [ ] LLM context update on interruption (trim to text_spoken)
- [ ] Push-to-talk mode as default, always-listening as option
- [ ] Text fallback: automatic when mic unavailable or voice degraded
- [ ] Transcript display alongside audio (live transcript)
- [ ] Echo cancellation (mute mic during TTS, or WebAudio AEC)
- [ ] Reconnection with session resume
- [ ] Graceful degradation indicators
- [ ] Voice-specific visual feedback integrated with Core orb (from Jarvis V4/V5 visual language)

### Phase 3: Production Hardening (2–4 weeks)
**Goal:** Reliable, secure, cost-optimized.

- [ ] WebSocket authentication (same session as HTTP routes)
- [ ] Rate limiting / abuse prevention
- [ ] Error recovery for all failure modes (§14)
- [ ] STT confidence-based confirmation for consequential actions
- [ ] Self-hosted STT/TTS deployment if cost warrants (Faster-Whisper + Kokoro)
- [ ] Observability: per-stage latency metrics, error rates, usage telemetry
- [ ] Hindi support verification and tuning
- [ ] Security audit (§12 items)
- [ ] Load testing (single user, but validate sustained conversation)

### Phase 4: Polish & Advanced Features (Ongoing)
**Goal:** Delightful. Competitive with Deepgram/Siri/Alexa in naturalness.

- [ ] Semantic turn detection (replace pure silence threshold)
- [ ] Backchannel awareness ("uh-huh", "go on")
- [ ] Proactive voice notifications ("You have a pending decision")
- [ ] Tone/persona selection for Sophia's voice
- [ ] Voice-specific Sophia personality tuning
- [ ] Partial-transcript eager mode (start thinking before Founder finishes)
- [ ] Evaluate LiveKit/Pipecat if scaling beyond single-user
- [ ] Evaluate S2S model integration if clean reasoning bypass becomes available

---

## 19. OPEN QUESTIONS

> **IMPORTANT:** These questions should be resolved before implementation begins.

### Architecture Decisions

1. **§0 Deployment target** — Is Sophia Live Interaction local-only or hosted? This determines whether self-hosted Faster-Whisper + Kokoro runs on the same machine or needs a GPU server.

2. **Push-to-talk vs. always-listening default?** — Push-to-talk is safer (no ambient capture), but always-listening feels more natural. Recommendation: push-to-talk as default with always-listening as opt-in.

3. **Python voice server vs. TypeScript voice server?** — The STT/TTS ecosystem is Python-dominant (Faster-Whisper, Kokoro, Pipecat, Silero). Options:
   - Python sidecar process for voice (WebSocket ↔ Python ↔ existing Node/Next.js)
   - TypeScript-only with API-based STT/TTS (simpler, but locked to APIs)
   - Full Python voice server calling Sophia APIs (more separation)

4. **Concurrent voice + text?** — Should the Founder be able to use voice and text simultaneously, or are they exclusive? Recommendation: exclusive, with seamless switching.

### Technology Choices

5. **STT provider for v1?** — Self-hosted Faster-Whisper (free, requires GPU) vs. Deepgram API (paid, zero infrastructure)? Recommendation: Deepgram API for v1 speed, migrate to self-hosted later.

6. **TTS provider for v1?** — Kokoro (self-hosted, Apache 2.0) vs. Edge TTS (free API, Microsoft) vs. Deepgram Flux TTS (paid, best quality)? Recommendation: Edge TTS for v1 speed (zero setup), migrate to Kokoro/Flux later.

7. **Hindi priority?** — Is Hindi a v1 requirement, or can it wait for v2? Whisper/Kokoro both support Hindi, but quality tuning takes effort.

### Integration Questions

8. **How does voice interact with the existing chat UI?** — Does the SophiaPanel/ChatPanel component gain a mic button, or is voice a separate surface?

9. **Should voice sessions produce visible chat history?** — Recommendation: yes, transcripts appear in the existing chat panel as if they were typed.

10. **How does the Founder indicate consequential approval via voice?** — "I approve" is ambiguous. Options:
    - Voice says "I approve" → Sophia asks for confirmation ("Please confirm: you're approving [specific action]. Is that correct?")
    - Voice says "I approve" → visual confirmation required (tap a button)
    - Both: voice for low-risk, visual for high-risk

### Resource Questions

11. **GPU availability** — Does SamJuniors have or plan to have GPU infrastructure for self-hosted models? This determines whether self-hosted STT/TTS is practical.

12. **Latency tolerance** — What is the actual acceptable latency for the Founder? Is 800ms acceptable, or does it need to be under 500ms? This determines whether the cascaded pipeline is sufficient or whether more aggressive optimization (or S2S fallback for prosody) is needed.

---

## APPENDIX A: DEEPGRAM TALK PAGE — TECHNICAL INSPECTION

**URL:** `https://talk.deepgram.com/`  
**Title:** "Talk to Flux TTS"

### Page Architecture
- Single-page app with a full-viewport `<voice-widget>` Web Component
- Client: `FluxAgentClient` class connects via WebSocket to `/ws/deepgram/voiceagent`
- Backend: Bun server hosts both the static page and the WebSocket voice endpoint
- Fallback: Built-in mock if WebSocket can't open (demo stays interactive)

### Client Events
```javascript
widget.addEventListener("voice-connected", (e) => ...)
widget.addEventListener("transcript", (e) => ...)
widget.addEventListener("voice-ended", (e) => ...)
widget.addEventListener("voice-error", (e) => ...)
widget.addEventListener("feedback", (e) => ...)
```

### UX Design
- **Visual:** Dark mode, 3D animated `<molten-orb>` spheres per voice persona
- **Voices:** 7+ personas with name, tone descriptor, accent/locale
- **Scenarios:** Preset system prompts (Default, Pet Hospital, Customer Service, Car Dealership)
- **Script mode:** TTS sandbox for auditioning voices with custom text (2000 char limit)
- **Feedback:** POST to `/feedback` endpoint for rating

### Relevant Takeaways for Sophia
- Web Component encapsulation is clean and portable
- Event-driven architecture maps to React state management
- Zero-config, zero-friction "Click to talk" is the right UX for a Founder tool
- Visual orb = visual presence of intelligence — matches Jarvis Core orb metaphor exactly

---

## APPENDIX B: EXISTING SOPHIA ARCHITECTURE SUMMARY

### Files Reviewed

| File | Purpose | Voice Relevance |
|:---|:---|:---|
| `src/lib/server/sophia/intent-classifier.ts` | Evaluates founder utterance → CandidateIntentProposal | Voice transcript is the `message` param |
| `src/lib/server/sophia/context-assembly.ts` | Assembles partitioned context slices (~1800 token budget) | Unchanged for voice |
| `src/lib/server/sophia/server-gateway.ts` | Trust boundary, strips untrusted fields, dispatches | Voice MUST route through here |
| `src/lib/server/sophia/entity-resolver.ts` | Tri-state entity matching | Unchanged |
| `src/lib/server/sophia/types.ts` | 10 authority classes, 7 intent kinds, 7 command types, TurnMetrics | Voice adds entries to TurnMetrics only |
| `src/lib/server/orchestration/orchestrator.ts` | Multi-agent execution | Triggered identically by voice or text |
| `src/lib/server/memory/memory-store.ts` | CompanyMemoryStore with Prisma persistence | Voice outcomes feed into this |
| `src/lib/server/knowledge/knowledge-store.ts` | SOPs, PRDs, architecture docs | Voice queries against this |
| `src/lib/server/epistemic/pipeline.ts` | Source→Signal→Claim→Fact lifecycle | Voice information follows this path |
| `src/lib/server/epistemic/claim-store.ts` | Claim storage | Unchanged |
| `src/lib/server/context/company-context.ts` | Operational state provider | Unchanged |
| `src/lib/server/authorization/gate.ts` | SideEffectAuthorizationGate | Voice approvals route through this |

### Architectural Diagram

```
Voice Layer (NEW)           Sophia Cognitive Layer (EXISTING)
─────────────────           ──────────────────────────────────
Mic → VAD → STT ──────────▶ SophiaIntentClassifier
                              ├── SophiaContextAssembler
                              │    ├── CompanyContextProvider
                              │    ├── EpistemicClaimStore
                              │    ├── CompanyMemoryStore
                              │    ├── CompanyKnowledgeStore
                              │    └── ActivityProjection
                              └── SophiaServerGateway
                                   ├── Policy validation
                                   ├── Principal binding
                                   └── Dispatch
                                        ├── CONVERSATION_REPLY → TTS ──▶ Speaker
                                        ├── DISPATCH_DIRECTIVE → Orchestrator
                                        ├── RESOLVE_APPROVAL → AuthGate
                                        ├── PRESENT_CLARIFICATION → TTS
                                        └── REGISTER_STEERING → Orchestrator
```

---

*End of research report. No code has been written. No files have been modified. No implementation has begun.*
