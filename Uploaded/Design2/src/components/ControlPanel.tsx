import { useState } from "react";
import type { Settings } from "../lib/field";

type Props = {
  settings: Settings;
  onChange: (s: Settings) => void;
  onPulse: () => void;
  onShake: () => void;
  onReset: () => void;
};

function Slider({
  label, value, min, max, step, onChange, format,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <label className="block select-none">
      <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-cyan-100/55">
        <span>{label}</span>
        <span className="font-mono text-cyan-200/90">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="slider h-1 w-full cursor-pointer appearance-none rounded-full bg-cyan-300/15 outline-none"
      />
    </label>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-[11px] uppercase tracking-[0.14em] transition ${
        on
          ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
          : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20"
      }`}
    >
      <span>{label}</span>
      <span
        className={`ml-3 h-3.5 w-6 rounded-full p-0.5 transition ${on ? "bg-cyan-400/70" : "bg-slate-600/70"}`}
      >
        <span
          className={`block h-2.5 w-2.5 rounded-full bg-white transition-transform ${on ? "translate-x-2.5" : ""}`}
        />
      </span>
    </button>
  );
}

export default function ControlPanel({ settings, onChange, onPulse, onShake, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });

  return (
    <div className="pointer-events-auto relative z-20 w-[268px] max-w-[calc(100vw-2rem)]">
      <div className="overflow-hidden rounded-2xl border border-cyan-200/12 bg-[#040a14]/70 shadow-[0_0_60px_-15px_rgba(56,189,248,0.45)] backdrop-blur-md">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-100/80">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_10px_2px_rgba(103,232,249,0.8)]" />
            Presence
          </span>
          <span className={`text-cyan-200/60 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </button>

        {open && (
          <div className="space-y-4 border-t border-white/5 px-4 pb-4 pt-4">
            <Slider
              label="Presence" value={settings.nodeCount} min={80} max={420} step={10}
              onChange={(v) => set("nodeCount", Math.round(v))} format={(v) => String(Math.round(v))}
            />
            <Slider
              label="Reach" value={settings.linkDistance} min={0.2} max={0.8} step={0.01}
              onChange={(v) => set("linkDistance", v)}
            />
            <Slider
              label="Orbit" value={settings.rotationSpeed} min={0} max={2.5} step={0.05}
              onChange={(v) => set("rotationSpeed", v)}
            />
            <Slider
              label="Glow" value={settings.glow} min={0.4} max={2} step={0.05}
              onChange={(v) => set("glow", v)}
            />
            <Slider
              label="Tension" value={settings.stiffness} min={0.25} max={2.2} step={0.05}
              onChange={(v) => set("stiffness", v)}
            />
            <Slider
              label="Field" value={settings.mouseForce} min={0} max={3} step={0.05}
              onChange={(v) => set("mouseForce", v)}
            />
            <Slider
              label="Flow" value={settings.dataFlow} min={0} max={3} step={0.05}
              onChange={(v) => set("dataFlow", v)}
            />
            <Slider
              label="Bloom" value={settings.bloom} min={0} max={1.6} step={0.05}
              onChange={(v) => set("bloom", v)}
            />
            <Slider
              label="Filaments" value={settings.axonSize} min={0.3} max={2.4} step={0.05}
              onChange={(v) => set("axonSize", v)}
            />

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Toggle label="Links" on={settings.showLinks} onClick={() => set("showLinks", !settings.showLinks)} />
              <Toggle label="Dust" on={settings.dust} onClick={() => set("dust", !settings.dust)} />
              <Toggle label="Orbit" on={settings.autoRotate} onClick={() => set("autoRotate", !settings.autoRotate)} />
              <Toggle label="Lines" on={settings.axons} onClick={() => set("axons", !settings.axons)} />
              <Toggle label="Voice" on={settings.voice} onClick={() => set("voice", !settings.voice)} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onPulse}
                className="rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-400/20"
              >
                Speak
              </button>
              <button
                onClick={onShake}
                className="rounded-lg border border-fuchsia-300/25 bg-fuchsia-400/10 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-fuchsia-100 transition hover:bg-fuchsia-400/20"
              >
                Stir
              </button>
            </div>

            <button
              onClick={onReset}
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-slate-400 transition hover:border-white/25 hover:text-slate-200"
            >
              Reset Defaults
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
