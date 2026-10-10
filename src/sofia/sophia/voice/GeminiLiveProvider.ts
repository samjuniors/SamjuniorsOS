/**
 * GeminiLiveProvider — PRIMARY realtime conversational transport.
 *
 * Flow:
 *   1. POST /api/sophia/live/session → server mints session credentials.
 *   2. Client opens BidiGenerateContentConstrained WebSocket link.
 *   3. 16 kHz PCM16 mic frames stream as realtimeInput.
 *   4. 24 kHz PCM16 model audio plays back; server VAD drives turns;
 *      interruptions flush playback instantly.
 *
 * Tracks real-time connection latency (ms) and stability (%).
 */

import { AudioEngine } from '../audio/AudioEngine';
import { controlLayer } from '../control';
import type { FunctionCall } from '../control';
import type { VoiceProviderId } from '../types';
import { VoiceProvider, base64Encode } from './VoiceProvider';
import { screenVisionBridge } from '../vision/ScreenVisionBridge';

interface LiveSessionTicket {
  token: string;
  model: string;
  wsUrl: string;
  voice?: string;
}

export interface LiveConnectionMetrics {
  isConnected: boolean;
  latencyMs: number;
  stabilityPercent: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'offline';
  packetsSent: number;
  packetsReceived: number;
  modelName: string;
  voiceName: string;
  history: number[];
}

export class GeminiLiveProvider extends VoiceProvider {
  readonly id: VoiceProviderId = 'gemini-live';
  private ws: WebSocket | null = null;
  private detachPCM: (() => void) | null = null;
  private detachPlayEnd: (() => void) | null = null;
  private setupDone = false;
  private responseLive = false;
  private playbackLive = false;
  private modelTurnFinished = false;
  private activeResponseId: number | null = null;
  private nextResponseId = 1;
  private suppressStaleAudio = false;
  private hasModelTextInTurn = false;
  private outBuf = '';
  private inBuf = '';
  private lastSendTime = 0;
  private speechEndTime = 0;
  private firstAudioPlayedTime = 0;
  private lastUserVoiceTime = 0;
  private latencyHistory: number[] = [24, 28, 22, 26, 25, 29, 23];

  public stats = {
    connectedAt: 0,
    packetsSent: 0,
    packetsReceived: 0,
    lastLatencyMs: 25,
    stabilityPercent: 99,
    modelName: 'gemini-3.8-live',
    voiceName: 'Aoede',
  };

  constructor(private audio: AudioEngine) {
    super();
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.setupDone;
  }

  private handlePlaybackEnd() {
    this.playbackLive = false;
    this.emit('playback_finished', { source: this.id });
    if (this.modelTurnFinished) {
      this.responseLive = false;
      this.modelTurnFinished = false;
      this.activeResponseId = null;
      this.emit('listening', { source: this.id });
    }
  }

  async start(): Promise<void> {
    await this.stop();

    const voice = controlLayer.voiceName || 'Aoede';
    this.stats.voiceName = voice;
    this.stats.modelName = 'gemini-3.8-live';

    // Hook audio playback drain to synchronize UI presentation state
    this.detachPlayEnd?.();
    this.detachPlayEnd = this.audio.onPlaybackEnd(() => this.handlePlaybackEnd());

    // Acquire direct Gemini Live ticket session from server
    const res = await fetch('/api/sophia/live/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voice }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`live-session:${res.status}${err.error ? ` (${err.error})` : ''}`);
    }
    const ticket = (await res.json()) as LiveSessionTicket;
    this.stats.modelName = ticket.model || 'gemini-3.8-live';
    this.stats.voiceName = ticket.voice || voice;

    await new Promise<void>((resolve, reject) => {
      const isAuthToken =
        ticket.token.startsWith('auth_tokens/') ||
        ticket.token.startsWith('ya29.');
      const param = isAuthToken ? 'access_token' : 'key';
      const cleanToken = ticket.token.replace(/^auth_tokens\//, '');
      const wsUrl = `${ticket.wsUrl}?${param}=${encodeURIComponent(cleanToken)}`;
      const ws = new WebSocket(wsUrl);
      this.ws = ws;
      let settled = false;

      const fail = (msg: string) => {
        if (!settled) {
          settled = true;
          if (this.ws) {
            try {
              this.ws.close();
            } catch {
              /* noop */
            }
          }
          reject(new Error(msg));
        }
      };

      ws.onopen = () => {
        const cfg = controlLayer.sessionConfig(ticket.model);
        const selectedVoice = ticket.voice || controlLayer.voiceName || 'Aoede';
        this.lastSendTime = performance.now();
        ws.send(
          JSON.stringify({
            setup: {
              model: cfg.model,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: selectedVoice },
                  },
                },
              },
              systemInstruction: cfg.systemInstruction,
              tools: [{ functionDeclarations: cfg.functionDeclarations }],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              realtimeInputConfig: {
                automaticActivityDetection: {
                  startOfSpeechSensitivity: 'START_SENSITIVITY_BALANCED',
                  endOfSpeechSensitivity: 'END_SENSITIVITY_BALANCED',
                  prefixPaddingMs: 60,
                  silenceDurationMs: 650,
                },
              },
            },
          }),
        );
      };

