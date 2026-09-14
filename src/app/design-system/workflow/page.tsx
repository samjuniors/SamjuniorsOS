'use client';

/**
 * SamJuniorsOS Design System — the canonical visual-language specimen.
 *
 * Organized as a component/specimen laboratory (sections A–I) so every surface
 * of the OS — Canvas, Flow, Cockpit, Activity, Epistemic Board, Inspector,
 * controls and contextual surfaces — reads as a projection of ONE operating
 * environment, not separate applications.
 *
 * Doctrine: Calm → Notice → Understand → Act → Inspect.
 * Visual grammar: ENTITY → STATE → RELATIONSHIP → WORK → RESULT → ATTENTION.
 *
 * Everything on this page is CONTROLLED SPECIMEN FIXTURE DATA, clearly
 * labeled — it consumes the REAL primitives and token sources
 * (`src/components/workflow`, `StandardSurfaces`) but never touches
 * production state, stores, or APIs. Progress values shown here are explicit
 * specimen values; the OS derives them exclusively from authoritative state.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, AlertCircle, AlertTriangle, ArrowRight, Bot, Check, CheckCircle2,
  ClipboardList, Clock, Coins, Crosshair, FileText, Hand, LayoutGrid, Layers,
  Maximize, MousePointer2, PackageCheck, Pause, Play, Scale, ShieldCheck,
  Sliders, X, Zap,
} from 'lucide-react';
import {
  Node,
  IconContainer,
  Connector,
  IconLabelContent,
  WORKFLOW_COLORS,
  EXECUTION_LANGUAGE,
  CONDUIT_LANGUAGE,
  PERIMETER_LANGUAGE,
  ENTITY_IDENTITY,
  DEPTH_TOKENS,
  type EffectsBudget,
  type NodeGeometryType,
  type ConduitKey,
  GoogleLogo,
  TelegramLogo,
  GitHubLogo,
  SlackLogo,
} from '@/components/workflow';
import { ActivitySurface, EmptyState } from '@/os/components/surfaces/StandardSurfaces';
import type { ActivityEvent } from '@/os/lib/surfaceSchema';

/* ------------------------------------------------------------------ helpers */

const EASE = 'cubic-bezier(.16,1,.3,1)';

