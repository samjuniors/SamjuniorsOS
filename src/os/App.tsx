import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, MicOff, Sparkles, LayoutGrid } from "lucide-react";
import NeuralCanvas from "./components/NeuralCanvas";
import SophiaPanel from "./components/SophiaPanel";
import DesktopOS from "./components/os/DesktopOS";
import ChatPanel from "./components/os/ChatPanel";
import { defaultSettings, type NeuralField, type Settings } from "./lib/field";
import { os, useOS, openAttention, openDecisions, activeWork } from "./lib/osStore";
import { agentChat, dispatchDirective, looksLikeDirective, summarizeRun, syncFromServer } from "./lib/runtime";
import { osSound } from "./lib/osAudio";

type Tab = "sophia" | "os";

/* ------------------------------------------------------------------ Sophia */

function SophiaScene({ onOpenOS: _onOpenOS }: { onOpenOS: () => void }) {
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

  const submit = async () => {
    const text = ask.trim();
    if (!text) return;
    setAsk("");
    os.setSophia("thinking");
    try {
      // 1. Local founder records (hand-raised decisions, focus, notes) and
      //    briefings derived from real synced state.
      const local = os.localCommand(text);
      if (local !== null) { os.setSophia("idle"); say(local); return; }

      // 2. Founder command → the REAL orchestration path
      //    (POST /api/orchestrate → MultiAgentOrchestrator 9-step council).
      //    Live progress surfaces from durable agent-run records while it runs.
      if (looksLikeDirective(text)) {
        const run = await dispatchDirective(text);
        os.setSophia("idle");
        say(summarizeRun(run));
        return;
      }

      // 3. Conversational → the REAL Sophia persona (POST /api/agent-chat).
      const res = await agentChat({ agentId: "coo", message: text });
      os.setSophia("idle");
      say(res.reply);
    } catch (err) {
      // Honest failure — nothing is simulated on the local machine.
      os.setSophia("idle");
      const msg = err instanceof Error ? err.message : String(err);
      os.log(`Execution failed: ${msg}`);
      say(`That failed on the server — nothing was simulated locally. ${msg}`);
    }
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
    : work.length ? `All quiet · ${work.length} workstream${work.length > 1 ? "s" : ""} active` : "All quiet. Nothing needs you.";

  return (
    <>
      <NeuralCanvas settings={settings} fieldRef={setField} />

      {/* identity + now — calm, prominent executive presence */}
      <div className="pointer-events-none absolute left-6 top-20 z-10 max-w-[min(26rem,calc(100vw-20rem))]">
        <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-300/5 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-cyan-200/75 backdrop-blur-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${modeDot} ${mode === "speaking" ? "animate-pulse" : ""}`} />
          Sophia · {modeLabel}
        </div>
        {/* suppressHydrationWarning: time-of-day greeting is legitimately time-dependent (SSR render time ≠ client hydration time) */}
        <h1 suppressHydrationWarning className="text-3xl font-light leading-tight tracking-tight text-white sm:text-4xl">
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"},{" "}
          <span className="bg-gradient-to-r from-cyan-200 via-sky-300 to-blue-400 bg-clip-text font-medium text-transparent">Sam</span>
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-slate-300/90">{now}</p>
        {company.focus && (
          <p className="mt-2 text-[11.5px] text-slate-400">
            <span className="uppercase tracking-[0.18em] text-cyan-200/60">Focus</span> · {company.focus}
          </p>
        )}
        {reply && (
          <div className="mt-3.5 max-w-sm rounded-2xl border border-cyan-300/20 bg-[#040a14]/65 p-3 text-[12.5px] italic leading-relaxed text-cyan-50/90 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md" style={{ animation: "os-in 260ms cubic-bezier(.16,1,.3,1)" }}>
            “{reply}”
          </div>
        )}
      </div>

      {/* contextual briefing trigger & panel */}
      <div className="absolute right-3 top-16 z-20 sm:right-6 sm:top-20">
        <SophiaPanel settings={settings} onChange={setSettings} onReset={() => setSettings({ ...defaultSettings, voice: settings.voice })} onSpeak={say} />
      </div>

      {/* ask bar — clean, calm conversational input */}
      <div className="absolute bottom-8 left-1/2 z-20 w-[min(540px,calc(100vw-2rem))] -translate-x-1/2">
        <form
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
          className="flex items-center gap-2 rounded-2xl border border-cyan-200/15 bg-[#040a14]/80 p-1.5 pl-3 shadow-[0_0_50px_-12px_rgba(56,189,248,0.35)] backdrop-blur-xl transition duration-200 focus-within:border-cyan-300/50 focus-within:shadow-[0_0_60px_-10px_rgba(56,189,248,0.5)]"
        >
          <button
            type="button"
            title={settings.voice ? "Voice on — click to mute" : "Voice off — click to enable voice"}
            onClick={() => setSettings((s) => ({ ...s, voice: !s.voice }))}
            className={`rounded-xl p-2 transition ${settings.voice ? "bg-cyan-400/20 text-cyan-200 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "text-slate-500 hover:text-slate-300"}`}
          >
            {settings.voice ? <Mic size={15} /> : <MicOff size={15} />}
          </button>
          <input
            ref={askRef}
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Ask or direct Sophia… (/ to focus)"
            className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-white outline-none placeholder:text-slate-500"
          />
          <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:block">/</kbd>
          <button
            type="submit"
            disabled={!ask.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-sky-500 text-slate-950 shadow-[0_0_14px_rgba(56,189,248,0.4)] transition hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:shadow-none"
          >
            <ArrowUp size={15} strokeWidth={2.5} />
          </button>
        </form>
      </div>
    </>
  );
}

/* --------------------------------------------------------------------- App */

export default function App() {
  const [tab, setTab] = useState<Tab>("sophia");

  // Apply persisted OS state after mount (hydration-safe: SSR and the first
  // client render both start from SEED; localStorage state lands post-mount),
  // then pull the server-authoritative read model (roster, durable agent runs,
  // approval gate records) so execution state is never UI-only.
  useEffect(() => {
    os.rehydrate();
    syncFromServer().catch(() => { /* runtime logs the honest failure */ });
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#01040a] text-slate-200">
      {/* ---------------- Persistent Top Mode Switcher (Zero Flicker, Identical Coordinates) ---------------- */}
      <div className="fixed left-1/2 top-2 z-[60] -translate-x-1/2">
        <div className="os-mode-switcher flex items-center rounded-full p-0.5">
          <button
            onClick={() => { osSound.click(); setTab("sophia"); }}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase transition-all duration-200 active:scale-95 ${
              tab === "sophia"
                ? "bg-cyan-400/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.4),0_0_14px_rgba(56,189,248,0.4)]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles size={12} className={tab === "sophia" ? "text-cyan-300" : "text-slate-400"} />
            <span>Sophia</span>
          </button>
          <button
            onClick={() => { osSound.click(); setTab("os"); }}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase transition-all duration-200 active:scale-95 ${
              tab === "os"
                ? "bg-cyan-400/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.4),0_0_14px_rgba(56,189,248,0.4)]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <LayoutGrid size={12} className={tab === "os" ? "text-cyan-300" : "text-slate-400"} />
            <span>SamJuniorsOS</span>
          </button>
        </div>
      </div>

      {tab === "sophia" ? (
        <SophiaScene onOpenOS={() => setTab("os")} />
      ) : (
        <DesktopOS onOpenNeural={() => setTab("sophia")} />
      )}

      {/* Floating Agent Chat Launcher & Small Handy Chat Panel */}
      <ChatPanel />
    </div>
  );
}
