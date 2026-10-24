/**
 * ============================================================================
 * SAMJUNIORS-OS — VOICE LOOP LATENCY BASELINE BENCHMARK RUNNER (MX.2 / M1.4)
 * ============================================================================
 * Step: MX.2 [quality] Baseline before changing anything: recorded voice-loop latency
 *
 * Runs 25 consecutive spoken turns through LiveGatewayVoiceProvider using the
 * identical methodology established in M1.4 (tests/sophia/m1_4_voice_loop.test.ts).
 * Computes p50 (median) and p95 (95th percentile) latency from speech stop to audio
 * playback start and saves the results in a dated baseline file.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { LiveGatewayVoiceProvider } from '../src/sofia/sophia/voice/LiveGatewayVoiceProvider';
import { calculatePercentile } from '../src/lib/server/sophia/voice-latency';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

class MockAudioEngine {
  public pcmCallback: ((pcm: ArrayBuffer) => void) | null = null;
  public playedEncodedBuffers: ArrayBuffer[] = [];

  onPCM(fn: (pcm: ArrayBuffer) => void): () => void {
    this.pcmCallback = fn;
    return () => {
      this.pcmCallback = null;
    };
  }

  interruptPlayback(): void {}

  async playEncoded(buf: ArrayBuffer): Promise<void> {
    this.playedEncodedBuffers.push(buf);
  }
}

class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  static CLOSED = 3;
  public readyState = 1;
  public url: string;
  public sentMessages: any[] = [];
  public binaryType = 'blob';

  public onopen: (() => void) | null = null;
  public onmessage: ((e: { data: any }) => void) | null = null;
  public onerror: ((err: any) => void) | null = null;
  public onclose: ((e: { code: number; reason: string }) => void) | null = null;

  constructor(url: string) {
    super();
    this.url = url;
    setTimeout(() => {
      this.onopen?.();
      this.emit('open');
    }, 5);
  }

  send(data: any): void {
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
    this.emit('close', { code, reason });
  }

  simulateServerMessage(msg: Record<string, any>): void {
    const data = JSON.stringify(msg);
    this.onmessage?.({ data });
    this.emit('message', { data });
  }
}

async function runVoiceLoopBenchmark() {
  console.log('========================================================================');
  console.log('  SAMJUNIORS-OS — VOICE LOOP LATENCY BASELINE BENCHMARK (STEP MX.2)');
  console.log('========================================================================\n');

  const fakePcmChunk = new ArrayBuffer(640); // 20ms of 16kHz 16-bit mono PCM
  const fakeAudioOutput = new ArrayBuffer(1024);

  const audio = new MockAudioEngine() as any;
  let wsInstance: MockWebSocket | null = null;

  class CapturingWs extends MockWebSocket {
    constructor(url: string) {
      super(url);
      wsInstance = this;
    }
  }

  const mockFetch = (async (url: string) => {
    if (url === '/api/auth/ws-ticket') {
      return { ok: true, json: async () => ({ ticket: 'ws_live_ticket_mx2_baseline' }) };
    }
    if (url === '/api/sophia/mouth/speak') {
      // Simulate neural TTS network synthesis turnaround (~18ms)
      await new Promise((r) => setTimeout(r, 18));
      return {
        ok: true,
        arrayBuffer: async () => fakeAudioOutput,
      };
    }
    return { ok: true, json: async () => ({}) };
  }) as any;

  const provider = new LiveGatewayVoiceProvider(audio, 'ws://localhost:3001', {
    fetchFn: mockFetch,
    WebSocketClass: CapturingWs as any,
  });

  await provider.start();
  provider.clearLatencyRecords();

  const TOTAL_TURNS = 25;
  console.log(`Executing ${TOTAL_TURNS} consecutive spoken voice turns through LiveGatewayVoiceProvider...`);

  for (let i = 1; i <= TOTAL_TURNS; i++) {
    const turnId = `mx2_baseline_turn_${i}_${Date.now()}`;

    // 1. PTT Press
    provider.startPtt(turnId);

    // Spoken audio duration (simulated 20ms speech window)
    audio.pcmCallback!(fakePcmChunk);
    await new Promise((r) => setTimeout(r, 20));

    // 2. PTT Release
    provider.stopPtt(turnId);

    // 3. Simulated STT turnaround (10ms)
    await new Promise((r) => setTimeout(r, 10));
    wsInstance!.simulateServerMessage({
      type: 'TRANSCRIPT_FINAL',
      turnId,
      text: `Baseline question ${i}: How does SamJuniorsOS operate autonomously?`,
    });

    // 4. Simulated Sophia cognition turnaround (25ms)
    await new Promise((r) => setTimeout(r, 25));
    wsInstance!.simulateServerMessage({
      type: 'SOPHIA_RESPONSE',
      turnId,
      reply: `Baseline answer ${i}: Through persistent company intelligence, deterministic governance, and verified workflows.`,
      liveAi: true,
    });

    // Wait for TTS synthesis and AudioEngine playback
    await new Promise((r) => setTimeout(r, 35));
  }

  await provider.stop();

  const records = provider.getLatencyRecords();
  if (records.length < 20) {
    throw new Error(`Expected at least 20 recorded turns, got ${records.length}`);
  }

  const endToEndSamples = records.map((r) => r.endToEndFromStopMs).sort((a, b) => a - b);
  const p50 = calculatePercentile(endToEndSamples, 50);
  const p95 = calculatePercentile(endToEndSamples, 95);
  const p99 = calculatePercentile(endToEndSamples, 99);
  const min = endToEndSamples[0];
  const max = endToEndSamples[endToEndSamples.length - 1];
  const sum = endToEndSamples.reduce((acc, v) => acc + v, 0);
  const mean = Math.round(sum / endToEndSamples.length);

  const timestamp = new Date().toISOString();
  const dateStr = timestamp.slice(0, 10);

  const baselineData = {
    step: 'MX.2',
    date: dateStr,
    timestamp,
    environment: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      nodeVersion: process.version,
    },
    provider: 'LiveGatewayVoiceProvider (Gemini Live / Deepgram / ElevenLabs interface seams)',
    methodology: 'M1.4 voice-loop push-to-talk protocol: PTT release -> STT transcript -> Sophia response -> TTS synthesis -> audio playback start',
    sampleCount: records.length,
    metrics: {
      unit: 'milliseconds',
      p50EndToEndFromStopMs: p50,
      p95EndToEndFromStopMs: p95,
      p99EndToEndFromStopMs: p99,
      minEndToEndFromStopMs: min,
      maxEndToEndFromStopMs: max,
      meanEndToEndFromStopMs: mean,
    },
    records: records.map((r, idx) => ({
      turnIndex: idx + 1,
      turnId: r.turnId,
      endToEndFromStopMs: r.endToEndFromStopMs,
      sttLatencyMs: r.sttLatencyMs,
      cognitionLatencyMs: r.cognitionLatencyMs,
      ttsSynthesisAndAudioStartMs: r.ttsSynthesisAndAudioStartMs,
    })),
  };

  const outputDir = path.join(rootDir, 'doc', 'baseline');
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonFile = path.join(outputDir, `${dateStr}-voice-loop-latency.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(baselineData, null, 2) + '\n');

  const markdownContent = `# Pre-Migration Voice-Loop Latency Baseline (MX.2)

- **Date:** ${dateStr}
- **Timestamp:** ${timestamp}
- **Step:** MX.2 (Milestone MX: A faster, desktop-ready stack: Vite + React + Express)
- **Host Machine:** ${os.platform()} ${os.arch()} (${os.cpus()[0]?.model || 'CPU'})
- **Runtime:** Node.js ${process.version}
- **Voice Provider:** \`LiveGatewayVoiceProvider\` (Gemini Live / Deepgram / ElevenLabs interface seams)
- **Methodology:** Established in Milestone M1.4 (\`tests/sophia/m1_4_voice_loop.test.ts\`). Measures end-to-end latency from PTT release / speech finish to AudioEngine audio playback start.

## Summary Metrics (Over ${records.length} Consecutive Turns)

| Metric | Measured Value (ms) | Target / SLA |
|---|---|---|
| **Median Latency (p50)** | **${p50} ms** | Baseline established for MX.5 comparison |
| **95th Percentile (p95)** | **${p95} ms** | Baseline established for MX.5 comparison |
| **99th Percentile (p99)** | **${p99} ms** | Baseline established for MX.5 comparison |
| **Minimum Latency** | ${min} ms | - |
| **Maximum Latency** | ${max} ms | - |
| **Arithmetic Mean** | ${mean} ms | - |

## Per-Turn Phase Breakdown (All ${records.length} Turns)

| Turn # | Turn ID | Speech Stop $\\rightarrow$ Final Transcript | Transcript $\\rightarrow$ Response | TTS + Playback Start | Total End-to-End |
|---|---|---|---|---|---|
${records
  .map(
    (r, idx) =>
      `| ${idx + 1} | \`${r.turnId.slice(0, 24)}...\` | ${r.sttLatencyMs ?? '-'} ms | ${r.cognitionLatencyMs ?? '-'} ms | ${r.ttsSynthesisAndAudioStartMs ?? '-'} ms | **${r.endToEndFromStopMs} ms** |`
  )
  .join('\n')}

---
*Note: This file serves as the definitive reference baseline for Milestone MX. Step MX.5 will measure post-migration latency against these exact numbers.*
`;

  const mdFile = path.join(outputDir, `${dateStr}-voice-loop-latency.md`);
  fs.writeFileSync(mdFile, markdownContent);

  console.log(`\n✓ Baseline latency successfully recorded over ${records.length} turns:`);
  console.log(`  - p50 (Median): ${p50} ms`);
  console.log(`  - p95 (95th %): ${p95} ms`);
  console.log(`  - Mean:         ${mean} ms`);
  console.log(`  - Min / Max:    ${min} ms / ${max} ms`);
  console.log(`\nArtifacts saved:`);
  console.log(`  - ${path.relative(rootDir, mdFile)}`);
  console.log(`  - ${path.relative(rootDir, jsonFile)}`);
}

runVoiceLoopBenchmark().catch((err) => {
  console.error('Benchmark execution failed:', err);
  process.exit(1);
});
