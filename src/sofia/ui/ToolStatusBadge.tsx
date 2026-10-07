/**
 * ui/ToolStatusBadge.tsx
 *
 * Minimal, voice-first tool lifecycle indicator.
 * Mounts invisibly; shows a subtle pill when a tool is running or errors out.
 * Auto-dismisses after TOOL_RESULT or TOOL_ERROR. Never clutters the interface.
 */

import { useEffect, useState } from 'react';
import { controlLayer } from '../sophia/control';
import type { ToolLifecyclePayload } from '../tools/types';

interface BadgeState {
  tool: string;
  message: string;
  phase: 'running' | 'done' | 'error';
}

const TOOL_ICONS: Record<string, string> = {
  web_search:     '🔍',
  generate_image: '🎨',
  transform_shape:'✦',
  ui_control:     '⚡',
  play_music:     '♪',
  open_url:       '🌐',
  notification:   '🔔',
  status:         '💬',
};

export function ToolStatusBadge() {
  const [badge, setBadge] = useState<BadgeState | null>(null);

  useEffect(() => {
    let dismissTimer: ReturnType<typeof setTimeout>;

    const handler = (e: Event) => {
      const { type, tool, message, error } = (e as CustomEvent<ToolLifecyclePayload>).detail;

      clearTimeout(dismissTimer);

      if (type === 'TOOL_STARTED') {
        setBadge({
          tool,
          message: message ?? `${tool.replace(/_/g, ' ')}…`,
          phase: 'running',
        });
      } else if (type === 'TOOL_PROGRESS') {
        setBadge((prev) => prev ? { ...prev, message: message ?? prev.message } : null);
      } else if (type === 'TOOL_RESULT') {
        setBadge((prev) => prev ? { ...prev, message: 'Done', phase: 'done' } : null);
        dismissTimer = setTimeout(() => setBadge(null), 1400);
      } else if (type === 'TOOL_ERROR') {
        setBadge({ tool, message: error ?? 'Something went wrong', phase: 'error' });
        dismissTimer = setTimeout(() => setBadge(null), 3500);
      } else if (type === 'TOOL_CANCELLED') {
        setBadge(null);
      }
    };

    const notifHandler = (e: Event) => {
      const { message, level, duration } = (e as CustomEvent).detail as {
        message: string;
        level?: 'info' | 'success' | 'warning' | 'error';
        duration?: number;
      };
      clearTimeout(dismissTimer);
      setBadge({
        tool: 'notification',
        message,
        phase: level === 'error' ? 'error' : level === 'success' ? 'done' : 'running',
      });
      dismissTimer = setTimeout(() => setBadge(null), duration ?? 4000);
    };

    const statusTextHandler = (e: Event) => {
      const { text, duration } = (e as CustomEvent).detail as { text: string; duration?: number };
      clearTimeout(dismissTimer);
      setBadge({
        tool: 'status',
        message: text,
        phase: 'running',
      });
      dismissTimer = setTimeout(() => setBadge(null), duration ?? 5000);
    };

    controlLayer.addEventListener('tool:lifecycle', handler);
    controlLayer.addEventListener('command:notification', notifHandler);
    controlLayer.addEventListener('command:status_text', statusTextHandler);
    return () => {
      controlLayer.removeEventListener('tool:lifecycle', handler);
      controlLayer.removeEventListener('command:notification', notifHandler);
      controlLayer.removeEventListener('command:status_text', statusTextHandler);
      clearTimeout(dismissTimer);
    };
  }, []);

  if (!badge) return null;

  const icon = TOOL_ICONS[badge.tool] ?? '⚙';

  const colours =
    badge.phase === 'error'
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
      : badge.phase === 'done'
        ? 'border-emerald-400/30 bg-emerald-400/8 text-emerald-200'
        : 'border-sky-400/25 bg-sky-400/8 text-sky-100';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        pointer-events-none fixed bottom-[124px] left-1/2 z-50
        -translate-x-1/2 transition-all duration-300
        flex items-center gap-2 rounded-full border px-3 py-1.5
        font-mono text-[10px] tracking-wide shadow-lg backdrop-blur-md
        ${colours}
      `}
    >
      <span
        className={badge.phase === 'running' ? 'animate-pulse' : ''}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span>{badge.message}</span>
      {badge.phase === 'running' && (
        <span className="flex gap-0.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block size-1 rounded-full bg-current opacity-70"
              style={{ animation: `bounce 0.9s ${i * 0.15}s infinite` }}
            />
          ))}
        </span>
      )}
    </div>
  );
}
