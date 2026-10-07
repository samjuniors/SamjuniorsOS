/**
 * ui/WorldPanel.tsx — the World Monitor (Phase 5 Theatre).
 *
 * A rotating dot-matrix globe (real 110m continent data) over the live
 * news wire. Drag to spin; respects reduced-motion.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, Newspaper, RotateCw } from 'lucide-react';
import { fibonacciSphere, landAt, project } from '../lib/world-map';
import {
  FALLBACK_HEADLINES,
  ageLabel,
  fetchHeadlines,
  readHeadlineCache,
  writeHeadlineCache,
  type Headline,
} from '../lib/headlines';

const DOTS = 1500;
const CITIES: Array<{ name: string; lat: number; lon: number }> = [
  { name: 'San Francisco', lat: 37.8, lon: -122.4 },
  { name: 'London', lat: 51.5, lon: -0.1 },
  { name: 'Singapore', lat: 1.35, lon: 103.8 },
  { name: 'São Paulo', lat: -23.5, lon: -46.6 },
  { name: 'Sydney', lat: -33.9, lon: 151.2 },
];

interface Dot {
  lat: number;
  lon: number;
  land: boolean;
}

function themeGlow(): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--th-glow').trim();
    return v || '56, 189, 248';
  } catch {
    return '56, 189, 248';
  }
}

function Globe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; offset: number } | null>(null);
  const dots = useMemo<Dot[]>(
    () => fibonacciSphere(DOTS).map((p) => ({ ...p, land: landAt(p.lat, p.lon) })),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxOrNull = canvas.getContext('2d');
    if (!ctxOrNull) return;
    const ctx: CanvasRenderingContext2D = ctxOrNull;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) / 2 - 14;
    let rotation = 2.2;
    let glow = themeGlow();
    let raf = 0;
    let last = performance.now();

    const observer = new MutationObserver(() => {
      glow = themeGlow();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    function draw(now: number) {
      ctx.clearRect(0, 0, W, H);

      // Atmosphere + rim.
      const atmo = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.12);
      atmo.addColorStop(0, 'rgba(0,0,0,0)');
      atmo.addColorStop(0.92, `rgba(${glow},0.10)`);
      atmo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = atmo;
      ctx.fillRect(0, 0, W, H);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${glow},0.35)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Land + ocean dots with limb fade.
      for (const d of dots) {
        const p = project(d.lat, d.lon, rotation);
        if (!p.visible) continue;
        const r2 = p.x * p.x + p.y * p.y;
        if (r2 > 1) continue;
        const edge = 1 - r2;
        const px = cx + p.x * R;
        const py = cy + p.y * R;
        if (d.land) {
          ctx.fillStyle = `rgba(${glow},${(0.25 + 0.75 * edge).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(px, py, 0.9 + 1.5 * edge, 0, Math.PI * 2);
          ctx.fill();
        } else if (edge > 0.25) {
          ctx.fillStyle = `rgba(148,163,184,${(0.05 + 0.16 * edge).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(px, py, 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Hub cities with a soft pulse.
      const pulse = 0.5 + 0.5 * Math.sin(now / 700);
      for (const c of CITIES) {
        const p = project(c.lat, c.lon, rotation);
        if (!p.visible || p.x * p.x + p.y * p.y > 0.98) continue;
        const px = cx + p.x * R;
        const py = cy + p.y * R;
        ctx.fillStyle = `rgba(${glow},${(0.25 + 0.35 * pulse).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px, py, 5 + 2 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    let resumeAt = 0;
    function frame(now: number) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!drag.current && now > resumeAt) rotation += dt * (Math.PI * 2) / 44;
      draw(now);
      raf = requestAnimationFrame(frame);
    }

    if (reduced) {
      draw(performance.now());
      return () => observer.disconnect();
    }
    raf = requestAnimationFrame(frame);

    const onDown = (e: PointerEvent) => {
      drag.current = { x: e.clientX, offset: rotation };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      rotation = d.offset + ((e.clientX - d.x) / R) * 1.4;
    };
    const onUp = () => {
      drag.current = null;
      resumeAt = performance.now() + 2500;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [dots]);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={300}
      role="img"
      aria-label="Rotating dot-matrix globe"
      className="h-auto w-full cursor-grab touch-none select-none active:cursor-grabbing"
    />
  );
}

function Wire() {
  const [items, setItems] = useState<Headline[]>(FALLBACK_HEADLINES);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const cached = readHeadlineCache();
    if (cached && cached.items.length > 0) {
      setItems(cached.items);
      setUpdatedAt(cached.at);
      setLive(true);
    }
    setBusy(true);
    fetchHeadlines()
      .then((fresh) => {
        if (!alive || fresh.length === 0) return;
        setItems(fresh);
        setUpdatedAt(Date.now());
        setLive(true);
        writeHeadlineCache(fresh);
      })
      .catch(() => {
        // Offline — the cache/fallback above already covers the panel.
        if (alive && !cached) setLive(false);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 px-0.5">
        <Newspaper size={12} className="text-sky-300/80" />
        <p className="flex-1 text-[10px] uppercase tracking-wide text-white/40">
          The wire {updatedAt ? `· ${ageLabel(updatedAt)}` : live ? '' : '· cached sample'}
        </p>
        <button
          type="button"
          aria-label="Refresh headlines"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            fetchHeadlines()
              .then((fresh) => {
                if (fresh.length === 0) return;
                setItems(fresh);
                setUpdatedAt(Date.now());
                setLive(true);
                writeHeadlineCache(fresh);
              })
              .catch(() => undefined)
              .finally(() => setBusy(false));
          }}
          className="rounded-md border border-white/10 bg-white/5 p-1 text-white/60 transition-colors hover:text-white disabled:opacity-50"
        >
          <RotateCw size={11} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>
      {busy && items === FALLBACK_HEADLINES && (
        <p className="flex items-center gap-1.5 px-1 py-1 text-[11px] text-white/40">
          <Loader2 size={12} className="animate-spin" /> Tuning the wire…
        </p>
      )}
      <ul className="flex max-h-44 flex-col gap-0.5 overflow-y-auto">
        {items.map((h, i) => (
          <li key={`${h.url}-${i}`}>
            <a
              href={h.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-baseline gap-1.5 rounded-md px-1.5 py-1 hover:bg-white/[0.06]"
            >
              <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-sky-300/70">
                {h.points}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] text-white/80 group-hover:text-white">
                  {h.title}
                </span>
                <span className="block truncate text-[10px] text-white/35">
                  {h.source}
                  {h.comments > 0 ? ` · ${h.comments} comments` : ''}
                </span>
              </span>
              <ExternalLink size={10} className="shrink-0 self-center text-white/25 group-hover:text-white/60" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WorldPanel() {
  return (
    <div className="flex flex-col gap-2">
      <Globe />
      <Wire />
    </div>
  );
}