function SectionHead({ id, title, blurb }: { id: string; title: string; blurb: string }) {
  return (
    <div className="max-w-3xl">
      <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">{id}</div>
      <h2 className="mt-1 text-base font-semibold text-white">{title}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{blurb}</p>
    </div>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{children}</div>;
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[10px] leading-relaxed text-slate-600">{children}</p>;
}

/** Node + label pairing used across entity/execution specimens. */
function NodeSpecimen({ children, top, bottom }: { children: React.ReactNode; top: string; bottom?: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      {children}
      <div className="text-center">
        <div className="text-xs font-semibold text-slate-200">{top}</div>
        {bottom && <div className="text-[10px] text-slate-500">{bottom}</div>}
      </div>
    </div>
  );
}

/** Owner-metadata chip — agents appear as owners/capabilities, never nodes. */
function OwnerChip({ name, tint }: { name: string; tint: string }) {
  return (
    <span
      className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-px text-[8.5px] font-medium tracking-wide text-slate-300"
      style={{ color: tint }}
    >
      <Bot size={9} />
      {name}
    </span>
  );
}

/** Semantic state chip straight from the frozen EXECUTION_LANGUAGE map. */
function StateChip({ semantic }: { semantic: keyof typeof EXECUTION_LANGUAGE }) {
  const lang = EXECUTION_LANGUAGE[semantic];
  return (
    <span className={`rounded border px-1.5 py-px font-mono text-[8.5px] font-semibold tracking-[0.1em] ${lang.chip}`}>
      {semantic.replace(/([A-Z])/g, ' $1').toUpperCase()}
    </span>
  );
}

/* --------------------------------------------- conduit relationship sampler */

/**
 * Renders a relationship stroke from the FROZEN CONDUIT_LANGUAGE token values
 * (base + core strokes, widths and alphas per state). Presentation-only
 * specimen of the authoritative canvas-layer treatment — no invented values.
 */
function ConduitSample({ state, width = 220 }: { state: ConduitKey; width?: number }) {
  const t = CONDUIT_LANGUAGE[state];
  const strokeFor = (prefix: string, alpha: number) => {
    // CONDUIT_LANGUAGE stores "r,g,b" prefixes; idle/neutral entries derive
    // from slate text tokens, the rest from the execution language.
    return `rgba(${prefix},${alpha})`;
  };
  const base = strokeFor(t.base, t.baseAlpha);
  const core = strokeFor(t.core, t.coreAlpha);
  const bright = strokeFor(t.bright, t.fillAlpha || t.coreAlpha);
  const fillFrac = state === 'running' || state === 'externalAction' ? 0.55 : 0;
  return (
    <svg width={width} height={44} className="overflow-visible">
      <path d={`M 0 22 C ${width * 0.3} 22, ${width * 0.7} 22, ${width} 22`} fill="none" stroke={base} strokeWidth={t.baseWidth} strokeLinecap="round" />
      <path d={`M 0 22 C ${width * 0.3} 22, ${width * 0.7} 22, ${width} 22`} fill="none" stroke={core} strokeWidth={t.coreWidth} strokeLinecap="round" />
      {fillFrac > 0 && (
        <path
          d={`M 0 22 C ${width * 0.3} 22, ${width * 0.7 * fillFrac} 22, ${width * fillFrac} 22`}
          fill="none"
          stroke={bright}
          strokeWidth={t.fillWidth}
          strokeLinecap="round"
          style={state === 'running' || state === 'externalAction' ? { filter: `drop-shadow(0 0 4px rgba(${t.bright},0.55))` } : undefined}
        />
      )}
      <circle cx={width} cy={22} r={3} fill={core} />
    </svg>
  );
}

/* -------------------------------------------------- specimen SideCard (rail) */

/** The production right-rail SideCard pattern (FlowDesktop), reproduced so
 *  contextual surfaces can be demonstrated with controlled fixtures. */
function SideCardSpec({ title, icon, count, tone, children, footer }: {
  title: string; icon?: React.ReactNode; count?: number; tone?: 'amber' | 'cyan';
  children: React.ReactNode; footer?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="shrink-0 rounded-2xl border border-white/10 bg-[#0a1120]/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_-18px_rgba(0,0,0,0.75)] backdrop-blur-md">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/90">
          {icon && <span className="text-cyan-300/80">{icon}</span>}{title}
          {!!count && <span className={`tnum rounded-full px-1.5 py-px font-mono text-[10px] ${tone === 'amber' ? 'bg-amber-300/15 text-amber-100' : 'bg-cyan-300/15 text-cyan-100'}`}>{count}</span>}
        </span>
      </button>
      <div className="overflow-hidden" style={{ maxHeight: open ? 720 : 0, opacity: open ? 1 : 0, transition: `max-height 420ms ${EASE}, opacity 280ms ease` }}>
        <div className="px-4 pb-4">{children}</div>
      </div>
      {footer && <p className="border-t border-white/[0.06] px-4 py-2 text-[8.5px] uppercase tracking-[0.18em] text-slate-600">{footer}</p>}
    </section>
  );
}

/* ----------------------------------------------------- epistemic stage chips */

const EPISTEMIC_STAGE_STYLE: Record<string, string> = {
  pending: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  verified: 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200',
  fact: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  rejected: 'border-rose-400/40 bg-rose-400/10 text-rose-200',
};

function EpistemicStageChip({ stage }: { stage: string }) {
  return (
    <span className={`shrink-0 rounded border px-1 py-px font-mono text-[8.5px] font-semibold uppercase tracking-[0.14em] ${EPISTEMIC_STAGE_STYLE[stage] ?? EPISTEMIC_STAGE_STYLE.pending}`}>
      {stage}
    </span>
  );
}

/* ------------------------------------------------------------------ fixtures */

const FIXTURE_ACTIVITY: ActivityEvent[] = [
  {
    id: 'spec-1', at: Date.now() - 1000 * 60 * 4, actor: 'sophia', text: 'Workstream completed all protocol stages',
    status: 'completed', server: true, kind: 'work',
    provenance: { workstreamTitle: 'Margin model v2', agentRunId: 'run_spec_000000000000', workflowInstanceId: 'wfi_spec_00000000' },
  },
  {
    id: 'spec-2', at: Date.now() - 1000 * 60 * 26, actor: 'founder', text: 'Founder approved external action',
    status: 'approved', server: true, kind: 'decision',
    provenance: { approvalId: 'apr_spec_0000000000', agentRunId: 'run_spec_000000000001' },
  },
  {
    id: 'spec-3', at: Date.now() - 1000 * 60 * 61, actor: 'scheduler', text: 'Scheduled occurrence executed',
    status: 'in_flight', server: true, kind: 'info',
    provenance: { scheduleId: 'sch_spec_000000000', occurrenceNumber: 14 },
  },
];

/* ================================================================== the page */

export default function WorkflowDesignSystemSpecimen() {
  const [budget, setBudget] = useState<EffectsBudget>('full');
  const [reduced, setReduced] = useState(false);
  const [lens, setLens] = useState(false);
  const router = useRouter();

  return (
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden bg-[#030711] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 select-text">
      {/* Route toggle: design-system specimen ⇄ main canvas (navigation) */}
      <button
        onClick={() => router.push('/')}
        title="Back to the SamJuniorsOS canvas"
        aria-label="Back to the SamJuniorsOS canvas"
        className="group fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 backdrop-blur-md transition-all duration-200 hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-100 active:scale-95"
      >
        <LayoutGrid size={12} className="text-slate-400 transition-colors duration-200 group-hover:text-cyan-300" />
        <span>Canvas</span>
      </button>

      {/* CALM BASELINE background — faint grid only. No ambient particles, no
          decorative glow blobs: an ordinary documentation surface stays quiet. */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      {/* Main Container */}
      <div className="relative z-10 mx-auto max-w-[1520px] px-4 py-8 sm:px-6 lg:px-10">
        {/* ===================== TOP HEADER ===================== */}
        <header className="mb-8 border-b border-white/[0.1] pb-7">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <span className="sj-control inline-flex items-center gap-1.5 rounded-full border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  SamJuniorsOS · Design System
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-[0.08em] text-white sm:text-3xl">
                Canonical Visual Language
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                One operating environment. Canvas, Flow, Cockpit, Activity, Epistemic Board, Inspector and controls
                are projections of the same OS — never separate applications.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">
                <span className="text-cyan-300/80">Calm</span><span className="text-slate-700">→</span>
                <span className="text-cyan-300/80">Notice</span><span className="text-slate-700">→</span>
                <span className="text-cyan-300/80">Understand</span><span className="text-slate-700">→</span>
                <span className="text-cyan-300/80">Act</span><span className="text-slate-700">→</span>
                <span className="text-cyan-300/80">Inspect</span>
                <span className="mx-1 hidden h-3 w-px bg-white/10 sm:block" />
                <span className="text-slate-500">Entity · State · Relationship · Work · Result · Attention</span>
              </div>
            </div>

            {/* Budget + reduced-motion controls */}
            <div className="sj-surface flex flex-wrap items-center gap-4 rounded-xl p-2">
              <div className="flex items-center gap-2 pl-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Sliders size={14} className="text-cyan-400" />
                <span>Budget:</span>
              </div>
              <div className="flex items-center gap-1">
                {(['full', 'balanced', 'minimal'] as EffectsBudget[]).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setBudget(lvl)}
                    className={`sj-control rounded-lg px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${budget === lvl ? 'text-cyan-200' : 'text-slate-400'}`}
                    data-active={budget === lvl}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setReduced((v) => !v)}
                title="Demonstrate prefers-reduced-motion rendering (static final states, no orbit, no transitions)"
                className={`sj-control rounded-lg px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${reduced ? 'text-amber-200' : 'text-slate-400'}`}
                data-active={reduced}
              >
                Reduced motion
              </button>
            </div>
          </div>

          {/* Specimen-data honesty banner */}
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-1.5 text-[11px] leading-snug text-amber-200/90">
            <AlertTriangle size={12} className="shrink-0 text-amber-300" />
            <span><span className="font-semibold">Specimen fixtures only.</span> Everything on this page is controlled
            specimen data rendered through the real primitives — never production company state. Progress values are
            explicit specimen values; the OS derives them exclusively from authoritative execution records.</span>
          </div>
        </header>

        {/* ===================== GRID SECTIONS ===================== */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">

          {/* ============ A. FOUNDATIONS ============ */}
          <section className="sj-surface rounded-2xl p-6 lg:col-span-12">
            <SectionHead
              id="A · FOUNDATIONS"
              title="Background, Surfaces, Type, Spacing & Semantic States"
              blurb="The obsidian-glass material system every OS surface is built from. Dark ambient baseline; hairline specular borders; one typography scale; semantic color = runtime state, never decoration."
            />

            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* A1 — backgrounds */}
              <div>
                <SubHead>A1 · Backgrounds & void</SubHead>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { hex: WORKFLOW_COLORS.bgVoid, label: 'bgVoid', use: 'app shell' },
                    { hex: '#030711', label: 'canvas', use: 'flow canvas' },
                    { hex: '#060c18', label: 'rail glass', use: 'rails / header' },
                    { hex: '#0a1120', label: 'sidecard', use: 'rail cards' },
                    { hex: WORKFLOW_COLORS.bgGlass, label: 'bgGlass', use: 'floating panels' },
                    { hex: WORKFLOW_COLORS.background, label: 'background', use: 'node fill base' },
                  ].map((c) => (
                    <div key={c.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <span className="block h-8 w-full rounded-lg border border-white/15" style={{ backgroundColor: c.hex }} />
                      <div className="mt-2 text-[11px] font-semibold text-white">{c.label}</div>
                      <div className="text-[9px] font-mono text-slate-500">{c.hex}</div>
                      <div className="text-[9px] text-slate-600">{c.use}</div>
                    </div>
                  ))}
                </div>
                <Caption>Deep obsidian layers only — the default canvas is quiet, monochrome and spatial. No decorative gradients.</Caption>
              </div>

              {/* A2 — borders & glass tiers */}
              <div>
                <SubHead>A2 · Surfaces & specular hairlines</SubHead>
                <div className="mt-3 space-y-2">
                  <div className="rounded-2xl border border-white/[0.08] bg-[#060c18]/80 p-3 text-[11px] text-slate-300 backdrop-blur-md">
                    Rail glass <span className="font-mono text-[9px] text-slate-500">border-white/[0.08] · backdrop-blur</span>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#0a1120]/85 p-3 text-[11px] text-slate-300 backdrop-blur-md">
                    SideCard glass <span className="font-mono text-[9px] text-slate-500">border-white/10 · inset highlight</span>
                  </div>
                  <div className="rounded-xl border border-cyan-200/25 bg-[#081120]/95 p-3 text-[11px] text-slate-300 backdrop-blur-xl">
                    Inspector glass <span className="font-mono text-[9px] text-slate-500">floating contextual panel</span>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
                    Inset well <span className="text-slate-600">· lifecycle strips, domain grids</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-4 text-[10px] font-mono text-slate-500">
                  <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded border border-white/[0.08]" />subtle 0.08</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded border border-white/[0.14]" />default 0.14</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded border border-white/[0.22]" />elevated 0.22</span>
                </div>
                <Caption>One glass family: obsidian fill + white hairline + soft inner highlight. Inset wells are near-black, never a second tinted material.</Caption>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* A3 — typography */}
              <div>
                <SubHead>A3 · Typography scale</SubHead>
                <div className="mt-3 space-y-3 rounded-xl border border-white/[0.06] bg-black/30 p-4">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600">Section eyebrow · mono 11px · tracking 0.24em</div>
                    <div className="mt-1 text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-300">COMPANY CONTEXT · SPATIAL</div>
                  </div>
                  <div className="border-t border-white/[0.06] pt-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600">Node title · 12.5px semibold</div>
                    <div className="mt-1 text-[12.5px] font-semibold text-slate-100">Margin model v2 · unit economics</div>
                  </div>
                  <div className="border-t border-white/[0.06] pt-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600">Body · 11.5px relaxed</div>
                    <div className="mt-1 text-[11.5px] leading-relaxed text-slate-300">Verified outcomes and escalated decisions reach the founder.</div>
                  </div>
                  <div className="border-t border-white/[0.06] pt-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600">Meta · mono 8.5px · tabular numerics</div>
                    <div className="tnum mt-1 font-mono text-[8.5px] tracking-[0.12em] text-slate-500">TRAIL 4/9 · RUN 8F2C · 12.4S</div>
                  </div>
                </div>
                <Caption>Sans for reading, mono for machine truth. All numbers tabular (<span className="font-mono">.tnum</span>) so state never jitters.</Caption>
              </div>

              {/* A4 — spacing rhythm */}
              <div>
                <SubHead>A4 · Spacing rhythm</SubHead>
                <div className="mt-3 space-y-2 rounded-xl border border-white/[0.06] bg-black/30 p-4">
                  {[4, 6, 8, 12, 16, 24].map((s) => (
                    <div key={s} className="flex items-center gap-3">
                      <span className="w-10 text-right font-mono text-[9px] text-slate-500">{s}px</span>
                      <span className="h-2 rounded bg-cyan-400/25" style={{ width: s * 6 }} />
                    </div>
                  ))}
                </div>
                <Caption>Tight internal rhythm (4/6/8) inside cards; 12/16 between surfaces; generous negative space is the default state — spacious, quiet, minimal persistent telemetry.</Caption>
              </div>

              {/* A5 — semantic states */}
              <div>
                <SubHead>A5 · Semantic states (frozen 4.3C)</SubHead>
                <div className="mt-3 space-y-1.5 rounded-xl border border-white/[0.06] bg-black/30 p-4">
                  {(Object.keys(EXECUTION_LANGUAGE) as Array<keyof typeof EXECUTION_LANGUAGE>).map((k) => (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <StateChip semantic={k} />
                      <span className="truncate font-mono text-[9px] text-slate-600">{EXECUTION_LANGUAGE[k].token}</span>
                    </div>
                  ))}
                </div>
                <Caption>Color = runtime state, never agent identity. Amber static = governance attention, never animated like execution. Neutral gray = idle.</Caption>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* A6 — icon treatment */}
              <div>
                <SubHead>A6 · Icon treatment</SubHead>
                <div className="mt-3 flex flex-wrap items-start justify-around gap-5 rounded-xl border border-white/[0.06] bg-black/30 p-4">
                  <div className="flex flex-col items-center gap-2">
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.primary}><Bot size={20} className="text-cyan-300" /></IconContainer>
                    <span className="text-[9px] text-slate-500">glass · entity</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <IconContainer variant="filled" size="md" color={WORKFLOW_COLORS.processing}><Zap size={20} className="text-orange-200" /></IconContainer>
                    <span className="text-[9px] text-slate-500">filled · action</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <IconContainer variant="brand" size="md"><span style={{ display: 'flex', lineHeight: 0 }}><GoogleLogo size={22} /></span></IconContainer>
                    <span className="text-[9px] text-slate-500">brand · identity</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <IconContainer variant="brand" size="md"><span style={{ display: 'flex', lineHeight: 0 }}><GitHubLogo size={22} /></span></IconContainer>
                    <span className="text-[9px] text-slate-500">brand · identity</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <IconContainer variant="brand" size="md"><span style={{ display: 'flex', lineHeight: 0 }}><SlackLogo size={22} /></span></IconContainer>
                    <span className="text-[9px] text-slate-500">brand · identity</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <IconContainer variant="brand" size="md"><span style={{ display: 'flex', lineHeight: 0 }}><TelegramLogo size={22} /></span></IconContainer>
                    <span className="text-[9px] text-slate-500">brand · identity</span>
                  </div>
                </div>
                <Caption>Lucide glyphs at 1.8 stroke inside glass containers. Genuinely-matched external services keep their official flat mark — the logo is the identity; state lives on the perimeter, never on the mark.</Caption>
              </div>

              {/* A7 — focus & selection */}
              <div>
                <SubHead>A7 · Focus & selection</SubHead>
                <div className="mt-3 flex flex-wrap items-center justify-around gap-6 rounded-xl border border-white/[0.06] bg-black/30 p-4">
                  <NodeSpecimen top="default" bottom="resting · no ring">
                    <Node geometry="circle" size="sm" budget={budget}>
                      <IconContainer variant="glass" size="sm" color={WORKFLOW_COLORS.textMuted}><Bot size={16} className="text-slate-400" /></IconContainer>
                    </Node>
                  </NodeSpecimen>
                  <NodeSpecimen top="selected" bottom="primary emphasis ring">
                    <Node geometry="circle" size="sm" state="selected" budget={budget}>
                      <IconContainer variant="glass" size="sm" color={WORKFLOW_COLORS.primary}><Bot size={16} className="text-cyan-300" /></IconContainer>
                    </Node>
                  </NodeSpecimen>
                  <NodeSpecimen top="hover" bottom="lift + hairline">
                    <Node geometry="circle" size="sm" state="hover" budget={budget}>
                      <IconContainer variant="glass" size="sm" color={WORKFLOW_COLORS.textMuted}><Bot size={16} className="text-slate-300" /></IconContainer>
                    </Node>
                  </NodeSpecimen>
                </div>
                <Caption>Selection is a static primary-family ring ({'{'}DEPTH_TOKENS.nodeSelected{'}'} — 2px ring + restrained halo). It never animates and never implies execution energy. Keyboard focus follows the same treatment.</Caption>
              </div>
            </div>
          </section>

          {/* ============ B. CORE ENTITIES ============ */}
          <section className="sj-surface rounded-2xl p-6 lg:col-span-12">
            <SectionHead
              id="B · CORE ENTITIES"
              title="Company, Work, Research, Result & Decision Objects"
              blurb="The entity taxonomy of the spatial company context. Every object pairs an identity (icon/tint/owner) with a runtime state — agents appear as capability owners in metadata, never as pipeline nodes."
            />

            <div className="mt-6 flex flex-wrap items-start justify-around gap-7">
              <NodeSpecimen top="Company entity" bottom="circle · founder tint">
                <Node geometry="circle" size="md" budget={budget}>
                  <IconContainer variant="glass" size="md" color={ENTITY_IDENTITY.founder}><ClipboardList size={20} className="text-sky-300" /></IconContainer>
                </Node>
              </NodeSpecimen>
              <NodeSpecimen top="Agent capability" bottom="identity tint · owner metadata">
                <Node geometry="circle" size="md" budget={budget}>
                  <IconContainer variant="glass" size="md" color={ENTITY_IDENTITY.sophia}><Bot size={20} className="text-orange-300" /></IconContainer>
                </Node>
              </NodeSpecimen>
              <div className="flex flex-col items-center gap-2.5">
                <Node geometry="squircle" size="md" state="active" budget={budget} perimeter={{ semantic: 'running', progress: 0.45 }}>
                  <div className="flex h-full w-full flex-col justify-between p-3">
                    <div className="flex items-start gap-2.5">
                      <IconContainer variant="glass" size="sm" color={WORKFLOW_COLORS.primary}><Activity size={14} className="text-cyan-300" /></IconContainer>
                      <div className="min-w-0">
                        <div className="truncate text-left text-[12.5px] font-semibold text-slate-100">Margin model v2</div>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <StateChip semantic="running" />
                          <OwnerChip name="CRUZ" tint={ENTITY_IDENTITY.cruz} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end"><span className="tnum font-mono text-[8.5px] tracking-wider text-slate-500">TRAIL 4/9</span></div>
                  </div>
                </Node>
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-200">Work object</div>
                  <div className="text-[10px] text-slate-500">squircle · state + owner + trail</div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2.5">
                <Node geometry="squircle" size="md" state="processing" budget={budget} perimeter={{ semantic: 'externalAction', progress: 0.6 }}>
                  <IconLabelContent
                    icon={<ClipboardList size={18} className="text-orange-300" />}
                    label="Market scan"
                    sublabel="gated research"
                    color={WORKFLOW_COLORS.processing}
                  />
                </Node>
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-200">Research object</div>
                  <div className="text-[10px] text-slate-500">external action · evidence source</div>
                </div>
              </div>
              <NodeSpecimen top="Result / artifact" bottom="completed · governed vault">
                <Node geometry="squircle" size="md" state="success" budget={budget} perimeter={{ semantic: 'completed', progress: 1 }}>
                  <IconLabelContent
                    icon={<PackageCheck size={18} className="text-emerald-300" />}
                    label="Margin report"
                    sublabel="verified artifact"
                    color={WORKFLOW_COLORS.success}
                  />
                </Node>
              </NodeSpecimen>
              <NodeSpecimen top="Decision point" bottom="static amber boundary">
                <Node geometry="circle" size="md" budget={budget} indicator={{ status: 'waiting', glow: true }} perimeter={{ semantic: 'approval' }}>
                  <IconContainer variant="glass" size="md" color={ENTITY_IDENTITY.approval}><Scale size={20} className="text-amber-300" /></IconContainer>
                </Node>
              </NodeSpecimen>
              <NodeSpecimen top="Blocked" bottom="stops at last known progress">
                <Node geometry="squircle" size="md" state="error" budget={budget} perimeter={{ semantic: 'blocked', progress: 0.35 }}>
                  <IconLabelContent
                    icon={<AlertCircle size={18} className="text-rose-300" />}
                    label="Pricing sync"
                    sublabel="intervention required"
                    color={WORKFLOW_COLORS.error}
                  />
                </Node>
              </NodeSpecimen>
              <NodeSpecimen top="Verifier" bottom="deterministic gate">
                <Node geometry="circle" size="md" state="success" budget={budget} perimeter={{ semantic: 'completed', progress: 1 }}>
                  <IconContainer variant="glass" size="md" color={ENTITY_IDENTITY.verifier}><ShieldCheck size={20} className="text-emerald-300" /></IconContainer>
                </Node>
              </NodeSpecimen>
            </div>

            <Caption>
              Entity identity (icon + tint + owner chip) and execution state (perimeter + chip) are two orthogonal axes —
              a work object keeps its owner while its state advances. Sophia and Thorne surface as capability owners in
              metadata labels, so the founder sees what the <span className="text-slate-400">company</span> is accomplishing, not internal agent message-passing.
            </Caption>
          </section>

          {/* ============ C. EXECUTION LANGUAGE ============ */}
          <section className="sj-surface rounded-2xl p-6 lg:col-span-12">
            <SectionHead
              id="C · EXECUTION LANGUAGE"
              title="The 4.3E Perimeter — the Single Progress Language"
              blurb="A loading/progress stroke rendered ON the node's own shape — never a second decorative circle, never a generic spinner, never a fabricated percentage. Starts at 12 o'clock, fills clockwise, completes at the top."
            />

            {/* C1 — measured progressive fill */}
            <div className="mt-7">
              <SubHead>C1 · Measured progress — circular entity (identity preserved)</SubHead>
              <div className="mt-5 flex flex-wrap items-start justify-around gap-6">
                {[0, 0.25, 0.5, 0.75, 1].map((p) => (
                  <NodeSpecimen key={p} top={`${Math.round(p * 100)}%`} bottom={p === 0 ? 'no perimeter' : p === 1 ? 'complete · settles' : 'clockwise fill'}>
                    <Node geometry="circle" size="md" budget={budget} perimeter={{ semantic: 'running', progress: p }}>
                      <IconContainer variant="brand" size="md"><span style={{ display: 'flex', lineHeight: 0 }}><GoogleLogo size={22} /></span></IconContainer>
                    </Node>
                  </NodeSpecimen>
                ))}
              </div>
              <Caption>The brand mark stays recognizable in every state — identity is the logo; blue/cyan is execution state.</Caption>
            </div>

            {/* C2 — work object progressive fill */}
            <div className="mt-7">
              <SubHead>C2 · Measured progress — work object (the shape itself owns the perimeter)</SubHead>
              <div className="mt-5 flex flex-wrap items-start justify-around gap-6">
                {[0.25, 0.5, 0.75, 1].map((p) => (
                  <NodeSpecimen key={p} top={`${Math.round(p * 100)}%`} bottom={`TRAIL ${Math.round(p * 9)}/9`}>
                    <Node geometry="rectangle" size="md" budget={budget} perimeter={{ semantic: 'running', progress: p }}>
                      <div className="flex items-center gap-2.5">
                        <IconContainer variant="glass" size="sm" color={WORKFLOW_COLORS.primary}><Activity size={14} className="text-cyan-300" /></IconContainer>
                        <div className="text-left">
                          <div className="text-[11px] font-semibold text-slate-200">Work object</div>
                          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Trail {Math.round(p * 9)}/9</div>
                        </div>
                      </div>
                    </Node>
                  </NodeSpecimen>
                ))}
              </div>
              <Caption>The stroke follows the card's rounded-rectangle outline — never a circular ring inside the rectangle.</Caption>
            </div>

            {/* C3 — six canonical states */}
            <div className="mt-7">
              <SubHead>C3 · The six canonical states</SubHead>
              <div className="mt-5 flex flex-wrap items-start justify-around gap-6">
                <NodeSpecimen top="IDLE" bottom="no perimeter · calm">
                  <Node geometry="circle" size="md" budget={budget}>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.textMuted}><Clock size={20} className="text-slate-400" /></IconContainer>
                  </Node>
                </NodeSpecimen>
                <NodeSpecimen top="RUNNING" bottom="blue · progressive">
                  <Node geometry="circle" size="md" state="active" budget={budget} perimeter={{ semantic: 'running', progress: 0.5 }}>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.primary}><Bot size={20} className="text-cyan-300" /></IconContainer>
                  </Node>
                </NodeSpecimen>
                <NodeSpecimen top="EXTERNAL ACTION" bottom="amber · strongest">
                  <Node geometry="circle" size="md" state="processing" budget={budget} perimeter={{ semantic: 'externalAction', progress: 0.6 }}>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.processing}><Zap size={20} className="text-orange-300" /></IconContainer>
                  </Node>
                </NodeSpecimen>
                <NodeSpecimen top="COMPLETED" bottom="100% · settled green">
                  <Node geometry="circle" size="md" state="success" budget={budget} perimeter={{ semantic: 'completed', progress: 1 }}>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.success}><CheckCircle2 size={20} className="text-emerald-300" /></IconContainer>
                  </Node>
                </NodeSpecimen>
                <NodeSpecimen top="BLOCKED" bottom="stops at known progress">
                  <Node geometry="circle" size="md" state="error" budget={budget} perimeter={{ semantic: 'blocked', progress: 0.35 }}>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.error}><AlertCircle size={20} className="text-rose-300" /></IconContainer>
                  </Node>
                </NodeSpecimen>
                <NodeSpecimen top="APPROVAL REQUIRED" bottom="static amber · never progress">
                  <Node geometry="circle" size="md" budget={budget} indicator={{ status: 'waiting', glow: true }} perimeter={{ semantic: 'approval' }}>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.processing}><Scale size={20} className="text-amber-300" /></IconContainer>
                  </Node>
                </NodeSpecimen>
              </div>
            </div>

            {/* C4 — measured vs unmeasured + reduced motion */}
            <div className="mt-7">
              <SubHead>C4 · Measured vs unmeasured vs reduced motion</SubHead>
              <div className="mt-5 flex flex-wrap items-start justify-around gap-6">
                <NodeSpecimen top="MEASURED" bottom="0.5 · from the trail only">
                  <Node geometry="circle" size="md" state="active" budget={budget} perimeter={{ semantic: 'running', progress: 0.5 }} forceReducedMotion={reduced}>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.primary}><Bot size={20} className="text-cyan-300" /></IconContainer>
                  </Node>
                </NodeSpecimen>
                <NodeSpecimen top="UNMEASURED" bottom="quarter arc · spinner semantics">
                  <Node geometry="circle" size="md" state="active" budget={budget} perimeter={{ semantic: 'running' }} forceReducedMotion={reduced}>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.primary}><Bot size={20} className="text-cyan-300" /></IconContainer>
                  </Node>
                </NodeSpecimen>
                <NodeSpecimen top="REDUCED MOTION" bottom="static final state · no orbit">
                  <Node geometry="circle" size="md" state="active" budget={budget} perimeter={{ semantic: 'running', progress: 0.62 }} forceReducedMotion>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.primary}><Bot size={20} className="text-cyan-300" /></IconContainer>
                  </Node>
                </NodeSpecimen>
              </div>
              <Caption>
                Unmeasured active execution renders a restrained quarter arc that orbits slowly — it never implies a percentage.
                Under <span className="font-mono text-slate-500">prefers-reduced-motion</span> (and via the header toggle) the correct
                static final state renders with no continuous animation.
              </Caption>
            </div>

            {/* C5 — verifier lifecycle */}
            <div className="mt-7">
              <SubHead>C5 · Constitutional verifier — VERIFYING → VERIFIED</SubHead>
              <div className="mt-5 flex flex-wrap items-start justify-around gap-8">
                <NodeSpecimen top="IDLE" bottom="neutral · no perimeter">
                  <Node geometry="circle" size="md" budget={budget}>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.textMuted}><ShieldCheck size={20} className="text-slate-400" /></IconContainer>
                  </Node>
                </NodeSpecimen>
                <NodeSpecimen top="VERIFYING" bottom="unmeasured — state-driven">
                  <Node geometry="circle" size="md" state="active" budget={budget} perimeter={{ semantic: 'running' }} forceReducedMotion={reduced}>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.primary}><ShieldCheck size={20} className="text-cyan-300" /></IconContainer>
                  </Node>
                </NodeSpecimen>
                <NodeSpecimen top="VERIFIED" bottom="100% · settles green">
                  <Node geometry="circle" size="md" state="success" budget={budget} perimeter={{ semantic: 'completed', progress: 1 }}>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.success}><ShieldCheck size={20} className="text-emerald-300" /></IconContainer>
                  </Node>
                </NodeSpecimen>
              </div>
            </div>

            {/* Contract notes */}
            <div className="mt-7 rounded-xl border border-white/[0.06] bg-black/40 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Behavioral contract (frozen)</div>
              <ul className="mt-2 grid gap-1.5 text-[10.5px] text-slate-400 sm:grid-cols-2">
                <li>· Start 12 o'clock · CLOCKWISE · one direction system-wide · completes at the top</li>
                <li>· The stroke follows the node's actual shape — never a nested ring, never an extra circle</li>
                <li>· 0% = no perimeter · 100% = complete perimeter · progress ONLY from the authoritative trail</li>
                <li>· Unmeasured active = restrained quarter arc — never a fabricated percentage</li>
                <li>· Approval = static amber boundary — governance, never animated as execution</li>
                <li>· Logo = identity · perimeter = execution state · edge signal = movement</li>
                <li>· Blocked stops at the last known progress · completed settles into restrained green</li>
                <li>· prefers-reduced-motion: correct static progress state, no orbit, no transitions</li>
              </ul>
              <p className="mt-3 border-t border-white/[0.06] pt-3 text-[10.5px] text-slate-500">
                The perimeter is the <span className="text-slate-300">single progress language</span> of the OS —
                generic spinners, progress bars, fake percentages and duplicated progress indicators are prohibited.
                Derived from <span className="font-mono text-slate-400">PERIMETER_LANGUAGE</span> · stroke {PERIMETER_LANGUAGE.strokeWidth}px ·
                transition {PERIMETER_LANGUAGE.transitionMs}ms.
              </p>
            </div>
          </section>

          {/* ============ D. RELATIONSHIPS ============ */}
          <section className="sj-surface rounded-2xl p-6 lg:col-span-12">
            <SectionHead
              id="D · RELATIONSHIPS"
              title="Conduit Semantics — Idle, Active, Signal, Completed, Blocked, Governance"
              blurb="How a relationship renders per execution state, drawn from the frozen CONDUIT_LANGUAGE token values. Animation represents actual state semantics — a comet means real execution energy is traveling; everything else stays static."
            />

            <div className="mt-6 overflow-x-auto">
              <div className="min-w-[760px] space-y-3">
                {([
                  { key: 'idle' as ConduitKey, label: 'IDLE', note: 'thin · static · monochrome — the calm schematic baseline' },
                  { key: 'running' as ConduitKey, label: 'RUNNING', note: 'blue/cyan activation · additive energy · progressive fill' },
                  { key: 'externalAction' as ConduitKey, label: 'EXTERNAL ACTION', note: 'amber/gold execution pulse · additive · progressive fill' },
                  { key: 'blocked' as ConduitKey, label: 'BLOCKED', note: 'restrained red · gentle state pulse only · no particles' },
                  { key: 'completed' as ConduitKey, label: 'COMPLETED', note: 'restrained green settled state · static' },
                  { key: 'governance' as ConduitKey, label: 'GOVERNANCE', note: 'static amber approval boundary — never animated like execution' },
                ]).map(({ key, label, note }) => (
                  <div key={key} className="flex items-center gap-5 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                    <span className="w-36 shrink-0 font-mono text-[10px] font-semibold tracking-[0.14em] text-slate-300">{label}</span>
                    <ConduitSample state={key} />
                    <span className="min-w-0 flex-1 text-[10px] leading-snug text-slate-500">{note}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* signal / comet on the routed path */}
            <div className="mt-7">
              <SubHead>D2 · Edge signal + perimeter — source active → signal travels → destination fills</SubHead>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
                <NodeSpecimen top="SOURCE" bottom="identity mark">
                  <Node geometry="circle" size="md" budget={budget}>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.textMuted}><Bot size={20} className="text-slate-400" /></IconContainer>
                  </Node>
                </NodeSpecimen>
                <svg width={240} height={64} className="overflow-visible">
                  <Connector x1={0} y1={32} x2={240} y2={32} type="animated" tone="blue" hasArrow budget={budget} />
                </svg>
                <NodeSpecimen top="DESTINATION" bottom="perimeter begins filling">
                  <Node geometry="circle" size="md" state="active" budget={budget} perimeter={{ semantic: 'running', progress: 0.35 }} forceReducedMotion={reduced}>
                    <IconContainer variant="glass" size="md" color={WORKFLOW_COLORS.primary}><Activity size={20} className="text-cyan-300" /></IconContainer>
                  </Node>
                </NodeSpecimen>
              </div>
              <Caption>
                The signal travels the exact rendered relationship path (never an independent particle system); on arrival
                the destination's perimeter reflects its authoritative execution state. Execution sequence: source fills →
                connection progressively fills → directional energy travels the same path → target activates → settles.
              </Caption>
            </div>
          </section>

          {/* ============ E. WORKFLOW ============ */}
          <section className="sj-surface rounded-2xl p-6 lg:col-span-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <SectionHead
                id="E · WORKFLOW"
                title="The Compact Execution Sequence"
                blurb="Work → Research → Compare → Analyze → Verify → Result: one company workstream advancing through authoritative stages. Sophia and Thorne appear as owner metadata — never as baton-passing pipeline nodes."
              />
            </div>

            <div className="mt-6 overflow-x-auto">
              <div className="min-w-[1020px] rounded-2xl border border-white/[0.08] bg-[#02050e] p-8">
                <div className="flex items-center justify-between gap-3">
                  {/* WORK */}
                  <div className="flex flex-col items-center gap-2">
                    <Node geometry="squircle" size="md" state="active" budget={budget} perimeter={{ semantic: 'running', progress: 0.45 }} forceReducedMotion={reduced}>
                      <div className="flex h-full w-full flex-col justify-between p-3">
                        <div className="flex items-start gap-2">
                          <IconContainer variant="glass" size="sm" color={WORKFLOW_COLORS.primary}><Activity size={13} className="text-cyan-300" /></IconContainer>
                          <div className="min-w-0">
                            <div className="truncate text-left text-[11px] font-semibold text-slate-100">Pricing revision</div>
                            <div className="mt-1 flex items-center gap-1"><StateChip semantic="running" /></div>
                          </div>
                        </div>
                        <div className="flex items-center justify-end"><span className="tnum font-mono text-[8px] text-slate-500">TRAIL 2/5</span></div>
                      </div>
                    </Node>
                    <OwnerChip name="SOPHIA" tint={ENTITY_IDENTITY.sophia} />
                  </div>
                  <svg width={96} height={40} className="shrink-0 overflow-visible"><Connector x1={0} y1={20} x2={96} y2={20} type="animated" tone="blue" budget={budget} /></svg>

                  {/* RESEARCH */}
                  <div className="flex flex-col items-center gap-2">
                    <Node geometry="squircle" size="md" state="success" budget={budget} perimeter={{ semantic: 'completed', progress: 1 }}>
                      <IconLabelContent icon={<ClipboardList size={16} className="text-emerald-300" />} label="Market scan" sublabel="evidence sourced" color={WORKFLOW_COLORS.success} />
                    </Node>
                    <OwnerChip name="THORNE" tint={ENTITY_IDENTITY.thorne} />
                  </div>
                  <svg width={96} height={40} className="shrink-0 overflow-visible"><Connector x1={0} y1={20} x2={96} y2={20} type="curved" tone="green" budget={budget} /></svg>

                  {/* COMPARE */}
                  <div className="flex flex-col items-center gap-2">
                    <Node geometry="squircle" size="md" state="active" budget={budget} perimeter={{ semantic: 'running' }} forceReducedMotion={reduced}>
                      <IconLabelContent icon={<Layers size={16} className="text-cyan-300" />} label="Compare" sublabel="vs. benchmark" color={WORKFLOW_COLORS.primary} />
                    </Node>
                    <OwnerChip name="THORNE" tint={ENTITY_IDENTITY.thorne} />
                  </div>
                  <svg width={96} height={40} className="shrink-0 overflow-visible"><Connector x1={0} y1={20} x2={96} y2={20} type="curved" tone="blue" budget={budget} /></svg>

                  {/* ANALYZE */}
                  <div className="flex flex-col items-center gap-2">
                    <Node geometry="squircle" size="md" budget={budget}>
                      <IconLabelContent icon={<Coins size={16} className="text-slate-400" />} label="Analyze" sublabel="queued" color={WORKFLOW_COLORS.textMuted} />
                    </Node>
                    <OwnerChip name="CRUZ" tint={ENTITY_IDENTITY.cruz} />
                  </div>
                  <svg width={96} height={40} className="shrink-0 overflow-visible"><Connector x1={0} y1={20} x2={96} y2={20} type="dashed" tone="blue" budget={budget} /></svg>

                  {/* VERIFY */}
                  <div className="flex flex-col items-center gap-2">
                    <Node geometry="circle" size="md" budget={budget} indicator={{ status: 'waiting', glow: true }} perimeter={{ semantic: 'approval' }}>
                      <IconContainer variant="glass" size="md" color={ENTITY_IDENTITY.verifier}><ShieldCheck size={19} className="text-emerald-300" /></IconContainer>
                    </Node>
                    <span className="font-mono text-[8.5px] uppercase tracking-wide text-slate-500">verifier · gate</span>
                  </div>
                  <svg width={96} height={40} className="shrink-0 overflow-visible"><Connector x1={0} y1={20} x2={96} y2={20} type="branch" tone="orange" budget={budget} /></svg>

                  {/* RESULT */}
                  <div className="flex flex-col items-center gap-2">
                    <Node geometry="squircle" size="md" state="success" budget={budget} perimeter={{ semantic: 'completed', progress: 1 }}>
                      <IconLabelContent icon={<FileText size={16} className="text-emerald-300" />} label="Margin report" sublabel="governed result" color={WORKFLOW_COLORS.success} />
                    </Node>
                    <OwnerChip name="SOPHIA" tint={ENTITY_IDENTITY.sophia} />
                  </div>
                </div>
              </div>
            </div>
            <Caption>
              The founder sees what the company is accomplishing — a workstream with owners, stages, a governance gate and a
              verified result. There is no Founder → Sophia → Agent → Sophia baton-passing visual model; agents never become
              pipeline nodes. Dashed = queued dependency · animated = live energy · amber branch = governance escalation.
            </Caption>
          </section>

          {/* ============ F. CANVAS ============ */}
          <section className="sj-surface rounded-2xl p-6 lg:col-span-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <SectionHead
                id="F · CANVAS"
                title="Spatial Company Context"
                blurb="The canvas is a spatial map of the company — regions, entities, work and relationships — with contextual expansion on selection and a focused work lens. It is NOT a drag-and-drop workflow builder."
              />
              <button
                onClick={() => setLens((v) => !v)}
                className={`sj-control shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${lens ? 'text-cyan-200' : 'text-slate-400'}`}
                data-active={lens}
              >
                {lens ? 'Lens: focused' : 'Focus lens'}
              </button>
            </div>

            {/* Bounded canvas specimen */}
            <div className="relative mt-6 h-[440px] overflow-hidden rounded-2xl border border-white/10 bg-[#030710] shadow-[0_30px_80px_-24px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)]">
              {/* grid */}
              <div
                className="absolute inset-0 opacity-[0.5]"
                style={{
                  backgroundImage: 'linear-gradient(rgba(120,170,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(120,170,255,0.08) 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                }}
              />
              {/* region zones */}
              <div className="absolute left-[6%] top-[6%] h-[34%] w-[38%] rounded-[26px] border border-white/[0.06]">
                <span className="absolute left-4 top-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-600">COMPANY CONTEXT</span>
              </div>
              <div className="absolute left-[30%] top-[44%] h-[38%] w-[46%] rounded-[26px] border border-white/[0.06]">
                <span className="absolute left-4 top-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-600">ACTIVE WORK</span>
              </div>
              <div className="absolute bottom-[6%] right-[6%] h-[30%] w-[30%] rounded-[26px] border border-white/[0.06]">
                <span className="absolute left-4 top-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-600">GOVERNED OUTCOMES</span>
              </div>

              {/* relationships (SVG world layer) */}
              <svg className="absolute inset-0 h-full w-full overflow-visible">
                {/* idle: founder → sophia (neutral structural) */}
                <Connector x1={145} y1={95} x2={235} y2={130} type="curved" tone="blue" budget={budget} className="opacity-30" />
                {/* running: sophia → work A (live energy) */}
                <Connector x1={280} y1={165} x2={330} y2={245} type="animated" tone="blue" budget={budget} />
                {/* governance: work B → verifier (static amber) */}
                <Connector x1={560} y1={280} x2={690} y2={245} type="branch" tone="orange" budget={budget} />
                {/* completed: verifier → vault (settled) */}
                <Connector x1={740} y1={275} x2={820} y2={330} type="curved" tone="green" budget={budget} />
              </svg>

              {/* nodes */}
              <div className={`absolute left-[8%] top-[13%] transition-opacity duration-300 ${lens ? 'opacity-45' : 'opacity-100'}`}>
                <Node geometry="circle" size="sm" budget={budget}>
                  <IconContainer variant="glass" size="sm" color={ENTITY_IDENTITY.founder}><ClipboardList size={15} className="text-sky-300" /></IconContainer>
                </Node>
                <div className="mt-2 text-center text-[9px] uppercase tracking-[0.14em] text-slate-600">FOUNDER</div>
              </div>
              <div className={`absolute left-[24%] top-[20%] transition-opacity duration-300 ${lens ? 'opacity-45' : 'opacity-100'}`}>
                <Node geometry="circle" size="sm" budget={budget}>
                  <IconContainer variant="glass" size="sm" color={ENTITY_IDENTITY.sophia}><Bot size={15} className="text-orange-300" /></IconContainer>
                </Node>
                <div className="mt-2 text-center text-[9px] uppercase tracking-[0.14em] text-slate-600">SOPHIA</div>
              </div>

              {/* work A — running, selected (focus ring + lens trail) */}
              <div className="absolute left-[28%] top-[52%]">
                <Node geometry="squircle" customWidth={168} customHeight={92} state="selected" budget={budget} perimeter={{ semantic: 'running', progress: 0.45 }} forceReducedMotion={reduced}>
                  <div className="flex h-full w-full flex-col justify-between p-3">
                    <div className="flex items-start gap-2">
                      <IconContainer variant="glass" size="sm" color={WORKFLOW_COLORS.primary}><Activity size={13} className="text-cyan-300" /></IconContainer>
                      <div className="min-w-0">
                        <div className="truncate text-left text-[11px] font-semibold text-cyan-100">Margin model v2</div>
                        <div className="mt-1 flex items-center gap-1"><StateChip semantic="running" /><OwnerChip name="CRUZ" tint={ENTITY_IDENTITY.cruz} /></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end"><span className="tnum font-mono text-[8px] text-slate-500">TRAIL 4/9</span></div>
                  </div>
                </Node>
                {/* focused work lens — local execution trail revealed beneath the node */}
                <div className={`pointer-events-none absolute left-0 top-[104px] w-[300px] rounded-2xl border border-cyan-300/20 bg-[#06101e]/94 p-2.5 shadow-[0_16px_44px_-14px_rgba(0,0,0,0.85)] backdrop-blur-md ${lens ? 'opacity-100' : 'opacity-0'}`} style={{ transition: `opacity 260ms ${EASE}` }}>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-200/90">Local workflow · execution trail</span>
                    <span className="tnum font-mono text-[8.5px] text-slate-500">4/9 STAGES</span>
                  </div>
                  <div className="flex items-stretch gap-1.5">
                    {['Research', 'Compare', 'Analyze', 'Verify', 'Deliver'].map((s, i) => (
                      <div key={s} className="flex flex-1 flex-col items-center gap-1.5">
                        <div className="flex w-full items-center gap-1">
                          {i > 0 && <div className={`h-px flex-1 ${i < 3 ? EXECUTION_LANGUAGE.completed.fillSoft : 'bg-white/10'}`} />}
                          <span className={`h-2 w-2 shrink-0 rounded-full ${i < 2 ? `${EXECUTION_LANGUAGE.completed.fill} ${EXECUTION_LANGUAGE.completed.glow}` : i === 2 ? `${EXECUTION_LANGUAGE.running.fill} ${EXECUTION_LANGUAGE.running.glow} animate-pulse` : i === 3 ? `${EXECUTION_LANGUAGE.approval.fill} ${EXECUTION_LANGUAGE.approval.glow}` : EXECUTION_LANGUAGE.idle.fill}`} />
                          {i < 4 && <div className="h-px flex-1 bg-white/10" />}
                        </div>
                        <span className={`text-center text-[8px] font-medium leading-tight ${i < 2 ? 'text-slate-300' : i === 2 ? 'text-cyan-200' : 'text-slate-600'}`}>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* work B — waiting approval */}
              <div className={`absolute left-[52%] top-[62%] transition-opacity duration-300 ${lens ? 'opacity-45' : 'opacity-100'}`}>
                <Node geometry="squircle" customWidth={150} customHeight={84} budget={budget} indicator={{ status: 'waiting', glow: true }} perimeter={{ semantic: 'approval' }}>
                  <div className="flex h-full w-full flex-col justify-between p-3">
                    <div className="flex items-start gap-2">
                      <IconContainer variant="glass" size="sm" color={ENTITY_IDENTITY.approval}><Scale size={13} className="text-amber-300" /></IconContainer>
                      <div className="min-w-0">
                        <div className="truncate text-left text-[11px] font-semibold text-slate-100">Pricing sync</div>
                        <div className="mt-1"><StateChip semantic="approval" /></div>
                      </div>
                    </div>
                  </div>
                </Node>
              </div>

              {/* verifier + vault */}
              <div className={`absolute left-[68%] top-[46%] transition-opacity duration-300 ${lens ? 'opacity-45' : 'opacity-100'}`}>
                <Node geometry="circle" size="sm" budget={budget}>
                  <IconContainer variant="glass" size="sm" color={ENTITY_IDENTITY.verifier}><ShieldCheck size={15} className="text-emerald-300" /></IconContainer>
                </Node>
                <div className="mt-2 text-center text-[9px] uppercase tracking-[0.14em] text-slate-600">VERIFIER</div>
              </div>
              <div className="absolute right-[9%] bottom-[14%]">
                <Node geometry="squircle" size="sm" state="success" budget={budget} perimeter={{ semantic: 'completed', progress: 1 }}>
                  <IconContainer variant="glass" size="sm" color={ENTITY_IDENTITY.vault}><PackageCheck size={15} className="text-emerald-300" /></IconContainer>
                </Node>
                <div className="mt-2 text-center text-[9px] uppercase tracking-[0.14em] text-slate-600">VAULT</div>
              </div>

              {/* canvas chrome: zoom readout + hint */}
              <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-xl border border-white/10 bg-[#060c18]/88 p-1 backdrop-blur-md">
                <span className="rounded-lg p-1.5 text-slate-300"><MousePointer2 size={13} /></span>
                <span className="tnum min-w-[46px] text-center font-mono text-[11px] font-semibold text-cyan-200">62%</span>
                <span className="rounded-lg p-1.5 text-slate-300"><Maximize size={13} /></span>
              </div>
              <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-[#060c18]/85 px-3.5 py-1.5 text-[10.5px] tracking-wide text-slate-400 backdrop-blur-md">
                <Hand size={11} className="text-cyan-300" /> Drag to pan <span className="text-slate-600">·</span> Scroll to zoom <span className="text-slate-600">·</span> <MousePointer2 size={11} className="text-cyan-300" /> Click a node to inspect
              </div>
              <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-white/10 bg-[#060c18]/85 p-1 backdrop-blur-md">
                <span className="rounded-lg bg-cyan-300/15 p-1.5 text-cyan-200"><Layers size={13} /></span>
                <span className="rounded-lg p-1.5 text-slate-500"><Crosshair size={13} /></span>
              </div>
            </div>
            <Caption>
              Spatial, zoomable, calm. Selection expands contextually (inspector + local trail); the focus lens dims
              unrelated work and reveals the authoritative execution trail beneath the focused object. Selected node carries
              the static primary ring — selection never emits execution energy.
            </Caption>
          </section>

          {/* ============ G. CONTEXTUAL SURFACES ============ */}
          <section className="sj-surface rounded-2xl p-6 lg:col-span-12">
            <SectionHead
              id="G · CONTEXTUAL SURFACES"
              title="SideCard, Activity, Epistemic Board & Inspector"
              blurb="The contextual-surface family. Same glass, same header pattern, same provenance footers — the Epistemic Board visually belongs to the same family as Company Activity because both are founder-facing projections of authoritative server state."
            />

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* G1 — Company Activity SideCard (real ActivitySurface component, fixture events) */}
              <div>
                <SubHead>G1 · Company Activity (4.4C)</SubHead>
                <div className="mt-3">
                  <SideCardSpec title="Company Activity" icon={<Activity size={13} />} count={3} footer="Server-authoritative · /api/activity">
                    <div className="os-scroll max-h-[260px] overflow-y-auto pr-0.5">
                      {FIXTURE_ACTIVITY.map((e) => <ActivitySurface key={e.id} event={e} />)}
                    </div>
                  </SideCardSpec>
                </div>
                <Caption>Events carry a status chip and a provenance trace (workstream · occurrence · run · approval ids). What the company actually did — nothing simulated.</Caption>
              </div>

              {/* G2 — Epistemic Board SideCard (production markup pattern, fixture claims) */}
              <div>
                <SubHead>G2 · Epistemic Board (4.4E)</SubHead>
                <div className="mt-3">
                  <SideCardSpec title="Epistemic Board" icon={<ShieldCheck size={13} />} count={2} tone="amber" footer="AI proposed · Founder verifies · /api/epistemic">
                    <div className="mb-2 flex items-center justify-between gap-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[9px] font-mono uppercase tracking-[0.12em]">
                      <span className="text-amber-200/90">2 pend</span>
                      <ArrowRight size={9} className="text-slate-600" />
                      <span className="text-cyan-200/90">1 verif</span>
                      <ArrowRight size={9} className="text-slate-600" />
                      <span className="text-emerald-200/90">1 fact</span>
                      <ArrowRight size={9} className="text-slate-600" />
                      <span className="text-violet-200/90">1 mem</span>
                    </div>
                    <div className="os-scroll max-h-[260px] space-y-1.5 overflow-y-auto pr-0.5">
                      <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-1.5">
                        <span className="flex items-start gap-1.5">
                          <EpistemicStageChip stage="pending" />
                          <span className="min-w-0 flex-1 text-[10.5px] leading-snug text-slate-300">Assistant pricing is consolidating around per-seat tiers in Q3.</span>
                        </span>
                        <span className="mt-1 block truncate font-mono text-[8.5px] text-slate-600">AI proposed (researcher) · run spec-0001 · market</span>
                        <span className="mt-0.5 flex items-center gap-1 truncate font-mono text-[8.5px] text-slate-600">
                          <span className="text-cyan-300/70">evidence:</span>
                          <span className="truncate">web_research → system_event</span>
                        </span>
                      </div>
                      <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-1.5">
                        <span className="flex items-start gap-1.5">
                          <EpistemicStageChip stage="pending" />
                          <span className="min-w-0 flex-1 text-[10.5px] leading-snug text-slate-300">Unit margins hold above the 80% floor at current COGS.</span>
                        </span>
                        <span className="mt-1 block truncate font-mono text-[8.5px] text-slate-600">AI proposed (finance) · run spec-0002 · financial</span>
                        <span className="mt-0.5 flex items-center gap-1 truncate font-mono text-[8.5px] text-slate-600">
                          <span className="text-slate-600/80">no evidence source (AI takeaway)</span>
                        </span>
                      </div>
                      <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-1.5">
                        <span className="flex items-start gap-1.5">
                          <EpistemicStageChip stage="fact" />
                          <span className="min-w-0 flex-1 text-[10.5px] leading-snug text-emerald-100/90">Competitor X raised pricing 12% in June.</span>
                        </span>
                        <span className="mt-1 block truncate font-mono text-[8.5px] text-slate-600">Founder verification established this as company truth.</span>
                      </div>
                      <div className="rounded-lg border border-violet-300/20 bg-violet-300/[0.04] p-1.5">
                        <p className="text-[10px] leading-snug text-violet-100/80">Historical pricing decision Q2</p>
                        <p className="mt-0.5 font-mono text-[8px] text-slate-600">historical precedent — NOT new evidence · fact lineage</p>
                      </div>
                    </div>
                  </SideCardSpec>
                </div>
                <Caption>
                  Pending claims are always labeled AI-proposed — never company truth. Verified facts are labeled
                  founder-verified; memory is labeled historical precedent. Lineage is shown only when a real source
                  exists; its absence is stated honestly.
                </Caption>
              </div>

              {/* G3 — Inspector + approval boundary */}
              <div>
                <SubHead>G3 · Inspector & approval state</SubHead>
                <div className="mt-3 rounded-2xl border border-cyan-200/25 bg-[#081120]/95 p-4 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.05]" style={{ color: ENTITY_IDENTITY.cruz }}><Coins size={16} /></span>
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-semibold leading-tight text-white">Margin model v2</div>
                        <div className="truncate text-[11px] text-slate-400">Finance & Unit Economics · awaiting approval</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="rounded-md p-1.5 text-slate-400"><Crosshair size={13} /></span>
                      <span className="rounded-md p-1.5 text-slate-500"><X size={13} /></span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl border border-white/10 bg-black/40 p-2 text-[10px]">
                    <div className="rounded-lg bg-white/[0.03] p-1.5">
                      <span className="block text-[9px] uppercase tracking-wider text-slate-500">Runtime Domain</span>
                      <span className="font-mono font-semibold text-cyan-300">WAITING</span>
                    </div>
                    <div className="rounded-lg border border-amber-400/30 bg-amber-400/15 p-1.5">
                      <span className="block text-[9px] uppercase tracking-wider text-slate-500">Governance Domain</span>
                      <span className="font-mono font-bold text-amber-300">AWAITING FOUNDER APPROVAL</span>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] p-1.5">
                      <span className="block text-[9px] uppercase tracking-wider text-slate-500">Epistemic Domain</span>
                      <span className="font-mono font-semibold text-slate-300">ACTIVE</span>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] p-1.5">
                      <span className="block text-[9px] uppercase tracking-wider text-slate-500">Presentation State</span>
                      <span className="font-mono font-semibold text-cyan-200">WAITING</span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/[0.08] p-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-200">
                        <Scale size={13} className="text-amber-300" /> Founder Authorization Boundary
                      </span>
                      <span className="rounded bg-amber-400/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-200">GATE</span>
                    </div>
                    <div className="mt-2 rounded-lg bg-black/40 p-2 text-[11px]">
                      <div className="font-medium text-white">Approve external pricing publication</div>
                      <div className="mt-0.5 text-[10px] text-slate-400">Consequential external action · requires founder ratification</div>
                    </div>
                  </div>
                </div>
                <Caption>
                  Four orthogonal state domains (Runtime / Governance / Epistemic / Presentation) keep execution,
                  authority, evidence and presentation separate. The approval boundary is static amber — a gate, never progress.
                </Caption>
              </div>
            </div>
          </section>

          {/* ============ H. FOUNDER ACTIONS ============ */}
          <section className="sj-surface rounded-2xl p-6 lg:col-span-12">
            <SectionHead
              id="H · FOUNDER ACTIONS"
              title="Authority Through Restraint"
              blurb="Founder actions communicate authority with quiet, precisely-sized controls — never dashboard-sized buttons. Approve/reject pairs sit inside the surface where the decision lives."
            />

            <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
              <div className="flex flex-col items-center gap-2.5">
                <button className="w-full rounded-lg border border-cyan-300/40 bg-cyan-400/15 py-1.5 text-center text-[10.5px] font-semibold text-cyan-100 transition hover:bg-cyan-400/25 active:scale-95">Dispatch directive</button>
                <span className="text-[9px] text-slate-600">primary</span>
              </div>
              <div className="flex flex-col items-center gap-2.5">
                <button className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-1.5 text-center text-[10.5px] font-medium text-slate-300 transition hover:border-white/25 active:scale-95">Defer</button>
                <span className="text-[9px] text-slate-600">secondary</span>
              </div>
              <div className="flex w-full flex-col items-center gap-2.5">
                <div className="flex w-full gap-1.5">
                  <button className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-400/20 py-1.5 text-center text-[10.5px] font-semibold text-emerald-200 transition hover:bg-emerald-400/30 active:scale-95">Approve</button>
                  <button className="flex-1 rounded-lg border border-rose-400/30 bg-rose-400/15 py-1.5 text-center text-[10.5px] font-semibold text-rose-200 transition hover:bg-rose-400/25 active:scale-95">Reject</button>
                </div>
                <span className="text-[9px] text-slate-600">approve / reject pair</span>
              </div>
              <div className="flex flex-col items-center gap-2.5">
                <div className="flex w-full gap-1.5">
                  <button className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] py-1.5 text-center text-[10.5px] text-slate-300 transition hover:text-white active:scale-95"><Crosshair size={12} className="mx-auto" /></button>
                  <button className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] py-1.5 text-center text-[10.5px] text-slate-300 transition hover:text-white active:scale-95"><Pause size={12} className="mx-auto" /></button>
                  <button className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] py-1.5 text-center text-[10.5px] text-slate-300 transition hover:text-white active:scale-95"><Play size={12} className="mx-auto" /></button>
                </div>
                <span className="text-[9px] text-slate-600">inspect · pause · resume</span>
              </div>
              <div className="flex flex-col items-center gap-2.5">
                <button className="w-full rounded-lg border border-rose-400/30 bg-rose-400/10 py-1.5 text-center text-[10.5px] font-semibold text-rose-200 transition hover:bg-rose-400/20 active:scale-95">Resolve blockage</button>
                <span className="text-[9px] text-slate-600">blocked-state action</span>
              </div>
              <div className="col-span-2 flex flex-col items-center gap-2.5">
                <div className="flex w-full max-w-[280px] items-center justify-between gap-2 rounded-lg border border-violet-300/30 bg-violet-300/[0.06] px-3 py-2">
                  <span className="text-[10.5px] text-violet-100/90">Promote fact to memory?</span>
                  <div className="flex gap-1.5">
                    <button className="rounded border border-violet-300/40 bg-violet-300/15 px-2 py-px font-mono text-[9px] uppercase tracking-wide text-violet-100 transition hover:bg-violet-300/25 active:scale-95">Confirm</button>
                    <button className="rounded border border-white/10 px-2 py-px font-mono text-[9px] uppercase tracking-wide text-slate-400 transition hover:text-slate-200 active:scale-95">Cancel</button>
                  </div>
                </div>
                <span className="text-[9px] text-slate-600">confirmation (irreversible / governed steps only)</span>
              </div>
            </div>
            <Caption>
              Specimen presentations only — inert controls. Production actions always route through the founder-gated
              APIs and re-project authoritative state; the UI never optimistically mutates governed records.
            </Caption>
          </section>

          {/* ============ I. EMPTY / HONEST STATES ============ */}
          <section className="sj-surface rounded-2xl p-6 lg:col-span-12">
            <SectionHead
              id="I · EMPTY / HONEST STATES"
              title="Quiet Is a Real State"
              blurb="Empty space is never filled with fake telemetry. Each surface states exactly what would make it non-empty — nothing is simulated."
            />

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-3 text-[11px] tracking-[0.2em] text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.8)]" />
                ALL QUIET · NOTHING NEEDS YOU
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4">
                <div className="text-[11px] font-semibold text-slate-300">Attention</div>
                <p className="mt-1 text-[11.5px] leading-snug text-slate-500">Nothing needs you right now.</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4">
                <div className="text-[11px] font-semibold text-slate-300">Company Activity</div>
                <p className="mt-1 text-[11.5px] leading-snug text-slate-500">No company activity recorded yet. Real executions, approvals and automation lifecycle events will appear here — nothing is simulated.</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4">
                <div className="text-[11px] font-semibold text-slate-300">Epistemic Board</div>
                <p className="mt-1 text-[11.5px] leading-snug text-slate-500">No epistemic claims recorded yet. Agent work and gated research will submit candidate claims here for founder verification.</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4">
                <div className="text-[11px] font-semibold text-slate-300">Evidence lineage</div>
                <p className="mt-1 font-mono text-[10px] leading-snug text-slate-600">no evidence source (AI takeaway)</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4">
                <div className="text-[11px] font-semibold text-slate-300">Inspector</div>
                <p className="mt-1 text-[11.5px] leading-snug text-slate-500">No work selected — click a node to inspect.</p>
              </div>
            </div>

            <div className="mt-4 max-w-md">
              <EmptyState
                icon="○"
                title="No pending claims"
                description="The epistemic pipeline is empty. Claims appear only when real agent work or gated research proposes them."
              />
            </div>

            <Caption>
              These are the production strings. An empty board renders zero counts; an unselected canvas renders no
              inspector; a claim without recorded external evidence says so — the system never invents a source.
            </Caption>
          </section>
        </div>

        {/* ===================== FOOTER ===================== */}
        <footer className="mt-14 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/[0.08] pt-7 pb-12 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="font-semibold tracking-[0.18em] text-slate-300">SAMJUNIORSOS</span>
            <span>·</span>
            <span>DESIGN SYSTEM · CANONICAL VISUAL LANGUAGE</span>
          </div>
          <div className="font-mono tracking-wider text-cyan-400/80">
            ONE OPERATING ENVIRONMENT · CALM → NOTICE → UNDERSTAND → ACT → INSPECT
          </div>
          <div className="font-mono text-slate-600">tokens.ts · execution-language.ts · ExecutionPerimeter.tsx · DESIGN.md</div>
        </footer>
      </div>
    </div>
  );
}
