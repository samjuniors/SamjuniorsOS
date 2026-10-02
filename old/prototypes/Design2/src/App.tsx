import { useCallback, useRef, useState } from "react";
import NeuralCanvas, { type Stats } from "./components/NeuralCanvas";
import ControlPanel from "./components/ControlPanel";
import DesktopOS from "./components/os/DesktopOS";
import { defaultSettings, type NeuralField, type Settings } from "./lib/field";
import { OS } from "./lib/osContent";

type Tab = "neural" | "desktop";

function NeuralScene({ onEnterDesk }: { onEnterDesk: () => void }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [stats, setStats] = useState<Stats>({ nodes: 0, links: 0, packets: 0, fps: 60 });
  const [nowOpen, setNowOpen] = useState(true);
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
          {OS.companion} · Live
        </div>
        <h1 className="text-3xl font-light leading-tight tracking-tight text-white sm:text-4xl">
          {OS.companion}
        </h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-400">
          I'm here. Hold a point of light, or open the desk when there is work.
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

      {/* contextual now-panel — progressive disclosure */}
      <div className="pointer-events-auto absolute bottom-6 left-6 z-10 hidden w-[280px] sm:block">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#040a14]/70 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.75)] backdrop-blur-md">
          <button
            onClick={() => setNowOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-100/80">Now</span>
            <span className={`text-cyan-200/50 transition-transform ${nowOpen ? "rotate-180" : ""}`}>▾</span>
          </button>
          {nowOpen && (
            <div className="space-y-2 border-t border-white/5 px-4 pb-4 pt-3">
              {[
                ["Attention", "Listening"],
                ["Decisions", "2 waiting on the desk"],
                ["Workforce", "Present"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="uppercase tracking-[0.14em] text-slate-500">{k}</span>
                  <span className="text-slate-200">{v}</span>
                </div>
              ))}
              <button
                onClick={onEnterDesk}
                className="mt-2 w-full rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-400/20"
              >
                Open the desk
              </button>
            </div>
          )}
        </div>
        <div className="mt-3 space-y-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-500">
          {[
            ["Hover", "she notices"],
            ["Click", "she speaks"],
            ["Hold", "she follows"],
            ["Drag space", "look around"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-24 text-cyan-200/70">{k}</span>
              <span className="h-px w-6 bg-gradient-to-r from-cyan-300/60 to-transparent" />
              <span className="normal-case tracking-normal text-slate-400">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-6 right-6 z-10 flex gap-5 rounded-xl border border-white/5 bg-[#040a14]/60 px-4 py-2.5 font-mono text-[11px] text-slate-400 backdrop-blur-sm">
        <span>FIELD <span className="text-cyan-200">{stats.nodes}</span></span>
        <span>LINKS <span className="text-cyan-200">{stats.links}</span></span>
        <span>FLOW <span className="text-violet-200">{stats.packets}</span></span>
        <span>FPS <span className="text-cyan-200">{stats.fps}</span></span>
      </div>
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("neural");

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#01040a] text-slate-200">
      {tab === "neural" ? <NeuralScene onEnterDesk={() => setTab("desktop")} /> : <DesktopOS onOpenNeural={() => setTab("neural")} />}

      {tab === "neural" && (
        <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[#040a14]/75 p-1 backdrop-blur-md shadow-[0_0_30px_-8px_rgba(56,189,248,0.5)]">
            {([
              ["neural", OS.companion],
              ["desktop", "Desk"],
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
      )}
    </div>
  );
}
