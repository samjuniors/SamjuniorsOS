import { useCallback, useRef, useState } from "react";
import NeuralCanvas, { type Stats } from "./components/NeuralCanvas";
import ControlPanel from "./components/ControlPanel";
import FlowDesktop from "./components/FlowDesktop";
import { defaultSettings, type NeuralField, type Settings } from "./lib/field";

type Tab = "neural" | "desktop";

function NeuralScene() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [stats, setStats] = useState<Stats>({ nodes: 0, links: 0, packets: 0, fps: 60 });
  const fieldRef = useRef<NeuralField | null>(null);
  const frame = useRef(0);

  const handleStats = useCallback((s: Stats) => {
    frame.current++;
    if (frame.current % 20 === 0) setStats(s);
  }, []);

  const setField = useCallback((f: NeuralField | null) => {
    fieldRef.current = f;
  }, []);

  return (
    <>
      <NeuralCanvas settings={settings} onStats={handleStats} fieldRef={setField} />

      <div className="pointer-events-none absolute left-6 top-20 z-10 max-w-[min(22rem,calc(100vw-19rem))]">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-300/5 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-cyan-200/70 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_2px_rgba(103,232,249,0.9)]" />
          Live Simulation
        </div>
        <h1 className="text-3xl font-light leading-tight tracking-tight text-white sm:text-4xl">
          Neural{" "}
          <span className="bg-gradient-to-r from-cyan-200 via-sky-300 to-blue-400 bg-clip-text font-medium text-transparent">
            Particle Lattice
          </span>
        </h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-400">
          A living neuron: the cortex fires and speaks, axons carry the signal to a
          spring-coupled globe of synapses. Grab a node — feel it recoil.
        </p>
      </div>

      <div className="absolute right-4 top-16 max-h-[calc(100vh-5rem)] overflow-y-auto [scrollbar-width:none]">
        <ControlPanel
          settings={settings}
          onChange={setSettings}
          onPulse={() => fieldRef.current?.pulseAll()}
          onShake={() => fieldRef.current?.shake()}
          onReset={() => setSettings({ ...defaultSettings })}
        />
      </div>

      <div className="pointer-events-none absolute bottom-6 left-6 z-10 hidden space-y-2 text-[11px] uppercase tracking-[0.16em] text-slate-500 sm:block">
        {[
          ["Hover node", "electric arcs + sparks"],
          ["Click node", "fire action potential"],
          ["Left drag", "grab + spring recoil"],
          ["Right drag", "rotate the globe"],
          ["Voice", "the core speaks its pulses"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center gap-3">
            <span className="w-24 text-cyan-200/70">{k}</span>
            <span className="h-px w-6 bg-gradient-to-r from-cyan-300/60 to-transparent" />
            <span className="normal-case tracking-normal text-slate-400">{v}</span>
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-6 right-6 z-10 flex gap-5 rounded-xl border border-white/5 bg-[#040a14]/60 px-4 py-2.5 font-mono text-[11px] text-slate-400 backdrop-blur-sm">
        <span>NODES <span className="text-cyan-200">{stats.nodes}</span></span>
        <span>SYNAPSES <span className="text-cyan-200">{stats.links}</span></span>
        <span>SIGNALS <span className="text-violet-200">{stats.packets}</span></span>
        <span>FPS <span className="text-cyan-200">{stats.fps}</span></span>
      </div>
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("neural");

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#01040a] text-slate-200">
      {tab === "neural" ? <NeuralScene /> : <FlowDesktop />}

      {/* tab bar */}
      <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[#040a14]/75 p-1 backdrop-blur-md shadow-[0_0_30px_-8px_rgba(56,189,248,0.5)]">
          {([
            ["neural", "Neural Core"],
            ["desktop", "Desktop"],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-full px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] transition ${
                tab === id
                  ? "bg-cyan-300/15 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.35)]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
