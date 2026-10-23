# Voice documentation map — kit/integration

**Checked against:** kit/integration @ d209f67 (2026-10-23).  
**Verification status:** Source inspection only; microphone/audio and cloud provider availability NOT TESTED.

## Current code paths (implementation, not promises of passing audio)

- [Sofia app surface](../../src/sofia/App.tsx) renders [SofiaVoiceCompanion](../../src/components/SofiaVoiceCompanion.tsx).
- [OS shell](../../src/os/App.tsx) mounts the Sofia surface and [SharedSophiaVoicePresence](../../src/os/components/voice/SharedSophiaVoicePresence.tsx) rather than a second microphone transport by default.
- [SofiaOS singleton](../../src/sofia/sophia/SophiaOS.ts) and provider implementations live under the Sofia runtime.
- [Integrated Express + live WebSocket server](../../server.ts) exposes /api/live-ws on the HTTP port.
- [Setup for this branch](../setup/KIT_INTEGRATION.md) explains the actual package scripts.

## Historical design and migration evidence

- [Shared SofiaUI voice patch notes](SHARED-SOFIA-VOICE-PATCH.md): **HISTORICAL PATCH INSTRUCTIONS**. They refer to a Next.js/separate WebSocket path and must not be used as an installation guide for the audited Vite/Express branch.
- [Voice port notes](../../src/os/components/voice/PORT-NOTES.md): dated phase/port history; preserves design intent and known limitations.
- [ADR 0003: Sophia Live Interaction](../../doc/adr/0003-sophia-live-interaction-architecture.md) and [ADR 0004: STT](../../doc/adr/0004-provider-agnostic-streaming-stt-architecture.md): prior architectural choices.
- [ADR-001: Realtime Sophia Interface](../architecture/ADR-001-realtime-sophia-interface.md): later multimodal design; assess each target against current code before treating as shipped.
- [Phase 5 parity checklist](../audit/PHASE5-PARITY-CHECKLIST.md) and [voice governance review](../audit/PHASE4-VOICE-GOVERNANCE-SECURITY-REVIEW.md): historical tests and review, not a substitute for current hardware validation.

**Supersession rule:** Existing evidence stays intact. A document can be superseded as a current procedure without invalidating its historical test claims or ratified decisions. No source has been moved or deleted by this indexing change.

[Documentation index](../README.md) · [Branch audit](../audit/KIT_INTEGRATION_DOCUMENT_RECONCILIATION_2026-10-23.md)
