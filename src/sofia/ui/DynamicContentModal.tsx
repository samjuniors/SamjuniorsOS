/**
 * DynamicContentModal.tsx
 *
 * Dynamic Info & Review Panel for Sofia.
 * Allows Sofia to open rich custom panels for weather, system clock, document reviews,
 * active stories, and detailed lookups, scroll them on voice command ("scroll down", "scroll for me"),
 * and dismiss them when the user says "ok done" or clicks done.
 */

import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  CloudSun,
  Copy,
  FileText,
  Info,
  Maximize2,
  Sparkles,
  X,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { controlLayer } from '../sophia/control';

export type InfoPanelType = 'info' | 'weather' | 'time' | 'review' | 'story' | 'document';

interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const EDGE = 7;
const MARGIN = 16;
const RESERVED_DOCK = 116;

function clampRect(rect: WindowRect): WindowRect {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const maxW = Math.max(340, viewportW - MARGIN * 2);
  const maxH = Math.max(260, viewportH - RESERVED_DOCK - MARGIN * 2);
  const minW = Math.min(480, maxW);
  const minH = Math.min(320, maxH);
  const w = Math.max(minW, Math.min(maxW, rect.w));
  const h = Math.max(minH, Math.min(maxH, rect.h));
  const x = Math.max(MARGIN, Math.min(viewportW - w - MARGIN, rect.x));
  const y = Math.max(MARGIN, Math.min(viewportH - RESERVED_DOCK - h, rect.y));
  return { x, y, w, h };
}

function initialRect(): WindowRect {
  const w = Math.min(680, window.innerWidth - 48);
  const h = Math.min(560, window.innerHeight - RESERVED_DOCK - 40);
  return clampRect({
    x: Math.max(MARGIN, (window.innerWidth - w) / 2),
    y: Math.max(MARGIN, 40),
    w,
    h,
  });
}

