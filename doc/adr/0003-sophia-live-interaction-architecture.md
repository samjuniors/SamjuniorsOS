# ADR 0003: Sophia Live Interaction Architecture (Voice Modality Adapter)

## Status
PROPOSED — 2026-09-16 (Pending Founder Review & Decision Gate)

## Context & Problem
Following the completion and sealing of **Phase 3: Sophia Durable Conversation Persistence** (ADR 0002), Sophia possesses server-authoritative dialogue history, turn-level idempotency, and strict session isolation.

However, human-agent interaction is currently limited to synchronous, keyboard-driven text input (`ChatPanel.tsx` and ask bar in `App.tsx`). For a solo founder directing an AI-native company, text-only chat has notable limitations:
1. **High Interaction Friction During Executive Review:** Inspecting active workstreams, reviewing spatial topologies, and directing operations requires constant keyboard-focus switching.
2. **No Hands-Free or Rapid Steering:** Real-time steering (pausing, redirecting, or requesting brief verbal updates) is slower when forced through manual typing.
3. **Absence of a True Real-Time Modality:** The existing shell contains visual and auditory placeholders (e.g. ambient canvas pulses, UI click sounds in `osAudio.ts`, and an unlinked browser `speechSynthesis` fallback in `field.ts`), but zero streaming voice input, Voice Activity Detection (VAD), Speech-to-Text (STT), or interruptible Text-to-Speech (TTS).

### Non-Negotiable Core Principle
```
VOICE IS A MODALITY.
SOPHIA IS THE COGNITIVE/EXECUTIVE LAYER.
THE EXISTING CONTROL PLANE REMAINS THE AUTHORITY.
```

Voice must NOT become an autonomous second intelligence, a parallel conversational system, or an unmonitored execution shortcut. Specifically:
- **Audio must NEVER directly invoke tools or bypass security gates.**
- **Spoken words like "I approve" must NEVER directly trigger side effects without passing through `SophiaServerGateway` and `SideEffectAuthorizationGate`.**
- **No "Voice Memory Store" or separate voice database may be created.** Dialogue transcribes to canonical text and integrates seamlessly with `ConversationStore`.

---

## Architectural Decision

We adopt a **Cascaded Streaming Pipeline (Browser VAD → Server WebSocket Gateway → Streaming STT → Sophia Server Gateway → Streaming TTS → Browser Playback)** as the official architecture for Sophia Live Interaction.

### 1. The Cascaded Ingress/Egress Pipeline

```
[ Founder Microphone ]
        │
        ▼ (Raw PCM / 16kHz AudioWorklet)
[ Client Silero VAD (ONNX/WASM Worker) ] ──(Speech Start/Stop Signals)──┐
        │                                                               │
        ▼ (Audio Frames only during active speech)                      │
[ Authenticated WebSocket (/api/live-interaction) ]                     │
        │                                                               │
        ▼                                                               │
[ Server Live Session Manager ] ◄───────────────────────────────────────┘
        │
        ▼ (Streaming Audio)
[ Streaming STT Provider (Deepgram Flux / Nova-3) ]
        │
        ├──► (Interim Transcripts ──► Streaming to UI preview)
        │
        ▼ (Finalized Turn Transcript)
[ Canonical Sophia Ingress ]
        │
        ├──► [ ConversationStore.saveMessage('founder', text) ]
        ├──► [ SophiaContextAssembler.assemble(...) ]
        ├──► [ SophiaIntentClassifier.classify(...) ]
        │
        ▼ (CandidateIntentProposal)
[ SophiaServerGateway.process(...) ]
        │
        ├──► Policy Enforcement & Founder Session Validation
        ├──► Dispatch Directive ──► MultiAgentOrchestrator (if authorized)
        └──► Generate Text Reply
        │
        ▼ (Authoritative Text Response)
[ ConversationStore.saveMessage('assistant', reply) ]
        │
        ▼ (Text Streaming Chunks)
[ Streaming TTS Provider (Deepgram Flux/Aura-2 or Kokoro TTS) ]
        │
        ▼ (Streaming Audio Chunks / Opus)
[ Client Audio Playback Buffer ] ──► [ Speaker / Headphones ]
```

### 2. Component Technology Selection

| Component | Selected Technology | Role & Justification |
| :--- | :--- | :--- |
| **Client VAD** | **Silero VAD v5 (ONNX/WASM in Web Worker)** | Sub-1ms inference latency per 30ms frame. Runs locally in the browser; filters background noise and avoids streaming silence over the network. Provides immediate local mute of assistant audio upon user speech detection. |
| **Transport** | **Node.js / Next.js WebSocket (`ws` / server-mediated)** | Low-overhead bidirectional binary/text transport. Avoids WebRTC SFU infrastructure complexity (Pipecat/LiveKit) which is excessive for a single-tenant desktop OS. Bound strictly to the founder's authenticated session cookie. |
| **Streaming STT** | **Deepgram Flux STT / Nova-3** | Sub-300ms time-to-partial-transcript. Flux provides conversational turn-taking and semantic endpointing, preventing premature turn cuts during mid-sentence thinking pauses. |
| **Cognitive Core** | **Existing Sophia Subsystems** | `SophiaContextAssembler`, `SophiaIntentClassifier`, and `SophiaServerGateway`. Zero duplication of intelligence or context budgeting. |
| **Streaming TTS** | **Deepgram Flux / Aura-2 TTS** *(Primary Cloud)*<br>**Kokoro-82M TTS** *(Self-Hosted Fallback)* | Deepgram Flux/Aura-2 offers ~150–250ms time-to-first-audio (TTFA) with character-based pricing ($0.030/1k chars) and stateful stream flushing. Kokoro provides an open-source (Apache 2.0) 82M-parameter lightweight fallback for offline or zero-cloud-cost operation. |

