/**
 * ============================================================================
 * VOICE RUNTIME (PHASE 3 — SofiaUI voice integration)
 * ============================================================================
 * The clearly-defined interface between the SofiaUI-derived voice presence
 * (src/os/components/voice/) and the destination's existing voice stack.
 *
 * ARCHITECTURAL BOUNDARY (per the approved migration plan):
 *   SofiaUI provides the voice interaction EXPERIENCE. SamJuniorsOS stays
 *   authoritative for reasoning, conversations, memory, tools, permissions,
 *   approvals, workflows and execution. This runtime therefore owns ONLY:
 *     - spoken-output rendering (TTS playback + metering),
 *     - voice-presence lifecycle (attach/detach with the widget),
 *     - transport-loss reconnection,
 *     - device-change and capture-failure handling,
 *     - interruption coordination (stop playback + existing server seam).
 *   It NEVER talks to a model, a provider key, a memory store or a tool. The
 *   canonical path is untouched: WS :3001 → DeepgramFlux STT →
 *   executeSophiaTurn (conversation store, turn IDs, idempotency, founder
 *   identity) → SOPHIA_RESPONSE → this runtime speaks the reply.
 *
 * PROVIDERS (reuse, no duplicates):
 *   - STT: the existing live-voice path (DeepgramFluxProvider) — unchanged.
 *   - TTS: the existing founder-gated POST /api/sofia/tts ladder
 *     (ElevenLabs → local server → z-ai neural, cached, keyless default).
 *     Per-sentence failures fall back to the browser's speechSynthesis for
 *     that sentence — the route's own designed failure mode. Secrets stay on
 *     the server; no provider key ever reaches the browser.
 *
 * SPEAKING OVERLAY (client-owned, deliberately):
 *   The live server's SPEAKING state is never entered (it emits a trailing
 *   IDLE after SOPHIA_RESPONSE). The runtime therefore drives the store's
 *   'speaking' status itself: the osStore reply setter sets it on response,
 *   a speaking GATE in the bridge holds off the server's trailing IDLE while
 *   audio plays, and the engine's 350ms-drained signal settles it back to
 *   'idle' (which the Phase 2 orb mapping turns into response_finished →
 *   completed → ambient). Stopping playback never cancels finished server
 *   work — "stop playback" ≠ "cancel server work" by design; cancelling
 *   in-flight work is the server's INTERRUPT handling (Phase 3).
 *
 * LIFECYCLE CONTRACT:
 *   attach()  — idempotent; called on voice-presence mount. Subscribes to
 *               bridge events, store changes and device changes; arms the
 *               speaking gate. Can be attached while a session is mid-turn.
 *   detach()  — full, explicit cleanup; called on unmount. Stops playback,
 *               aborts in-flight TTS fetches, removes every listener, clears
 *               timers, destroys the playback engine. The bridge/session
 *               themselves survive (they are OS-owned chrome, shared with
 *               the transcript ribbon).
 *   interrupt() — stop spoken output immediately AND route the existing
 *               bridge interrupt seam (server-side turn cancellation).
 *   Barge-in    — starting a PTT hold while a reply is still being spoken
 *               cuts the playback (status 'listening' is a cut trigger in
 *               the store watcher) WITHOUT sending INTERRUPT: the spoken
 *               turn already completed and persisted server-side, so a
 *               barge-in is a playback cut, not a canonical cancellation
 *               (that stays interrupt()'s exclusive job — no second
 *               interruption path exists).
 *
 * Adapted from SofiaUI @ 9e88dee (one-way reference port):
 *   - src/sophia/SophiaOS.ts — lifecycle/cleanup sequencing, 1200ms
 *     reconnect base delay, fixed-0.5 level for non-streaming speech.
 *   - src/sophia/audio/AudioEngine.ts:248 — main-thread mic-level EMA.
 *   - src/core/AudioOutput.ts — engine semantics (see voicePlayback.ts).
 */

import { liveBridge, type LiveBridgeEvent } from './liveCompanionBridge';
import { os, getOS, subscribeOS } from './osStore';
import { VoicePlaybackEngine } from './voicePlayback';

/** Real-time amplitude for the orb (0..1 each). */
export interface VoiceRuntimeLevels {
  mic: number;
  play: number;
}

/** SofiaUI reconnect cadence (GeminiLiveProvider): 1200ms base, exponential. */
const RECONNECT_BASE_DELAY_MS = 1200;
const MAX_RECONNECT_ATTEMPTS = 3;
/** Per-sentence TTS fetch timeout (provider errors must not wedge a reply). */
const TTS_FETCH_TIMEOUT_MS = 15_000;
/** Duplicate-event guard capacity for spoken turns. */
const SPOKEN_TURNS_RETAINED = 64;

