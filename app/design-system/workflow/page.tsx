'use client';

import React, { useState } from 'react';
import {
  Send,
  Bot,
  FileSpreadsheet,
  Cpu,
  Layers,
  Sparkles,
  Zap,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  FolderGit2,
  Sliders,
} from 'lucide-react';
import {
  Node,
  NodePort,
  IconContainer,
  IconSurfaceVariant,
  IconOnlyContent,
  IconLabelContent,
  IconTitleContent,
  IconMetaContent,
  AgentContent,
  ModelContent,
  Connector,
  LoadingRing,
  PulseEffect,
  SuccessBurst,
  ErrorPulse,
  AmbientParticles,
  NodeStateType,
  NodeGeometryType,
  EffectsBudget,
  WORKFLOW_COLORS,
} from '@/components/workflow';

export default function WorkflowDesignSystemSpecimen() {
  const [activeTabState, setActiveTabState] = useState<NodeStateType>('processing');
  const [budget, setBudget] = useState<EffectsBudget>('full');

  return (
    <div className="min-h-screen w-full bg-[#01040A] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden">
      {/* Background Ambience & Perspective Grid */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {/* Deep radial cosmic horizon glow */}
        <div
          className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[1200px] h-[500px] rounded-full opacity-35 blur-[120px]"
          style={{ background: 'radial-gradient(ellipse at center, rgba(0, 178, 255, 0.45), rgba(5, 10, 25, 0))' }}
        />
        <div
          className="absolute top-[60%] right-[-10%] w-[600px] h-[600px] rounded-full opacity-15 blur-[140px]"
          style={{ background: 'radial-gradient(circle, rgba(255, 138, 0, 0.35), transparent 70%)' }}
        />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <AmbientParticles budget={budget} count={28} />
      </div>

      {/* Main Container */}
      <div className="relative z-10 mx-auto max-w-[1520px] px-4 py-8 sm:px-6 lg:px-10">
        {/* ===================== TOP HEADER ===================== */}
        <header className="mb-12 border-b border-white/[0.08] pb-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  SamJuniorsOS Primitives
                </span>
                <span className="text-[11px] font-mono tracking-widest text-slate-500">PHASE 4.1</span>
              </div>
              <h1 className="mt-3 text-3xl font-extrabold tracking-[0.14em] text-white sm:text-4xl lg:text-5xl">
                F L O W G R I D <span className="text-xs align-super text-cyan-400 font-mono">TM</span>
              </h1>
              <p className="mt-2 text-sm font-medium tracking-wide text-slate-400">
                WORKFLOW UI COMPONENT LIBRARY · <span className="text-cyan-200/90 font-semibold">NODES CONNECT IDEAS INTO REAL ACTIONS.</span>
              </p>
            </div>

            {/* Performance Budget Switcher */}
            <div className="flex items-center gap-4 rounded-xl border border-white/[0.1] bg-[#050A14]/80 p-2 backdrop-blur-md">
              <div className="flex items-center gap-2 pl-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Sliders size={14} className="text-cyan-400" />
                <span>Effects Budget:</span>
              </div>
              <div className="flex items-center gap-1">
                {(['full', 'balanced', 'minimal'] as EffectsBudget[]).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setBudget(lvl)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-all duration-150 ${
                      budget === lvl
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50 shadow-[0_0_12px_rgba(0,178,255,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        {/* ===================== GRID SECTIONS ===================== */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* SECTION 01: CANVAS & BACKGROUND (Col 1-4) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#050A14]/85 p-6 backdrop-blur-xl lg:col-span-4 flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">01 CANVAS & BACKGROUND</div>
              <h2 className="mt-1 text-base font-semibold text-white">Grid, Depth & Environment</h2>
              <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                Perspective isometric plane with radial depth falloff, subtle coordinate dots, and ambient illumination.
              </p>
            </div>
            {/* 3D Perspective Plane Preview */}
            <div className="mt-6 relative h-48 w-full overflow-hidden rounded-xl border border-white/[0.06] bg-[#02050D]">
              <div
                className="absolute inset-0"
                style={{
                  transform: 'perspective(400px) rotateX(45deg) scale(1.4) translateY(-10px)',
                  backgroundImage: 'radial-gradient(rgba(0, 178, 255, 0.4) 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#02050D] via-transparent to-[#02050D]/60" />
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2 text-[10px] text-slate-400">
                <span className="rounded bg-white/[0.05] px-2 py-0.5 border border-white/[0.08]">Grid Lines</span>
                <span className="rounded bg-white/[0.05] px-2 py-0.5 border border-white/[0.08]">Subtle Dots</span>
                <span className="rounded bg-white/[0.05] px-2 py-0.5 border border-white/[0.08]">Depth Layers</span>
                <span className="rounded bg-white/[0.05] px-2 py-0.5 border border-white/[0.08]">Ambient Glow</span>
              </div>
            </div>
          </section>

          {/* SECTION 02: NODE GEOMETRY (Col 5-12) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#050A14]/85 p-6 backdrop-blur-xl lg:col-span-8">
            <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">02 NODE GEOMETRY</div>
            <h2 className="mt-1 text-base font-semibold text-white">Core Shapes Used in Workflows</h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Five pure geometric enclosures: Square (1:1), Rectangle (Wide / 2.8:1), Circle (1:1), Squircle (Hybrid), and Pill (Compact).
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-around gap-6">
              {/* 1. Square Node */}
              <div className="flex flex-col items-center gap-2">
                <Node geometry="square" size="md" hasInputPort hasOutputPort budget={budget}>
                  <IconContainer variant="filled" color={WORKFLOW_COLORS.primary}>
                    <Send size={20} className="text-white" />
                  </IconContainer>
                </Node>
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-200">Square Node</div>
                  <div className="text-[10px] font-mono text-slate-500">1:1 Ratio</div>
                </div>
              </div>

              {/* 2. Rectangle Node */}
              <div className="flex flex-col items-center gap-2">
                <Node geometry="rectangle" size="md" hasInputPort hasOutputPort budget={budget}>
                  <IconTitleContent
                    icon={<Bot size={20} className="text-cyan-300" />}
                    title="Real Estate AI Agent"
                    subtitle="Operations Worker"
                    iconVariant="glass"
                  />
                </Node>
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-200">Rectangle Node</div>
                  <div className="text-[10px] font-mono text-slate-500">Wide / 2.8:1</div>
                </div>
              </div>

              {/* 3. Circle Node */}
              <div className="flex flex-col items-center gap-2">
                <Node geometry="circle" size="md" hasInputPort hasOutputPort budget={budget}>
                  <IconContainer variant="glass" color="#4285F4">
                    <Cpu size={22} className="text-blue-400" />
                  </IconContainer>
                </Node>
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-200">Circle Node</div>
                  <div className="text-[10px] font-mono text-slate-500">1:1 Radial</div>
                </div>
              </div>

              {/* 4. Squircle Node */}
              <div className="flex flex-col items-center gap-2">
                <Node geometry="squircle" size="md" hasInputPort hasOutputPort budget={budget}>
                  <IconContainer variant="squircle" color={WORKFLOW_COLORS.success}>
                    <FileSpreadsheet size={20} className="text-emerald-400" />
                  </IconContainer>
                </Node>
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-200">Hybrid Node</div>
                  <div className="text-[10px] font-mono text-slate-500">Squircle</div>
                </div>
              </div>

              {/* 5. Pill Node */}
              <div className="flex flex-col items-center gap-2">
                <Node geometry="pill" size="md" hasInputPort hasOutputPort budget={budget}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-semibold tracking-wide text-slate-200">Compact</span>
                  </div>
                </Node>
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-200">Pill Node</div>
                  <div className="text-[10px] font-mono text-slate-500">Compact</div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 03: NODE ANATOMY (Col 1-12) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#050A14]/85 p-6 backdrop-blur-xl lg:col-span-12">
            <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">03 NODE ANATOMY</div>
            <h2 className="mt-1 text-base font-semibold text-white">Layer Breakdown & Component Anatomy</h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Structural deconstruction showing the layered composition of obsidian glass, interactive ports, specular highlights, and state glow.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center">
              <div className="relative p-12">
                {/* Central Specimen Node */}
                <Node
                  geometry="square"
                  size="lg"
                  state="selected"
                  hasInputPort
                  hasOutputPort
                  indicator={{ status: 'active', label: 'Trigger', glow: true }}
                  budget={budget}
                >
                  <IconLabelContent
                    icon={<Send size={26} className="text-white" />}
                    label="Telegram Trigger"
                    sublabel="Event Webhook"
                    iconVariant="filled"
                    color={WORKFLOW_COLORS.primary}
                  />
                </Node>

                {/* Callout Pointers */}
                {/* 1. Status Indicator Callout */}
                <div className="hidden sm:flex absolute -top-1 left-2 items-center gap-3">
                  <div className="rounded-md border border-amber-400/40 bg-amber-950/40 px-2.5 py-1 text-[11px] font-mono text-amber-300">
                    Status Indicator (Warm Glow)
                  </div>
                  <div className="h-[1px] w-12 bg-amber-400/60" />
                </div>

                {/* 2. Left Connection Port */}
                <div className="hidden sm:flex absolute top-[52%] -left-16 -translate-y-1/2 items-center gap-3">
                  <div className="rounded-md border border-cyan-400/40 bg-cyan-950/40 px-2.5 py-1 text-[11px] font-mono text-cyan-300">
                    Connection Port (Input)
                  </div>
                  <div className="h-[1px] w-10 bg-cyan-400/60" />
                </div>

                {/* 3. Right Connection Port */}
                <div className="hidden sm:flex absolute top-[52%] -right-16 -translate-y-1/2 items-center gap-3">
                  <div className="h-[1px] w-10 bg-cyan-400/60" />
                  <div className="rounded-md border border-cyan-400/40 bg-cyan-950/40 px-2.5 py-1 text-[11px] font-mono text-cyan-300">
                    Connection Port (Output)
                  </div>
                </div>

                {/* 4. Glass Background */}
                <div className="hidden sm:flex absolute -top-1 right-2 items-center gap-3">
                  <div className="h-[1px] w-12 bg-white/40" />
                  <div className="rounded-md border border-white/20 bg-slate-900/60 px-2.5 py-1 text-[11px] font-mono text-slate-300">
                    Obsidian Glass / Specular Rim
                  </div>
                </div>

                {/* 5. Glow / Depth */}
                <div className="hidden sm:flex absolute -bottom-2 right-6 items-center gap-3">
                  <div className="h-[1px] w-12 bg-cyan-400/40" />
                  <div className="rounded-md border border-cyan-400/30 bg-cyan-950/30 px-2.5 py-1 text-[11px] font-mono text-cyan-300">
                    State-Driven Depth & Glow
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 04: NODE CONTENT STYLES (Col 1-7) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#050A14]/85 p-6 backdrop-blur-xl lg:col-span-7">
            <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">04 NODE CONTENT STYLES</div>
            <h2 className="mt-1 text-base font-semibold text-white">Reusable Content Compositions</h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Structured internal layouts supporting icon-only, icon+label, horizontal titles, metadata badges, and AI agents.
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center justify-between">
                <Node geometry="square" size="sm" budget={budget}>
                  <IconOnlyContent icon={<Zap size={18} className="text-cyan-300" />} />
                </Node>
                <div className="text-right">
                  <div className="text-xs font-semibold text-white">Icon Only</div>
                  <div className="text-[10px] text-slate-500">Minimal trigger</div>
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center justify-between">
                <Node geometry="square" size="md" budget={budget}>
                  <IconLabelContent icon={<Send size={20} />} label="Telegram" sublabel="Trigger" />
                </Node>
                <div className="text-right">
                  <div className="text-xs font-semibold text-white">Icon + Label</div>
                  <div className="text-[10px] text-slate-500">Vertical stack</div>
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center justify-between sm:col-span-2">
                <Node geometry="rectangle" size="sm" customWidth={220} budget={budget}>
                  <IconTitleContent
                    icon={<Bot size={18} className="text-cyan-300" />}
                    title="Real Estate AI Agent"
                    subtitle="Automation"
                  />
                </Node>
                <div className="text-right">
                  <div className="text-xs font-semibold text-white">Icon + Title</div>
                  <div className="text-[10px] text-slate-500">Horizontal arrangement</div>
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center justify-between sm:col-span-2">
                <Node geometry="rectangle" size="sm" customWidth={220} budget={budget}>
                  <IconMetaContent
                    icon={<FileSpreadsheet size={18} className="text-emerald-400" />}
                    title="Save Lead to Sheet"
                    meta="Auto Sync"
                    tag="Action"
                  />
                </Node>
                <div className="text-right">
                  <div className="text-xs font-semibold text-white">Icon + Meta</div>
                  <div className="text-[10px] text-slate-500">Action with tag pill</div>
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center justify-between sm:col-span-2">
                <Node geometry="rectangle" size="sm" customWidth={220} budget={budget}>
                  <AgentContent
                    icon={<Bot size={18} className="text-cyan-300" />}
                    name="Sophia Vance"
                    role="COO & Orchestrator"
                    statusText="Online"
                    statusTone="idle"
                  />
                </Node>
                <div className="text-right">
                  <div className="text-xs font-semibold text-white">Agent Content</div>
                  <div className="text-[10px] text-slate-500">Employee with status indicator</div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 05: ICON CONTAINERS (Col 8-12) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#050A14]/85 p-6 backdrop-blur-xl lg:col-span-5">
            <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">05 ICON CONTAINERS</div>
            <h2 className="mt-1 text-base font-semibold text-white">Surface Variations</h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Six physical surface treatments for internal glyphs and avatars.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-4">
              {(['filled', 'glass', 'outline', 'squircle', 'recessed', 'floating'] as IconSurfaceVariant[]).map(
                (v) => (
                  <div key={v} className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <IconContainer variant={v} color={WORKFLOW_COLORS.primary} size="md">
                      <Send size={18} />
                    </IconContainer>
                    <span className="text-[11px] font-medium capitalize text-slate-300">{v}</span>
                  </div>
                )
              )}
            </div>
          </section>

          {/* SECTION 06: NODE STATES (Col 1-12) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#050A14]/85 p-6 backdrop-blur-xl lg:col-span-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">06 NODE STATES</div>
                <h2 className="mt-1 text-base font-semibold text-white">Interactive State Matrix</h2>
                <p className="mt-1.5 text-xs text-slate-400">
                  States modify existing geometry. Neon is a state, not the default appearance.
                </p>
              </div>

              {/* State Interactive Switcher */}
              <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-black/40 p-1.5">
                {(['default', 'hover', 'selected', 'active', 'processing', 'success', 'error', 'disabled'] as NodeStateType[]).map(
                  (st) => (
                    <button
                      key={st}
                      onClick={() => setActiveTabState(st)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-all ${
                        activeTabState === st
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_12px_rgba(0,178,255,0.25)]'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                      }`}
                    >
                      {st}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Side-by-Side Node States */}
            <div className="mt-8 flex flex-wrap items-center justify-around gap-6">
              {(['default', 'hover', 'selected', 'processing', 'success', 'error'] as NodeStateType[]).map((st) => (
                <div key={st} className="flex flex-col items-center gap-2">
                  <Node
                    geometry="square"
                    size="md"
                    state={st}
                    hasInputPort
                    hasOutputPort
                    budget={budget}
                    onClick={() => setActiveTabState(st)}
                  >
                    <IconContainer variant="filled" color={WORKFLOW_COLORS.primary}>
                      <Send size={20} className="text-white" />
                    </IconContainer>
                  </Node>
                  <div className="text-center">
                    <span className="text-xs font-semibold capitalize text-slate-200">{st}</span>
                    <div className="text-[10px] text-slate-500">
                      {st === 'default' && 'Quiet / Dark'}
                      {st === 'hover' && 'Elevation'}
                      {st === 'selected' && 'Blue Boundary'}
                      {st === 'processing' && 'Orange Energy'}
                      {st === 'success' && 'Green Halo'}
                      {st === 'error' && 'Red Warning'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* SECTION 07: CONNECTION PORTS (Col 1-6) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#050A14]/85 p-6 backdrop-blur-xl lg:col-span-6">
            <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">07 CONNECTION PORTS</div>
            <h2 className="mt-1 text-base font-semibold text-white">Input / Output Port Styles</h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Independent reusable connection ports with snap physics, state glows, and shape options.
            </p>

            <div className="mt-6 space-y-6">
              {/* Circular Ports */}
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-3">Circular Port Styles</div>
                <div className="grid grid-cols-4 gap-3 text-center">
                  {(['default', 'active', 'success', 'error'] as const).map((pst) => (
                    <div key={pst} className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="relative h-6 w-6 flex items-center justify-center">
                        <NodePort shape="circle" state={pst} size={16} position="top" offset={0} />
                      </div>
                      <span className="text-[11px] capitalize text-slate-300">{pst}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Square / Diamond Ports */}
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-3">Square / Micro-Diamond Styles</div>
                <div className="grid grid-cols-4 gap-3 text-center">
                  {(['default', 'hover', 'connected', 'error'] as const).map((pst) => (
                    <div key={pst} className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="relative h-6 w-6 flex items-center justify-center">
                        <NodePort shape="square" state={pst} size={15} position="top" offset={0} />
                      </div>
                      <span className="text-[11px] capitalize text-slate-300">{pst}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 08: CONNECTORS & FLOWS (Col 7-12) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#050A14]/85 p-6 backdrop-blur-xl lg:col-span-6">
            <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">08 CONNECTORS & FLOWS</div>
            <h2 className="mt-1 text-base font-semibold text-white">Conduit Styles & Directional Signals</h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Signals travel from source port to destination port without blinking whole wires.
            </p>

            <div className="mt-6 rounded-xl border border-white/[0.06] bg-[#02050D] p-4">
              <svg width="100%" height="240" viewBox="0 0 480 240" className="overflow-visible">
                {/* 1. Straight */}
                <text x="16" y="32" fill="#94A3B8" fontSize="11" fontWeight="500">Straight</text>
                <Connector x1={100} y1={28} x2={440} y2={28} type="straight" tone="blue" budget={budget} />

                {/* 2. Curved (S-Curve) */}
                <text x="16" y="86" fill="#94A3B8" fontSize="11" fontWeight="500">Curved</text>
                <Connector x1={100} y1={82} x2={440} y2={92} type="curved" tone="blue" budget={budget} />

                {/* 3. Dashed */}
                <text x="16" y="142" fill="#94A3B8" fontSize="11" fontWeight="500">Dashed</text>
                <Connector x1={100} y1={138} x2={440} y2={138} type="dashed" tone="blue" budget={budget} />

                {/* 4. Animated Signal Flow */}
                <text x="16" y="200" fill="#FF8A00" fontSize="11" fontWeight="600">Animated Flow</text>
                <Connector x1={100} y1={196} x2={440} y2={216} type="animated" tone="orange" budget={budget} />
              </svg>
            </div>
          </section>

          {/* SECTION 09: EFFECTS & ANIMATIONS (Col 1-12) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#050A14]/85 p-6 backdrop-blur-xl lg:col-span-12">
            <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">09 EFFECTS & ANIMATIONS</div>
            <h2 className="mt-1 text-base font-semibold text-white">Visual Kinetics & State Feedback</h2>
            <p className="mt-1.5 text-xs text-slate-400">
              State-bound motion primitives honoring the performance budget and reduced-motion settings.
            </p>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* 1. Flow Particle */}
              <div className="flex flex-col items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center h-36">
                <span className="text-xs font-semibold text-slate-300">Flow Particle</span>
                <div className="relative h-12 w-full flex items-center justify-center">
                  <svg width="60" height="30">
                    <defs>
                      <linearGradient id="wf-tail-orange" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#FF8A00" stopOpacity="0" />
                        <stop offset="100%" stopColor="#FF8A00" stopOpacity="1" />
                      </linearGradient>
                    </defs>
                    <line x1="8" y1="15" x2="44" y2="15" stroke="url(#wf-tail-orange)" strokeWidth="3" strokeLinecap="round" />
                    <circle cx="44" cy="15" r="3.5" fill="#FF8A00" />
                  </svg>
                </div>
                <span className="text-[10px] text-amber-400 font-mono">Orange Comet</span>
              </div>

              {/* 2. Node Activation */}
              <div className="flex flex-col items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center h-36">
                <span className="text-xs font-semibold text-slate-300">Node Activation</span>
                <div className="relative h-12 w-12 flex items-center justify-center">
                  <span className="absolute h-10 w-10 rounded-full border border-cyan-400/60 animate-ping" />
                  <span className="h-6 w-6 rounded-full bg-cyan-500/30 border border-cyan-400" />
                </div>
                <span className="text-[10px] text-cyan-300 font-mono">Arrival Wave</span>
              </div>

              {/* 3. Pulse Effect */}
              <div className="flex flex-col items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center h-36">
                <span className="text-xs font-semibold text-slate-300">Pulse Aura</span>
                <div className="relative h-12 w-12 flex items-center justify-center">
                  <div className="h-9 w-9 rounded-xl border border-cyan-400/70 shadow-[0_0_16px_rgba(0,178,255,0.7)]" />
                </div>
                <span className="text-[10px] text-cyan-300 font-mono">Breathing Border</span>
              </div>

              {/* 4. Signal Flow */}
              <div className="flex flex-col items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center h-36">
                <span className="text-xs font-semibold text-slate-300">Signal Flow</span>
                <div className="relative h-12 w-full flex items-center justify-center">
                  <svg width="70" height="24">
                    <path d="M 5 12 Q 20 4 35 12 T 65 12" fill="none" stroke="#00B2FF" strokeWidth="2" />
                    <circle cx="35" cy="12" r="3" fill="#FFFFFF" />
                  </svg>
                </div>
                <span className="text-[10px] text-cyan-300 font-mono">Sine Motion</span>
              </div>

              {/* 5. Loading Ring */}
              <div className="flex flex-col items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center h-36">
                <span className="text-xs font-semibold text-slate-300">Loading Ring</span>
                <div className="relative h-12 w-12 flex items-center justify-center">
                  <LoadingRing size={32} color={WORKFLOW_COLORS.processing} />
                </div>
                <span className="text-[10px] text-amber-400 font-mono">Orbital Spinner</span>
              </div>

              {/* 6. Success Burst */}
              <div className="flex flex-col items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center h-36">
                <span className="text-xs font-semibold text-slate-300">Success Burst</span>
                <div className="relative h-12 w-12 flex items-center justify-center">
                  <span className="absolute h-10 w-10 rounded-full border border-emerald-400 shadow-[0_0_18px_rgba(34,217,122,0.8)]" />
                  <CheckCircle2 size={20} className="text-emerald-400 z-10" />
                </div>
                <span className="text-[10px] text-emerald-400 font-mono">Green Halo</span>
              </div>
            </div>
          </section>

          {/* SECTION 10: COLOR TOKENS (Col 1-6) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#050A14]/85 p-6 backdrop-blur-xl lg:col-span-6">
            <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">10 COLOR TOKENS</div>
            <h2 className="mt-1 text-base font-semibold text-white">Semantic Color System</h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Harmonious obsidian palette matching SamJuniorsOS core design tokens.
            </p>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                { hex: '#00B2FF', label: 'Primary', desc: 'Active & Data' },
                { hex: '#FF8A00', label: 'Active', desc: 'Processing' },
                { hex: '#22D97A', label: 'Success', desc: 'Healthy & Done' },
                { hex: '#FF4B4B', label: 'Error', desc: 'Blocked Alert' },
                { hex: '#94A3B8', label: 'Muted', desc: 'Text & Lines' },
                { hex: '#1E293B', label: 'Surface', desc: 'Node Fill' },
                { hex: '#0F172A', label: 'Background', desc: 'Deep Void' },
                { hex: '#FFFFFF', label: 'Text', desc: 'Pure Contrast' },
              ].map((c) => (
                <div key={c.hex} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex flex-col items-center gap-2">
                  <span
                    className="h-9 w-9 rounded-full border border-white/20 shadow-[0_0_14px_rgba(0,0,0,0.6)]"
                    style={{ backgroundColor: c.hex }}
                  />
                  <div>
                    <div className="text-xs font-semibold text-white">{c.label}</div>
                    <div className="text-[10px] font-mono text-slate-400">{c.hex}</div>
                    <div className="text-[9px] text-slate-500">{c.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* SECTION 11: TYPOGRAPHY (Col 7-12) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#050A14]/85 p-6 backdrop-blur-xl lg:col-span-6">
            <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">11 TYPOGRAPHY</div>
            <h2 className="mt-1 text-base font-semibold text-white">Hierarchical Text Styles</h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Clean system sans-serif hierarchy with tabular numeric alignment for execution state.
            </p>

            <div className="mt-6 space-y-4 rounded-xl border border-white/[0.06] bg-[#02050D] p-5">
              <div className="border-b border-white/[0.06] pb-3">
                <div className="text-[11px] font-mono uppercase text-slate-400">Node Title · Semibold 16px</div>
                <div className="text-base font-semibold text-white tracking-[-0.01em] mt-1">Real Estate AI Agent</div>
              </div>
              <div className="border-b border-white/[0.06] pb-3">
                <div className="text-[11px] font-mono uppercase text-slate-400">Node Label / Subtitle · Medium 14px</div>
                <div className="text-sm font-medium text-slate-200 mt-1">Telegram Trigger · Webhook Listener</div>
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase text-slate-400">Node Meta · Regular 12px with Tabular Numerics</div>
                <div className="text-xs font-normal text-slate-400 mt-1 font-mono">
                  Online · In-Flight: 02.14s · Latency: 42ms
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 12: REAL COMPOSITIONS (Col 1-12) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#050A14]/85 p-6 backdrop-blur-xl lg:col-span-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">12 REAL COMPOSITIONS</div>
                <h2 className="mt-1 text-base font-semibold text-white">Common Visual Workflow Assemblies</h2>
                <p className="mt-1.5 text-xs text-slate-400">
                  Illustrative fixtures only — demonstrative visual assemblies uniting triggers, agents, actions, and models.
                </p>
              </div>
              <div className="rounded-lg border border-amber-400/30 bg-amber-950/20 px-3 py-1 text-[11px] font-mono text-amber-300">
                Visual Specimens Only · Not Active OS Integrations
              </div>
            </div>

            {/* Main Composition A: Telegram Trigger → AI Agent → Save Lead to Sheet → Google Gemini Chat Model */}
            <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#02050E] p-8 overflow-x-auto">
              <div className="min-w-[880px] flex items-center justify-between gap-4 relative">
                {/* 1. Telegram Trigger */}
                <div className="flex flex-col items-center gap-2">
                  <Node geometry="square" size="md" hasOutputPort budget={budget}>
                    <IconLabelContent
                      icon={<Send size={22} className="text-white" />}
                      label="Telegram"
                      sublabel="Trigger"
                      color={WORKFLOW_COLORS.primary}
                    />
                  </Node>
                  <span className="text-[11px] font-medium text-slate-400">Telegram Trigger</span>
                </div>

                {/* Connector 1 */}
                <div className="flex-1 px-2">
                  <svg width="100%" height="40" viewBox="0 0 160 40">
                    <Connector x1={0} y1={20} x2={160} y2={20} type="animated" tone="orange" budget={budget} />
                  </svg>
                </div>

                {/* 2. Real Estate AI Agent */}
                <div className="flex flex-col items-center gap-2">
                  <Node geometry="rectangle" size="md" hasInputPort hasOutputPort state="processing" budget={budget}>
                    <IconTitleContent
                      icon={<Bot size={20} className="text-cyan-300" />}
                      title="Real Estate AI Agent"
                      subtitle="Council Specialist"
                      iconVariant="glass"
                    />
                  </Node>
                  <span className="text-[11px] font-medium text-slate-400">AI Agent</span>
                </div>

                {/* Connector 2 */}
                <div className="flex-1 px-2">
                  <svg width="100%" height="40" viewBox="0 0 160 40">
                    <Connector x1={0} y1={20} x2={160} y2={20} type="animated" tone="blue" budget={budget} />
                  </svg>
                </div>

                {/* 3. Save Lead to Sheet */}
                <div className="flex flex-col items-center gap-2">
                  <Node geometry="squircle" size="md" hasInputPort hasOutputPort state="active" budget={budget}>
                    <IconLabelContent
                      icon={<FileSpreadsheet size={22} className="text-emerald-400" />}
                      label="Save Lead"
                      sublabel="to Sheet"
                      color={WORKFLOW_COLORS.success}
                    />
                  </Node>
                  <span className="text-[11px] font-medium text-slate-400">Save Lead to Sheet</span>
                </div>

                {/* Connector 3 */}
                <div className="flex-1 px-2">
                  <svg width="100%" height="40" viewBox="0 0 160 40">
                    <Connector x1={0} y1={20} x2={160} y2={20} type="straight" tone="blue" budget={budget} />
                  </svg>
                </div>

                {/* 4. Google Gemini Chat Model */}
                <div className="flex flex-col items-center gap-2">
                  <Node geometry="circle" size="md" hasInputPort budget={budget}>
                    <ModelContent
                      icon={<Cpu size={22} className="text-blue-400" />}
                      modelName="Gemini 2.0"
                      provider="Google AI"
                    />
                  </Node>
                  <span className="text-[11px] font-medium text-slate-400">Chat Model</span>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 13: RESPONSIVE SIZES (Col 1-12) */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#050A14]/85 p-6 backdrop-blur-xl lg:col-span-12">
            <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400">13 RESPONSIVE SIZES</div>
            <h2 className="mt-1 text-base font-semibold text-white">Scale & Proportional Hierarchy</h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Demonstrating Small (64×64), Medium (96×64/96), and Large (120×80/128) scaling across icons, typography, and ports.
            </p>

            <div className="mt-8 flex flex-wrap items-end justify-around gap-8">
              {/* Small: 64×64 */}
              <div className="flex flex-col items-center gap-2">
                <Node geometry="square" size="sm" hasInputPort hasOutputPort budget={budget}>
                  <IconContainer variant="filled" size="sm">
                    <Send size={14} className="text-white" />
                  </IconContainer>
                </Node>
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-200">Small</div>
                  <div className="text-[10px] font-mono text-slate-500">64 × 64</div>
                </div>
              </div>

              {/* Medium: 96×96 */}
              <div className="flex flex-col items-center gap-2">
                <Node geometry="square" size="md" hasInputPort hasOutputPort budget={budget}>
                  <IconContainer variant="filled" size="md">
                    <Send size={20} className="text-white" />
                  </IconContainer>
                </Node>
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-200">Medium</div>
                  <div className="text-[10px] font-mono text-slate-500">96 × 96</div>
                </div>
              </div>

              {/* Large: 128×128 */}
              <div className="flex flex-col items-center gap-2">
                <Node geometry="square" size="lg" hasInputPort hasOutputPort budget={budget}>
                  <IconContainer variant="filled" size="lg">
                    <Send size={28} className="text-white" />
                  </IconContainer>
                </Node>
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-200">Large</div>
                  <div className="text-[10px] font-mono text-slate-500">128 × 128</div>
                </div>
              </div>

              {/* Responsive Rectangle Small */}
              <div className="flex flex-col items-center gap-2">
                <Node geometry="rectangle" size="sm" hasInputPort hasOutputPort budget={budget}>
                  <div className="flex items-center gap-2">
                    <Bot size={14} className="text-cyan-300" />
                    <span className="text-[11px] font-semibold text-slate-200">Agent</span>
                  </div>
                </Node>
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-200">Compact Rect</div>
                  <div className="text-[10px] font-mono text-slate-500">140 × 56</div>
                </div>
              </div>

              {/* Responsive Rectangle Large */}
              <div className="flex flex-col items-center gap-2">
                <Node geometry="rectangle" size="lg" hasInputPort hasOutputPort budget={budget}>
                  <IconTitleContent
                    icon={<Bot size={22} className="text-cyan-300" />}
                    title="Executive Council"
                    subtitle="4 Specialists Active"
                  />
                </Node>
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-200">Large Rect</div>
                  <div className="text-[10px] font-mono text-slate-500">240 × 80</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ===================== FOOTER ===================== */}
        <footer className="mt-16 border-t border-white/[0.08] pt-8 pb-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="font-extrabold tracking-widest text-slate-300">FLOWGRID</span>
            <span>·</span>
            <span>DESIGN SYSTEM v1.0</span>
          </div>
          <div className="font-mono tracking-wider text-cyan-400/80">
            MODULAR COMPONENTS FOR LIMITLESS WORKFLOWS
          </div>
          <div className="text-slate-400">TURN IDEAS INTO FLOWS</div>
        </footer>
      </div>

      {/* Global Embedded SVG Glow Filters & Animation Keyframes */}
      <svg width="0" height="0" className="absolute pointer-events-none">
        <defs>
          <filter id="wf-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      <style jsx global>{`
        @keyframes wf-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes wf-pulse {
          0%, 100% {
            opacity: 0.4;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.02);
          }
        }
        @keyframes wf-pulse-fast {
          0%, 100% {
            opacity: 0.5;
          }
          50% {
            opacity: 0.95;
          }
        }
        @keyframes wf-shockwave {
          0% {
            r: 8px;
            opacity: 0.9;
          }
          100% {
            r: 32px;
            opacity: 0;
          }
        }
        @keyframes wf-burst {
          0% {
            transform: scale(0.95);
            opacity: 0.8;
          }
          100% {
            transform: scale(1.06);
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          *, ::before, ::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}
