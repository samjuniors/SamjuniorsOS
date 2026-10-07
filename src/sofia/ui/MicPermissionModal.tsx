/**
 * MicPermissionModal — Polite Microphone Unblock Guidance & Text-Voice Fallback.
 *
 * Appears when microphone access is blocked in browser settings.
 * Explains how to unblock in address bar, offers 1-click Reload,
 * and provides instant "Text & AI Voice Mode" so the user can chat and hear Sophia immediately.
 */

import { Mic, MessageSquare, X, ShieldAlert, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { SophiaOS } from '../sophia/SophiaOS';

export function MicPermissionModal({
  os,
  onClose,
  onOpenChat,
}: {
  os: SophiaOS;
  onClose: () => void;
  onOpenChat: () => void;
}) {
  const [requesting, setRequesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRequestAccess = async () => {
    setRequesting(true);
    setErrorMsg(null);
    try {
      await os.audio.startCapture();
      os.pushLog('event', 'Microphone permission granted successfully.');
      onClose();
    } catch (err: any) {
      console.warn('[MicPermissionModal] Permission request result:', err);
      setErrorMsg('Microphone remains blocked in your browser settings. To unblock: click the lock/camera icon next to the URL in your browser address bar above and select "Allow".');
    } finally {
      setRequesting(false);
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  const handleStartTextVoice = () => {
    onClose();
    onOpenChat();
    void os.speakText("G'day! Text and AI voice mode is ready. Type anything here and I will answer aloud.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl border border-sky-400/30 bg-[#060a14] p-5 shadow-[0_0_45px_rgba(56,189,248,0.25)] text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300">
              <ShieldAlert size={18} />
            </div>
            <div>
              <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-white/95">
                Microphone Access Blocked
              </h2>
              <p className="text-[9px] text-sky-200/60 font-mono">Browser Settings Permission</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="mt-4 space-y-3.5">
          <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-3">
            <p className="text-[11px] leading-relaxed text-sky-100 font-medium">
              💡 Good news: You can still have a full voice conversation!
            </p>
            <p className="mt-1 text-[10px] text-sky-200/80 leading-normal">
              Type your questions in Chat, and Sophia will answer aloud using Gemini Neural Speech.
            </p>
          </div>

          {/* How to Unblock Guide */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 text-[10px] text-white/70 space-y-2">
            <p className="text-sky-300 font-semibold uppercase text-[9px] tracking-wider">
              How to Unblock Microphone in Browser:
            </p>
            <div className="space-y-1.5 font-mono text-[9.5px]">
              <div className="flex items-start gap-2">
                <span className="rounded bg-sky-400/20 px-1.5 py-0.5 text-sky-300 font-bold">1</span>
                <span>Click the 🔒 <strong>Lock or Shield icon</strong> at the left of the address bar at the top of your browser screen.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="rounded bg-sky-400/20 px-1.5 py-0.5 text-sky-300 font-bold">2</span>
                <span>Find <strong>Microphone</strong> and change it to <strong className="text-emerald-300">"Allow"</strong>.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="rounded bg-sky-400/20 px-1.5 py-0.5 text-sky-300 font-bold">3</span>
                <span>Click <strong>Reload Page</strong> or <strong>Retry Microphone</strong> below.</span>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[9.5px] text-amber-200 leading-normal font-mono">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 space-y-2">
          {/* Primary Action: Start Text & AI Voice Mode */}
          <button
            type="button"
            onClick={handleStartTextVoice}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/20 py-2.5 text-[11px] font-semibold tracking-wider text-emerald-100 hover:bg-emerald-500/30 shadow-[0_0_20px_rgba(52,211,153,0.25)] transition-all"
          >
            <MessageSquare size={16} className="text-emerald-300" />
            Start Text & AI Voice Mode (No Mic Needed)
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleRequestAccess}
              disabled={requesting}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-500/15 py-2 text-[10px] font-medium text-sky-200 hover:bg-sky-500/25 transition-all disabled:opacity-50"
            >
              <Mic size={14} className={requesting ? 'animate-bounce' : ''} />
              {requesting ? 'Checking…' : 'Retry Microphone'}
            </button>

            <button
              type="button"
              onClick={handleReload}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2 text-[10px] font-medium text-white/80 hover:bg-white/10 transition-all"
            >
              <RefreshCw size={14} />
              Reload Page
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