/** Split a reply into speakable sentences (SofiaUI speaks sentence-at-a-time
 *  so the first audio starts before the whole reply is synthesized). */
function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const parts = normalized.match(/[^.!?…\n]*[.!?…\n]+|[^.!?…\n]+$/g) ?? [normalized];
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

class VoiceRuntime {
  private attachCount = 0;
  private engine: VoicePlaybackEngine | null = null;
  private unsubBridge: (() => void) | null = null;
  private unsubStore: (() => void) | null = null;
  private removeDeviceChangeListener: (() => void) | null = null;

  /** SofiaUI AudioEngine main-thread mic smoothing: EMA with ×5.5 gain. */
  private micEma = 0;
  /** Fixed level while the system-voice fallback speaks (SofiaUI's
   *  non-streaming providers emit a constant 0.5). */
  private playLevelOverride: number | null = null;

  private speaking = false;
  private speakAbort: AbortController | null = null;
  private speakPending = 0;
  private spokenTurnIds: Set<string> = new Set();

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  /* ------------------------------------------------------------- lifecycle */

  /** Idempotent; called on voice-presence mount. Browser-only. */
  public attach(): void {
    if (typeof window === 'undefined') return;
    this.attachCount++;
    if (this.attachCount > 1) return;

    this.engine = new VoicePlaybackEngine({
      onDrained: () => this.handleDrained(),
    });

    this.unsubBridge = liveBridge.subscribe((e) => this.onBridgeEvent(e));
    this.unsubStore = subscribeOS(() => this.onStoreChange());

    if (navigator.mediaDevices?.addEventListener) {
      const onChange = () => void this.handleDeviceChange();
      navigator.mediaDevices.addEventListener('devicechange', onChange);
      this.removeDeviceChangeListener = () =>
        navigator.mediaDevices?.removeEventListener('devicechange', onChange);
    }
  }

  /** Full explicit cleanup; idempotent; safe when never attached. */
  public detach(): void {
    if (this.attachCount === 0) return;
    this.attachCount = Math.max(0, this.attachCount - 1);
    if (this.attachCount > 0) return;

    this.stopSpeaking();
    this.unsubBridge?.();
    this.unsubBridge = null;
    this.unsubStore?.();
    this.unsubStore = null;
    this.removeDeviceChangeListener?.();
    this.removeDeviceChangeListener = null;
    this.clearReconnect();
    this.engine?.destroy();
    this.engine = null;
    this.micEma = 0;
    this.playLevelOverride = null;
    liveBridge.setSpeakingGate(null);
    // Phase 5 (parity area 13): the client-owned speaking overlay must not
    // outlive the runtime. If we were mid-speech on unmount, the store's
    // 'speaking' status would be stuck — nobody else owns settling it (the
    // server never enters SPEAKING; the drain callback dies with the
    // engine). Settle it honestly: idle when the session survives, otherwise
    // disconnected.
    if (getOS().liveVoice.status === 'speaking') {
      os.setLiveVoice({ status: getOS().liveVoice.enabled ? 'idle' : 'disconnected' });
    }
  }

  /* ---------------------------------------------------------------- levels */

  /** Real capture + playback amplitude for the orb's frame loop. When no
   *  hardware level is available the values are 0 — the Phase 2 ported
   *  VisualDirector substitutes its designed procedural envelopes then. */
  public getLevels(): VoiceRuntimeLevels {
    const play = this.playLevelOverride ?? this.engine?.getPlaybackLevel() ?? 0;
    return { mic: this.micEma, play };
  }

  public isSpeaking(): boolean {
    return this.speaking;
  }

  /* ---------------------------------------------------------- interactions */

  /**
   * Interrupt the current interaction, context-aware:
   *   - always cuts spoken output immediately (stopImmediately semantics),
   *   - and routes the EXISTING bridge interrupt seam — the server now
   *     aborts an in-flight canonical turn (Phase 3) and the client gets the
   *     interrupted visual feedback via the transport status, exactly like
   *     the pre-runtime surfaces.
   */
  public interrupt(): void {
    this.stopSpeaking();
    liveBridge.interrupt();
  }

  /* ------------------------------------------------------------ internals */

