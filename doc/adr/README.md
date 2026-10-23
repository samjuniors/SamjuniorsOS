# Architecture Decision Records (ADRs)

This directory houses the authoritative Architecture Decision Records for SamJuniorsOS. All architectural modifications, persistence models, and governance contracts must be recorded here following the template in `AGENTS.md` §14.

## Index of Records

| ADR | Title | Status | Date | Primary Scope |
|---|---|---|---|---|
| [ADR-0001](0001-replace-legacy-design-system-with-canonical-visual-language.md) | Replace Legacy Design System with Canonical Visual Language | ACCEPTED | 2026-09-12 | Desktop UI, Canvas, Design Tokens |
| [ADR-0002](0002-sophia-durable-conversation-persistence.md) | Sophia Durable Conversation Persistence | ACCEPTED | 2026-09-14 | Persistence, SQLite/Prisma, Conversation Store |
| [ADR-0003](0003-sophia-live-interaction-architecture.md) | Sophia Live Interaction Architecture | ACCEPTED | 2026-09-16 | Live Companion Server, Audio Resampling, VAD |
| [ADR-0004](0004-provider-agnostic-streaming-stt-architecture.md) | Provider-Agnostic Streaming STT Architecture | ACCEPTED | 2026-09-17 | Deepgram Flux, Qwen3-ASR, Provider Independence |
| [ADR-0005](0005-telemetrymetric-model-disposition.md) | TelemetryMetric Model Disposition | ACCEPTED | 2026-09-28 | Honest Metrics, TurnStopwatch, Schema Preservation |
| [ADR-0006](0006-scale-later-seams.md) | Scale-Later Seams | ACCEPTED | 2026-10-18 | Single-Founder Invariant, Multi-Tenant Future Seams |
| [ADR-0007](0007-stack-migration-vite-react-express.md) | Stack Migration to Vite + React + Express + TypeScript | ACCEPTED | 2026-10-23 | Full-Stack Runtime, Milestone MX, Desktop & Cloud |

## Related Target Architecture Specifications
- [`docs/architecture/ADR-001-realtime-sophia-interface.md`](../../docs/architecture/ADR-001-realtime-sophia-interface.md): Target design for WebRTC, multimodal vision, and cloud/local boundaries.