export function DynamicContentModal({
  onClose,
  initialTitle = 'Information Review',
  initialContent = '',
  initialType = 'info',
}: {
  onClose: () => void;
  initialTitle?: string;
  initialContent?: string;
  initialType?: InfoPanelType;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [type, setType] = useState<InfoPanelType>(initialType);
  const [rect, setRect] = useState<WindowRect>(initialRect);
  const [maximized, setMaximized] = useState(false);
  const [copied, setCopied] = useState(false);
  const restoreRect = useRef<WindowRect | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const gesture = useRef<
    | { kind: 'drag'; startX: number; startY: number; start: WindowRect }
    | { kind: 'resize'; edge: ResizeEdge; startX: number; startY: number; start: WindowRect }
    | null
  >(null);

  // Listen to controlLayer commands to update or scroll
  useEffect(() => {
    const onInfoCmd = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        open?: boolean;
        title?: string;
        content?: string;
        type?: InfoPanelType;
      };
      if (detail.open === false) {
        onClose();
        return;
      }
      if (detail.title) setTitle(detail.title);
      if (detail.content !== undefined) setContent(detail.content);
      if (detail.type) setType(detail.type);
    };

    const onScrollCmd = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        direction?: 'up' | 'down' | 'top' | 'bottom';
        amount?: number;
      };
      const container = scrollContainerRef.current;
      if (!container) return;

      const amt = detail.amount || 260;
      if (detail.direction === 'down') {
        container.scrollBy({ top: amt, behavior: 'smooth' });
      } else if (detail.direction === 'up') {
        container.scrollBy({ top: -amt, behavior: 'smooth' });
      } else if (detail.direction === 'top') {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (detail.direction === 'bottom') {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    };

    controlLayer.addEventListener('command:info_card', onInfoCmd);
    controlLayer.addEventListener('command:scroll_info_card', onScrollCmd);

    return () => {
      controlLayer.removeEventListener('command:info_card', onInfoCmd);
      controlLayer.removeEventListener('command:scroll_info_card', onScrollCmd);
    };
  }, [onClose]);

  const scrollByAmount = (delta: number) => {
    scrollContainerRef.current?.scrollBy({ top: delta, behavior: 'smooth' });
  };

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${content}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button, input, a, pre')) return;
    gesture.current = { kind: 'drag', startX: event.clientX, startY: event.clientY, start: rect };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const beginResize = (edge: ResizeEdge, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    gesture.current = { kind: 'resize', edge, startX: event.clientX, startY: event.clientY, start: rect };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveWindow = (event: ReactPointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (active.kind === 'drag') {
      setRect(clampRect({ ...active.start, x: active.start.x + dx, y: active.start.y + dy }));
      return;
    }
    const edge = active.edge;
    let { x, y, w, h } = active.start;
    if (edge.includes('e')) w += dx;
    if (edge.includes('s')) h += dy;
    if (edge.includes('w')) { x += dx; w -= dx; }
    if (edge.includes('n')) { y += dy; h -= dy; }
    setRect(clampRect({ x, y, w, h }));
  };

  const endGesture = () => { gesture.current = null; };

  const toggleMaximize = () => {
    if (maximized && restoreRect.current) {
      setRect(clampRect(restoreRect.current));
      restoreRect.current = null;
      setMaximized(false);
      return;
    }
    restoreRect.current = rect;
    setRect(clampRect({ x: MARGIN, y: MARGIN, w: window.innerWidth, h: window.innerHeight }));
    setMaximized(true);
  };

  const getTypeIcon = () => {
    switch (type) {
      case 'weather':
        return <CloudSun size={15} className="text-amber-400" />;
      case 'time':
        return <Clock size={15} className="text-sky-400" />;
      case 'review':
        return <FileText size={15} className="text-emerald-400" />;
      case 'story':
        return <BookOpen size={15} className="text-purple-400" />;
      default:
        return <Sparkles size={15} className="text-cyan-400" />;
    }
  };

  const getTypeBadgeClass = () => {
    switch (type) {
      case 'weather':
        return 'border-amber-400/30 bg-amber-400/10 text-amber-300';
      case 'time':
        return 'border-sky-400/30 bg-sky-400/10 text-sky-300';
      case 'review':
        return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300';
      case 'story':
        return 'border-purple-400/30 bg-purple-400/10 text-purple-300';
      default:
        return 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300';
    }
  };

  // Render paragraphs or split lines cleanly
  const paragraphs = content.split('\n\n').filter((p) => p.trim().length > 0);

  return (
    <section
      aria-label="Sofia Dynamic Info Panel"
      className="glass-panel panel-in fixed z-40 flex select-none flex-col overflow-hidden rounded-2xl shadow-[0_30px_100px_rgba(0,0,0,0.9)] backdrop-blur-xl border border-white/10 bg-[#080d1e]/90"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onPointerMove={moveWindow}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      {/* Title bar */}
      <header
        className="flex h-11 shrink-0 cursor-move items-center justify-between border-b border-white/[0.08] bg-white/[0.03] px-4"
        onPointerDown={beginDrag}
        onDoubleClick={toggleMaximize}
      >
        <div className="flex items-center gap-2.5">
          {getTypeIcon()}
          <span className="font-medium text-xs tracking-wide text-white/90 truncate max-w-[280px] sm:max-w-md">
            {title}
          </span>
          <span
            className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider border ${getTypeBadgeClass()}`}
          >
            {type}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={copyContent}
            title="Copy content"
            aria-label="Copy"
            className="grid size-7 cursor-pointer place-items-center rounded-lg text-white/40 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
          <button
            type="button"
            onClick={toggleMaximize}
            aria-label={maximized ? 'Restore' : 'Maximize'}
            className="grid size-7 cursor-pointer place-items-center rounded-lg text-white/40 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <Maximize2 size={12} strokeWidth={1.6} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 cursor-pointer place-items-center rounded-lg text-white/40 hover:bg-rose-500/20 hover:text-rose-200 transition-colors"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* Main scrollable body */}
      <div
        ref={scrollContainerRef}
        className="relative flex-1 overflow-y-auto px-6 py-5 font-sans text-sm leading-relaxed text-white/85 scroll-smooth select-text"
      >
        {paragraphs.length > 0 ? (
          paragraphs.map((p, idx) => (
            <p key={idx} className="mb-4 last:mb-0 text-white/90 font-light leading-relaxed">
              {p}
            </p>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center text-white/40">
            <Info size={28} className="mb-2 text-white/20" />
            <p className="text-xs font-mono">No details to display yet.</p>
          </div>
        )}
      </div>

      {/* Interactive Footer Toolbar (Voice and Clickable) */}
      <footer className="flex h-11 shrink-0 items-center justify-between border-t border-white/[0.06] bg-black/30 px-4">
        <div className="flex items-center gap-1.5 text-white/40 text-[11px] font-mono">
          <span>Voice:</span>
          <span className="text-sky-300/80">"scroll down"</span>
          <span>•</span>
          <span className="text-sky-300/80">"ok done"</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollByAmount(-220)}
            title="Scroll up (or say 'scroll up')"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <ChevronUp size={14} />
            <span className="hidden sm:inline">Up</span>
          </button>
          <button
            type="button"
            onClick={() => scrollByAmount(220)}
            title="Scroll down (or say 'scroll down')"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <ChevronDown size={14} />
            <span className="hidden sm:inline">Down</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close panel (or say 'ok done')"
            className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-sky-500/20 text-sky-200 hover:bg-sky-500/30 transition-colors ml-2"
          >
            <Check size={13} />
            <span>Done</span>
          </button>
        </div>
      </footer>

      {/* Resize handles */}
      {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeEdge[]).map((edge) => {
        const vertical = edge === 'n' || edge === 's';
        const horizontal = edge === 'e' || edge === 'w';
        const style: CSSProperties = vertical
          ? { left: EDGE, right: EDGE, height: EDGE, [edge === 'n' ? 'top' : 'bottom']: 0 }
          : horizontal
            ? { top: EDGE, bottom: EDGE, width: EDGE, [edge === 'w' ? 'left' : 'right']: 0 }
            : {
                width: EDGE * 2,
                height: EDGE * 2,
                [edge.includes('n') ? 'top' : 'bottom']: 0,
                [edge.includes('w') ? 'left' : 'right']: 0,
              };
        const cursor = vertical
          ? 'ns-resize'
          : horizontal
            ? 'ew-resize'
            : edge === 'nw' || edge === 'se'
              ? 'nwse-resize'
              : 'nesw-resize';
        return (
          <div
            key={edge}
            aria-hidden="true"
            className="absolute z-50"
            style={{ ...style, cursor }}
            onPointerDown={(e) => beginResize(edge, e)}
          />
        );
      })}
    </section>
  );
}