  private onBridgeEvent(e: LiveBridgeEvent): void {
    if (e.type === 'response' && e.reply) {
      void this.speak(e.turnId, e.reply);
    } else if (e.type === 'mic-level') {
      // SofiaUI AudioEngine.ts:248 — main-thread EMA with ×5.5 gain.
      this.micEma = this.micEma * 0.72 + Math.min(1, e.rms * 5.5) * 0.28;
    } else if (e.type === 'disconnect') {
      // Explicit transport-loss handling: cut playback; reconnect unless the
      // close was intentional (1000) or this socket was superseded by
      // another surface of the same founder (4409 — reconnecting would fight
      // the live surface).
      this.stopSpeaking();
      if (e.code !== 1000 && e.code !== 4409) {
        this.scheduleReconnect();
      }
    } else if (e.type === 'client-error') {
      if (e.error.fatal && liveBridge.getClient()) {
        // Mid-session fatal capture failure (device unplugged / permission
        // revoked): explicit teardown — stop playback, close the session
        // cleanly, then surface the honest error (the Phase 2 permission
        // modal owns the recovery loop). Connect-time failures are owned by
        // the bridge's existing path — the client is not registered yet.
        this.stopSpeaking();
        void liveBridge.toggleVoice(false).then(() => {
          os.setLiveVoice({ error: e.error.message });
        });
      }
    }
  }

  private onStoreChange(): void {
    const live = getOS().liveVoice;
    // Any surface turning voice off, interrupting, starting a PTT hold
    // (barge-in — the founder speaks over Sophia; the orb already enters
    // its barge-in choreography on this same 'listening' transition), or
    // losing the transport also cuts our playback — there is exactly one
    // voice, not one per UI. This is a PLAYBACK cut only: the turn that was
    // being spoken has already completed and persisted server-side, so no
    // INTERRUPT is sent here — cancelling in-flight server work remains
    // the exclusive job of interrupt() (the existing seam).
    if (
      !live.enabled ||
      live.status === 'interrupted' ||
      live.status === 'disconnected' ||
      live.status === 'listening'
    ) {
      this.stopSpeaking();
      // Phase 5 (P5-D3): the reconnect timer must NOT be cancelled by the
      // transient 'disconnected' status itself. The disconnect event arms
      // the reconnect, and the honest disconnect-error write that follows
      // lands while the status is still 'disconnected' — treating that as
      // a cancel trigger killed the armed reconnect and silently dropped
      // session recovery. Only intentional stop signals cancel it: voice
      // turned off, or a barge-in interrupt.
      if (!live.enabled || live.status === 'interrupted') {
        this.clearReconnect();
      }
    }
  }

  /* -------------------------------------------------------------- speaking */

  private async speak(turnId: string, reply: string): Promise<void> {
    if (typeof window === 'undefined' || !this.engine) return;

    // Duplicate-event guard: exactly one utterance per canonical turn.
    if (this.spokenTurnIds.has(turnId)) return;
    if (this.spokenTurnIds.size >= SPOKEN_TURNS_RETAINED) {
      const oldest = this.spokenTurnIds.values().next().value;
      if (typeof oldest === 'string') this.spokenTurnIds.delete(oldest);
    }
    this.spokenTurnIds.add(turnId);

    // Never overlap utterances — a new reply cuts the previous one.
    this.stopSpeaking();

    const invocation = new AbortController();
    this.speakAbort = invocation;
    const signal = invocation.signal;
    this.speaking = true;
    liveBridge.setSpeakingGate(() => this.speaking);

    const sentences = splitSentences(reply);
    this.speakPending = sentences.length;
    let scheduledAny = false;
    let totalFailure = sentences.length > 0;

    try {
      for (const sentence of sentences) {
        if (signal.aborted) return;
        const audio = await this.fetchSentenceAudio(sentence, signal);
        if (signal.aborted) return;

        let handled = false;
        if (audio !== null) {
          const scheduled = await this.engine.playEncoded(audio);
          if (signal.aborted) return;
          if (scheduled > 0) {
            scheduledAny = true;
            totalFailure = false;
            handled = true;
          }
        }
        if (!handled) {
          // Provider failure for this sentence (fetch failed, non-OK, decode
          // failed): the route's designed fallback is the browser's own
          // voice for that sentence.
          const spoke = await this.speakSystemFallback(sentence, signal);
          if (signal.aborted) return;
          if (spoke) {
            scheduledAny = true;
            totalFailure = false;
          }
        }
        this.speakPending--;
      }
    } finally {
      // Re-audit F3: only the invocation that still OWNS the runtime may
      // touch its counters. An aborted speak's finally runs AFTER a newer
      // speak (or the cut itself) already reset/owns the state — zeroing
      // speakPending here would clobber the newer speak's pending count
      // and let a drain during its next fetch gap settle the overlay
      // early (stopSpeaking() owns the reset at cut time).
      if (this.speakAbort === invocation) {
        this.speakPending = 0;
        if (!signal.aborted && this.speaking) {
          if (!scheduledAny) {
            // Nothing audible happened (provider completely unavailable):
            // settle the overlay honestly — the reply remains visible as text.
            this.settleSpeaking(totalFailure);
          } else if (!this.engine.hasActiveAudio()) {
            // Everything scheduled has already drained while later sentences
            // were still being fetched (edge race: the 350ms drain fired with
            // speakPending > 0 and no further source ever arrived) — settle now.
            this.settleSpeaking(false);
          }
          // else: the engine's drain (handleDrained) owns the settle.
        }
      }
    }
  }

