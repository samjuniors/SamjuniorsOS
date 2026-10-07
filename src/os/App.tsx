'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Sparkles, LayoutGrid, Palette } from "lucide-react";
import SophiaPanel from "./components/SophiaPanel";
import DesktopOS from "./components/os/DesktopOS";
import ChatPanel from "./components/os/ChatPanel";
import LiveTranscriptRibbon from "./components/os/LiveTranscriptRibbon";
import VoicePresence from "./components/voice/VoicePresence";
import { BootScreen } from "./components/os/BootScreen";
import { defaultSettings, type Settings } from "./lib/field";
import { os } from "./lib/osStore";
import { syncFromServer } from "./lib/runtime";
import { osSound } from "./lib/osAudio";
import "@/sofia/sofia.css";

/** The SOFIA display — the SofiaUI surface port (src/sofia). Client-only
 *  like the whole scene stack it carries (WebGL, WebAudio, speech); inside
 *  the shell it stays mounted for the session, hidden behind the OS
 *  surface, so her microphone and her voice keep running wherever the
 *  founder is working. */
const SofiaSurface = dynamic(() => import("@/sofia/App"), {
  ssr: false,
  loading: () => <div className="sofia-scope" aria-hidden="true" />,
});

type Tab = "sophia" | "os";

/* --------------------------------------------------------------------- App */

export default function App() {
  // The Sophia surface is the entry experience of the OS (SofiaUI's boot
  // contract: she is the interface); the SamJuniorsOS desktop is one
  // switch away and stays fully functional.
  const [tab, setTab] = useState<Tab>("sophia");
  const [isBooting, setIsBooting] = useState(true);
  const [panelSettings, setPanelSettings] = useState<Settings>(() => ({ ...defaultSettings, voice: false }));
  const router = useRouter();

  // Apply persisted OS state after mount (hydration-safe: SSR and the first
  // client render both start from SEED; localStorage state lands post-mount),
  // then pull the server-authoritative read model (roster, durable agent runs,
  // approval gate records) so execution state is never UI-only.
  useEffect(() => {
    os.rehydrate();
    syncFromServer().catch(() => { /* runtime logs the honest failure */ });
  }, []);

  if (isBooting) {
    return <BootScreen onComplete={() => setIsBooting(false)} />;
  }

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
            onClick={() => { osSound.click(); router.push("/design-system/workflow"); }}
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
          tab switches — she is the assistant of the OS, not of one pane. */}
      <div
        className={`sofia-scope${tab === "sophia" ? "" : " sofia-scope-hidden"}`}
        aria-hidden={tab !== "sophia"}
      >
        <SofiaSurface active={tab === "sophia"} />
      </div>

      {/* Sophia's contextual briefing panel (decisions, needs-you, memory
          review) rides beside her surface — collapsed to a pill by default. */}
      {tab === "sophia" && (
        <div className="absolute right-3 top-16 z-20 sm:right-6 sm:top-20">
          <SophiaPanel
            settings={panelSettings}
            onChange={setPanelSettings}
            onReset={() => setPanelSettings({ ...defaultSettings, voice: panelSettings.voice })}
            onSpeak={(text) => os.setLastSaid(text)}
          />
        </div>
      )}

      {tab === "os" && <DesktopOS onOpenNeural={() => setTab("sophia")} />}

      {/* While Sophia's display is up, the OS's own conversation chrome
          stands down — she IS the conversation surface, with her own chat,
          transcript line and voice. The chrome returns on the OS surface. */}
      {tab !== "sophia" && <ChatPanel />}

      {/* Contextual Live Voice & STT Transcript Ribbon */}
      {tab !== "sophia" && <LiveTranscriptRibbon />}

      {/* SofiaUI-derived voice presence: the state-driven orb, mic-permission
          UX and interruption feedback — the voice surface of the OS desktop. */}
      {tab !== "sophia" && <VoicePresence />}
    </div>
  );
}
