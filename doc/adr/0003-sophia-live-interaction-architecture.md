# ADR 0003: Sophia Live Interaction Architecture (Voice Modality Adapter)

## Status
APPROVED WITH CORRECTIONS — 2026-09-16 (Architecture Approved; Implementation Gated)

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

We adopt a **Cascaded Streaming Pipeline over a Companion WebSocket Process** as the official architecture for Sophia Live Interaction.

### 1. The Cascaded Ingress/Egress Pipeline

```
[ Founder Microphone (PTT: Spacebar Hold / Button) ]
        │
        ▼ (Raw PCM / 16kHz AudioWorklet)
[ Client Silero VAD (ONNX/WASM Worker) ] ──(Local Mute on Speech Start)──┐
        │                                                                │
        ▼ (Audio Frames only during active speech)                       │
[ Authenticated Companion WebSocket (Port 3001) ]                        │
        │                                                                │
        ▼                                                                │
[ Server Live Session Manager ] ◄────────────────────────────────────────┘
        │
        ▼ (Streaming Audio)
[ Deepgram Flux STT ] (Conversational Turn-Taking & Semantic Endpointing)
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
[ Deepgram Flux TTS ] (Stateful Conversational Speech API: /v2/speak)
        │
        ▼ (Streaming Audio Chunks / Opus)
[ Client Audio Playback Buffer ] ──► [ Speaker / Headphones ]
```

### 2. Component Technology Selection & Separation

| Component | Selected Technology | Pricing / Licensing | Role & Distinctions |
| :--- | :--- | :--- | :--- |
| **Activation Mode** | **Push-to-Talk (PTT) ONLY** | N/A | **Initial Scope Constraint:** Phase 4 initial implementation is strictly Push-to-Talk (holding `Spacebar` or mic button). Continuous listening and wake-words are excluded to eliminate acoustic feedback, room noise leakage, and echo cancellation overhead. |
| **Client VAD** | **Silero VAD v5 (ONNX/WASM in Web Worker)** | Open-Source (MIT) | Sub-1ms inference latency per 30ms frame. Runs locally in the browser; filters background noise and provides instantaneous local mute of assistant audio upon user speech detection. |
| **Host Transport** | **Companion Node.js WebSocket Process (Port 3001)** | In-house Node process | **Deployment Reality:** Standard Next.js App Router route handlers (`route.ts`) cannot host WebSockets directly. The WebSocket gateway runs as a dedicated TypeScript companion process (`npm run dev:ws` / standalone worker) sharing the same code, auth, and store modules. |
| **Streaming STT** | **Deepgram Flux STT** | $0.39 / hour | Conversational speech recognition with native semantic turn-taking, preventing premature cutoffs during mid-thought pauses. |
| **Streaming TTS** | **Deepgram Flux TTS (`/v2/speak`)** | ~$0.045 / 1k characters | **Explicitly separated from Aura-2.** Aura-2 ($0.030/1k chars) is stateless text-to-speech. Flux TTS is a stateful conversational streaming engine with native progress tracking and interruption reconciliation. |
| **Self-Hosted Fallback** | **Kokoro-82M TTS** | Open-Source (Apache 2.0) | 82M parameter lightweight fallback for offline or zero-cloud-cost operation. |

### 3. Native Flux Interruption Reconciliation (Barge-In)

Rather than building complex, error-prone server-side character timing estimation, the architecture leverages **Deepgram Flux TTS's native event protocol**:
1. **Immediate Acoustic Mute (<50ms):** When the founder speaks during Sophia's reply, client-side Silero VAD triggers `SPEECH_START`. The browser immediately mutes audio output and flushes the local WebAudio playback queue.
2. **Forwarding Native Interrupt:** Client sends `{ type: "INTERRUPT" }` over the WebSocket. The server immediately forwards the `Interrupt` control frame to the active Deepgram Flux TTS WebSocket.
3. **Flux Native Reconciliation:** Deepgram Flux TTS immediately halts audio generation and emits its native `SpeechInterrupted` event, returning the authoritative `text_spoken` and `text_remaining` character split.
4. **Conversation State Synchronization:** The server updates the assistant record in `ConversationStore`:
   ```json
   {
     "metadata": {
       "interrupted": true,
       "textSpoken": "We have three active workstreams...",
       "textRemaining": "and Julian's audit is complete.",
       "fluxInterruptionEvent": true
     }
   }
   ```
