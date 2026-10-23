import { useEffect, useState, lazy, Suspense } from "react";
import { Sparkles, LayoutGrid, Palette } from "lucide-react";
import DesktopOS from "./components/os/DesktopOS";
import ChatPanel from "./components/os/ChatPanel";
import { os } from "./lib/osStore";
import { syncFromServer } from "./lib/runtime";
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

          {/* Route toggle: main canvas ⇄ design-system specimen (navigation, not a mode) */}
          <span aria-hidden="true" className="mx-0.5 h-3 w-px bg-white/10" />
          <button
            onClick={() => {
              osSound.click();
              if (onNavigate) {
                onNavigate("/design-system/workflow");
              } else {
                window.history.pushState({}, '', "/design-system/workflow");
                window.dispatchEvent(new PopStateEvent('popstate'));
              }
            }}
            title="Open the workflow design-system specimen"
            aria-label="Open the workflow design-system specimen"
            className="group flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase text-slate-400 transition-all duration-200 hover:text-cyan-100 active:scale-95"
          >
            <Palette size={12} className="text-slate-400 transition-colors duration-200 group-hover:text-cyan-300" />
            <span>Design</span>
          </button>
        </div>
      </div>

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
