'use client';

/**
 * ui/VisionGlow.tsx — Phase 10: eyes you can see.
 *
 * When Screen Vision is live, paints a thin glowing outline at the screen
 * edges so it is always obvious Sofia can see the display — plus a small
 * top-center status strip: Vision on/off (tap to toggle — a real click,
 * which is exactly what the browser needs to allow screen share) with the
 * live frame size, and the companion PC-link state.
 */

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Monitor, MonitorOff } from 'lucide-react';
import { screenVisionBridge } from '../sophia/vision/ScreenVisionBridge';
import { companion, type CompanionStatus } from '../lib/companion-client';

export function VisionGlow() {
  const [vision, setVision] = useState(screenVisionBridge.active);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const [link, setLink] = useState<CompanionStatus>(companion.status);

  useEffect(() => {
    const onState = (e: Event) => {
      const active = Boolean((e as CustomEvent).detail?.active);
      setVision(active);
      if (!active) setFrame(null);
    };
    const onFrame = (e: Event) => {
      const d = (e as CustomEvent).detail as { width?: number; height?: number } | undefined;
      if (d?.width && d?.height) setFrame({ width: d.width, height: d.height });
    };
    const onLink = (e: Event) => {
      setLink(((e as CustomEvent).detail?.status ?? 'disconnected') as CompanionStatus);
    };
    screenVisionBridge.addEventListener('vision:state', onState);
    screenVisionBridge.addEventListener('vision:frame', onFrame);
    companion.addEventListener('status', onLink);
    return () => {
      screenVisionBridge.removeEventListener('vision:state', onState);
      screenVisionBridge.removeEventListener('vision:frame', onFrame);
      companion.removeEventListener('status', onLink);
    };
  }, []);

  const linked = link === 'connected';

  return (
    <>
      {vision && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[6]"
          style={{
            boxShadow:
              'inset 0 0 0 2px rgba(52,211,153,0.55), inset 0 0 42px rgba(52,211,153,0.16)',
          }}
        />
      )}

      <div className="fixed left-1/2 top-[26px] z-10 flex -translate-x-1/2 items-center gap-2 sm:top-[30px]">
        <button
          type="button"
          aria-pressed={vision}
          aria-label={vision ? 'Screen Vision live — click to stop sharing' : 'Turn on Screen Vision'}
          title={
            vision
              ? 'Sofia sees your screen right now (click to stop)'
              : 'Share your screen so Sofia can see it (browser needs this click)'
          }
          onClick={() => void screenVisionBridge.toggleCapture()}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium tracking-wide transition-all duration-200 ${
            vision
              ? 'border-emerald-400/50 bg-emerald-950/50 text-emerald-200 shadow-[0_0_14px_rgba(52,211,153,0.35)]'
              : 'border-white/[0.08] bg-white/[0.02] text-white/50 hover:border-white/20 hover:text-white/80'
          }`}
        >
          {vision ? <Eye size={13} strokeWidth={2} /> : <EyeOff size={13} strokeWidth={1.5} />}
          {vision ? (
            <span className="flex items-center gap-1.5">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-300" />
              </span>
              VISION LIVE{frame ? ` · ${frame.width}×${frame.height}` : ''}
            </span>
          ) : (
            'Vision off'
          )}
        </button>

        <span
          role="status"
          title={linked ? 'Companion daemon linked — Sofia can drive this PC' : 'Companion daemon not linked — PC control unavailable'}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium tracking-wide ${
            linked
              ? 'border-sky-400/40 bg-sky-950/40 text-sky-200'
              : 'border-amber-400/30 bg-amber-950/30 text-amber-200/80'
          }`}
        >
          {linked ? <Monitor size={13} strokeWidth={2} /> : <MonitorOff size={13} strokeWidth={1.5} />}
          {linked ? 'PC linked' : link === 'connecting' ? 'PC linking…' : 'PC unlinked'}
        </span>
      </div>
    </>
  );
}
