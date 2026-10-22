/**
 * src/lib/server/sophia/voice-latency.ts
 *
 * Voice Latency Measurement & Tracking (M1.4 / G6.2).
 *
 * Implements deterministic measurement, recording, and percentile analytics
 * for Sofia voice and typing turns:
 * 1. Measures phase breakdown:
 *    - speaking duration (PTT press -> PTT release)
 *    - STT latency (PTT release -> final transcript)
 *    - cognition latency (final transcript -> Sophia response)
 *    - TTS synthesis latency (Sophia response -> audio buffer ready)
 *    - audio playback start latency (PTT release -> first audio output)
 * 2. Calculates median (p50) and 95th-percentile (p95) end-to-end latency
 *    over conversational turns (satisfies >= 20 turns requirement).
 * 3. Supports typing turns alongside voice turns without regression.
 * 4. Durably persists metrics via DurableFileStore without external dependencies.
 */

import { DurableFileStore } from '../persistence/durable-file-store';

export interface VoiceTurnLatencyRecord {
  turnId: string;
  turnType: 'voice' | 'text';
  timestamp: number;
  durationSpeakingMs?: number;
  sttLatencyMs?: number;
  cognitionLatencyMs?: number;
  ttsLatencyMs?: number;
  endToEndFromStopMs: number;
  endToEndTotalMs: number;
  transcriptLengthChars?: number;
  replyLengthChars?: number;
  liveAi?: boolean;
}

export interface VoiceLatencySummary {
  sampleCount: number;
  voiceSampleCount: number;
  textSampleCount: number;
  p50EndToEndFromStopMs: number;
  p95EndToEndFromStopMs: number;
  p99EndToEndFromStopMs: number;
  p50TotalMs: number;
  p95TotalMs: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  records: VoiceTurnLatencyRecord[];
}

/**
 * Standard linear interpolation percentile calculation (equivalent to NIST / Excel PERCENTILE.INC).
 * Works deterministically for any sample size >= 1.
 */
export function calculatePercentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  if (p <= 0) return sortedValues[0];
  if (p >= 100) return sortedValues[sortedValues.length - 1];

  const rank = (p / 100) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const fraction = rank - lowerIndex;

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }
  const result = sortedValues[lowerIndex] + fraction * (sortedValues[upperIndex] - sortedValues[lowerIndex]);
  return Math.round(result * 100) / 100;
}

export class VoiceLatencyTracker {
  private static instance: VoiceLatencyTracker | null = null;
  private records = new Map<string, VoiceTurnLatencyRecord>();

  private constructor() {
    this.loadPersistedRecords();
  }

  public static getInstance(): VoiceLatencyTracker {
    if (!VoiceLatencyTracker.instance) {
      VoiceLatencyTracker.instance = new VoiceLatencyTracker();
    }
    return VoiceLatencyTracker.instance;
  }

  public static resetInstance(): void {
    VoiceLatencyTracker.instance = null;
  }

  private loadPersistedRecords(): void {
    try {
      const collection = DurableFileStore.getInstance().readCollection<VoiceTurnLatencyRecord>('voice_latency');
      for (const [id, rec] of Object.entries(collection)) {
        if (rec && typeof rec === 'object' && rec.turnId) {
          this.records.set(id, rec);
        }
      }
    } catch {
      // Best-effort loading on boot
    }
  }

  private persistRecord(record: VoiceTurnLatencyRecord): void {
    try {
      DurableFileStore.getInstance().saveItem('voice_latency', record.turnId, record);
    } catch (err) {
      console.warn('[VoiceLatencyTracker] Failed to persist latency record:', err);
    }
  }

