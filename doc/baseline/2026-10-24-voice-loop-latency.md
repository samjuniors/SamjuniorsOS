# Pre-Migration Voice-Loop Latency Baseline (MX.2)

- **Date:** 2026-10-24
- **Timestamp:** 2026-10-24T05:23:27.206Z
- **Step:** MX.2 (Milestone MX: A faster, desktop-ready stack: Vite + React + Express)
- **Host Machine:** win32 x64 (13th Gen Intel(R) Core(TM) i7-13700K)
- **Runtime:** Node.js v24.16.0
- **Voice Provider:** `LiveGatewayVoiceProvider` (Gemini Live / Deepgram / ElevenLabs interface seams)
- **Methodology:** Established in Milestone M1.4 (`tests/sophia/m1_4_voice_loop.test.ts`). Measures end-to-end latency from PTT release / speech finish to AudioEngine audio playback start.

## Summary Metrics (Over 25 Consecutive Turns)

| Metric | Measured Value (ms) | Target / SLA |
|---|---|---|
| **Median Latency (p50)** | **79 ms** | Baseline established for MX.5 comparison |
| **95th Percentile (p95)** | **90.8 ms** | Baseline established for MX.5 comparison |
| **99th Percentile (p99)** | **94.04 ms** | Baseline established for MX.5 comparison |
| **Minimum Latency** | 66 ms | - |
| **Maximum Latency** | 95 ms | - |
| **Arithmetic Mean** | 79 ms | - |

## Per-Turn Phase Breakdown (All 25 Turns)

| Turn # | Turn ID | Speech Stop $\rightarrow$ Final Transcript | Transcript $\rightarrow$ Response | TTS + Playback Start | Total End-to-End |
|---|---|---|---|---|---|
| 1 | `mx2_baseline_turn_1_1792...` | 16 ms | 32 ms | - ms | **76 ms** |
| 2 | `mx2_baseline_turn_2_1792...` | 16 ms | 31 ms | - ms | **84 ms** |
| 3 | `mx2_baseline_turn_3_1792...` | 16 ms | 31 ms | - ms | **71 ms** |
| 4 | `mx2_baseline_turn_4_1792...` | 16 ms | 48 ms | - ms | **90 ms** |
| 5 | `mx2_baseline_turn_5_1792...` | 15 ms | 36 ms | - ms | **77 ms** |
| 6 | `mx2_baseline_turn_6_1792...` | 24 ms | 35 ms | - ms | **91 ms** |
| 7 | `mx2_baseline_turn_7_1792...` | 11 ms | 32 ms | - ms | **66 ms** |
| 8 | `mx2_baseline_turn_8_1792...` | 15 ms | 34 ms | - ms | **80 ms** |
| 9 | `mx2_baseline_turn_9_1792...` | 19 ms | 35 ms | - ms | **90 ms** |
| 10 | `mx2_baseline_turn_10_179...` | 15 ms | 27 ms | - ms | **73 ms** |
| 11 | `mx2_baseline_turn_11_179...` | 17 ms | 31 ms | - ms | **69 ms** |
| 12 | `mx2_baseline_turn_12_179...` | 14 ms | 31 ms | - ms | **66 ms** |
| 13 | `mx2_baseline_turn_13_179...` | 15 ms | 36 ms | - ms | **85 ms** |
| 14 | `mx2_baseline_turn_14_179...` | 16 ms | 28 ms | - ms | **75 ms** |
| 15 | `mx2_baseline_turn_15_179...` | 16 ms | 29 ms | - ms | **79 ms** |
| 16 | `mx2_baseline_turn_16_179...` | 20 ms | 34 ms | - ms | **85 ms** |
| 17 | `mx2_baseline_turn_17_179...` | 20 ms | 33 ms | - ms | **71 ms** |
| 18 | `mx2_baseline_turn_18_179...` | 15 ms | 38 ms | - ms | **86 ms** |
| 19 | `mx2_baseline_turn_19_179...` | 16 ms | 32 ms | - ms | **79 ms** |
| 20 | `mx2_baseline_turn_20_179...` | 15 ms | 26 ms | - ms | **75 ms** |
| 21 | `mx2_baseline_turn_21_179...` | 20 ms | 26 ms | - ms | **67 ms** |
| 22 | `mx2_baseline_turn_22_179...` | 16 ms | 32 ms | - ms | **78 ms** |
| 23 | `mx2_baseline_turn_23_179...` | 16 ms | 35 ms | - ms | **81 ms** |
| 24 | `mx2_baseline_turn_24_179...` | 24 ms | 41 ms | - ms | **95 ms** |
| 25 | `mx2_baseline_turn_25_179...` | 14 ms | 37 ms | - ms | **82 ms** |

---
*Note: This file serves as the definitive reference baseline for Milestone MX. Step MX.5 will measure post-migration latency against these exact numbers.*
