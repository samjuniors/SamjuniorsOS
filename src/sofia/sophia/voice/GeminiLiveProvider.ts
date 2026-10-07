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
  private setupDone = false;
  private responseLive = false;
  private outBuf = '';
  private inBuf = '';
  private lastSendTime = 0;
  private latencyHistory: number[] = [24, 28, 22, 26, 25, 29, 23];
  private isLocalLiveWs = false;

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

  private tryConnectLocalLiveWs(voice: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        if (typeof window === 'undefined') {
          resolve(false);
          return;
        }
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/live-ws?voice=${encodeURIComponent(voice || 'Aoede')}`;
        const ws = new WebSocket(wsUrl);
        this.ws = ws;
        let settled = false;

        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            try { ws.close(); } catch { /* already closed */ }
            this.ws = null;
            resolve(false);
          }
        }, 3000);

        ws.onopen = () => {
          this.stats.connectedAt = Date.now();
        };

        ws.onerror = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            try { ws.close(); } catch { /* already closed */ }
            this.ws = null;
            resolve(false);
          }
        };

        ws.onclose = (e) => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            this.ws = null;
            resolve(false);
          } else {
            this.handleClosed(e.code);
          }
        };

        ws.onmessage = (ev) => {
          this.stats.packetsReceived++;
          void this.handleMessage(ev.data, () => {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              this.isLocalLiveWs = true;
              this.setupDone = true;
              this.active = true;
              this.stats.connectedAt = Date.now();
              resolve(true);
            }
          });
        };
      } catch {
        resolve(false);
      }
    });
  }

  async start(): Promise<void> {
    await this.stop();
    this.isLocalLiveWs = false;

    const voice = controlLayer.voiceName || 'Aoede';
    this.stats.voiceName = voice;
    this.stats.modelName = 'gemini-3.8-live';

    // 1. Try local Sofia Live WebSocket first
    const connectedLocally = await this.tryConnectLocalLiveWs(voice);
    if (connectedLocally) {
      return;
    }

    // 2. Fallback to direct Gemini Live ticket session
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
        ticket.token.startsWith('ya29.') ||
        ticket.token.startsWith('AQ.');
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
        if (this.lastSendTime > 0) {
          const lat = Math.round(performance.now() - this.lastSendTime);
          if (lat > 5 && lat < 3000) {
            this.recordLatency(lat);
          }
        }
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

    // Local /api/live-ws protocol support
    if (msg.type === 'ready') {
      this.isLocalLiveWs = true;
      onSetup();
      this.attachMic();
      this.emit('listening', { source: this.id });
      return;
    }
    if (msg.type === 'audio' && msg.audio) {
      if (!this.responseLive) {
        this.responseLive = true;
        this.emit('response_started', { source: this.id });
        this.emit('audio_started', { source: this.id });
      }
      const level = this.audio.playPCM24(msg.audio);
      this.emit('audio_chunk', { level, source: this.id });
      return;
    }
    if (msg.type === 'transcript' && msg.text) {
      this.outBuf += msg.text;
      controlLayer.addSophiaTurn(this.outBuf, false);
      this.emit('transcript', { role: 'sophia', text: this.outBuf, final: false, source: this.id });
      return;
    }
    if (msg.type === 'interrupted') {
      this.audio.interruptPlayback();
      this.responseLive = false;
      this.flushTranscripts(true);
      this.emit('interrupted', { source: this.id });
      this.emit('listening', { source: this.id });
      return;
    }
    if (msg.type === 'turn_complete') {
      this.flushTranscripts(true);
      this.responseLive = false;
      this.emit('response_finished', { source: this.id });
      this.emit('listening', { source: this.id });
      return;
    }
    if (msg.type === 'error') {
      this.emit('error', { code: 'live-ws', message: msg.error || 'Live session error', source: this.id });
      return;
    }
    // Local WS tool_call: server forwards Gemini tool calls to client for execution
    if (msg.type === 'tool_call' && msg.functionCalls) {
      this.emit('thinking', { source: this.id });
      const calls: FunctionCall[] = msg.functionCalls;
      void (async () => {
        const responses = await Promise.all(
          calls.map(async (c: FunctionCall) => {
            // Signal rendering state for image generation
            if (c.name === 'generate_image') {
              this.emit('rendering' as any, { source: this.id });
            }
            const result = await controlLayer.execute(c);
            return { id: c.id, name: c.name, response: { result } };
          }),
        );
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: 'tool_response',
              functionResponses: responses,
            }),
          );
          this.stats.packetsSent++;
        }
      })();
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
        this.audio.interruptPlayback();
        this.responseLive = false;
        this.flushTranscripts(true);
        this.emit('interrupted', { source: this.id });
        this.emit('listening', { source: this.id });
        return;
      }
      const parts = sc.modelTurn?.parts as Array<Record<string, any>> | undefined;
      if (parts) {
        for (const p of parts) {
          const inline = p.inlineData ?? p.inline_data;
          if (inline?.data && typeof inline.data === 'string') {
            if (!this.responseLive) {
              this.responseLive = true;
              this.emit('response_started', { source: this.id });
              this.emit('audio_started', { source: this.id });
            }
            const level = this.audio.playPCM24(inline.data);
            this.emit('audio_chunk', { level, source: this.id });
          }
          if (typeof p.text === 'string' && p.text.trim() && !p.thought) {
            this.outBuf += p.text;
            controlLayer.addSophiaTurn(this.outBuf, false);
            this.emit('transcript', { role: 'sophia', text: this.outBuf, final: false, source: this.id });
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
      if (typeof ot === 'string' && ot) {
        this.outBuf += ot;
        controlLayer.addSophiaTurn(this.outBuf, false);
        this.emit('transcript', { role: 'sophia', text: this.outBuf, final: false, source: this.id });
      }
      if (sc.turnComplete || sc.generationComplete) {
        this.flushTranscripts(true);
        this.responseLive = false;
        this.emit('response_finished', { source: this.id });
        this.emit('listening', { source: this.id });
      }
    }

    const toolCall = msg.toolCall;
    if (toolCall?.functionCalls) {
      this.emit('thinking', { source: this.id });
      const calls: FunctionCall[] = toolCall.functionCalls;
      const responses = await Promise.all(
        calls.map(async (c) => ({
          id: c.id,
          name: c.name,
          response: { result: await controlLayer.execute(c) },
        })),
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
      // Do not stream mic audio during speech playback unless intentional user barge-in is enabled
      if (this.audio.isSpeaking && !controlLayer.asrInterruption) {
        return;
      }
      const b64 = base64Encode(new Uint8Array(pcm));
      this.lastSendTime = performance.now();
      if (this.isLocalLiveWs) {
        this.ws.send(JSON.stringify({ type: 'audio', audio: b64 }));
      } else {
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
      }
      this.stats.packetsSent++;
    });
  }

  sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    controlLayer.addUserTurn(trimmed, true);
    this.emit('transcript', { role: 'user', text: trimmed, final: true, source: this.id });
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupDone) return;
    this.emit('thinking', { source: this.id });
    this.lastSendTime = performance.now();
    if (this.isLocalLiveWs) {
      this.ws.send(JSON.stringify({ type: 'text', text: trimmed }));
    } else {
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
    }
    this.stats.packetsSent++;
  }

  sendPrompt(promptText: string) {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupDone) return;
    this.emit('thinking', { source: this.id });
    this.lastSendTime = performance.now();
    if (this.isLocalLiveWs) {
      this.ws.send(JSON.stringify({ type: 'text', text: trimmed }));
    } else {
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
    }
    this.stats.packetsSent++;
  }

  sendScreenFrame(b64Jpeg: string, mimeType = 'image/jpeg') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupDone) return;
    this.lastSendTime = performance.now();
    if (this.isLocalLiveWs) {
      this.ws.send(JSON.stringify({ type: 'video', video: b64Jpeg, mimeType }));
    } else {
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
    }
    this.stats.packetsSent++;
  }

  interrupt() {
    this.audio.interruptPlayback();
    this.responseLive = false;
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (this.isLocalLiveWs) {
        this.ws.send(JSON.stringify({ type: 'interrupt' }));
      } else {
        this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      }
      this.stats.packetsSent++;
    }
  }

  private handleClosed(code?: number) {
    screenVisionBridge.registerFrameCallback(null);
    const wasActive = this.active;
    this.active = false;
    this.setupDone = false;
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
