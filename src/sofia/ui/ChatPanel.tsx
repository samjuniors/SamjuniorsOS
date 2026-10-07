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
  onSend: (text: string) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>(() => [...controlLayer.history]);
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [targetLang, setTargetLang] = useState('off');
  const [isTranslating, setIsTranslating] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

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

    setText('');
    onSend(finalMessage);
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
                {t.text && <p>{t.text}</p>}

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
