/**
 * ChatPanel — text & live voice-to-type fallback.
 * Includes a small mic button for live speech typing and real-time multi-language translation.
 */

import { Download, ExternalLink, Globe, Image as ImageIcon, Languages, Mic, MicOff, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { controlLayer } from '../sophia/control';
import type { OSStatus } from '../sophia/SophiaOS';
import type { Turn } from '../sophia/types';

const TRANSLATE_LANGUAGES = [
  { code: 'off', name: 'Original Language' },
  { code: 'en', name: 'English 🇬🇧' },
  { code: 'es', name: 'Spanish 🇪🇸' },
  { code: 'fr', name: 'French 🇫🇷' },
  { code: 'de', name: 'German 🇩🇪' },
  { code: 'zh', name: 'Chinese 🇨🇳' },
  { code: 'ja', name: 'Japanese 🇯🇵' },
  { code: 'hi', name: 'Hindi 🇮🇳' },
  { code: 'ar', name: 'Arabic 🇸🇦' },
  { code: 'pt', name: 'Portuguese 🇧🇷' },
];

export function ChatPanel({
  status,
  onClose,
  onSend,
}: {
  status: OSStatus;
  onClose: () => void;
  onSend: (text: string) => void | Promise<void>;
}) {
  const [turns, setTurns] = useState<Turn[]>(() => [...controlLayer.history]);
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [targetLang, setTargetLang] = useState('off');
  const [isTranslating, setIsTranslating] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [expandedWhyTurn, setExpandedWhyTurn] = useState<number | null>(null);
  const [isFrozen, setIsFrozen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    fetch('/api/sofia/stop')
      .then((res) => res.json())
      .then((data) => {
        if (data?.status?.isFrozen) {
          setIsFrozen(true);
        }
      })
      .catch(() => {});

    const onStop = () => setIsFrozen(true);
    controlLayer.addEventListener('command:stop_control', onStop);
    return () => controlLayer.removeEventListener('command:stop_control', onStop);
  }, []);

  const handleStopControl = async () => {
    try {
      await fetch('/api/sofia/stop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'panel', reason: 'Founder clicked STOP button on panel' }),
      });
      setIsFrozen(true);
      controlLayer.addSystemNote('Emergency Stop: System is FROZEN in Safe Mode. Resuming requires explicit confirmation.');
    } catch (err) {
      console.error('Stop control failed:', err);
    }
  };

  const handleConfirmResume = async () => {
    try {
      const res = await fetch('/api/sofia/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmed: true, reason: 'Founder confirmed resume via panel button' }),
      });
      if (res.ok) {
        setIsFrozen(false);
        controlLayer.addSystemNote('Safe Mode deactivated. System resumed by Founder confirmation.');
      }
    } catch (err) {
      console.error('Confirm resume failed:', err);
    }
  };

  useEffect(() => {
    const on = () => setTurns([...controlLayer.history]);
    controlLayer.addEventListener('turn', on);
    return () => controlLayer.removeEventListener('turn', on);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  // Helper function to translate text live using server / Gemini endpoint
  const translateText = async (inputText: string, langCode: string): Promise<string> => {
    if (!inputText.trim() || langCode === 'off') return inputText;

    const targetLangName = TRANSLATE_LANGUAGES.find((l) => l.code === langCode)?.name || langCode;

    try {
      const res = await fetch('/api/sophia/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lastUser: `Translate the following text or message into ${targetLangName}. Return ONLY the exact direct translation without explanations or quotation marks: "${inputText}"`,
          history: [],
          brainMode: 'gemini',
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        if (data.text) {
          return data.text.trim();
        }
      }
    } catch {
      /* fallback to raw text if translation fails */
    }
    return inputText;
  };

  // Initialize SpeechRecognition if available
  const startVoiceInput = () => {
    if (isListening) {
      stopVoiceInput();
      return;
    }

    const windowObj = window as unknown as {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    const SpeechRecognitionClass = windowObj.SpeechRecognition || windowObj.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      alert('Live speech-to-text is supported in Chrome, Edge, Safari, and Opera.');
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = targetLang !== 'off' ? targetLang : navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = async (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          currentTranscript += transcript;
        }

        if (currentTranscript) {
          if (targetLang !== 'off') {
            setIsTranslating(true);
            const translated = await translateText(currentTranscript, targetLang);
            setText(translated);
            setIsTranslating(false);
          } else {
            setText(currentTranscript);
          }
        }
      };

      recognition.onerror = (e: any) => {
        console.warn('[ChatPanel] Speech recognition error:', e);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('[ChatPanel] Failed to start speech recognition:', err);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;

    if (isListening) stopVoiceInput();

    let finalMessage = v;
    if (targetLang !== 'off') {
      setIsTranslating(true);
      finalMessage = await translateText(v, targetLang);
      setIsTranslating(false);
    }

    setSendError(null);
    try {
      await onSend(finalMessage);
      setText('');
    } catch (err) {
      setText(v);
      setSendError(err instanceof Error ? err.message : 'Sophia could not complete that turn.');
    }
  };

  return (
    <section
      aria-label="Text fallback"
      className="glass-panel panel-in panel-in-bottom-right fixed bottom-[98px] right-4 left-4 z-30 flex max-h-[calc(100vh-120px)] flex-col overflow-hidden rounded-2xl sm:left-auto sm:right-11 sm:bottom-[108px] sm:w-[350px]"
    >
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <p className="text-[9.5px] font-normal uppercase tracking-[0.24em] text-white/50">
            Text & Voice Chat
          </p>
          <span
            className="block size-[5px] rounded-full"
            style={{
              background: status === 'live' ? '#38bdf8' : '#64748b',
              boxShadow: `0 0 6px 1px ${status === 'live' ? 'rgba(56,189,248,0.7)' : 'rgba(100,116,139,0.3)'}`,
            }}
          />
        </div>

        {/* Live Translation Language Selector */}
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLangMenu((v) => !v)}
            title="Live Translation Target Language"
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[9px] font-mono transition-all ${
              targetLang !== 'off'
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white'
            }`}
          >
            <Globe size={11} className={targetLang !== 'off' ? 'text-emerald-300 animate-spin-slow' : ''} />
            <span>{targetLang !== 'off' ? targetLang.toUpperCase() : 'Live Translate'}</span>
          </button>

          {showLangMenu && (
            <div className="absolute right-7 top-7 z-50 w-44 rounded-xl border border-white/10 bg-[#090d1f] p-1.5 shadow-2xl backdrop-blur-xl">
              <p className="mb-1 px-2 text-[8.5px] font-mono uppercase tracking-wider text-white/40">
                Live Translate Target
              </p>
              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                {TRANSLATE_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      setTargetLang(lang.code);
                      setShowLangMenu(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[10px] font-medium transition ${
                      targetLang === lang.code
                        ? 'bg-sky-500/20 text-sky-200'
                        : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <span>{lang.name}</span>
                    {targetLang === lang.code && <span className="text-[9px] text-sky-400">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* M1.7 Stop Control (Safe Mode Freeze) */}
          <button
            type="button"
            data-testid="stop-control-button"
            onClick={handleStopControl}
            title="Emergency Stop / Safe Mode: Freeze all in-flight turns and scheduled workflows"
            className="flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[9px] font-mono font-semibold text-red-300 hover:bg-red-500/30 transition-all active:scale-95"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span>STOP</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="grid size-6 place-items-center rounded-lg text-white/40 transition hover:bg-white/[0.06] hover:text-white"
          >
            <X size={13} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {sendError && <p role="alert" className="mx-3 mt-2 rounded-lg border border-rose-400/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">{sendError}</p>}

      {/* M1.7 Safe Mode Frozen Banner */}
      {isFrozen && (
        <div
          data-testid="system-frozen-banner"
          className="m-3 mb-0 flex items-center justify-between rounded-xl border border-red-500/50 bg-red-950/60 p-2.5 text-xs text-red-200 shadow-lg"
        >
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-mono font-bold text-xs">⚠ SAFE MODE</span>
            <span className="text-[11px] text-red-300">System is frozen. In-flight turns and workflows are suspended.</span>
          </div>
          <button
            type="button"
            data-testid="confirm-resume-button"
            onClick={handleConfirmResume}
            className="rounded-lg bg-red-500 hover:bg-red-600 px-2.5 py-1 font-semibold text-[10px] font-mono text-white shadow-sm transition active:scale-95"
          >
            Confirm Resume
          </button>
        </div>
      )}

      {/* Live Status Banner */}
      {status === 'live' ? (
        <div className="m-3 mb-0 flex items-center justify-between rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-[9.5px] font-mono tracking-wide text-sky-200 shadow-[inset_0_0_8px_rgba(56,189,248,0.15)]">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
            <span>Gemini Live Stream Active</span>
          </span>
          <span className="text-[8px] font-semibold text-sky-300/60">gemini-3.8-live</span>
        </div>
      ) : (
        <div className="m-3 mb-0 rounded-xl border border-sky-400/20 bg-sky-400/[0.04] px-3 py-2 text-[10px] font-light leading-relaxed tracking-wide text-sky-200/70">
          Connecting to Gemini Live stream… Type or speak your message below.
        </div>
      )}

      {/* Message List */}
      <div ref={listRef} className="chat-scroll max-h-[250px] min-h-[80px] space-y-3 overflow-y-auto p-4">
        {turns.length === 0 && (
          <p className="pt-3 text-center text-[11px] font-light tracking-wide text-white/30">
            No messages yet. Speak or send a query below.
          </p>
        )}
        {turns.slice(-24).map((t, i) =>
          t.role === 'system' ? (
            <p key={`turn-${t.ts}-${i}`} className="text-center font-mono text-[9.5px] font-light text-white/30">
              {t.text}
            </p>
          ) : (
            <div key={`turn-${t.ts}-${i}`} className={t.role === 'user' ? 'text-right' : 'text-left'}>
              <div className={`mb-1 flex items-center gap-1.5 text-[8px] font-normal uppercase tracking-[0.25em] text-white/30 ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <span>{t.role === 'user' ? 'you' : 'sophia'}</span>
                {t.role === 'sophia' && (
                  <>
                    {t.fallback === true || t.liveAi === false ? (
                      <span
                        data-testid="fallback-badge"
                        className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[7.5px] font-medium tracking-wide text-amber-300 normal-case"
                        title="Deterministic fallback reply — live model reasoning was unavailable"
                      >
                        Offline Fallback
                      </span>
                    ) : t.liveAi === true ? (
                      <span
                        data-testid="live-ai-badge"
                        className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[7.5px] font-medium tracking-wide text-cyan-300 normal-case"
                        title="Live model reasoning"
                      >
                        Live AI
                      </span>
                    ) : null}

                    {t.scopes && t.scopes.map((scope) => (
                      <span
                        key={scope}
                        data-testid={`scope-chip-${scope}`}
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[7.5px] font-medium tracking-wide normal-case ${
                          scope === 'personal_mind'
                            ? 'border-purple-400/30 bg-purple-500/15 text-purple-200'
                            : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                        }`}
                        title={`Answer read from ${scope === 'personal_mind' ? 'Personal Mind' : 'Company Brain'}`}
                      >
                        <span className={`size-1 rounded-full ${scope === 'personal_mind' ? 'bg-purple-400' : 'bg-emerald-400'}`} />
                        <span>{scope === 'personal_mind' ? 'Personal Mind' : 'Company Brain'}</span>
                      </span>
                    ))}

                    {t.decisionLog && (
                      <button
                        type="button"
                        data-testid="why-turn-button"
                        onClick={() => setExpandedWhyTurn(expandedWhyTurn === i ? null : i)}
                        className="rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[7.5px] font-medium tracking-wide text-indigo-300 normal-case hover:bg-indigo-500/20"
                        title="Why did Sophia choose this action? View decision log entry"
                      >
                        {expandedWhyTurn === i ? 'Close Why' : 'Why?'}
                      </button>
                    )}
                  </>
                )}
              </div>
              <div
                className={`inline-block max-w-[90%] px-3.5 py-2 text-left text-[12px] font-normal leading-relaxed ${
                  t.role === 'user'
                    ? 'rounded-2xl rounded-tr-sm border border-white/[0.08] bg-white/[0.06] text-white/90'
                    : 'rounded-2xl rounded-tl-sm border border-sky-400/25 bg-sky-400/[0.08] text-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.08)]'
                } ${t.final ? '' : 'opacity-65'}`}
              >
                {t.text && <p>{t.text}</p>}

                {/* Minimal Decision Log Why View (M1.6 / G12.6) */}
                {expandedWhyTurn === i && t.decisionLog && (
                  <div
                    data-testid="why-view"
                    className="mt-2.5 rounded-lg border border-indigo-400/30 bg-indigo-950/60 p-2.5 font-mono text-[9px] text-indigo-100 shadow-inner"
                  >
                    <div className="flex items-center justify-between border-b border-indigo-400/20 pb-1 text-[8.5px] text-indigo-300">
                      <span className="font-semibold uppercase tracking-wider">Decision Log</span>
                      <span data-testid="why-log-id" className="text-white/50">{t.decisionLog.id}</span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      <div><span className="text-white/40">Route: </span><span data-testid="why-route" className="font-semibold text-indigo-200">{t.decisionLog.route}</span></div>
                      <div><span className="text-white/40">Confidence: </span><span data-testid="why-confidence">{Math.round((t.decisionLog.confidence ?? 1) * 100)}%</span></div>
                      <div><span className="text-white/40">Outcome: </span><span data-testid="why-outcome" className="capitalize text-emerald-300">{t.decisionLog.outcome}</span></div>
                      <div><span className="text-white/40">Scopes Read: </span><span data-testid="why-scopes">{(t.decisionLog.scopes || []).join(', ') || 'none'}</span></div>
                      {t.decisionLog.sources && t.decisionLog.sources.length > 0 && (
                        <div><span className="text-white/40">Sources: </span><span data-testid="why-sources">{t.decisionLog.sources.join(', ')}</span></div>
                      )}
                      <div><span className="text-white/40">Reasoning: </span><span data-testid="why-reasoning" className="text-white/80">{t.decisionLog.reasoning}</span></div>
                    </div>
                  </div>
                )}

                {/* Generated Image Card */}
                {t.imageUrl && (
                  <div className="mt-2 overflow-hidden rounded-xl border border-sky-400/30 bg-black/40 shadow-[0_0_15px_rgba(56,189,248,0.15)]">
                    <div className="relative group">
                      <img
                        src={t.imageUrl}
                        alt={t.imagePrompt || 'Generated image'}
                        className="w-full max-h-[220px] object-cover rounded-t-xl transition-transform duration-300 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                      <a
                        href={t.imageUrl}
                        download={`sophia-art-${t.ts}.jpg`}
                        className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg border border-white/20 bg-black/70 px-2 py-1 text-[9px] font-mono text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/90"
                        title="Download Image"
                      >
                        <Download size={11} />
                        <span>Save</span>
                      </a>
                    </div>
                    {t.imagePrompt && (
                      <div className="p-2 px-2.5 flex items-center gap-1.5 text-[8.5px] font-mono text-sky-200/80 border-t border-white/[0.08]">
                        <ImageIcon size={10} className="text-sky-400 shrink-0" />
                        <span className="truncate">{t.imagePrompt}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Web Search Grounding Sources */}
                {t.sources && t.sources.length > 0 && (
                  <div className="mt-2 pt-1.5 border-t border-white/[0.08] space-y-1">
                    <p className="text-[7.5px] uppercase tracking-wider text-sky-300/70 font-mono">Sources</p>
                    <div className="flex flex-wrap gap-1">
                      {t.sources.slice(0, 3).map((s, idx) => (
                        <a
                          key={`src-${idx}`}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-sky-400/20 bg-sky-400/10 px-1.5 py-0.5 text-[8px] text-sky-200 transition hover:border-sky-400/50 hover:bg-sky-400/20"
                        >
                          <span className="max-w-[130px] truncate">{s.title}</span>
                          <ExternalLink size={8} className="shrink-0 text-sky-300/60" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
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
          title={isListening ? 'Stop Listening' : 'Click to Speak (Voice-to-Type)'}
          aria-label={isListening ? 'Stop listening' : 'Start voice-to-type input'}
          className={`relative grid size-8 place-items-center rounded-xl border transition-all ${
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
            placeholder={
              isListening
                ? 'Listening to your voice…'
                : isTranslating
                ? 'Translating live…'
                : 'Message Sophia or tap mic…'
            }
            aria-label="Message Sophia"
            className="h-8 w-full bg-transparent text-[12px] font-light tracking-wide text-white/90 placeholder:text-white/30 focus:outline-none"
          />
          {isTranslating && (
            <span className="absolute right-1 top-2 flex items-center gap-1 font-mono text-[8px] text-emerald-400 animate-pulse">
              <Languages size={10} />
              Translating
            </span>
          )}
        </div>

        <button
          type="submit"
          aria-label="Send message"
          className="grid size-8 place-items-center rounded-xl border border-transparent text-white/40 transition-all hover:border-sky-400/30 hover:bg-sky-400/15 hover:text-sky-200 active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent"
          disabled={!text.trim() && !isListening}
        >
          <Send size={13} strokeWidth={1.75} />
        </button>
      </form>
    </section>
  );
}
