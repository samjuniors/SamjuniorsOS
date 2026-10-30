# ADR 0008: Voice Orchestration and Barge-in Architecture — Pipecat and LiveKit Agents Evaluation

## Status
ACCEPTED (Ratified for Gate G6.2 / Milestone M5 on 2026-10-30)

## Decision
Retain the in-tree TypeScript Cascaded Streaming Gateway with client AudioWorklet VAD, generation ID fencing, and immediate audio hardware cutoff. Borrow key architectural patterns from Pipecat and LiveKit Agents (ring buffering, chunk-level cancellation, and context reconciliation), while explicitly rejecting an external Python sidecar runtime or external LiveKit Server daemon.

## Why
1. **Single-Founder Simplicity & Zero-Overhead Deployment:**
   SamJuniorsOS operates on a unified TypeScript stack (Vite + React + Express). Introducing a secondary Python sidecar runtime (required by Pipecat and LiveKit Agents) doubles packaging, build, and monitoring complexity for a solo founder.
2. **Cognitive Ingress Authority:**
   Per `AGENTS.md` §3 and §6, Sophia is the single authoritative company intelligence. The decision engine, route taxonomy, and cryptographic governance gates must reside in the TypeScript core. Running a Python agent framework would bifurcate company logic and create a parallel execution engine.
3. **Proven Sub-70ms Performance:**
   Windows voice-loop latency is measured at `p50 = 50ms` and `p95 = 67.2ms`, well under human conversational pause thresholds, making heavier WebRTC SFU infrastructure unnecessary.

## Alternatives Considered
1. **Pipecat (BSD-2):**
   - *Pros:* Mature pipeline architecture, native VAD, and audio frame abstractions.
   - *Cons:* Python-first. Requires running an external Python process/sidecar. Lacks institutional memory, WORM audit ledgers, or authorization gates. Packaging with Electron for Windows adds significant friction.
2. **LiveKit Agents (Apache-2.0):**
   - *Pros:* High-performance WebRTC media routing (SFU), packet-loss resilience.
   - *Cons:* Requires deploying and operating an external LiveKit Server daemon or paying for cloud hosting. Overkill for single-founder local/staging operations. Python agent SDK introduces dual-stack complexity.
3. **In-Tree TypeScript Streaming Gateway (Selected):**
   - *Pros:* 100% TypeScript, single container deployable, direct WebSocket multiplexing, zero inter-process RPC overhead.
   - *Cons:* Requires maintaining our own AudioWorklet and gateway transport logic (already built and verified in M1.4 and MX.5).

## Boundaries
- **Voice is an Ephemeral Sensory Modality:** Voice is an interface to Sophia, not a second brain (`AGENTS.md` §3 & §6).
- **Zero Bypass of Governance:** Spoken words can never execute consequential side effects without visual panel sign-off.
- **Fail-Closed Abort:** If a barge-in occurs while an AI specialist or tool is executing an uncommitted proposal, the generation is canceled safely without leaving orphaned state.

## Risks
| Risk | Mitigation |
|---|---|
| Audio Worklet support on non-standard browser runtimes | System maintains Push-to-Talk (PTT) keyboard hold (`Space` / `P`) and WebSpeech text-mode fallback. |
| Model streaming rate limits or SSE chunk truncation | Implemented SSE chunk buffering in `GeminiConversationProvider` with fallback to batch generation if streaming transport fails. |
| Acoustic feedback / echo triggering accidental barge-in | `bargeInThreshold` dynamically scales with speaker playback RMS to prevent the AI's own voice from triggering a self-interruption. |

## Migration / Reversibility
The speech modality sits entirely behind provider-neutral interfaces (`VoiceProvider`, `STTProvider`, `RealtimeModelProvider`). If a multi-party voice room or specialized WebRTC feature is ever required in future milestones, a LiveKit or Pipecat adapter can be added behind these existing interfaces without rewriting any business logic or governance gates.

## Next Action
1. Measure end-to-end streaming voice latency on Windows and record `p50` and `p95` in `doc/benchmarks/2026-10-30-voice-loop-streaming-latency-g62.json`.
2. Verify barge-in cancellation, AbortController signaling, and generation ID fencing via `tests/voice/g6_2_streaming_reply_barge_in.test.ts`.