5. **Contextual Continuity:** The next founder turn is assembled with the injected contextual marker:  
   `[Sophia was interrupted after uttering: "We have three active workstreams..."]`.
6. **Consequential Action Boundary:** Audio interruption mutes speech; it **does NOT abort or mutate in-flight orchestrations or database operations** unless the new spoken turn is an explicit steering command (`"Sophia, halt Julian's task"`).

### 4. WebSocket Security, Reconnect & Idempotency Specifications

Before writing code, the transport layer is fully specified:

#### A. Authentication
- **Handshake Protocol:** The client connects to `ws://localhost:3001/live` (or reverse-proxied via Caddy).
- **Session Proof:** The client forwards the session cookie (Clerk JWT / dev session cookie) during the HTTP upgrade request, OR provides an ephemeral single-use ticket acquired via an authenticated POST to `/api/auth/ws-ticket`.
- **Validation:** The server validates the principal via `getAuthenticatedFounder(req)`. Unauthenticated connections are rejected with HTTP 401 / WebSocket close code `4401` (`Unauthorized`).
- **Single Connection Guarantee:** Only one active live voice stream is permitted per founder session. A secondary connection closes the older socket with close code `4409` (`Session Superseded`).

#### B. Reconnect Architecture
- **State Preservation:** The client maintains a stable `sessionId` and `activeConversationId`.
- **Backoff Strategy:** On network drop, client enters `RECONNECTING` state with exponential backoff (1s, 2s, 4s; max 3 retries) before dropping to text fallback.
- **Session Resumption:** On reconnect, client sends:
  ```json
  { "type": "RESUME_SESSION", "sessionId": "...", "conversationId": "...", "lastAckTurnId": "..." }
  ```
  The server keeps session state alive in memory for 60 seconds. If resumed within the window, the audio stream continues seamlessly; if expired, the server provisions a fresh session bound to the authoritative `ConversationStore`.

#### C. Turn-Level Idempotency & Concurrency
- **Client Turn Key:** Every spoken PTT utterance receives a client-generated `turnId` (`idempotencyKey`) generated at speech start.
- **In-Flight Turn Locking:** If an identical `turnId` is received during transmission retries, the server's `inFlightTurns` lock prevents duplicate LLM ingress.
- **Persistence Idempotency:** Assistant responses are cached in `ConversationStore` under `${turnId}:assistant`, ensuring duplicate requests receive cached replies with zero re-execution.

### 5. Latency Budget vs Target

- **Design Target Budget:** ~780ms under ideal networking and sub-100ms LLM first-token generation.
- **Realistic Conversational Budget:** **800ms – 1,250ms** accounting for real-world broadband jitter, client AudioWorklet buffering, and variable model inference time.
- **Verification Status:** **NOT VERIFIED.** Real-world latency must be measured during Phase 4 integration benchmarks.

---

## Consequences

### Positive
- **Rock-Solid Control Plane:** Retains 100% of existing authorization, constitutional verification, and multi-agent coordination.
- **Zero Timing Guesswork:** Leverages Deepgram Flux's native conversational turn-taking and `SpeechInterrupted` event protocol.
- **Safe Next.js Architecture:** Isolates streaming WebSockets into a companion process, preserving Next.js standalone builds and developer HMR stability.
- **Safe Initial Scope:** Push-to-Talk eliminates audio feedback loops and room acoustic leakage.

### Negative / Trade-offs
- **Process Supervision:** Requires running a companion Node/TypeScript WebSocket process alongside Next.js (`npm run dev:ws` in dev; managed process or container companion in production).
- **Vendor Cost:** Deepgram Flux STT ($0.39/hr) and Flux TTS (~$0.045/1k chars) incur usage fees (~$5–$25/month for normal founder usage).

---

## Alternatives Considered & Rejected

1. **Embedding WebSockets in Next.js Route Handlers (`src/app/api/live/route.ts`):**
   - *Rejected:* Technically unsupported by Next.js App Router. Route handlers lack raw Node HTTP upgrade hooks.
2. **Treating Aura-2 and Flux TTS Interchangeably:**
   - *Rejected:* Aura-2 lacks native conversational state and cannot provide native `SpeechInterrupted` character offset tracking.
3. **Continuous Ambient Listening for v1:**
   - *Rejected:* Creates false positives, acoustic echo loops, privacy concerns, and unnecessary streaming costs. PTT-only is strictly enforced for Phase 4.
