# ADR 0004: Provider-Agnostic Streaming Speech-to-Text (STT) Architecture

## Status
ACCEPTED & IMPLEMENTED (Phase 4C-A Benchmark & Architecture Decision Completed; Phase 4C-B Streaming STT Adapter Implemented & Verified) — 2026-09-17

## Context & Problem
In ADR 0003, we established the cascaded streaming pipeline over an authenticated companion WebSocket process (`port 3001`), with Phase 4A (Live Session & Gateway Foundation) and Phase 4B (Client Silero VAD & Audio Ingress) verified and sealed.

As we advance to streaming Speech-to-Text (STT), we must avoid coupling SamJuniorsOS to any single speech vendor or runtime framework. The system requires:
1. A **provider-agnostic speech architecture** where STT engines are hot-swappable modality services.
2. A **simple, low-overhead initial implementation** suitable for a single founder (<$15/month, zero infrastructure maintenance).
3. A **viable self-hosted / free-forever path** (e.g. running open-weight models locally on the founder's GPU or private compute) that requires zero rewrites of the client or Sophia control plane.
4. Absolute preservation of the non-negotiable security invariant: **STT output is untrusted data, never authority. Audio never directly invokes tools.**

---

## Architectural Decision

We adopt a **Provider-Agnostic STT Adapter Architecture** with a **Hybrid Turn/Endpointing Pipeline**, selecting **Deepgram Flux STT** as the initial cloud provider and **Qwen3-ASR (0.6B)** as the designated self-hosted target.

### 1. The Canonical Ingress Architecture

```
[ Founder Microphone ]
        │ (AudioWorklet: 16kHz mono Int16 PCM, 512-sample / 32ms frames)
        ▼
[ Client Silero VAD + 128ms Pre-Roll Ring Buffer ]
        │ (Immediate local mute on speech start; pre-roll flushed on speech_start)
        ▼
[ Authenticated Companion WebSocket (Port 3001) ]
        │ (Single-tenant connection guard, binary frame size bounds)
        ▼
[ Server Live Session Manager ]
        │
        ▼
[ STTProvider Adapter Interface ]
        ├──► DeepgramFluxProvider (Initial Cloud Implementation)
        └──► Qwen3AsrProvider (Designated Self-Hosted Implementation)
        │
        ├──► (Interim Transcripts) ──► WebSocket Client UI Preview
        │
        ▼ (Finalized Canonical Turn Transcript)
[ Canonical Sophia Ingress Pipeline ]
        ├──► ConversationStore.saveMessage('founder', text)
        ├──► SophiaContextAssembler.assemble(...)
        ├──► SophiaIntentClassifier.classify(...)
        └──► SophiaServerGateway.process(...) ──► MultiAgentOrchestrator
```

### 2. Provider-Neutral Contract

The live gateway interacts exclusively with an abstract `STTProvider` contract, emitting a canonical transcript event:

```typescript
export interface CanonicalTranscriptEvent {
  turnId: string;
  conversationId?: string;
  text: string;
  isFinal: boolean;
  isInterim: boolean;
  confidence?: number;
  language?: string;
  timing?: { startMs: number; durationMs: number };
  providerMetadata?: { providerName: string; model: string; rawEventKind?: string };
  error?: { code: string; message: string; recoverable: boolean };
}

export interface STTProvider {
  readonly providerId: string;
  readonly providerName: string;
  connect(opts: STTProviderSessionOptions): Promise<void>;
  sendAudio(chunk: Buffer): void;
  endTurn(): Promise<void>;
  interrupt(): void;
  close(): Promise<void>;
  onTranscript(listener: (event: CanonicalTranscriptEvent) => void): void;
  onError(listener: (error: Error) => void): void;
}
```

### 3. Turn & Endpointing Resolution (Hybrid Pipeline)

We resolve the Phase 4B open question by adopting a **Hybrid Pre-Roll Ring Buffer + Dual Endpointing Strategy**:
1. **Pre-Roll Buffering (Client-Side):** The client maintains a rolling 4-frame (128ms) circular buffer. When VAD confirms `speech_start`, this pre-roll burst is transmitted immediately, preventing first-phoneme clipping (e.g. losing the onset consonant in "Sophia").
2. **Transmission Gating:** Frames are transmitted ONLY during active PTT + speech, maintaining zero cloud bandwidth waste during pauses.
3. **Dual Endpointing:**
   - **PTT Release:** Immediately invokes `sttProvider.endTurn()` (translating to `ForceEndTurn` on Deepgram Flux), guaranteeing sub-100ms turn finalization.
   - **Mid-Turn Pauses:** If the founder holds PTT across a natural pause, provider-native turn detection (`EndOfTurn`) identifies the semantic boundary without premature cutoffs.

### 4. Component Technology Strategy

| Component | Selected Strategy | Rationale & Tradeoffs |
| :--- | :--- | :--- |
| **Initial Cloud Provider** | **Deepgram Flux STT (`wss://api.deepgram.com/v2/listen`)** | Conversational model with native turn-taking (`StartOfTurn`, `EndOfTurn`, `ForceEndTurn`), sub-200ms latency, true per-second billing ($0.39/hr), zero compute maintenance, ~$6–$15/mo founder usage. |
| **Designated Self-Hosted Target** | **Qwen3-ASR (0.6B)** | Permissive Apache 2.0 license, modern dynamic causal attention windows, ~2 GB VRAM footprint (runs comfortably on consumer NVIDIA GPUs), 52+ languages. External VAD/turn management provided by our existing pipeline. |
| **Batch / Offline Transcriber** | **Faster-Whisper (CTranslate2)** | Retained for post-hoc file transcription or meeting notes; rejected for streaming due to sequence-to-sequence chunking hallucinations. |
| **Voice Frameworks (Pipecat / LiveKit)** | **DEFERRED / REJECTED** | Compete with Sophia's control plane; introduce redundant session managers and heavy WebRTC infrastructure for a 1:1 companion stream. |

---

## Consequences

### Positive
- **Zero Vendor Lock-In:** Deepgram Flux is encapsulated behind `STTProvider`. Switching to Qwen3-ASR or a local model requires writing a new adapter class; zero changes to client or Sophia ingress.
- **Minimal Operating Cost:** Pay-as-you-go cloud pricing ($0.39/hr) results in ~$6–$15/month for active founder usage, avoiding $200+/month dedicated cloud GPU costs.
- **Acoustic Integrity:** The 128ms pre-roll buffer eliminates first-phoneme clipping without unbounded buffering.
- **Fail-Closed Security:** Transcripts enter the existing `SophiaServerGateway`, which strips untrusted credentials and enforces `SideEffectAuthorizationGate`.

### Negative / Trade-offs
- **External Network Dependency (Cloud Mode):** Cloud STT requires an active internet connection to Deepgram's streaming API.
- **Self-Hosted Hardware Requirement:** Running Qwen3-ASR locally requires a GPU with at least 4–8 GB VRAM.

---

## Phased Roadmap & Implementation Boundary

- **Phase 4C-A:** Research, candidate benchmarking, latency budgeting, security modeling, and provider-agnostic interface design. **(COMPLETE & SEALED)**
- **Phase 4C-B:** Implementation of `STTProvider` contract (`src/lib/server/live/stt/types.ts`), `DeepgramFluxProvider` (`src/lib/server/live/stt/deepgram-flux.ts`), 128ms pre-roll ring buffer in `SophiaLiveClient`, server frame aggregation (2560 bytes / 80ms), canonical turn executor (`src/lib/server/sophia/turn-executor.ts`), and turn idempotency locks in `LiveInteractionServer`. **(IMPLEMENTED & VERIFIED)**
- **Phase 4C-C (Next Phase - Gated):** Self-Hosted STT Adapter exploration (Qwen3-ASR 0.6B) or UI transcript ribbon binding.

### Phase 4C-B Verification Record
- **`tests/sophia/phase4c_streaming_stt_adapter.test.ts`**: 4 comprehensive automated test suites (58/58 assertions passing) verifying:
  1. Deepgram Flux event normalization (`StartOfTurn`, `Update`, `EndOfTurn`, `Error`), malformed payload safety, missing credentials fail-closed enforcement, and 80ms (2560 bytes) chunk aggregation with turn-boundary residual buffer flush and `ForceEndTurn` control frame.
  2. Client-side 128ms (4-frame) pre-roll ring buffer bounded memory and burst on `speech_start`.
  3. Companion server STT ingress, stable turnId binding, interim and final transcript broadcast, and double-finalization idempotency suppression.
  4. End-to-end Sophia cognitive ingress: persistence to `ConversationStore`, execution through `SophiaIntentClassifier` and `SophiaServerGateway`, prompt-injection untrusted boundary verification, and clean in-flight STT termination upon session reconnect.

---

## References
- Research Report: `doc/research/phase4c_stt_benchmark_and_architecture.md`
- Foundation ADRs: `doc/adr/0002-sophia-durable-conversation-persistence.md`, `doc/adr/0003-sophia-live-interaction-architecture.md`
- Implementation Test: `tests/sophia/phase4c_streaming_stt_adapter.test.ts`
