'use client';

import React, { useEffect, useRef } from 'react';
import { AgentRole } from '@/types/os';

export type SpecialistId = AgentRole | 'systems' | 'advisor';

export interface SpecialistNodeDef {
  id: SpecialistId;
  code: string;
  fullName: string;
  role: string;
  department: string;
  clearance: string;
  tier: 'Active (v1)' | 'Deferred (v1)' | 'Planned (Target-state)';
  isV1Active: boolean;
  color: string;
  task: string;
  short: string;
  x: number;
  y: number;
}

export const SPECIALIST_NODES: SpecialistNodeDef[] = [
  {
    id: 'coo',
    code: 'SOPHIA',
    fullName: 'Sophia Vance',
    role: 'Chief Operating Officer & Master Orchestrator',
    department: 'Executive Operations & Orchestration Mesh',
    clearance: 'LEVEL 5 CONSTITUTIONAL',
    tier: 'Active (v1)',
    isV1Active: true,
    color: '#a855f7',
    task: 'Decomposing founder directive into 9-Step DAG',
    short: 'COO',
    x: 24,
    y: 28,
  },
  {
    id: 'researcher',
    code: 'THORNE',
    fullName: 'Dr. Aris Thorne',
    role: 'Lead Market & Intelligence Researcher',
    department: 'Market Intelligence & Deep Tech Recon',
    clearance: 'LEVEL 4 STRATEGIC INTEL',
    tier: 'Active (v1)',
    isV1Active: true,
    color: '#fbbf24',
    task: 'Synthesizing competitive benchmark memos',
    short: 'Research',
    x: 75,
    y: 24,
  },
  {
    id: 'pm',
    code: 'MAYA',
    fullName: 'Maya Lin',
    role: 'Principal Product Manager',
    department: 'Product Strategy & User Experience',
    clearance: 'LEVEL 4 PRODUCT ARCHITECTURE',
    tier: 'Deferred (v1)',
    isV1Active: false,
    color: '#f43f5e',
    task: 'PRD authoring & backlog grooming (governed standby)',
    short: 'Product',
    x: 87,
    y: 56,
  },
  {
    id: 'finance',
    code: 'JULIAN',
    fullName: 'Julian Cruz',
    role: 'Chief Financial Analyst',
    department: 'Capital, Treasury & Unit Economics',
    clearance: 'LEVEL 5 FINANCIAL SOVEREIGNTY',
    tier: 'Deferred (v1)',
    isV1Active: false,
    color: '#34d399',
    task: 'Margin floor & unit economics modeling (governed standby)',
    short: 'Finance',
    x: 65,
    y: 84,
  },
  {
    id: 'advisor',
    code: 'ELENA',
    fullName: 'Elena Rostova',
    role: 'Legal, Governance & Compliance',
    department: 'Governance & Regulatory Oversight',
    clearance: 'LEVEL 5 GOVERNANCE',
    tier: 'Planned (Target-state)',
    isV1Active: false,
    color: '#81caaa',
    task: 'Constitutional side-effect audit (planned architecture)',
    short: 'Governance',
    x: 31,
    y: 81,
  },
  {
    id: 'systems',
    code: 'MARCUS',
    fullName: 'Marcus Vance',
    role: 'Systems & Autonomous Infrastructure',
    department: 'Execution Runtime & Sandboxing',
    clearance: 'LEVEL 4 INFRASTRUCTURE',
    tier: 'Planned (Target-state)',
    isV1Active: false,
    color: '#8acbde',
    task: 'Deterministic runtime sandboxing (planned architecture)',
    short: 'Systems',
    x: 11,
    y: 56,
  },
];

export interface SamJuniorsCoreCanvasProps {
  paused?: boolean;
  reduced?: boolean;
  quality?: 'high' | 'low';
  burst?: number;
  reset?: number;
  theme?: 'solar' | 'luna';
  showLabels?: boolean;
  selectedAgent?: SpecialistId | null;
  onSelectSpecialist?: (id: SpecialistId) => void;
  onSelectAgent?: (role: AgentRole) => void;
}

