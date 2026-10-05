/**
 * VoicePermissionModal — microphone unblock guidance for the voice presence.
 *
 * Ported/adapted from SofiaUI @ commit 9e88dee: src/ui/MicPermissionModal.tsx.
 * The SofiaUI repository remains independent; one-way reference port.
 *
 * Adaptations for SamJuniorsOS:
 *   - Built on the destination's shadcn/ui Dialog (Radix) instead of SofiaUI's
 *     plain fixed div — this GAINS a focus trap, focus restore and ESC close
 *     that SofiaUI's hand-rolled modal lacks (documented SofiaUI gap).
 *   - "Retry Microphone" performs a permission PROBE (getUserMedia then
 *     immediately stop all tracks). This port deliberately ships NO audio
 *     engine: the probe exists only to surface the browser prompt and read
 *     the result. Sustained capture stays owned by the existing live-voice
 *     client (src/lib/client/live/live-client.ts), so no second audio engine
 *     is introduced.
 *   - SofiaUI's "Start Text & AI Voice Mode" fallback is replaced by closing
 *     the modal: the destination's ChatPanel is already a first-class text
 *     surface on the same tabs; it does not need re-opening from here.
 */

import { useState } from "react";
import { Mic, MessageSquare, ShieldAlert, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type MicProbeResult = "granted" | "denied" | "unsupported";

/**
 * Probe microphone permission WITHOUT starting an audio engine: request a
 * stream, stop every track immediately, report the outcome. Insecure origins
 * and unsupported browsers resolve as "unsupported".
 */
export async function probeMicPermission(): Promise<MicProbeResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return "granted";
  } catch {
    return "denied";
  }
}

export interface VoicePermissionModalProps {
  open: boolean;
  /** Async retry hook; resolves with the probe outcome. */
  onRetry: () => Promise<MicProbeResult>;
  /** Called after a successful retry (typically: start live voice). */
  onGranted: () => void;
  onClose: () => void;
}

export function VoicePermissionModal({ open, onRetry, onGranted, onClose }: VoicePermissionModalProps) {
  const [requesting, setRequesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  const handleRetry = async () => {
    setRequesting(true);
    setErrorMsg(null);
    try {
      const result = await onRetry();
      if (result === "granted") {
        onGranted();
        return; // parent closes
      }
      if (result === "unsupported") {
        setUnsupported(true);
        setErrorMsg(
          "Microphone input is unavailable here (insecure origin or unsupported browser). Voice needs a secure context; the text surfaces keep working."
        );
        return;
      }
      setErrorMsg(
        'Microphone remains blocked in your browser settings. To unblock: click the lock/camera icon next to the URL in your browser address bar above and select "Allow".'
      );
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg border-sky-400/30 bg-[#060a14]/95 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-left text-xs font-semibold uppercase tracking-[0.16em] text-white/95">
            <span className="grid size-8 place-items-center rounded-xl border border-amber-400/40 bg-amber-500/20 text-amber-300">
              <ShieldAlert size={18} />
            </span>
            Microphone Access Blocked
          </DialogTitle>
          <DialogDescription className="text-left font-mono text-[10px] text-sky-200/60">
            Browser Settings Permission
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-3">
            <p className="text-[11px] font-medium leading-relaxed text-sky-100">
              You can keep working without the mic: type to the chat surface and it answers as text.
            </p>
            <p className="mt-1 text-[10px] leading-normal text-sky-200/80">
              Live voice resumes the moment the microphone is unblocked.
            </p>
          </div>

          <div className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-3.5 text-[10px] text-white/70">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-sky-300">
              How to Unblock Microphone in Browser:
            </p>
            <div className="space-y-1.5 font-mono text-[9.5px]">
              <div className="flex items-start gap-2">
                <span className="rounded bg-sky-400/20 px-1.5 py-0.5 font-bold text-sky-300">1</span>
                <span>
                  Click the <strong>Lock or Shield icon</strong> at the left of the address bar at the top of your
                  browser screen.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="rounded bg-sky-400/20 px-1.5 py-0.5 font-bold text-sky-300">2</span>
                <span>
                  Find <strong>Microphone</strong> and change it to <strong className="text-emerald-300">Allow</strong>.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="rounded bg-sky-400/20 px-1.5 py-0.5 font-bold text-sky-300">3</span>
                <span>
                  Click <strong>Reload Page</strong> or <strong>Retry Microphone</strong> below.
                </span>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 font-mono text-[9.5px] leading-normal text-amber-200">
              {errorMsg}
            </div>
          )}
        </div>

        <DialogFooter className="mt-1 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2.5 text-[11px] font-semibold tracking-wider text-white/85 transition-all hover:bg-white/10"
          >
            <MessageSquare size={15} />
            Keep Working Without the Mic
          </button>
          <div className="grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleRetry}
              disabled={requesting || unsupported}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-500/15 py-2 text-[10px] font-medium text-sky-200 transition-all hover:bg-sky-500/25 disabled:opacity-50"
            >
              <Mic size={13} className={requesting ? "animate-bounce" : ""} />
              {requesting ? "Checking…" : "Retry Microphone"}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2 text-[10px] font-medium text-white/80 transition-all hover:bg-white/10"
            >
              <RefreshCw size={13} />
              Reload Page
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
