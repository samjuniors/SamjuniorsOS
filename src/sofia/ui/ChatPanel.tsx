/**
 * ChatPanel — text & live voice-to-type fallback.
 * Ported/adapted from SofiaUI @ commit 9e88dee: src/ui/ChatPanel.tsx
 * The SofiaUI repository remains independent; one-way reference port.
 *
 * Adaptations for the SamJuniorsOS flow:
 *   - Message turns arrive as PROPS (the surface owns the turn list and
 *     streams canonical /api/sofia/ask replies into it); onSend submits to
 *     the surface's canonical text-turn path.
 *   - SofiaUI's live-translation menu is not ported: it calls SofiaUI's own
 *     /api/sophia/chat brain endpoint, which does not exist in this app.
 *   - Voice-to-type (browser SpeechRecognition) is kept verbatim but is
 *     disabled while the live-voice session is enabled — the session owns
 *     the microphone then; PTT (hold Space) is the voice input.
 *   - The status banner reports the destination's live-voice session state
 *     instead of SofiaUI's Gemini Live stream.
 */

import { Mic, MicOff, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SurfaceTurn } from '@/sofia/types';

export function ChatPanel({
  sessionOn,
  liveStatus,
  turns,
  busy,
  onClose,
  onSend,
}: {
  sessionOn: boolean;
  liveStatus: string;
  turns: SurfaceTurn[];
  busy: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  // Initialize SpeechRecognition if available (disabled while the live
  // session is enabled — the live client owns the microphone then).
  const startVoiceInput = () => {
    if (isListening) {
      stopVoiceInput();
      return;
    }
    if (sessionOn) return;

    const windowObj = window as unknown as {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    const SpeechRecognitionClass = windowObj.SpeechRecognition || windowObj.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) return;

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        if (currentTranscript) setText(currentTranscript);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || busy) return;
    if (isListening) stopVoiceInput();
    setText('');
    onSend(v);
  };

  return (
    <section
      aria-label="Text fallback"
      className="glass-panel panel-in panel-in-bottom-right fixed bottom-[98px] right-4 left-4 z-30 flex max-h-[calc(100vh-120px)] flex-col overflow-hidden rounded-2xl sm:left-auto sm:right-11 sm:bottom-[108px] sm:w-[350px]"
    >
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <p className="text-[9.5px] font-normal uppercase tracking-[0.24em] text-white/50">
            Text &amp; Voice Chat
          </p>
          <span
            className="block size-[5px] rounded-full"
            style={{
              background: sessionOn ? '#38bdf8' : '#64748b',
              boxShadow: `0 0 6px 1px ${sessionOn ? 'rgba(56,189,248,0.7)' : 'rgba(100,116,139,0.3)'}`,
            }}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="grid size-6 place-items-center rounded-lg text-white/40 transition hover:bg-white/[0.06] hover:text-white"
        >
          <X size={13} strokeWidth={1.75} />
        </button>
      </header>

      {/* Live Status Banner */}
      {sessionOn ? (
        <div className="m-3 mb-0 flex items-center justify-between rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-[9.5px] font-mono tracking-wide text-sky-200 shadow-[inset_0_0_8px_rgba(56,189,248,0.15)]">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
            <span>Live Voice Session Active · {liveStatus}</span>
          </span>
          <span className="text-[8px] font-semibold text-sky-300/60">hold space to speak</span>
        </div>
      ) : (
        <div className="m-3 mb-0 rounded-xl border border-sky-400/20 bg-sky-400/[0.04] px-3 py-2 text-[10px] font-light leading-relaxed tracking-wide text-sky-200/70">
          Type your message — Sophia answers here. Start live voice (mic below) to hear her speak.
        </div>
      )}

      {/* Message List */}
      <div ref={listRef} className="chat-scroll max-h-[250px] min-h-[80px] space-y-3 overflow-y-auto p-4">
        {turns.length === 0 && (
          <p className="pt-3 text-center text-[11px] font-light tracking-wide text-white/30">
            No messages yet. Speak or send a query below.
          </p>
        )}
        {turns.slice(-24).map((t) =>
          t.role === 'system' ? (
            <p key={t.id} className="text-center font-mono text-[9.5px] font-light text-white/30">
              {t.text}
            </p>
          ) : (
            <div key={t.id} className={t.role === 'user' ? 'text-right' : 'text-left'}>
              <p className="mb-1 text-[8px] font-normal uppercase tracking-[0.25em] text-white/30">
                {t.role === 'user' ? 'you' : 'sophia'}
              </p>
              <div
                className={`inline-block max-w-[90%] px-3.5 py-2 text-left text-[12px] font-normal leading-relaxed ${
                  t.role === 'user'
                    ? 'rounded-2xl rounded-tr-sm border border-white/[0.08] bg-white/[0.06] text-white/90'
                    : 'rounded-2xl rounded-tl-sm border border-sky-400/25 bg-sky-400/[0.08] text-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.08)]'
                } ${t.final ? '' : 'opacity-65'}`}
              >
                <p>{t.text}</p>
              </div>
            </div>
          ),
        )}
      </div>

      {/* Voice-to-Type & Message Form */}
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-white/[0.06] bg-black/20 p-2 px-3">
        {/* Small Mic Icon Button for Voice Typing */}
        <button
          type="button"
          onClick={startVoiceInput}
          disabled={sessionOn}
          title={
            sessionOn
              ? 'Live voice session owns the microphone — hold Space to speak'
              : isListening
                ? 'Stop Listening'
                : 'Click to Speak (Voice-to-Type)'
          }
          aria-label={isListening ? 'Stop listening' : 'Start voice-to-type input'}
          className={`relative grid size-8 place-items-center rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
            isListening
              ? 'border-rose-500/60 bg-rose-500/25 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.4)] animate-pulse'
              : 'border-white/10 bg-white/[0.04] text-white/60 hover:border-sky-400/40 hover:bg-sky-400/15 hover:text-sky-200'
          }`}
        >
          {isListening ? <MicOff size={14} className="text-rose-300" /> : <Mic size={14} />}
          {isListening && (
            <span className="absolute -top-1 -right-1 block size-2 rounded-full bg-rose-400 shadow-[0_0_6px_#f43f5e] animate-ping" />
          )}
        </button>

        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={busy ? 'Sophia is answering…' : isListening ? 'Listening to your voice…' : 'Ask or direct Sophia…'}
            aria-label="Message Sophia"
            className="h-8 w-full bg-transparent text-[12px] font-light tracking-wide text-white/90 placeholder:text-white/30 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          aria-label="Send message"
          className="grid size-8 place-items-center rounded-xl border border-transparent text-white/40 transition-all hover:border-sky-400/30 hover:bg-sky-400/15 hover:text-sky-200 active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent"
          disabled={!text.trim() || busy}
        >
          <Send size={13} strokeWidth={1.75} />
        </button>
      </form>
    </section>
  );
}
