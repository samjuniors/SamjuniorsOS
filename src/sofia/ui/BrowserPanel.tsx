/**
 * BrowserPanel — in-app window. Most sites block raw iframes (X-Frame-Options),
 * so pages load through /api/sophia/browse unless they are known-embeddable.
 */

import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  ExternalLink,
  Globe,
  Home,
  Maximize2,
  Minus,
  Music,
  RotateCw,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { browseProxyPath, registerBrowserNavigate, unregisterBrowserNavigate } from '../lib/browser-bridge';
import { controlLayer } from '../sophia/control';
import { decisionEngine } from '../sophia/decision-engine';

interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const EDGE = 7;
const MARGIN = 12;
const RESERVED_DOCK = 116;
const HOME = 'sophia://home';

const DIRECT_HOSTS = [
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
];

function clampRect(rect: WindowRect): WindowRect {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const maxW = Math.max(300, viewportW - MARGIN * 2);
  const maxH = Math.max(240, viewportH - RESERVED_DOCK - MARGIN * 2);
  const minW = Math.min(420, maxW);
  const minH = Math.min(280, maxH);
  const w = Math.max(minW, Math.min(maxW, rect.w));
  const h = Math.max(minH, Math.min(maxH, rect.h));
  const x = Math.max(MARGIN, Math.min(viewportW - w - MARGIN, rect.x));
  const y = Math.max(MARGIN, Math.min(viewportH - RESERVED_DOCK - h, rect.y));
  return { x, y, w, h };
}

function initialRect(): WindowRect {
  const w = Math.min(1080, window.innerWidth - 48);
  const h = Math.min(720, window.innerHeight - RESERVED_DOCK - 36);
  return clampRect({ x: (window.innerWidth - w) / 2, y: 18, w, h });
}

function musicSearchUrl(query: string): string {
  const q = encodeURIComponent(query.trim() || 'relaxing music');
  return `https://www.youtube-nocookie.com/embed?listType=search&list=${q}&autoplay=1`;
}

function convertToEmbedUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
      if (parsed.pathname === '/watch') {
        const v = parsed.searchParams.get('v');
        if (v) return `https://www.youtube-nocookie.com/embed/${v}?autoplay=1`;
      }
      if (parsed.pathname.startsWith('/embed/')) return rawUrl;
      if (parsed.pathname === '/results' && parsed.searchParams.has('search_query')) {
        return musicSearchUrl(parsed.searchParams.get('search_query') || '');
      }
      if (parsed.hostname === 'youtu.be') {
        const id = parsed.pathname.slice(1);
        if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
      }
    }
    if (parsed.hostname.includes('google.') && (parsed.pathname.startsWith('/search') || parsed.hostname.startsWith('www.google'))) {
      const q = parsed.searchParams.get('q') || parsed.searchParams.get('query') || '';
      if (q) return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
      if (parsed.pathname === '/' || parsed.pathname === '') return HOME;
    }
  } catch {
    /* not a URL yet */
  }
  return rawUrl;
}

function resolveUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed === HOME) return HOME;
  if (trimmed.startsWith('sophia://')) return trimmed;
  let clean = trimmed;
  if (!/^https?:\/\//i.test(trimmed)) {
    if (/^[a-z0-9-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) clean = `https://${trimmed}`;
    else return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`;
  }
  return convertToEmbedUrl(clean);
}

function shouldProxy(resolved: string): boolean {
  if (!resolved.startsWith('http')) return false;
  try {
    const host = new URL(resolved).hostname.replace(/^www\./, '');
    if (DIRECT_HOSTS.some((h) => host === h || resolved.includes(h))) return false;
    if (host.endsWith('youtube-nocookie.com')) return false;
    if (host.endsWith('wikipedia.org')) return true;
    return true;
  } catch {
    return true;
  }
}

function iframeSrc(resolved: string): string {
  if (resolved === HOME || resolved.startsWith('sophia://')) return '';
  if (resolved.startsWith('/api/sophia/browse')) return resolved;
  return shouldProxy(resolved) ? browseProxyPath(resolved) : resolved;
}

function displayHost(resolved: string): string {
  if (resolved === HOME) return 'home';
  try {
    return new URL(resolved).hostname.replace(/^www\./, '');
  } catch {
    return resolved.replace(/^https?:\/\//, '');
  }
}

const SHORTCUTS = [
  { id: 'search', label: 'Search', hint: 'DuckDuckGo', url: 'https://html.duckduckgo.com/html/', icon: Search },
  { id: 'wiki', label: 'Wikipedia', hint: 'Encyclopedia', url: 'https://en.wikipedia.org/wiki/Main_Page', icon: Globe },
  { id: 'music', label: 'Music', hint: 'YouTube mix', url: musicSearchUrl('lofi chill music'), icon: Music },
  { id: 'calc', label: 'Calculator', hint: 'Desmos', url: 'https://www.desmos.com/scientific', icon: Calculator },
];

export function BrowserPanel({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(HOME);
  const [urlInput, setUrlInput] = useState('');
  const [pageTitle, setPageTitle] = useState('Home');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [rect, setRect] = useState<WindowRect>(initialRect);
  const [maximized, setMaximized] = useState(false);
  const restoreRect = useRef<WindowRect | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const historyStack = useRef<string[]>([HOME]);
  const historyIdx = useRef(0);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gesture = useRef<
    | { kind: 'drag'; startX: number; startY: number; start: WindowRect }
    | { kind: 'resize'; edge: ResizeEdge; startX: number; startY: number; start: WindowRect }
    | null
  >(null);

  const applyNav = (resolved: string, title?: string, push = true) => {
    setUrl(resolved);
    setUrlInput(resolved === HOME ? '' : resolved);
    if (title) setPageTitle(title);
    else if (resolved === HOME) setPageTitle('Home');
    setFailed(null);
    setLoading(resolved !== HOME);
    if (push) {
      historyStack.current = historyStack.current.slice(0, historyIdx.current + 1);
      historyStack.current.push(resolved);
      historyIdx.current = historyStack.current.length - 1;
    }
    if (loadTimer.current) clearTimeout(loadTimer.current);
    if (resolved !== HOME) {
      loadTimer.current = setTimeout(() => {
        setLoading(false);
      }, 12000);
    }
  };

  useEffect(() => {
    registerBrowserNavigate((newUrl: string, title?: string) => {
      applyNav(resolveUrl(newUrl), title);
    });
    return () => {
      unregisterBrowserNavigate();
      if (loadTimer.current) clearTimeout(loadTimer.current);
    };
  }, []);

  useEffect(() => {
    const onNav = (e: Event) => {
      const { url: navUrl, query, title } = (e as CustomEvent).detail as {
        url?: string;
        query?: string;
        title?: string;
      };
      applyNav(resolveUrl(navUrl || query || HOME), title);
    };
    controlLayer.addEventListener('command:navigate', onNav);
    return () => controlLayer.removeEventListener('command:navigate', onNav);
  }, []);

  useEffect(() => {
    decisionEngine.setBrowserState(true, url);
    return () => {
      decisionEngine.setBrowserState(false);
    };
  }, [url]);

  useEffect(() => {
    const onScroll = (e: Event) => {
      const { direction, amount = 350 } = ((e as CustomEvent).detail || {}) as {
        direction?: 'up' | 'down' | 'top' | 'bottom';
        amount?: number;
      };

      try {
        if (iframeRef.current?.contentWindow) {
          if (direction === 'top') {
            iframeRef.current.contentWindow.scrollTo({ top: 0, behavior: 'smooth' });
          } else if (direction === 'bottom') {
            iframeRef.current.contentWindow.scrollTo({ top: 999999, behavior: 'smooth' });
          } else if (direction === 'up') {
            iframeRef.current.contentWindow.scrollBy({ top: -amount, behavior: 'smooth' });
          } else {
            iframeRef.current.contentWindow.scrollBy({ top: amount, behavior: 'smooth' });
          }
        }
      } catch {
        // Cross-origin fallback
      }
    };

    const onInteract = (e: Event) => {
      const detail = ((e as CustomEvent).detail || {}) as {
        action?: 'click' | 'type' | 'press_key' | 'play_pause';
        key?: string;
        text?: string;
      };

      if (detail.action === 'play_pause') {
        try {
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }),
            '*'
          );
        } catch {
          // ignore
        }
      } else if (detail.action === 'press_key' && detail.key) {
        const targetInput = document.querySelector('input:focus') as HTMLInputElement | null;
        if (targetInput) {
          targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: detail.key, bubbles: true }));
        }
      }
    };

    controlLayer.addEventListener('command:browser_scroll', onScroll);
    controlLayer.addEventListener('command:browser_interact', onInteract);
    return () => {
      controlLayer.removeEventListener('command:browser_scroll', onScroll);
      controlLayer.removeEventListener('command:browser_interact', onInteract);
    };
  }, []);

  useEffect(() => {
    const onResize = () => setRect((current) => clampRect(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const navigate = (newUrl: string) => applyNav(resolveUrl(newUrl));

  const goBack = () => {
    if (historyIdx.current <= 0) return;
    historyIdx.current--;
    applyNav(historyStack.current[historyIdx.current], undefined, false);
  };

  const goForward = () => {
    if (historyIdx.current >= historyStack.current.length - 1) return;
    historyIdx.current++;
    applyNav(historyStack.current[historyIdx.current], undefined, false);
  };

  const reload = () => {
    if (url === HOME) return;
    setFailed(null);
    setLoading(true);
    if (iframeRef.current) iframeRef.current.src = iframeSrc(url);
  };

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button, input')) return;
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
    if (edge.includes('w')) {
      x += dx;
      w -= dx;
    }
    if (edge.includes('n')) {
      y += dy;
      h -= dy;
    }
    setRect(clampRect({ x, y, w, h }));
  };

  const endGesture = () => {
    gesture.current = null;
  };

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

  const handleNavigate = (event: FormEvent) => {
    event.preventDefault();
    navigate(urlInput || HOME);
  };

  const openExternal = (targetUrl?: string) => {
    const dest = targetUrl || (url === HOME ? 'https://html.duckduckgo.com/html/' : url);
    window.open(dest, '_blank', 'noopener,noreferrer');
  };

  const onIframeLoad = () => {
    setLoading(false);
    if (loadTimer.current) clearTimeout(loadTimer.current);
    const frame = iframeRef.current;
    if (!frame) return;
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const text = doc.body?.innerText?.slice(0, 80) || '';
      if (text.includes('Upstream returned') || text.includes('Browse proxy failed') || text.includes('Timed out')) {
        setFailed('This page could not be loaded in the preview.');
      }
      if (doc.title) setPageTitle(doc.title.slice(0, 80));
    } catch {
      /* cross-origin embed — fine */
    }
  };

  const isHome = url === HOME;
  const src = iframeSrc(url);

  return (
    <section
      aria-label="Sofia Browser"
      className="glass-panel panel-in fixed z-30 flex select-none flex-col overflow-hidden rounded-[20px] shadow-[0_30px_100px_rgba(0,0,0,0.85)]"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onPointerMove={moveWindow}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      <header
        className="flex h-10 shrink-0 cursor-move items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3"
        onPointerDown={beginDrag}
        onDoubleClick={toggleMaximize}
      >
        <div className="pointer-events-none flex min-w-0 items-center gap-2">
          <Globe size={13} className="shrink-0 text-sky-400/80" />
          <span className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-white/50">Browser</span>
          <span className="hidden truncate font-mono text-[8.5px] text-white/30 sm:inline">{pageTitle}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => openExternal()}
            title="Open in a new tab"
            aria-label="Open in a new tab"
            className="grid size-7 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <ExternalLink size={12} />
          </button>
          <button type="button" onClick={onClose} aria-label="Minimize" className="grid size-7 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white">
            <Minus size={13} strokeWidth={1.75} />
          </button>
          <button type="button" onClick={toggleMaximize} aria-label={maximized ? 'Restore' : 'Maximize'} className="grid size-7 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white">
            <Maximize2 size={12} strokeWidth={1.6} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-lg text-white/40 transition-colors hover:bg-rose-500/20 hover:text-rose-200">
            <X size={13} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-black/25 px-3">
        <div className="flex items-center gap-0.5 text-white/40">
          <button type="button" aria-label="Back" onClick={goBack} className="grid size-8 place-items-center rounded-lg hover:bg-white/[0.06] hover:text-white">
            <ArrowLeft size={14} />
          </button>
          <button type="button" aria-label="Forward" onClick={goForward} className="grid size-8 place-items-center rounded-lg hover:bg-white/[0.06] hover:text-white">
            <ArrowRight size={14} />
          </button>
          <button type="button" aria-label="Home" onClick={() => applyNav(HOME, 'Home')} className="grid size-8 place-items-center rounded-lg hover:bg-white/[0.06] hover:text-white">
            <Home size={14} />
          </button>
          <button type="button" aria-label="Reload" onClick={reload} className="grid size-8 place-items-center rounded-lg hover:bg-white/[0.06] hover:text-white">
            <RotateCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <form
          onSubmit={handleNavigate}
          className="flex h-8 flex-1 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 transition-[border-color,background-color] duration-200 focus-within:border-sky-400/40 focus-within:bg-white/[0.07]"
        >
          <Globe size={12} className="shrink-0 text-sky-400/60" />
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            spellCheck={false}
            aria-label="Web address or search"
            placeholder="Search or enter a URL"
            className="h-full flex-1 select-text bg-transparent font-mono text-[11px] text-white/85 placeholder-white/25 focus:outline-none"
          />
        </form>
      </div>

      <div className="relative flex-1 overflow-hidden bg-[#070b16]">
        {isHome && (
          <div className="absolute inset-0 flex flex-col items-center overflow-y-auto px-6 py-10">
            <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-sky-300/70">Sofia Browser</p>
            <h2 className="mt-3 text-[28px] font-extralight tracking-wide text-white/92">Where to?</h2>
            <form
              onSubmit={handleNavigate}
              className="mt-7 flex w-full max-w-[520px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 focus-within:border-sky-400/40"
            >
              <Search size={15} className="text-white/35" />
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Search the web or paste a link"
                className="h-7 flex-1 bg-transparent text-[14px] text-white/90 placeholder-white/30 outline-none"
                autoFocus
              />
            </form>
            <div className="mt-8 grid w-full max-w-[520px] grid-cols-2 gap-3 sm:grid-cols-4">
              {SHORTCUTS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyNav(resolveUrl(item.url), item.label)}
                    className="flex flex-col items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-left transition-colors hover:border-sky-400/25 hover:bg-white/[0.06]"
                  >
                    <span className="grid size-8 place-items-center rounded-xl bg-sky-400/10 text-sky-200">
                      <Icon size={15} />
                    </span>
                    <span>
                      <span className="block text-[13px] text-white/85">{item.label}</span>
                      <span className="mt-0.5 block text-[11px] text-white/35">{item.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-10 max-w-[36ch] text-center text-[11px] leading-relaxed text-white/30">
              Pages load inside Sofia. Sites that refuse embedding are fetched through a private preview.
            </p>
          </div>
        )}

        {!isHome && (
          <>
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#070b16]/90">
                <div className="flex flex-col items-center gap-3">
                  <div className="size-8 animate-spin rounded-full border-2 border-sky-400/20 border-t-sky-400" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-white/35">Loading {displayHost(url)}</span>
                </div>
              </div>
            )}
            {failed && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#070b16] px-8 text-center">
                <p className="text-[15px] text-white/80">Couldn’t show this page here</p>
                <p className="max-w-[40ch] text-[12px] leading-relaxed text-white/40">{failed}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={reload} className="rounded-full border border-white/12 px-4 py-2 text-[12px] text-white/70 hover:bg-white/[0.06]">
                    Retry
                  </button>
                  <button type="button" onClick={() => openExternal()} className="rounded-full bg-white/90 px-4 py-2 text-[12px] text-[#070b16]">
                    Open in new tab
                  </button>
                </div>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={src}
              title={pageTitle}
              className="h-full w-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              onLoad={onIframeLoad}
              onError={() => {
                setLoading(false);
                setFailed('This site blocked the preview.');
              }}
              referrerPolicy="no-referrer-when-downgrade"
            />
          </>
        )}
      </div>

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