export function SamJuniorsCoreCanvas({
  paused = false,
  reduced = false,
  quality = 'high',
  burst = 0,
  reset = 0,
  theme = 'solar',
  showLabels = true,
  selectedAgent,
  onSelectSpecialist,
  onSelectAgent,
}: SamJuniorsCoreCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ paused, reduced, quality, burst, theme });
  const view = useRef({ yaw: 0, pitch: 0, zoom: 1 });

  useEffect(() => {
    state.current = { paused, reduced, quality, burst, theme };
  }, [paused, reduced, quality, burst, theme]);

  useEffect(() => {
    view.current = { yaw: 0, pitch: 0, zoom: 1 };
  }, [reset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0,
      h = 0,
      frame = 0,
      time = 0,
      last = 0;
    let drag: { x: number; y: number } | null = null;
    let seed = 46;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const stars = Array.from({ length: 170 }, () => ({
      x: random(),
      y: random(),
      r: random(),
      a: random(),
    }));

    const points = Array.from({ length: 13000 }, (_, i) => ({
      t: random() * Math.PI * 2,
      a: random() * Math.PI * 2,
      r: Math.sqrt(random()),
      strand: i % 6,
      bright: random(),
      size: random(),
    }));

    const relays = Array.from({ length: 42 }, () => ({
      x: 0.06 + random() * 0.88,
      y: 0.09 + random() * 0.84,
      size: random(),
    }));

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    };

    const move = (e: PointerEvent) => {
      if (!drag) return;
      view.current.yaw += (e.clientX - drag.x) * 0.005;
      view.current.pitch += (e.clientY - drag.y) * 0.005;
      drag = { x: e.clientX, y: e.clientY };
    };

    const up = () => {
      drag = null;
      canvas.style.cursor = 'grab';
    };

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      view.current.zoom = Math.max(0.65, Math.min(1.6, view.current.zoom - e.deltaY * 0.0006));
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });

    const render = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.04);
      last = now;
      if (!state.current.paused && !state.current.reduced) time += dt;

      ctx.clearRect(0, 0, w, h);
      const isLuna = state.current.theme === 'luna';
      const cx = w / 2,
        cy = h * 0.5,
        size = Math.min(w * 0.235, h * 0.31) * view.current.zoom;

      // Ambient radial glow
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 2.3);
      if (isLuna) {
        glow.addColorStop(0, 'rgba(124,214,255,.11)');
        glow.addColorStop(0.5, 'rgba(95,232,200,.03)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        glow.addColorStop(0, 'rgba(125,101,63,.09)');
        glow.addColorStop(0.5, 'rgba(70,97,117,.025)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
      }
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Stars
      stars.forEach((s) => {
        ctx.fillStyle = isLuna
          ? `rgba(180,225,255,${s.a * 0.42})`
          : `rgba(174,196,209,${s.a * 0.38})`;
        ctx.fillRect(s.x * w, s.y * h, s.r + 0.3, s.r + 0.3);
      });

      // Orbital guide rings
      ctx.lineWidth = 0.65;
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate([ -0.29, 0.32, 1.05 ][i]);
        ctx.strokeStyle = isLuna
          ? `rgba(124,214,255,${i === 2 ? 0.08 : 0.17})`
          : `rgba(126,158,175,${i === 2 ? 0.07 : 0.15})`;
        ctx.setLineDash(i === 2 ? [2, 6] : []);
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          Math.min(w * 0.43, h * 0.52),
          Math.min(w * 0.2, h * 0.29),
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
      }

      // Constellation relays
      relays.forEach((p, i) => {
        const x = p.x * w,
          y = p.y * h;
        ctx.strokeStyle = isLuna ? 'rgba(124,214,255,.12)' : 'rgba(139,171,186,.10)';
        if (i % 3 !== 0) {
          const q = relays[(i + 1) % relays.length];
          if (Math.hypot((p.x - q.x) * w, (p.y - q.y) * h) < w * 0.34) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(q.x * w, q.y * h);
            ctx.stroke();
          }
        }
        ctx.strokeStyle = isLuna ? 'rgba(124,214,255,.38)' : 'rgba(158,193,207,.32)';
        ctx.beginPath();
        ctx.arc(x, y, p.size > 0.78 ? 3.4 : 1.15, 0, Math.PI * 2);
        ctx.stroke();
        if (p.size > 0.9) {
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      // Specialist connection rays
      SPECIALIST_NODES.forEach((a) => {
        ctx.strokeStyle = a.color + '18';
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo((a.x * w) / 100, (a.y * h) / 100);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // Particle Knot
      const rot = view.current.yaw + time * 0.026;
      const tilt = 0 + view.current.pitch;
      const count = state.current.quality === 'low' ? 5500 : points.length;

      for (let i = 0; i < count; i++) {
        const p = points[i],
          t = p.t + time * 0.023;
        const knot = (v: number) => {
          const r = 2 + Math.cos(3 * v);
          return [r * Math.cos(2 * v), r * Math.sin(2 * v), Math.sin(3 * v)];
        };
        const base = knot(t),
          next = knot(t + 0.003);
        let tx = next[0] - base[0],
          ty = next[1] - base[1],
          tz = next[2] - base[2];
        const len = Math.hypot(tx, ty, tz);
        tx /= len;
        ty /= len;
        tz /= len;
        const nl = Math.hypot(tx, ty);
        const nx = -ty / nl,
          ny = tx / nl;
        const bx = -tz * ny,
          by = tz * nx,
          bz = tx * ny - ty * nx;
        const a = p.a + (p.strand * Math.PI) / 3 + t * 8;
        const r = 0.105 * p.r;
        let x = base[0] + r * (Math.cos(a) * nx + Math.sin(a) * bx),
          y = base[1] + r * (Math.cos(a) * ny + Math.sin(a) * by),
          z = base[2] + r * Math.sin(a) * bz;

        const xx = x * Math.cos(rot) - y * Math.sin(rot);
        y = x * Math.sin(rot) + y * Math.cos(rot);
        x = xx;
        const yy = y * Math.cos(tilt) - z * Math.sin(tilt);
        z = y * Math.sin(tilt) + z * Math.cos(tilt);
        y = yy;

        const perspective = 1 + z * 0.06;
        const px = cx + x * size * 0.34 * perspective,
          py = cy + y * size * 0.34 * perspective;
        const alpha = (0.25 + p.bright * 0.64) * (1 + z * 0.2);

        if (isLuna) {
          ctx.fillStyle =
            p.strand === 0 || p.strand === 3
              ? `rgba(124,214,255,${alpha})`
              : p.strand === 1 || p.strand === 4
              ? `rgba(95,232,200,${alpha * 0.85})`
              : `rgba(240,180,92,${alpha * 0.75})`;
        } else {
          ctx.fillStyle =
            p.strand === 0 || p.strand === 3
              ? `rgba(158,207,226,${alpha * 0.7})`
              : `rgba(239,${190 + Math.floor(p.bright * 48)},${126 + Math.floor(p.bright * 96)},${alpha})`;
        }
        const s = p.bright > 0.985 ? 1.9 : 0.5 + p.size * 0.7;
        ctx.fillRect(px, py, s, s);
        if (p.bright > 0.995) {
          ctx.fillStyle = isLuna ? 'rgba(124,214,255,.08)' : 'rgba(244,214,165,.06)';
          ctx.beginPath();
          ctx.arc(px, py, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Energy burst pulse
      if (state.current.burst && Date.now() - state.current.burst < 1800) {
        const t = (Date.now() - state.current.burst) / 1800;
        ctx.strokeStyle = isLuna
          ? `rgba(124,214,255,${(1 - t) * 0.6})`
          : `rgba(214,184,120,${(1 - t) * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, size * (0.4 + t * 2), 0, Math.PI * 2);
        ctx.stroke();
      }

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
    };
  }, []);

  return (
    <div className="relative w-full h-full min-h-[340px] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="scene-canvas"
        aria-label="SamJuniors Core interactive particle visualization. Drag to orbit and scroll to zoom."
      />

      {showLabels && (
        <div className="agent-labels pointer-events-none absolute inset-0">
          {SPECIALIST_NODES.map((a) => (
            <button
              key={a.id}
              type="button"
              className="orbital-agent pointer-events-auto"
              style={
                {
                  left: `${a.x}%`,
                  top: `${a.y}%`,
                  '--agent-color': a.isV1Active ? a.color : '#657482',
                  opacity: a.isV1Active ? 1 : 0.65,
                } as React.CSSProperties
              }
              onClick={() => {
                if (onSelectSpecialist) {
                  onSelectSpecialist(a.id);
                } else if (onSelectAgent && a.id !== 'systems' && a.id !== 'advisor') {
                  onSelectAgent(a.id as AgentRole);
                }
              }}
              title={`${a.fullName} (${a.tier}) - ${a.task}`}
            >
              <span className="orbit-node">
                <span />
              </span>
              <strong>{a.code}</strong>
              <small>
                {a.short} · {a.isV1Active ? 'v1' : 'Standby'}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
