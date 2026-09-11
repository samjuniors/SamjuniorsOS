import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, MicOff } from "lucide-react";
import NeuralCanvas from "./components/NeuralCanvas";
import SophiaPanel from "./components/SophiaPanel";
import DesktopOS from "./components/os/DesktopOS";
import { defaultSettings, type NeuralField, type Settings } from "./lib/field";
import { os, useOS, openAttention, openDecisions, activeWork } from "./lib/osStore";

type Tab = "sophia" | "os";

function useTicker(ms: number) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

function fmtSession(startedAt: number) {
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ Sophia */

function SophiaScene({ onOpenOS }: { onOpenOS: () => void }) {
  const [settings, setSettings] = useState<Settings>(() => ({ ...defaultSettings, voice: false }));
  const fieldRef = useRef<NeuralField | null>(null);
  const [ask, setAsk] = useState("");
  const [reply, setReply] = useState<string>("");
  const askRef = useRef<HTMLInputElement | null>(null);

  const attention = useOS(openAttention);
  const decisions = useOS(openDecisions);
  const work = useOS(activeWork);
  const mode = useOS((s) => s.sophia);
  const company = useOS((s) => s.company);
  const sessionStart = useOS((s) => s.sessionStart);
  useTicker(1000);

  const setField = useCallback((f: NeuralField | null) => {
    fieldRef.current = f;
    if (!f) return;
    // Sophia speaks from real OS state, at a calm cadence.
    f.phraseProvider = () => os.ambient();
    f.fireRange = [26, 48];
    f.voiceProfile = { rate: 1.0, pitch: 1.05, volume: 0.9 };
    f.onSpeechStart = (t) => { os.setSophia("speaking"); os.setLastSaid(t); setReply(t); };
    f.onSpeechEnd = () => os.setSophia("idle");
  }, []);

  // Attentive whenever something is waiting; idle otherwise.
  useEffect(() => {
    if (mode === "speaking" || mode === "thinking") return;
    os.setSophia(attention.length ? "attentive" : "idle");
  }, [attention.length, mode]);

  const say = useCallback((text: string) => {
    setReply(text);
    os.setLastSaid(text);
    const f = fieldRef.current;
    if (f && settings.voice) f.say(text);
    else f?.pulseAll();
  }, [settings.voice]);

  const submit = () => {
    const text = ask.trim();
    if (!text) return;
    setAsk("");
    os.setSophia("thinking");
    const response = os.ask(text);
    setTimeout(() => { os.setSophia("idle"); say(response); }, 380);
  };

  // "/" focuses the ask bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
      if (!typing && e.key === "/") { e.preventDefault(); askRef.current?.focus(); }
      if (!typing && (e.key === "b" || e.key === "B")) say(os.brief());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [say]);

  const modeLabel = mode === "speaking" ? "Speaking" : mode === "thinking" ? "Thinking" : mode === "attentive" ? "Attentive" : "Idle";
  const modeDot = mode === "speaking" ? "bg-violet-300 shadow-[0_0_8px_2px_rgba(196,160,255,0.9)]" : mode === "attentive" ? "bg-amber-300 shadow-[0_0_8px_2px_rgba(252,211,77,0.8)]" : "bg-cyan-300 shadow-[0_0_8px_2px_rgba(103,232,249,0.9)]";
  const now = attention.length
    ? `${decisions.length ? `${decisions.length} decision${decisions.length > 1 ? "s" : ""} · ` : ""}${attention.length} item${attention.length > 1 ? "s" : ""} need you`
    : work.length ? `Nothing needs you · ${work.length} workstream${work.length > 1 ? "s" : ""} in progress` : "Nothing needs you";

  return (
    <>
      <NeuralCanvas settings={settings} fieldRef={setField} />

      {/* identity + now */}
      <div className="pointer-events-none absolute left-6 top-20 z-10 max-w-[min(22rem,calc(100vw-20rem))]">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-300/5 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-cyan-200/70 backdrop-blur-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${modeDot} ${mode === "speaking" ? "animate-pulse" : ""}`} />
          Sophia · {modeLabel}
        </div>
        <h1 className="text-3xl font-light leading-tight tracking-tight text-white sm:text-4xl">
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"},{" "}
          <span className="bg-gradient-to-r from-cyan-200 via-sky-300 to-blue-400 bg-clip-text font-medium text-transparent">Sam</span>
        </h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-400">{now}.</p>
        {company.focus ? (
          <p className="mt-2 text-[12px] text-slate-500"><span className="uppercase tracking-[0.18em] text-cyan-200/60">Focus</span> · {company.focus}</p>
        ) : (
          <p className="mt-2 text-[12px] text-slate-500">No focus set — say <span className="font-mono text-cyan-200/80">focus …</span> below.</p>
        )}
        {reply && (
          <p className="mt-4 max-w-xs border-l border-cyan-300/30 pl-3 text-[13px] italic leading-relaxed text-cyan-50/85" style={{ animation: "os-in 260ms cubic-bezier(.16,1,.3,1)" }}>
            “{reply}”
          </p>
        )}
      </div>

      {/* briefing panel */}
      <div className="absolute right-4 top-16 z-20 max-h-[calc(100vh-5rem)] [scrollbar-width:none]">
        <SophiaPanel settings={settings} onChange={setSettings} onReset={() => setSettings({ ...defaultSettings, voice: settings.voice })} onSpeak={say} />
      </div>

      {/* ask bar */}
      <div className="absolute bottom-20 left-1/2 z-20 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2">
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="flex items-center gap-2 rounded-2xl border border-cyan-200/15 bg-[#040a14]/75 p-1.5 pl-3 shadow-[0_0_50px_-12px_rgba(56,189,248,0.5)] backdrop-blur-md transition focus-within:border-cyan-200/40"
        >
          <button type="button" title={settings.voice ? "Voice on" : "Voice off"} onClick={() => setSettings((s) => ({ ...s, voice: !s.voice }))} className={`rounded-lg p-1.5 transition ${settings.voice ? "text-cyan-200" : "text-slate-500 hover:text-slate-300"}`}>
            {settings.voice ? <Mic size={15} /> : <MicOff size={15} />}
          </button>
          <input
            ref={askRef}
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Ask Sophia — try “status”, “decide …”, “work on …”, “focus …”"
            className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-white outline-none placeholder:text-slate-500"
          />
          <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:block">/</kbd>
          <button type="submit" disabled={!ask.trim()} className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-400/90 text-[#04121b] transition hover:bg-cyan-300 disabled:opacity-30">
            <ArrowUp size={15} strokeWidth={2.5} />
          </button>
        </form>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          {["status", "decide: ", "work on: ", "focus: "].map((q) => (
            <button key={q} onClick={() => { if (q.endsWith(" ")) { setAsk(q); askRef.current?.focus(); } else { setAsk(""); say(os.brief()); } }} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[10.5px] text-slate-400 transition hover:border-cyan-200/30 hover:text-cyan-100">{q.trim()}</button>
          ))}
          <button onClick={onOpenOS} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10.5px] uppercase tracking-[0.16em] text-slate-400 transition hover:border-cyan-200/30 hover:text-cyan-100">Open SamJuniorsOS →</button>
        </div>
      </div>

      {/* V2: minimal keyboard hint — replaces verbose interaction help block */}
      <div className="pointer-events-none absolute bottom-6 left-6 z-10 hidden items-center gap-4 rounded-lg border border-white/5 bg-[#040a14]/50 px-3 py-1.5 text-[10px] text-slate-500 backdrop-blur-sm lg:flex">
        <span><kbd className="rounded bg-white/5 px-1 mr-1 text-cyan-200/70">/</kbd> ask</span>
        <span><kbd className="rounded bg-white/5 px-1 mr-1 text-cyan-200/70">B</kbd> briefing</span>
        <span>drag nodes · right-drag rotates</span>
      </div>

      {/* state strip — real states only */}
      <div className="pointer-events-none absolute bottom-6 right-6 z-10 flex gap-5 rounded-xl border border-white/5 bg-[#040a14]/60 px-4 py-2.5 font-mono text-[11px] text-slate-400 backdrop-blur-sm">
        <span>STATE <span className="text-cyan-200">{modeLabel.toUpperCase()}</span></span>
        <span>NEEDS YOU <span className={attention.length ? "text-amber-200" : "text-cyan-200"}>{attention.length}</span></span>
        <span>VOICE <span className="text-cyan-200">{settings.voice ? "ON" : "OFF"}</span></span>
        <span>SESSION <span className="text-cyan-200">{fmtSession(sessionStart)}</span></span>
      </div>
    </>
  );
}

/* --------------------------------------------------------------------- App */

export default function App() {
  const [tab, setTab] = useState<Tab>("sophia");

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#01040a] text-slate-200">
      {tab === "sophia" ? <SophiaScene onOpenOS={() => setTab("os")} /> : <DesktopOS onOpenNeural={() => setTab("sophia")} />}

      {tab === "sophia" && (
        <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2">
          {/* V2: Refined segmented control mode pill */}
          <div className="flex items-center rounded-full border border-white/10 bg-[#040a14]/80 p-0.5 backdrop-blur-md shadow-[0_0_30px_-8px_rgba(56,189,248,0.4)]">
            {([
              ["sophia", "Sophia"],
              ["os", "SamJuniorsOS"],
            ] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`relative rounded-full px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] transition-all duration-200 ${
                  tab === id
                    ? "bg-cyan-300/15 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.30),0_0_12px_-3px_rgba(103,232,249,0.4)]"
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