  /** Founder-gated TTS ladder fetch with timeout + cancellation. Null on any
   *  failure — the caller falls back per-sentence. */
  private async fetchSentenceAudio(text: string, signal: AbortSignal): Promise<ArrayBuffer | null> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), TTS_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch('/api/sofia/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
        credentials: 'same-origin',
      });
      if (!res.ok) return null;
      return await res.arrayBuffer();
    } catch {
      return null; // aborted, timed out, or network failure
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
    }
  }

  /** Browser speechSynthesis fallback for one sentence (the /api/sofia/tts
   *  route's designed degradation). Resolves when the utterance ends. */
  private speakSystemFallback(text: string, signal: AbortSignal): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve(false);
        return;
      }
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        this.playLevelOverride = null;
        resolve(ok);
      };
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => finish(true);
      utterance.onerror = () => finish(false);
      const onAbort = () => {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
        finish(false);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        // SofiaUI's non-streaming providers emit a fixed 0.5 level — mirror.
        this.playLevelOverride = 0.5;
        window.speechSynthesis.speak(utterance);
      } catch {
        signal.removeEventListener('abort', onAbort);
        finish(false);
      }
    });
  }

  /** Playback settled (350ms quiet after the last scheduled source) — the
   *  client-owned speaking overlay ends here. The Phase 2 orb mapping turns
   *  the speaking→idle store transition into response_finished. */
  private handleDrained(): void {
    if (!this.speaking) return;
    if (this.speakPending > 0) return; // more sentences are still arriving
    this.settleSpeaking(false);
  }

  /** Common settle for the client-owned speaking overlay. */
  private settleSpeaking(withError: boolean): void {
    if (!this.speaking) return;
    this.speaking = false;
    liveBridge.setSpeakingGate(null);
    this.playLevelOverride = null;
    // Re-audit F4: settle only the status this overlay owns. A newer
    // interaction state that already replaced 'speaking' (e.g. a PTT hold
    // that started during the final drain window) must not be stomped back
    // to 'idle' by this older settlement — the newer state owns the store
    // until its own flow transitions it.
    if (getOS().liveVoice.status === 'speaking') {
      os.setLiveVoice({
        status: 'idle',
        ...(withError ? { error: 'Voice playback unavailable — reply shown as text' } : {}),
      });
      if (getOS().sophia !== 'attentive') os.setSophia('idle');
    }
  }

  /** Stop spoken output immediately. Always safe to call. Store status is NOT
   *  forced here — the interrupt path (bridge) or the store watcher owns the
   *  status transitions that follow a cut. */
  private stopSpeaking(): void {
    this.speakAbort?.abort();
    this.speakAbort = null;
    this.speakPending = 0;
    this.playLevelOverride = null;
    if (this.speaking) {
      this.speaking = false;
      liveBridge.setSpeakingGate(null);
    }
    this.engine?.stopImmediately();
  }

  /* ------------------------------------------------------------ reconnect */

  /** SofiaUI cadence: 1200ms base, ×2 backoff, capped attempts. */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (!getOS().liveVoice.enabled) return; // voice was turned off — stop
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      os.setLiveVoice({ status: 'error', error: 'Live session lost — could not reconnect' });
      return;
    }
    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      void liveBridge.reconnect().then((ok) => {
        if (ok) {
          this.reconnectAttempts = 0;
        } else {
          this.scheduleReconnect();
        }
      });
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  /* -------------------------------------------------------- device changes */

  /** Hot-swap backstop: if the active capture device vanished without the
   *  track ending (track.onended in the live client is the primary signal),
   *  treat it as the same fatal capture failure. */
  private async handleDeviceChange(): Promise<void> {
    const client = liveBridge.getClient();
    if (!client || !client.isCapturing()) return;
    const activeId = client.getActiveMicDeviceId();
    if (!activeId) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const stillThere = devices.some(
        (d) => d.kind === 'audioinput' && d.deviceId === activeId
      );
      if (!stillThere) {
        this.stopSpeaking();
        await liveBridge.toggleVoice(false);
        os.setLiveVoice({ error: 'Microphone device disconnected' });
      }
    } catch {
      // enumeration unavailable — track.onended remains the backstop
    }
  }
}

export const voiceRuntime = new VoiceRuntime();