### 3. Interruption & Barge-In Architecture

Interruption must be deterministic and contextually aware:
1. **Immediate Acoustic Mute (<50ms):** When the founder begins speaking while Sophia is talking, client-side Silero VAD triggers `SPEECH_START`. The browser immediately mutes audio output and flushes the local WebAudio playback queue.
2. **Server Stream Cancellation (<100ms):** Client sends an `INTERRUPT` frame over the WebSocket with `{ lastAudioSequencePlayed, clientTimestamp }`.
3. **TTS Pipeline Flush:** The server terminates active TTS streaming from the provider, stopping unnecessary audio generation and API billing.
4. **Context Reconciliation:**
   - The server calculates `text_spoken` (what reached the founder's ears before interruption) versus `text_remaining`.
   - The assistant record in `ConversationStore` is updated with metadata: `{ interrupted: true, textSpoken: "...", textRemaining: "..." }`.
   - When the founder's new utterance arrives, context assembly includes the note: `[Sophia was interrupted after saying: "..."]`. This prevents Sophia from being confused by references to sentences she never finished uttering.
5. **Consequential Action Protection:** If Sophia was in the middle of executing a multi-agent directive or awaiting a high-risk governance gate, interruption CANNOT cancel or mutate the underlying execution unless the new utterance is an explicit steering command (`"Sophia, halt the current run"`). Interruption mutes the voice modality; it does NOT corrupt the control plane.

### 4. Security & Authorization Boundary

- **No Voice Bypass:** Voice is strictly an input modality for text generation.
- **Session Handshake:** The WebSocket endpoint `/api/live-interaction` requires a valid authenticated Founder session (Clerk JWT / server session cookie). Unauthenticated connections fail-close with HTTP 401 / WebSocket close code 4401.
- **Single-Tenant Concurrency Lock:** A founder may have only one active live voice stream at any time. A second connection from a new tab terminates or supersedes the previous connection.
- **Approval Gate Invariant:** Spoken phrases such as *"I approve this"* or *"Execute the plan"* are classified as `approval_proposal` or `directive_proposal`. They MUST pass through `SophiaServerGateway` and `SideEffectAuthorizationGate`. Consequential mutations still require verified founder identity and payload cryptographic binding.

### 5. Conversation Persistence Integration

- Voice does NOT maintain an independent database or audio file repository.
- Finalized user utterances and assistant text responses are stored in `ConversationStore` as standard `ChatMessage` records.
- Raw audio buffers are discarded after playback and transcription; only canonical text, token metrics, and modality metadata (`modality: "voice"`) are retained.

### 6. Dual-Layer State Machine

Modality state must remain strictly decoupled from cognitive state:
- **Modality State (`LiveInteractionState`):**
  `IDLE` ──► `LISTENING` ──► `TRANSCRIBING` ──► `THINKING` ──► `SPEAKING` ──► `INTERRUPTED` ──► `RECONNECTING` ──► `ERROR`
- **Cognitive State (`SophiaState`):**
  `READY` ──► `UNDERSTANDING` ──► `WORKING` ──► `WAITING_FOR_FOUNDER` ──► `EXECUTING` ──► `COMPLETED` ──► `BLOCKED`

*Invariant:* The UI status dot or orb must clearly reflect both dimensions without confounding them. `SPEAKING` does NOT imply `EXECUTING`; `LISTENING` does NOT imply `THINKING`.

---

## Consequences

### Positive
- **Zero Cognitive Duplication:** Preserves 100% of Sophia's existing trust boundaries, constitutional verifications, and multi-agent orchestrator logic.
- **Full Auditability:** Every exchange passes through the textual audit trail, `ConversationStore`, and `AgentRunStore`.
- **Sub-800ms Latency:** Streaming STT and TTS combined with local VAD achieve natural conversational rhythm.
- **Deterministic Barge-In:** Founder can speak over Sophia at any time without audio echo or context desynchronization.
- **Vendor Independence:** STT and TTS providers can be swapped or hosted locally without rewriting the application or cognitive layer.

### Negative / Trade-offs
- **Additional Operational Surface:** Requires a long-running WebSocket server process alongside Next.js HTTP routes.
- **Cloud API Costs:** Streaming STT (~$0.39/hr) and TTS ($0.030/1k chars) incur operational expenses during voice sessions (estimated $5–$25/month for typical founder usage).
- **Network Sensitivity:** Audio streaming requires reliable local network connectivity; degraded connections must degrade gracefully to text mode.

---

## Alternatives Considered & Rejected

1. **Multimodal Speech-to-Speech (S2S) Realtime API (e.g. OpenAI Realtime / Gemini Live):**
   - *Rejected:* S2S models map direct audio-to-audio. While latency is very low (~300–500ms), they process reasoning and tool execution inside a closed black-box model. Bypasses `SophiaContextAssembler`, `SophiaIntentClassifier`, and `SophiaServerGateway`, making deterministic governance and cryptographic payload verification impossible without a second round-trip.
2. **Heavy WebRTC SFU Frameworks (Pipecat / LiveKit):**
   - *Rejected for v1:* WebRTC SFUs are designed for multi-participant video/audio conferencing. Introducing a media server daemon (SFU) adds substantial deployment and container orchestration overhead for a single-founder desktop application.
3. **Browser Native `SpeechRecognition` and `SpeechSynthesis`:**
   - *Rejected:* Extremely poor cross-platform consistency, lacks streaming partial transcripts on desktop, provides zero server-side auditability, and voice naturalness is unacceptable for an executive AI operating system.