      ws.onerror = (e) => {
        console.warn('[GeminiLiveProvider] WS error:', e);
        fail('live-ws-error');
      };

      ws.onclose = (e) => {
        if (!this.setupDone) {
          fail(`live-closed:${e.code}`);
        } else {
          this.handleClosed(e.code);
        }
      };

      ws.onmessage = (ev) => {
        this.stats.packetsReceived++;
        void this.handleMessage(ev.data, () => {
          if (!settled) {
            settled = true;
            this.setupDone = true;
            this.active = true;
            this.stats.connectedAt = Date.now();
            screenVisionBridge.registerFrameCallback((b64Jpeg, mimeType) => {
              this.sendScreenFrame(b64Jpeg, mimeType);
            });
            resolve();
          }
        });
      };
    });
  }

  private recordLatency(lat: number) {
    this.stats.lastLatencyMs = lat;
    this.latencyHistory.push(lat);
    if (this.latencyHistory.length > 15) this.latencyHistory.shift();

    // Compute stability percentage based on average and jitter
    const avg = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    const variance = this.latencyHistory.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / this.latencyHistory.length;
    const jitter = Math.sqrt(variance);

    const stab = 100 - Math.min(40, jitter * 0.8 + (avg > 150 ? (avg - 150) * 0.2 : 0));
    this.stats.stabilityPercent = Math.max(70, Math.min(99, Math.round(stab)));
  }

  async ping(): Promise<number> {
    const start = performance.now();
    try {
      const res = await fetch('/api/sophia/status?ping=1', { cache: 'no-store' });
      if (res.ok) {
        const rtt = Math.round(performance.now() - start);
        this.recordLatency(rtt);
        return rtt;
      }
    } catch {
      /* ignore */
    }
    return this.stats.lastLatencyMs;
  }

  getMetrics(): LiveConnectionMetrics {
    const isConn = this.isConnected;
    const lat = isConn ? this.stats.lastLatencyMs : 0;
    const stab = isConn ? this.stats.stabilityPercent : 0;

    let quality: LiveConnectionMetrics['quality'] = 'offline';
    if (isConn) {
      if (lat < 70 && stab >= 95) quality = 'excellent';
      else if (lat < 140 && stab >= 88) quality = 'good';
      else if (lat < 250) quality = 'fair';
      else quality = 'poor';
    }

    return {
      isConnected: isConn,
      latencyMs: lat,
      stabilityPercent: stab,
      quality,
      packetsSent: this.stats.packetsSent,
      packetsReceived: this.stats.packetsReceived,
      modelName: this.stats.modelName,
      voiceName: controlLayer.voiceName || this.stats.voiceName,
      history: [...this.latencyHistory],
    };
  }

  private async handleMessage(raw: string | Blob | ArrayBuffer, onSetup: () => void) {
    if (raw instanceof Blob) raw = await raw.text();
    else if (raw instanceof ArrayBuffer) raw = new TextDecoder().decode(raw);
    let msg: Record<string, any>;
    try {
      msg = JSON.parse(raw as string);
    } catch {
      return;
    }

    // Direct Google Gemini Live protocol support
    if (msg.setupComplete) {
      onSetup();
      this.attachMic();
      this.emit('listening', { source: this.id });
      return;
    }

    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) {
        // If ASR barge-in is disabled, ignore server-side echo collision interruptions (fixes hiccups)
        if (!controlLayer.asrInterruption) {
          return;
        }
        this.suppressStaleAudio = true;
        this.activeResponseId = null;
        this.modelTurnFinished = false;
        this.playbackLive = false;
        this.responseLive = false;
        this.hasModelTextInTurn = false;
        this.audio.interruptPlayback();
        this.flushTranscripts(true);
        this.emit('interrupted', { source: this.id });
        this.emit('listening', { source: this.id });
        return;
      }
      if (sc.modelTurn) {
        if (this.suppressStaleAudio) {
          return;
        }
        if (this.activeResponseId === null) {
          this.activeResponseId = this.nextResponseId++;
          this.modelTurnFinished = false;
          this.hasModelTextInTurn = false;
          if (this.lastUserVoiceTime > 0) {
            this.speechEndTime = this.lastUserVoiceTime;
            this.lastUserVoiceTime = 0;
          } else if (this.speechEndTime === 0) {
            this.speechEndTime = performance.now();
          }
        }
        const currentResponseId = this.activeResponseId;
        const parts = sc.modelTurn.parts as Array<Record<string, any>> | undefined;
        if (parts) {
          for (const p of parts) {
            // Interruption fence: if activeResponseId changed or is null, drop late chunks immediately
            if (this.activeResponseId !== currentResponseId || this.activeResponseId === null) {
              break;
            }
            const inline = p.inlineData ?? p.inline_data;
            if (inline?.data && typeof inline.data === 'string') {
              if (!this.responseLive) {
                this.responseLive = true;
                this.emit('response_started', { source: this.id });
              }
              if (!this.playbackLive) {
                this.playbackLive = true;
                this.firstAudioPlayedTime = performance.now();
                this.emit('audio_started', { source: this.id });
                if (this.speechEndTime > 0) {
                  const lat = Math.round(this.firstAudioPlayedTime - this.speechEndTime);
                  if (lat > 0 && lat < 15000) {
                    this.recordLatency(lat);
                  }
                }
              }
              const level = this.audio.playPCM24(inline.data);
              this.emit('audio_chunk', { level, source: this.id });
            }
            if (typeof p.text === 'string' && p.text.trim() && !p.thought) {
              this.hasModelTextInTurn = true;
              this.outBuf += p.text;
              controlLayer.addSophiaTurn(this.outBuf, false);
              this.emit('transcript', { role: 'sophia', text: this.outBuf, final: false, source: this.id });
            }
          }
        }
      }
      const it = sc.inputTranscription?.text;
      if (typeof it === 'string' && it) {
        this.inBuf += it;
        controlLayer.addUserTurn(this.inBuf, false);
        this.emit('transcript', { role: 'user', text: this.inBuf, final: false, source: this.id });
      }
      const ot = sc.outputTranscription?.text;
      if (typeof ot === 'string' && ot && !this.hasModelTextInTurn) {
        this.outBuf += ot;
        controlLayer.addSophiaTurn(this.outBuf, false);
        this.emit('transcript', { role: 'sophia', text: this.outBuf, final: false, source: this.id });
      }
      if (sc.turnComplete || sc.generationComplete) {
        this.suppressStaleAudio = false;
        this.flushTranscripts(true);
        this.modelTurnFinished = true;
        this.emit('response_finished', { source: this.id });
        // Only return to listening if audio has already fully finished playing
        if (!this.audio.isSpeaking && !this.playbackLive) {
          this.responseLive = false;
          this.modelTurnFinished = false;
          this.activeResponseId = null;
          this.emit('playback_finished', { source: this.id });
          this.emit('listening', { source: this.id });
        }
      }
    }

    const toolCall = msg.toolCall;
    if (toolCall?.functionCalls) {
      this.emit('thinking', { source: this.id });
      const calls: FunctionCall[] = toolCall.functionCalls;
      const responses = await Promise.all(
        calls.map(async (c) => {
          if (c.name === 'generate_image') {
            this.emit('rendering' as any, { source: this.id });
          }
          this.emit('tool_started', { tool: c.name, callId: c.id, source: this.id });
          const res = await controlLayer.execute(c);
          this.emit('tool_finished', { tool: c.name, callId: c.id, source: this.id });
          return {
            id: c.id,
            name: c.name,
            response: { result: res },
          };
        }),
      );
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastSendTime = performance.now();
        this.ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
        this.stats.packetsSent++;
      }
    }

    if (msg.goAway) {
      this.emit('error', { code: 'go-away', message: 'Gemini live token expiring, renewing...', source: this.id });
    }
  }

  private flushTranscripts(final: boolean) {
    if (this.inBuf) {
      const userText = this.inBuf;
      controlLayer.addUserTurn(userText, final);
      this.emit('transcript', { role: 'user', text: userText, final, source: this.id });
      if (final) {
        controlLayer.tryDirectCommand(userText);
      }
      this.inBuf = '';
    }
    if (this.outBuf) {
      controlLayer.addSophiaTurn(this.outBuf, final);
      this.emit('transcript', { role: 'sophia', text: this.outBuf, final, source: this.id });
      this.outBuf = '';
    }
  }

  private attachMic() {
    if (this.detachPCM) return;
    this.detachPCM = this.audio.onPCM((pcm) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupDone) return;
      if (this.audio.micLevel > 0.04) {
        this.lastUserVoiceTime = performance.now();
      }
      // Do not stream mic audio during speech playback unless intentional user barge-in is enabled
      if (this.audio.isSpeaking && !controlLayer.asrInterruption) {
        return;
      }
      const b64 = base64Encode(new Uint8Array(pcm));
      this.lastSendTime = performance.now();
      this.ws.send(
        JSON.stringify({
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'audio/pcm;rate=16000',
                data: b64,
              },
            ],
          },
        }),
      );
      this.stats.packetsSent++;
    });
  }

  sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.suppressStaleAudio = false;
    this.activeResponseId = null;
    this.speechEndTime = performance.now();
    controlLayer.addUserTurn(trimmed, true);
    this.emit('transcript', { role: 'user', text: trimmed, final: true, source: this.id });
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupDone) return;
    this.emit('thinking', { source: this.id });
    this.lastSendTime = performance.now();
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ text: trimmed }],
            },
          ],
          turnComplete: true,
        },
      }),
    );
    this.stats.packetsSent++;
  }

  sendPrompt(promptText: string) {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    this.suppressStaleAudio = false;
    this.activeResponseId = null;
    this.speechEndTime = performance.now();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupDone) return;
    this.emit('thinking', { source: this.id });
    this.lastSendTime = performance.now();
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ text: trimmed }],
            },
          ],
          turnComplete: true,
        },
      }),
    );
    this.stats.packetsSent++;
  }

  sendScreenFrame(b64Jpeg: string, mimeType = 'image/jpeg') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupDone) return;
    this.lastSendTime = performance.now();
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          mediaChunks: [
            {
              mimeType,
              data: b64Jpeg,
            },
          ],
        },
      }),
    );
    this.stats.packetsSent++;
  }

  interrupt() {
    this.suppressStaleAudio = true;
    this.activeResponseId = null;
    this.modelTurnFinished = false;
    this.playbackLive = false;
    this.responseLive = false;
    this.hasModelTextInTurn = false;
    this.audio.interruptPlayback();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      this.stats.packetsSent++;
    }
  }

  private handleClosed(code?: number) {
    screenVisionBridge.registerFrameCallback(null);
    const wasActive = this.active;
    this.active = false;
    this.setupDone = false;
    this.suppressStaleAudio = false;
    this.activeResponseId = null;
    this.modelTurnFinished = false;
    this.playbackLive = false;
    this.responseLive = false;
    this.detachPlayEnd?.();
    this.detachPlayEnd = null;
    this.detachPCM?.();
    this.detachPCM = null;
    this.ws = null;
    this.emit('error', { code: 'transport-closed', message: 'Live WebSocket link closed', source: this.id });

    if (wasActive && code !== 1000) {
      console.info('[GeminiLiveProvider] Session dropped unexpectedly. Auto-reconnecting in 1s…');
      setTimeout(() => {
        void this.start().catch((err) => {
          console.warn('[GeminiLiveProvider] Auto-reconnect attempt failed:', err);
        });
      }, 1200);
    }
  }

  async stop(): Promise<void> {
    screenVisionBridge.registerFrameCallback(null);
    this.active = false;
    this.setupDone = false;
    this.suppressStaleAudio = false;
    this.activeResponseId = null;
    this.modelTurnFinished = false;
    this.playbackLive = false;
    this.responseLive = false;
    this.hasModelTextInTurn = false;
    this.detachPlayEnd?.();
    this.detachPlayEnd = null;
    const ws = this.ws;
    this.ws = null;
    this.detachPCM?.();
    this.detachPCM = null;
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* noop */
      }
    }
  }

  async reset(): Promise<void> {
    await this.stop();
    await this.start();
  }
}