  /**
   * Records or updates a latency metric for a turn.
   * Merges partial updates if a record already exists for the turnId.
   */
  public recordTurn(metric: Partial<VoiceTurnLatencyRecord> & { turnId: string }): VoiceTurnLatencyRecord {
    const existing = this.records.get(metric.turnId);
    const updated: VoiceTurnLatencyRecord = {
      turnId: metric.turnId,
      turnType: metric.turnType ?? existing?.turnType ?? 'voice',
      timestamp: metric.timestamp ?? existing?.timestamp ?? Date.now(),
      durationSpeakingMs: metric.durationSpeakingMs ?? existing?.durationSpeakingMs,
      sttLatencyMs: metric.sttLatencyMs ?? existing?.sttLatencyMs,
      cognitionLatencyMs: metric.cognitionLatencyMs ?? existing?.cognitionLatencyMs,
      ttsLatencyMs: metric.ttsLatencyMs ?? existing?.ttsLatencyMs,
      endToEndFromStopMs: metric.endToEndFromStopMs ?? existing?.endToEndFromStopMs ?? 0,
      endToEndTotalMs: metric.endToEndTotalMs ?? existing?.endToEndTotalMs ?? 0,
      transcriptLengthChars: metric.transcriptLengthChars ?? existing?.transcriptLengthChars,
      replyLengthChars: metric.replyLengthChars ?? existing?.replyLengthChars,
      liveAi: metric.liveAi ?? existing?.liveAi,
    };

    this.records.set(metric.turnId, updated);
    this.persistRecord(updated);
    return updated;
  }

  /**
   * Returns summary statistics (sampleCount, p50, p95, min, max, mean).
   */
  public getSummary(filter?: { turnType?: 'voice' | 'text' | 'all' }): VoiceLatencySummary {
    const typeFilter = filter?.turnType ?? 'all';
    const allRecords = Array.from(this.records.values());

    const filtered = allRecords.filter((r) => {
      if (typeFilter === 'all') return true;
      return r.turnType === typeFilter;
    });

    const voiceCount = allRecords.filter((r) => r.turnType === 'voice').length;
    const textCount = allRecords.filter((r) => r.turnType === 'text').length;

    if (filtered.length === 0) {
      return {
        sampleCount: 0,
        voiceSampleCount: voiceCount,
        textSampleCount: textCount,
        p50EndToEndFromStopMs: 0,
        p95EndToEndFromStopMs: 0,
        p99EndToEndFromStopMs: 0,
        p50TotalMs: 0,
        p95TotalMs: 0,
        minMs: 0,
        maxMs: 0,
        meanMs: 0,
        records: [],
      };
    }

    const stopLatencies = filtered.map((r) => r.endToEndFromStopMs).sort((a, b) => a - b);
    const totalLatencies = filtered.map((r) => r.endToEndTotalMs).sort((a, b) => a - b);
    const sum = stopLatencies.reduce((acc, val) => acc + val, 0);

    return {
      sampleCount: filtered.length,
      voiceSampleCount: voiceCount,
      textSampleCount: textCount,
      p50EndToEndFromStopMs: calculatePercentile(stopLatencies, 50),
      p95EndToEndFromStopMs: calculatePercentile(stopLatencies, 95),
      p99EndToEndFromStopMs: calculatePercentile(stopLatencies, 99),
      p50TotalMs: calculatePercentile(totalLatencies, 50),
      p95TotalMs: calculatePercentile(totalLatencies, 95),
      minMs: stopLatencies[0],
      maxMs: stopLatencies[stopLatencies.length - 1],
      meanMs: Math.round((sum / stopLatencies.length) * 100) / 100,
      records: [...filtered],
    };
  }

  public getRecords(turnType?: 'voice' | 'text' | 'all'): VoiceTurnLatencyRecord[] {
    const typeFilter = turnType ?? 'all';
    return Array.from(this.records.values()).filter((r) => {
      if (typeFilter === 'all') return true;
      return r.turnType === typeFilter;
    });
  }

  public clear(): void {
    this.records.clear();
    try {
      DurableFileStore.getInstance().writeCollection('voice_latency', {});
    } catch {
      // ignore
    }
  }
}
