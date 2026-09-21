"use client";

import { useState } from "react";
import { Chip, Section, SubLabel } from "./primitives";
import { NodeOrb, ProgressRing } from "./node-orb";
import { FlowCanvas } from "./flow-canvas";
import {
  AgentGlyph,
  GoogleG,
  LockGlyph,
  MemoryGlyph,
  SearchGlyph,
  SheetGlyph,
  ShieldGlyph,
  TriggerGlyph,
} from "./glyphs";
import { StateKey, stateAccent, stateCaption, stateLabel } from "@/lib/tokens";

export function Hero() {
  const [density, setDensity] = useState("full");
  const [motion, setMotion] = useState("normal");
  return (
    <header className="cvl-rise relative overflow-hidden rounded-2xl border border-[var(--cvl-line)] bg-[var(--cvl-panel)] p-8">
      <div className="cvl-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative">
        <div className="cvl-label">✳ canvasworks · design system</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Canonical Visual Language
        </h1>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--cvl-muted)]">
          One operating environment. Canvas, flow, cockpit, activity, epistemic board and inspector
          are projections of the same object model — never separate applications.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="cvl-label mr-2">density</span>
          {["compact", "full", "balanced"].map((d) => (
            <Chip key={d} active={density === d} onClick={() => setDensity(d)}>
              {d}
            </Chip>
          ))}
          <span className="cvl-label mx-2">motion</span>
          {["normal", "reduced"].map((m) => (
            <Chip key={m} accent="#a78bfa" active={motion === m} onClick={() => setMotion(m)}>
              {m}
            </Chip>
          ))}
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3">
          <span className="mt-0.5 text-amber-300">▲</span>
          <p className="text-[12px] leading-relaxed text-amber-100/80">
            <span className="cvl-mono uppercase tracking-[0.18em]">specimen fixture only</span> —
            every surface on this page is a controlled specimen. Progress values are explicit and
            never reflect live authorization.
          </p>
        </div>
      </div>
    </header>
  );
}

const states: StateKey[] = ["idle", "running", "signal", "completed", "blocked", "approval"];

