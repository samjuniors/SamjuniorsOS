# ADR-001 — Realtime Sophia Interface

**Date:** 2026-09-21  
**Status:** ACCEPTED FOR DESIGN / NOT YET IMPLEMENTED  
**Scope:** Realtime Audio, Vision, Screen Sharing, and Cloud/Local Architecture  
**Deciders:** Founder, Sophia / Antigravity Engineering  
**Supersedes/Builds Upon:** Builds upon `doc/adr/0003-sophia-live-interaction-architecture.md` and `doc/adr/0004-provider-agnostic-streaming-stt-architecture.md`

---

## Context and Problem Statement

SamJuniorsOS requires high-bandwidth, low-latency sensory interaction between the founder and Sophia — including speech (voice conversation), vision (camera input), and screen awareness (desktop sharing).

There is an acute architectural danger in AI engineering: teams frequently build "realtime assistants" as completely separate parallel applications, creating an isolated voice bot with its own prompt structure, its own disconnected session memory, and its own unverified tool execution loop. This creates "Two Sophias" — a text-based company operating system and a conversational voice toy that knows nothing of the company's real state, workflows, or governance.

Furthermore, deciding whether realtime media should run entirely in the cloud or on a local workstation requires clear capability boundaries to prevent split-brain databases.

---

## Decision

1. **Realtime as an Interface, Not a Second Brain:**  
   Realtime voice, camera video, and screen sharing interaction is strictly an **interface and sensory capability** to the existing Sophia/SamJuniorsOS operating system. It is NOT a second agent, NOT a second brain, and NOT a separate product.

2. **Cloud Authoritative for Company State:**  
   The cloud runtime remains the single authoritative source of truth for company state, relational databases, workflow execution, agent council coordination, epistemic knowledge, and audit ledgers.

3. **Ephemeral Realtime Sessions:**  
   Realtime sessions are ephemeral transport streams. Audio waveforms, raw video frames, and screen pixels are transient sensory inputs that pass through ingress processors. They do not become company memory by default; only verified transcripts, explicit user directives, and governed artifacts are committed to persistent storage.

4. **LiveKit / WebRTC for Media Transport:**  
   For production multimodal streaming, media transport will leverage standard WebRTC via LiveKit (or an equivalent provider-abstracted WebRTC SFU) rather than bespoke raw WebSocket packetization for video/audio multiplexing.

5. **Gemini Live via Provider Abstraction:**  
   Initial cloud development for bidirectional speech-to-speech and multimodal reasoning may integrate Gemini Live via an explicit provider adapter. The interface must remain strictly provider-agnostic (`RealtimeModelAdapter`) so the underlying model provider (Gemini Live, OpenAI Realtime, self-hosted open-weight pipelines) can be replaced without modifying Sophia's cognitive core or governance gates.

6. **Local Runtime as Peripheral Capabilities:**  
   A future local desktop runtime will act as Sophia's local "eyes, ears, mouth, and hands" (capturing microphones, cameras, screen contents, and executing authorized local OS keystrokes/actions) while continuing to communicate with the single cloud-authoritative Sophia. The local node will never declare itself an independent company database.

7. **Unified Governance:**  
   Directives issued via realtime voice or vision will pass through the exact same authorization, validation, verification, and approval gates (`SideEffectAuthorizationGate`, SHA-256 payload binding) as directives typed into the chat interface.

---

## Current Implementation Status vs. Target

| Capability | Current Code Status in Repository | Architectural Status |
|---|---|---|
| **Live Companion Server** | IMPLEMENTED & VERIFIED (`src/lib/server/live/server.ts`, port 3001) | Baseline WebSocket Foundation |
| **Ticket Authentication** | IMPLEMENTED & VERIFIED (`/api/auth/ws-ticket`, single-use tickets) | Baseline Security |
| **Client Audio Resampling** | IMPLEMENTED & VERIFIED (`audio-worklet-processor.ts`, 16kHz PCM) | Baseline Audio Ingress |
| **Client VAD Engine** | IMPLEMENTED & VERIFIED (`vad.ts`, deterministic acoustic heuristic) | Baseline Audio Gating |
| **Push-to-Talk (PTT)** | IMPLEMENTED & VERIFIED (`live-client.ts`, PTT state machine) | Baseline Audio Control |
| **Streaming STT Adapter** | IMPLEMENTED (Phase 4C-B working tree: `DeepgramFluxProvider`) | Active Working Implementation |
| **Unified Cognitive Ingress**| IMPLEMENTED (Phase 4C-B working tree: `executeSophiaTurn`) | Active Working Implementation |
| **Live Transcript UI** | IMPLEMENTED (Phase 4C-B working tree: `LiveTranscriptRibbon.tsx`) | Active Working Implementation |
| **WebRTC / LiveKit Gateway** | **TARGET / NOT IMPLEMENTED** (No WebRTC or LiveKit code exists) | Design Target |
| **Gemini Live Provider** | **TARGET / NOT IMPLEMENTED** (No Gemini Live streaming adapter) | Design Target |
| **Camera Video Ingress** | **TARGET / NOT IMPLEMENTED** (No video stream capture code) | Design Target |
| **Screen Share Ingress** | **TARGET / NOT IMPLEMENTED** (No screen stream capture code) | Design Target |
| **Local Private Node** | **TARGET / NOT IMPLEMENTED** (No local daemon or edge worker) | Design Target |

---

## Consequences

### Positive
- **Single Source of Truth:** Prevents architectural fragmentation and split-brain company memory.
- **Provider Independence:** Sophia's intelligence and persona are decoupled from any specific proprietary model provider.
- **Resilient Recovery:** Ephemeral media disconnects do not corrupt company state, interrupt workflows, or drop audit histories.
- **Uniform Security:** Side effects and financial actions cannot be accidentally triggered by voice hallucination or prompt injection without founder approval.
- **Durable Evolution:** Allows incremental progression from WebSocket STT → WebRTC LiveKit → Multimodal Gemini Live → Local Edge Runtime without rewriting the application core.

### Negative & Operational Overhead
- **Infrastructure Complexity:** Hosting and managing a WebRTC gateway or LiveKit instance introduces additional network infrastructure beyond standard Next.js hosting.
- **Latency Balancing:** Bridging realtime audio into deterministic company state verification requires careful latency budgeting (350–550ms target) to maintain natural conversational pacing.
- **Bandwidth Consumption:** Multimodal video and screen streaming requires adaptive frame-rate throttling to avoid runaway API costs and bandwidth saturation.

---

## Migration and Reversibility

1. **Stepwise Transition:** The current implementation uses an authenticated WebSocket companion server (`src/lib/server/live/server.ts`) and streaming STT (`DeepgramFluxProvider`). This remains fully operational while WebRTC/LiveKit prototypes are evaluated in isolation.
2. **Reversibility:** Because the ingress routes through `executeSophiaTurn()`, the underlying media transport (WebSocket vs. WebRTC) and provider (Deepgram vs. Gemini Live) can be swapped or rolled back with zero changes to `ConversationStore`, `MultiAgentOrchestrator`, or `SideEffectAuthorizationGate`.
