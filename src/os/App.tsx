import { useEffect, useState, lazy, Suspense } from "react";
import { Sparkles, LayoutGrid, ArrowLeft } from "lucide-react";
import DesktopOS from "./components/os/DesktopOS";
import ChatPanel from "./components/os/ChatPanel";
import { os } from "./lib/osStore";
import { syncFromServer, fetchGreeting, fetchBriefing } from "./lib/runtime";
import { osSound } from "./lib/osAudio";
import "@/sofia/sofia.css";

const SofiaSurface = lazy(() => import("@/sofia/App"));
const SharedSophiaVoicePresence = lazy(() => import("./components/voice/SharedSophiaVoicePresence"));

type Tab = "sophia" | "os";

interface AppProps {
  onNavigate?: (path: string) => void;
}

/* --------------------------------------------------------------------- App */

export default function App({ onNavigate }: AppProps = {}) {
  // Default to the OS Cockpit desktop so the user opens directly into the company operating system.
  const [tab, setTab] = useState<Tab>("os");

  // Apply persisted OS state after mount (hydration-safe: SSR and the first
  // client render both start from SEED; localStorage state lands post-mount),
  // then pull the server-authoritative read model (roster, durable agent runs,
  // approval gate records) so execution state is never UI-only.
  // Gate G6.6: Fetch Sophia's honest greeting grounded strictly in real company state.
  useEffect(() => {
    os.rehydrate();
    syncFromServer().catch(() => { /* runtime logs the honest failure */ });

    // Grounding inputs: client time, client hour, and real last session timestamp
    const lastSessionAt = typeof window !== "undefined" ? localStorage.getItem("sophia_last_session_time") : null;
    const nowIso = new Date().toISOString();
    const currentHour = new Date().getHours();

    fetchGreeting({ clientTime: nowIso, clientHour: currentHour, lastSessionAt })
      .then((greeting) => {
        os.setGreeting(greeting);
        try {
          localStorage.setItem("sophia_last_session_time", nowIso);
        } catch { /* fail soft */ }
      })
      .catch((err) => {
        console.warn("[greeting] Failed to fetch honest greeting on open:", err);
      });

    // Gate G6.8: Proactive briefing built strictly from decision log and approvals only
    fetchBriefing({ since: lastSessionAt || undefined })
      .then((res) => {
        if (res && res.briefing) {
          os.setBriefing(res.briefing);
          os.setBriefingEnabled(res.enabled);
        } else if (res && !res.enabled) {
          os.setBriefingEnabled(false);
        }
      })
      .catch((err) => {
        console.warn("[briefing] Failed to fetch proactive briefing on open:", err);
      });
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#01040a] text-slate-200">
      {/* ---------------- Persistent Top View Switcher (One Unified App) ---------------- */}
      <div className="fixed left-1/2 top-2 z-[60] -translate-x-1/2">
        <div className="os-mode-switcher flex items-center rounded-full p-0.5">
          <button
            onClick={() => { osSound.click(); setTab("os"); }}
            data-testid="mode-switcher-cockpit"
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase transition-all duration-200 active:scale-95 ${
              tab === "os"
                ? "bg-cyan-400/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.4),0_0_14px_rgba(56,189,248,0.4)]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <LayoutGrid size={12} className={tab === "os" ? "text-cyan-300" : "text-slate-400"} />
            <span>Cockpit</span>
          </button>
          <button
            onClick={() => { osSound.click(); setTab("sophia"); }}
            data-testid="mode-switcher-sophia"
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase transition-all duration-200 active:scale-95 ${
              tab === "sophia"
                ? "bg-cyan-400/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.4),0_0_14px_rgba(56,189,248,0.4)]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles size={12} className={tab === "sophia" ? "text-cyan-300" : "text-slate-400"} />
            <span>Sophia Presence</span>
          </button>
        </div>
      </div>

      {/* Return to Cockpit button when viewing Sophia presence */}
      {tab === "sophia" && (
        <div className="fixed top-3 left-4 z-50">
          <button
            onClick={() => { osSound.click(); setTab("os"); }}
            className="flex items-center gap-1.5 rounded-full border border-cyan-800/60 bg-black/60 px-3.5 py-1.5 text-xs font-semibold tracking-wider text-cyan-300 uppercase shadow-lg backdrop-blur-md transition-all hover:bg-black/90 active:scale-95"
            title="Return to SamJuniorsOS Cockpit"
          >
            <ArrowLeft size={13} />
            <span>Return to Cockpit</span>
          </button>
        </div>
      )}

      {/* SOFIA's display: mounted for the whole session, hidden (not torn
          down) behind the OS surface so her ears and her voice survive
          tab switches — she is the assistant of the OS, not of one pane.
          Inside the scope, the surface is verbatim SofiaUI — nothing from
          the destination renders inside her tab. */}
      <div
        className={`sofia-scope${tab === "sophia" ? "" : " sofia-scope-hidden"}`}
        aria-hidden={tab !== "sophia"}
      >
        <Suspense fallback={<div className="sofia-scope" aria-hidden="true" />}>
          <SofiaSurface active={tab === "sophia"} />
        </Suspense>
      </div>

      {tab === "os" && <DesktopOS onOpenNeural={() => setTab("sophia")} />}

      {/* Retain the canonical text chat surface; do not mount a second
          microphone/voice WebSocket when switching to the OS desktop. */}
      {tab !== "sophia" && <ChatPanel />}

      {/* Same SofiaOS instance as the always-mounted full-screen SofiaUI.
          This shares Gemini Live audio, VAD, TTS, context and barge-in. */}
      {tab !== "sophia" && (
        <Suspense fallback={null}>
          <SharedSophiaVoicePresence />
        </Suspense>
      )}
    </div>
  );
}