export function Foundations() {
  return (
    <Section
      index="01"
      kicker="foundations"
      title="Background, Surfaces, Type, Spacing & Semantic States"
      blurb="The obsidian gloss material system spans six surfaces built from dark ambient baselines, hairline borders, one typography scale, semantic color — motion never, never decoration."
    >
      <div className="grid gap-8 lg:grid-cols-3">
        <div>
          <SubLabel id="1.1" text="backgrounds & fields" />
          <div className="grid grid-cols-2 gap-3">
            {[
              ["void", "#05070c"],
              ["canvas", "#080c14"],
              ["panel", "#0b111b"],
              ["rail glass", "#0e1522"],
              ["line", "#182233"],
              ["line soft", "#131c2a"],
            ].map(([name, hex]) => (
              <div
                key={name}
                className="group rounded-lg border border-[var(--cvl-line)] p-3 transition-all duration-300 hover:border-sky-400/40"
                style={{ background: hex }}
              >
                <div className="h-8" />
                <div className="cvl-mono text-[10px] uppercase tracking-[0.16em] text-[var(--cvl-muted)]">
                  {name}
                </div>
                <div className="cvl-mono text-[10px] text-[var(--cvl-dim)]">{hex}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SubLabel id="1.2" text="typography scale" />
          <div className="space-y-3 rounded-lg border border-[var(--cvl-line)] bg-[#070b12] p-4">
            <div className="cvl-label">display / 28 / -0.02em</div>
            <div className="text-2xl font-semibold tracking-tight">Company Context</div>
            <div className="cvl-label">title / 16 / -0.01em</div>
            <div className="text-base font-semibold">Margin model v2 — yield economics</div>
            <div className="cvl-label">body / 13 / 1.6</div>
            <p className="text-[13px] leading-relaxed text-[var(--cvl-muted)]">
              Verified outcomes and escalated decisions reach the founder without noise or
              intermediate translation layers.
            </p>
            <div className="cvl-label">mono / 11 / 0.16em</div>
            <div className="cvl-mono text-[11px] text-sky-300">RUN_ID · 0x9F27A4 · SEALED</div>
          </div>
        </div>

        <div>
          <SubLabel id="1.3" text="semantic states" />
          <div className="space-y-2">
            {states.map((s) => (
              <div
                key={s}
                className="flex items-center gap-3 rounded-lg border border-[var(--cvl-line)] bg-[#070b12] px-3 py-2 transition-all duration-300 hover:translate-x-1"
                style={{ boxShadow: `inset 3px 0 0 ${stateAccent[s]}` }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: stateAccent[s], boxShadow: `0 0 10px ${stateAccent[s]}` }}
                />
                <span className="cvl-mono text-[11px] uppercase tracking-[0.16em]">
                  {stateLabel[s]}
                </span>
                <span className="cvl-mono ml-auto text-[10px] text-[var(--cvl-dim)]">
                  {stateAccent[s]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10">
        <SubLabel id="1.4" text="icon treatment — circular entity medallions" />
        <div className="flex flex-wrap gap-6">
          <NodeOrb glyph={<GoogleG />} label="Gemini" caption="model" state="idle" />
          <NodeOrb glyph={<MemoryGlyph />} label="Memory" caption="context" state="running" />
          <NodeOrb glyph={<TriggerGlyph />} label="Trigger" caption="signal" state="signal" />
          <NodeOrb glyph={<SheetGlyph />} label="Artifact" caption="sealed" state="completed" />
          <NodeOrb glyph={<LockGlyph />} label="Blocked" caption="severed" state="blocked" />
          <NodeOrb glyph={<ShieldGlyph />} label="Approval" caption="gate" state="approval" />
        </div>
      </div>
    </Section>
  );
}

export function Entities() {
  return (
    <Section
      index="02"
      kicker="core entities"
      title="Company, Work, Research, Result & Decision Objects"
      blurb="The entity taxonomy of the spatial company context. Every object gains an identity medallion, a runtime state, an epistemic seal."
    >
      <div className="flex flex-wrap items-start gap-8">
        {[
          { g: <AgentGlyph />, l: "Company entity", c: "root context", s: "idle" },
          { g: <TriggerGlyph />, l: "Agent capability", c: "deploy unit", s: "idle" },
          { g: <SearchGlyph />, l: "Work object", c: "in progress", s: "running" },
          { g: <GoogleG />, l: "Market scan", c: "research", s: "signal" },
          { g: <SheetGlyph />, l: "Margin report", c: "result", s: "completed" },
          { g: <ShieldGlyph />, l: "Decision point", c: "authority", s: "approval" },
          { g: <LockGlyph />, l: "Blocked", c: "severed", s: "blocked" },
        ].map((n) => (
          <NodeOrb
            key={n.l}
            glyph={n.g}
            label={n.l}
            caption={n.c}
            state={n.s as StateKey}
            hanger
          />
        ))}
      </div>
    </Section>
  );
}

export function Perimeter() {
  const [pct, setPct] = useState(50);
  return (
    <Section
      index="03"
      kicker="perimeter language"
      title="The 4.5° Perimeter — the Single Progress Language"
      blurb="A loading progress stroke rendered ON the node's own shape — never a second decorative circle, never a generic spinner, never a fabricated percentage. Ratio of 72 o'clock, fills clockwise, completes at the top."
      right={
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="w-40 accent-sky-400"
        />
      }
    >
      <SubLabel id="3.1" text="measured progress — circular entity identity medallion" />
      <div className="flex flex-wrap justify-between gap-6">
        {[0, 25, pct, 75, 100].map((v, i) => (
          <ProgressRing key={i} value={v} accent={v === 100 ? stateAccent.completed : "#38bdf8"} label={`${v}% complete`} />
        ))}
      </div>

      <div className="mt-10">
        <SubLabel id="3.2" text="the six canonical states" />
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
          {states.map((s) => (
            <div key={s} className="flex flex-col items-center">
              <NodeOrb glyph={<AgentGlyph />} state={s} size={78} />
              <div
                className="cvl-mono mt-3 text-center text-[10px] uppercase tracking-[0.16em]"
                style={{ color: stateAccent[s] }}
              >
                {stateLabel[s]}
              </div>
              <div className="cvl-mono mt-1 text-[9px] text-[var(--cvl-dim)]">{stateCaption[s]}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function Relationships() {
  const rows: { k: StateKey; title: string; text: string; v: number }[] = [
    { k: "idle", title: "IDLE", text: "no authority claimed · no conduit energy", v: 4 },
    { k: "running", title: "RUNNING", text: "work executing, authority delegated, energy flowing", v: 62 },
    { k: "signal", title: "EXTERNAL ACTION", text: "waiting on third party, conduit held open", v: 38 },
    { k: "blocked", title: "BLOCKED", text: "conduit cut — action required to resume", v: 18 },
    { k: "completed", title: "COMPLETED", text: "sealed result, conduit at rest", v: 100 },
    { k: "approval", title: "GOVERNANCE", text: "human authority boundary crossed", v: 76 },
  ];
  return (
    <Section
      index="04"
      kicker="relationships"
      title="Conduit Semantics — Idle, Active, Signal, Completed, Blocked, Governance"
      blurb="How a relationship renders per execution state, drawn from the frozen CONDUIT_LANGUAGE token values. Animation represents actual data semantics — a severed edge never transmits energy in traveling, everything else stays static."
    >
      <div className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.k}
            className="group grid grid-cols-[110px_1fr_auto] items-center gap-4 rounded-lg border border-[var(--cvl-line)] bg-[#070b12] px-4 py-3 transition-colors hover:border-[color:var(--cvl-line)]"
          >
            <span
              className="cvl-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: stateAccent[r.k] }}
            >
              {r.title}
            </span>
            <div>
              <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-[#131c2a]">
                <span
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
                  style={{
                    width: `${r.v}%`,
                    background: stateAccent[r.k],
                    boxShadow: `0 0 10px ${stateAccent[r.k]}`,
                    opacity: r.k === "blocked" ? 0.5 : 1,
                  }}
                />
              </div>
              <div className="mt-2 text-[11px] text-[var(--cvl-muted)]">{r.text}</div>
            </div>
            <span className="cvl-mono text-[11px] text-[var(--cvl-dim)]">{r.v}%</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function Sequence() {
  const steps = [
    { l: "Trigger", s: "running", g: <TriggerGlyph /> },
    { l: "Market scan", s: "completed", g: <SearchGlyph /> },
    { l: "Compare", s: "running", g: <GoogleG /> },
    { l: "Analyze", s: "signal", g: <MemoryGlyph /> },
    { l: "Approval", s: "approval", g: <ShieldGlyph /> },
    { l: "Margin report", s: "completed", g: <SheetGlyph /> },
  ];
  return (
    <Section
      index="05"
      kicker="execution"
      title="The Compact Execution Sequence"
      blurb="Work → Research → Compare → Verify → Result: one company workstream advancing through authorization stages, fusion and third-in-space-to-owner semantics — never as latency-applied nodes."
    >
      <div className="flex items-center gap-2 overflow-x-auto pb-4">
        {steps.map((st, i) => (
          <div key={st.l} className="flex items-center gap-2">
            <NodeOrb glyph={st.g} state={st.s as StateKey} size={70} label={st.l} caption={`step ${i + 1}`} />
            {i < steps.length - 1 ? (
              <svg width="56" height="12" className="shrink-0">
                <line
                  x1="0"
                  y1="6"
                  x2="56"
                  y2="6"
                  stroke={stateAccent.running}
                  strokeWidth="1.2"
                  className="cvl-flowline"
                  opacity="0.8"
                />
              </svg>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

export function CanvasSection() {
  const [density, setDensity] = useState<"full" | "minimal">("full");
  return (
    <Section
      index="06"
      kicker="canvas"
      title="Spatial Company Context"
      blurb="The canvas is a spatial map of the company — organic entities, work and relationships. Execution energy travels as fire comets with residual source sparks and impact ignition; downstream memory conduits load as blue flow."
      right={
        <div className="flex items-center gap-2">
          <span className="cvl-label">fx</span>
          <Chip active={density === "full"} onClick={() => setDensity("full")}>
            full
          </Chip>
          <Chip active={density === "minimal"} onClick={() => setDensity("minimal")}>
            minimal
          </Chip>
        </div>
      }
    >
      <FlowCanvas density={density} />
    </Section>
  );
}

export function Surfaces() {
  return (
    <Section
      index="07"
      kicker="contextual surfaces"
      title="SideCard, Activity, Epistemic Board & Inspector"
      blurb="The contextual surface family. Same glass, same hairline pattern, same provenance footers — the epistemic board visually belongs to the same family as Company Activity because both are founder-facing projections of authoritative sensor state."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="cvl-panel overflow-hidden">
          <div className="cvl-label border-b border-[var(--cvl-line-soft)] p-3">
            ⬤ company activity
          </div>
          <div className="divide-y divide-[var(--cvl-line-soft)]">
            {[
              ["09:42", "Workstream completed all product stages", "completed"],
              ["09:38", "Escalated to founder — pricing authority", "approval"],
              ["09:21", "External vendor unresponsive 41m", "signal"],
              ["08:55", "Conduit severed: credentials expired", "blocked"],
            ].map(([t, msg, s]) => (
              <div key={t} className="flex gap-3 p-3 transition hover:bg-white/[0.02]">
                <span className="cvl-mono text-[10px] text-[var(--cvl-dim)]">{t}</span>
                <span className="text-[11.5px] leading-snug text-[var(--cvl-muted)]">{msg}</span>
                <span
                  className="ml-auto mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: stateAccent[s as StateKey],
                    boxShadow: `0 0 8px ${stateAccent[s as StateKey]}`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="cvl-panel overflow-hidden">
          <div className="cvl-label border-b border-[var(--cvl-line-soft)] p-3">
            ◆ epistemic board
          </div>
          <div className="space-y-3 p-3">
            {[
              ["VERIFIED", "Margin pricing is consolidating; assumptions hold", "#34d399"],
              ["MODELLED", "Unit margins hold above the 18% floor at current COGS", "#38bdf8"],
              ["CONTESTED", "Competitor A raised pricing 12% in June", "#f59e0b"],
              ["UNKNOWN", "Regional demand elasticity Q4", "#6b7c93"],
            ].map(([tag, txt, c]) => (
              <div
                key={tag}
                className="rounded-lg border border-[var(--cvl-line)] bg-[#070b12] p-3 transition hover:translate-x-0.5"
                style={{ boxShadow: `inset 2px 0 0 ${c}` }}
              >
                <span
                  className="cvl-mono text-[9px] uppercase tracking-[0.2em]"
                  style={{ color: c }}
                >
                  {tag}
                </span>
                <p className="mt-1 text-[11.5px] leading-snug text-[var(--cvl-muted)]">{txt}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="cvl-panel overflow-hidden">
          <div className="cvl-label border-b border-[var(--cvl-line-soft)] p-3">
            ▣ inspector & approval state
          </div>
          <div className="p-4">
            <div className="flex items-center gap-3">
              <NodeOrb glyph={<SheetGlyph />} state="approval" size={56} />
              <div>
                <div className="text-[13px] font-semibold">Margin model v2</div>
                <div className="cvl-mono text-[10px] text-[var(--cvl-dim)]">
                  awaiting approval · 00:14:22
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {[
                ["objective", "seal q3 pricing envelope"],
                ["authority", "founder only"],
                ["evidence", "7 sources · 2 contested"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-[var(--cvl-line-soft)] pb-1.5">
                  <span className="cvl-label">{k}</span>
                  <span className="cvl-mono text-[11px] text-[var(--cvl-muted)]">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-violet-400/30 bg-violet-400/[0.06] p-3">
              <div className="cvl-mono text-[9px] uppercase tracking-[0.2em] text-violet-300">
                founder authorization boundary
              </div>
              <p className="mt-1 text-[11px] leading-snug text-[var(--cvl-muted)]">
                Approve external pricing publication. Irreversible once sealed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

export function Commit() {
  const [sel, setSel] = useState("approve");
  return (
    <Section
      index="08"
      kicker="commit actions"
      title="Authority Through Restraint"
      blurb="Founder actions communicate authority with quiet, precisely sized controls — never dashboard-sized buttons. Approval intent pairs sit inside the surface where the decision lives."
    >
      <div className="flex flex-wrap items-center gap-3">
        <button className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-[12px] font-medium text-emerald-300 transition hover:bg-emerald-400/20 hover:shadow-[0_0_24px_rgba(52,211,153,0.25)]">
          Dispatch directive
        </button>
        <button className="rounded-md border border-[var(--cvl-line)] px-4 py-2 text-[12px] text-[var(--cvl-muted)] transition hover:border-sky-400/50 hover:text-sky-300">
          Defer
        </button>
        {["approve", "reject"].map((k) => (
          <button
            key={k}
            onClick={() => setSel(k)}
            className="rounded-md px-4 py-2 text-[12px] capitalize transition"
            style={{
              border: `1px solid ${sel === k ? (k === "approve" ? "#34d399" : "#f43f5e") : "var(--cvl-line)"}`,
              color: sel === k ? (k === "approve" ? "#34d399" : "#f43f5e") : "var(--cvl-muted)",
              background: sel === k ? (k === "approve" ? "#34d39914" : "#f43f5e14") : "transparent",
            }}
          >
            {k}
          </button>
        ))}
        <span className="cvl-label ml-auto">intent pair · irreversible</span>
      </div>
    </Section>
  );
}

export function EmptyStates() {
  return (
    <Section
      index="09"
      kicker="empty & signal states"
      title="Quiet Is a Real State"
      blurb="Empty space is never filled with fake telemetry. Each surface states exactly what would make it non-empty — nothing is simulated."
    >
      <div className="grid gap-5 md:grid-cols-3">
        {[
          ["all quiet", "nothing needs your attention", "Company Activity"],
          ["no pending claims", "the epistemic board has no contested entries", "Epistemic Board"],
          ["no node selected", "select an entity to inspect", "Inspector"],
        ].map(([t, s, src]) => (
          <div
            key={t}
            className="grid place-items-center rounded-lg border border-dashed border-[var(--cvl-line)] bg-[#070b12] p-8 text-center transition hover:border-sky-400/30"
          >
            <div className="cvl-breathe h-9 w-9 rounded-full border border-[var(--cvl-line)]" />
            <div className="cvl-mono mt-3 text-[11px] uppercase tracking-[0.2em] text-[var(--cvl-muted)]">
              {t}
            </div>
            <div className="mt-1 text-[11px] text-[var(--cvl-dim)]">{s}</div>
            <div className="cvl-label mt-3">{src}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}
