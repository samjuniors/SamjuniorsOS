import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Battery, Bell, ChevronLeft, ChevronRight,
  Clock, Globe, Home, Mail, Maximize2, Mic2, Minus, Monitor, Settings as Gear,
  Volume2, VolumeX, Wifi, X, Zap, FileSpreadsheet, Folder, Search,
  Power, User, SunMoon, Sparkles, Bot, PanelRightClose, ListTodo,
  Command as CommandIcon, RefreshCw, Image, LayoutGrid, CheckCircle2,
  Brain, Cpu, Wrench,
} from "lucide-react";
import FlowDesktop from "../FlowDesktop";
import BootLock from "./BootLock";
import Spotlight, { type Command } from "./Spotlight";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import TodoDrawer from "./TodoDrawer";
import AgentQuickDock from "./AgentQuickDock";
import PersonaModal, { AGENT_PERSONAS, type AgentPersona } from "./PersonaModal";
import { osSound, setOsMuted, setOsVolume } from "../../lib/osAudio";
import { type FlowNode } from "../../lib/flow";
import { OS, OS_NOTES } from "../../lib/osContent";

type Win = "max" | "win" | "min";
type Pop = null | "start" | "cal" | "vol" | "wifi" | "bell" | "settings";

// boot only runs once per page load, not on every tab switch
let HAS_BOOTED = false;

const NOTES = OS_NOTES;

function useNow(ms = 1000) {
  const [n, setN] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setN(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

function pad(n: number) { return n.toString().padStart(2, "0"); }

function fmtTime(d: Date, s12: boolean) {
  if (!s12) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  let h = d.getHours() % 12; if (h === 0) h = 12;
  return `${h}:${pad(d.getMinutes())} ${d.getHours() >= 12 ? "PM" : "AM"}`;
}

/* ------------------------------------------------------------------ chrome */

function Traffic({ onClose, onMin, onMax, maximized }: {
  onClose: () => void; onMin: () => void; onMax: () => void; maximized: boolean;
}) {
  const btn = "h-[12px] w-[12px] rounded-full transition active:scale-90 hover:brightness-110 shadow-sm";
  return (
    <div className="flex items-center gap-2 pl-1">
      <button className={`${btn} bg-[#ff5f57] border border-[#e0443e]`} onClick={onClose} title="Close" />
      <button className={`${btn} bg-[#febc2e] border border-[#d89e24]`} onClick={onMin} title="Minimize" />
      <button className={`${btn} bg-[#28c840] border border-[#1fa030]`} onClick={onMax} title={maximized ? "Restore" : "Maximize"} />
    </div>
  );
}

function TrayBtn({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title: string; children: ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={() => { osSound.click(); onClick(); }}
      className={`flex h-7 sm:h-8 items-center gap-1.5 rounded-lg px-2 text-slate-300 transition-all duration-200 hover:bg-white/10 hover:text-white active:scale-95 ${
        active ? "bg-white/15 text-white shadow-[0_0_12px_rgba(255,255,255,0.15)]" : ""
      }`}
    >
      {children}
    </button>
  );
}

function Popover({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`absolute top-[48px] overflow-hidden rounded-2xl border border-white/12 bg-[#08101e]/95 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.85)] backdrop-blur-2xl ${className}`}
      style={{
        animation: "os-in 180ms cubic-bezier(.16,1,.3,1)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 24px 60px rgba(0,0,0,0.8)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between py-2 text-left transition hover:opacity-90">
      <span className="text-[13px] text-slate-200">{label}</span>
      <span className={`h-5 w-9 rounded-full p-0.5 transition duration-300 ${on ? "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]" : "bg-slate-700"}`}>
        <span className={`block h-4 w-4 rounded-full bg-white transition-transform duration-300 ${on ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}

function CalendarCard({ now }: { now: Date }) {
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const month = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const today = now.getDate();
  const isThis = now.getMonth() === m && now.getFullYear() === y;
  return (
    <div className="w-[280px] p-4">
      <div className="mb-3 flex items-center justify-between">
        <button className="rounded-md p-1 hover:bg-white/10 text-slate-300 transition active:scale-95" onClick={() => setCursor(new Date(y, m - 1, 1))}><ChevronLeft size={16} /></button>
        <div className="text-[13px] font-medium tracking-wide text-white">{month}</div>
        <button className="rounded-md p-1 hover:bg-white/10 text-slate-300 transition active:scale-95" onClick={() => setCursor(new Date(y, m + 1, 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="mb-1 grid grid-cols-7 text-center text-[10px] uppercase tracking-wider text-slate-500">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[12px]">
        {cells.map((d, i) => (
          <div key={i} className="flex h-8 items-center justify-center">
            {d && (
              <span className={`flex h-7 w-7 items-center justify-center rounded-full transition ${isThis && d === today ? "bg-cyan-400 text-[#041018] font-bold shadow-[0_0_12px_rgba(34,211,238,0.7)]" : "text-slate-200 hover:bg-white/10"}`}>
                {d}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-white/10 pt-3 text-[12px] text-slate-400 flex items-center justify-between">
        <span>{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ main */

export default function DesktopOS({ onOpenNeural }: { onOpenNeural: () => void }) {
  const now = useNow();
  const [win, setWin] = useState<Win>("max");
  const [pop, setPop] = useState<Pop>(null);
  const [pos, setPos] = useState({ x: 36, y: 52 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const [volume, setVolume] = useState(0.55);
  const [muted, setMuted] = useState(false);
  const [uiSounds, setUiSounds] = useState(true);
  const [notifsOn, setNotifsOn] = useState(true);
  const [h12, setH12] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  const [bells, setBells] = useState<{ id: number; t: string; d: string; at: Date }[]>([]);
  const [toasts, setToasts] = useState<{ id: number; t: string; d: string }[]>([]);
  const nid = useRef(1);
  const [focus, setFocus] = useState(false);
  const [anim, setAnim] = useState(false);
  const [booting, setBooting] = useState(!HAS_BOOTED);
  const [spotlight, setSpotlight] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [wallIdx, setWallIdx] = useState(0);
  const [todoOpen, setTodoOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentPersona | null>(null);

  useEffect(() => { setOsVolume(uiSounds ? volume : 0); setOsMuted(muted || !uiSounds); }, [volume, muted, uiSounds]);

  /** stacked, self-dismissing OS notifications */
  const notify = (t: string, d: string) => {
    const id = nid.current++;
    setToasts((ts) => [{ id, t, d }, ...ts].slice(0, 3));
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4600);
  };

  useEffect(() => {
    if (!notifsOn) return;
    const id = setInterval(() => {
      const n = NOTES[Math.floor(Math.random() * NOTES.length)];
      setBells((b) => [{ id: nid.current++, ...n, at: new Date() }, ...b].slice(0, 12));
      notify(n.t, n.d);
      osSound.notify();
    }, 16000);
    const t = setTimeout(() => {
      const n = NOTES[0];
      setBells([{ id: nid.current++, ...n, at: new Date() }]);
      notify(n.t, n.d);
      osSound.notify();
    }, 2400);
    return () => { clearInterval(id); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifsOn]);

  // window open / restore / maximize feedback animation
  useEffect(() => {
    setAnim(true);
    const t = setTimeout(() => setAnim(false), 340);
    return () => clearTimeout(t);
  }, [win]);

  // OS keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault(); setPop(null); setMenu(null); setSpotlight((v) => !v); osSound.open(); return;
      }
      if (e.key === "Escape") {
        setPop(null);
        setMenu(null);
        setSpotlight(false);
        setSelectedAgent(null);
        return;
      }
      if (typing) return;
      if (e.key === "f" || e.key === "F") { setFocus((v) => !v); osSound.click(); }
      if (e.key === "t" || e.key === "T") { setTodoOpen((v) => !v); osSound.click(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = (p: Pop) => setPop((cur) => (cur === p ? null : p));

  const openWin = () => { setWin("max"); osSound.open(); setPop(null); };
  const closeWin = () => { setWin("min"); osSound.close(); };
  const minWin = () => { setWin("min"); osSound.min(); };
  const maxWin = () => { setWin((w) => (w === "max" ? "win" : "max")); osSound.max(); };

  const onTitleDown = (e: React.PointerEvent) => {
    if (win !== "win") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY };
  };
  const onTitleMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({ x: drag.current.x + (e.clientX - drag.current.px), y: drag.current.y + (e.clientY - drag.current.py) });
  };
  const onTitleUp = () => { drag.current = null; };

  const battery = useMemo(() => 72 + Math.round(Math.sin(now.getMinutes()) * 4), [now]);

  const WALLS = [
    "radial-gradient(ellipse at 50% 0%, rgba(30,70,140,0.45), transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(20,50,110,0.4), transparent 50%), #050a14",
    "radial-gradient(ellipse at 20% 10%, rgba(90,40,150,0.4), transparent 55%), radial-gradient(ellipse at 90% 90%, rgba(20,60,130,0.45), transparent 55%), #06070f",
    "radial-gradient(ellipse at 70% 15%, rgba(20,110,120,0.4), transparent 55%), radial-gradient(ellipse at 20% 100%, rgba(20,60,110,0.4), transparent 50%), #04090e",
  ];

  const commands: Command[] = [
    { id: "propulse", group: "Apps", label: "Open the desk", hint: OS.name, icon: <Bot size={15} />, run: openWin },
    { id: "neural", group: "Apps", label: `Open ${OS.companion}`, hint: "Presence", icon: <Sparkles size={15} />, run: onOpenNeural },
    { id: "sofia", group: "Workforce", label: "Sophia — Interface", hint: "Holds attention", icon: <Bot size={15} />, run: () => setSelectedAgent(AGENT_PERSONAS[0]) },
    { id: "marcus", group: "Workforce", label: "Atlas — Operations", hint: "Runs the day", icon: <Sparkles size={15} />, run: () => setSelectedAgent(AGENT_PERSONAS[1]) },
    { id: "elena", group: "Workforce", label: "Iris — Research", hint: "Briefs, doesn't pile", icon: <Brain size={15} />, run: () => setSelectedAgent(AGENT_PERSONAS[2]) },
    { id: "kai", group: "Workforce", label: "Voss — Records", hint: "Keeps continuity", icon: <Cpu size={15} />, run: () => setSelectedAgent(AGENT_PERSONAS[3]) },
    { id: "alex", group: "Workforce", label: "Reed — Comms", hint: "Drafts, waits", icon: <Wrench size={15} />, run: () => setSelectedAgent(AGENT_PERSONAS[4]) },
    { id: "todo", group: "Apps", label: "Work waiting", hint: "Drawer · T", icon: <ListTodo size={15} />, run: () => setTodoOpen((v) => !v) },
    { id: "focus", group: "Actions", label: focus ? "Exit Focus Mode" : "Enter Focus Mode", hint: "Hide side panels · F", icon: <PanelRightClose size={15} />, run: () => setFocus((v) => !v) },
    { id: "min", group: "Actions", label: "Minimize Window", icon: <Minus size={15} />, run: minWin },
    { id: "max", group: "Actions", label: win === "max" ? "Restore Window" : "Maximize Window", icon: <Maximize2 size={15} />, run: maxWin },
    { id: "wall", group: "Actions", label: "Shuffle Wallpaper", icon: <Image size={15} />, run: () => setWallIdx((i) => (i + 1) % WALLS.length) },
    { id: "mute", group: "Settings", label: muted ? "Unmute Sound" : "Mute Sound", icon: muted ? <VolumeX size={15} /> : <Volume2 size={15} />, run: () => setMuted((m) => !m) },
    { id: "clock", group: "Settings", label: `Switch to ${h12 ? "24-hour" : "12-hour"} clock`, icon: <Clock size={15} />, run: () => setH12((v) => !v) },
    { id: "notif", group: "Settings", label: notifsOn ? "Disable notifications" : "Enable notifications", icon: <Bell size={15} />, run: () => setNotifsOn((v) => !v) },
    { id: "settings", group: "Settings", label: "Open Settings", icon: <Gear size={15} />, run: () => setPop("settings") },
  ];

  const menuItems: MenuItem[] = [
    { type: "item", label: "Spotlight Search", icon: <Search size={14} />, shortcut: "⌘K", run: () => setSpotlight(true) },
    { type: "item", label: "Work waiting", icon: <ListTodo size={14} />, shortcut: "T", run: () => setTodoOpen((v) => !v) },
    { type: "item", label: "Sophia", icon: <Bot size={14} />, run: () => setSelectedAgent(AGENT_PERSONAS[0]) },
    { type: "item", label: focus ? "Exit Focus Mode" : "Focus Mode", icon: <PanelRightClose size={14} />, shortcut: "F", run: () => setFocus((v) => !v) },
    { type: "sep" },
    { type: "item", label: "Open the desk", icon: <Bot size={14} />, run: openWin },
    { type: "item", label: OS.companion, icon: <Sparkles size={14} />, run: onOpenNeural },
    { type: "sep" },
    { type: "item", label: "Shuffle Wallpaper", icon: <Image size={14} />, run: () => setWallIdx((i) => (i + 1) % WALLS.length) },
    { type: "item", label: "Refresh Desktop", icon: <RefreshCw size={14} />, run: () => notify("Desktop", "View refreshed.") },
    { type: "item", label: "Display Settings", icon: <Monitor size={14} />, run: () => setPop("settings") },
    { type: "sep" },
    { type: "item", label: "Lock & Restart", icon: <Power size={14} />, danger: true, run: () => { osSound.close(); setBooting(true); } },
  ];

  if (booting) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#03060d]">
        <BootLock onUnlock={() => { HAS_BOOTED = true; setBooting(false); }} />
      </div>
    );
  }

  const handleNodeClick = (node: FlowNode) => {
    if (node.id === "core") setSelectedAgent(AGENT_PERSONAS[0]);
    else if (node.id === "match") setSelectedAgent(AGENT_PERSONAS[1]);
    else if (node.id === "intent" || node.id === "gemini") setSelectedAgent(AGENT_PERSONAS[2]);
    else if (node.id === "sheets" || node.id === "save" || node.id === "db") setSelectedAgent(AGENT_PERSONAS[3]);
    else if (node.id === "follow" || node.id === "send") setSelectedAgent(AGENT_PERSONAS[4]);
    else notify("Noted", "Sophia held that for the desk.");
  };

  return (
    <div
      className="relative h-full w-full overflow-hidden text-slate-200 select-none"
      onPointerDown={() => setPop(null)}
      onContextMenu={(e) => { e.preventDefault(); setPop(null); setMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {/* wallpaper background */}
      <div
        className="absolute inset-0"
        style={{ background: WALLS[wallIdx], transition: "background 700ms ease" }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1] opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(120,170,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(120,170,255,0.08) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* depth layers: scanlines + top light + vignette */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] opacity-[0.35] mix-blend-overlay"
        style={{ backgroundImage: "repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-36"
        style={{ background: "linear-gradient(180deg, rgba(180,220,255,0.06), transparent)" }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.45))" }}
      />

      {/* ----------------- MODERN TOP TASKBAR / OS MENU BAR ----------------- */}
      <div
        className="fixed inset-x-0 top-0 z-50 flex h-11 items-center justify-between border-b border-white/10 bg-[#060c18]/92 px-3 sm:px-4 backdrop-blur-2xl"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          boxShadow: "0 4px 24px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* Left Section: Start launcher, Search pill & System indicators */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Launcher Button */}
          <button
            onClick={() => toggle("start")}
            className={`group flex h-8 items-center gap-1.5 rounded-lg px-2 sm:px-2.5 text-slate-200 transition-all duration-200 hover:bg-white/10 active:scale-95 ${
              pop === "start" ? "bg-cyan-400/20 text-cyan-100 border border-cyan-400/30 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "border border-white/5"
            }`}
            title="Start Menu"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-sky-500 text-slate-950 font-bold shadow-[0_0_10px_rgba(56,189,248,0.5)] transition-transform duration-300 group-hover:scale-105">
              <LayoutGrid size={12} />
            </span>
            <span className="text-[11.5px] font-bold tracking-wider text-white">
              {OS.short}
            </span>
          </button>

          {/* Quick Spotlight Search in Top Bar */}
          <button
            onClick={() => { osSound.open(); setSpotlight(true); }}
            className="group hidden sm:flex h-7.5 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-slate-400 transition-all duration-200 hover:border-cyan-300/40 hover:bg-white/[0.08] hover:text-slate-100 active:scale-95"
            title="Spotlight Search (⌘K)"
          >
            <Search size={12} className="text-cyan-300 transition-transform group-hover:scale-110" />
            <span className="hidden md:inline">Spotlight</span>
            <span className="flex items-center gap-0.5 rounded border border-white/15 bg-white/5 px-1 py-0.2 text-[9px] font-mono text-slate-400">
              <CommandIcon size={8} />K
            </span>
          </button>

          {/* System Status Chip */}
          <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-0.5 text-[10.5px] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            <span className="font-mono text-[10px] tracking-wider">PRESENT</span>
          </div>
        </div>

        {/* Center Section: App Window Switcher */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => { osSound.click(); win === "min" ? openWin() : minWin(); }}
            className={`flex h-7.5 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-semibold transition active:scale-95 ${
              win !== "min" ? "bg-cyan-400/15 text-cyan-200 border border-cyan-400/30 shadow-[0_0_12px_rgba(56,189,248,0.25)]" : "text-slate-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Bot size={14} className="text-orange-400" />
            <span className="hidden min-[420px]:inline">Desk</span>
            {win !== "min" && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />}
          </button>

          <button
            onClick={() => { osSound.click(); onOpenNeural(); }}
            className="flex h-7.5 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition active:scale-95"
            title={OS.companion}
          >
            <Sparkles size={14} className="text-cyan-300" />
            <span className="hidden sm:inline">{OS.companion}</span>
          </button>

          <button
            onClick={() => { osSound.click(); setFocus((v) => !v); }}
            className={`flex h-7.5 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition active:scale-95 ${
              focus ? "bg-cyan-400/20 text-cyan-200 border border-cyan-400/30" : "text-slate-400 hover:bg-white/10 hover:text-white"
            }`}
            title="Focus Mode (F)"
          >
            <PanelRightClose size={13} className={focus ? "text-cyan-300" : ""} />
            <span className="hidden md:inline">Focus</span>
          </button>
        </div>

        {/* Right Section: System Tray & Clock */}
        <div className="flex items-center gap-1">
          <TrayBtn active={pop === "wifi"} onClick={() => toggle("wifi")} title="Network">
            <Wifi size={14} />
          </TrayBtn>
          <TrayBtn active={pop === "vol"} onClick={() => toggle("vol")} title="Sound & Volume">
            {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </TrayBtn>
          <TrayBtn active={pop === "bell"} onClick={() => toggle("bell")} title="Notifications">
            <span className="relative">
              <Bell size={14} />
              {bells.length > 0 && (
                <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
              )}
            </span>
          </TrayBtn>
          <TrayBtn active={pop === "settings"} onClick={() => toggle("settings")} title="Settings">
            <Gear size={14} />
          </TrayBtn>

          {/* Clock & Calendar Trigger */}
          <button
            title="Calendar & Time"
            onClick={() => { osSound.click(); toggle("cal"); }}
            className={`ml-1 flex h-7.5 items-center gap-1.5 rounded-lg px-2 transition-all duration-200 hover:bg-white/10 active:scale-95 ${
              pop === "cal" ? "bg-white/15 text-white shadow-[0_0_12px_rgba(255,255,255,0.15)]" : ""
            }`}
          >
            <span className="tnum text-[12px] font-bold text-white tracking-tight">
              {fmtTime(now, h12)}
            </span>
          </button>

          {/* Battery Status */}
          <div className="hidden sm:flex items-center gap-1 pl-1 text-slate-400">
            <Battery size={14} />
            <span className="tnum text-[10px] font-mono">{battery}%</span>
          </div>
        </div>

        {/* ----------------- TOP BAR POPOVERS ----------------- */}

        {/* Start Menu Launcher */}
        {pop === "start" && (
          <Popover className="left-3 sm:left-4 w-[360px] max-w-[calc(100vw-24px)]">
            <div className="border-b border-white/10 p-3.5 bg-white/[0.02]">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  placeholder="Search the house…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setPop(null);
                      setSpotlight(true);
                    }
                  }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-[12.5px] text-white outline-none placeholder:text-slate-500 focus:border-cyan-400 transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 p-3.5">
              {[
                { icon: <Home size={17} />, l: "Desk", run: openWin },
                { icon: <Sparkles size={17} />, l: OS.companion, run: onOpenNeural },
                { icon: <ListTodo size={17} />, l: "Work", run: () => setTodoOpen(true) },
                { icon: <Gear size={17} />, l: "Settings", run: () => setPop("settings") },
                { icon: <Folder size={17} />, l: "Work", run: () => notify("Work", "Two decisions are waiting.") },
                { icon: <Mail size={17} />, l: "Inbox", run: () => notify("Inbox", "Quiet. Nothing new.") },
                { icon: <Globe size={17} />, l: "Notes", run: () => notify("Notes", "Iris left a short brief.") },
                { icon: <FileSpreadsheet size={17} />, l: "Records", run: () => notify("Records", "Yesterday is filed.") },
                { icon: <Zap size={17} />, l: "Focus Mode", run: () => setFocus((v) => !v) },
              ].map((a) => (
                <button
                  key={a.l}
                  onClick={() => { osSound.click(); a.run(); setPop(null); }}
                  className="group flex flex-col items-center gap-1.5 rounded-2xl p-2.5 transition hover:bg-white/[0.08] active:scale-95"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-200 transition-all duration-300 group-hover:scale-105 group-hover:border-cyan-300/40 group-hover:bg-cyan-950/60 shadow-lg">
                    {a.icon}
                  </span>
                  <span className="text-[11px] font-medium text-slate-300 group-hover:text-white">{a.l}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 px-4 py-2.5 bg-white/[0.02]">
              <div className="flex items-center gap-2 text-[12px] text-slate-300">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400/20 text-cyan-200 font-bold">
                  <User size={13} />
                </span>
                <span>{OS.operator}</span>
              </div>
              <button
                onClick={() => { osSound.close(); setBooting(true); setPop(null); }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition active:scale-95"
                title="Lock & Restart"
              >
                <Power size={14} />
              </button>
            </div>
          </Popover>
        )}

        {/* Calendar Popover */}
        {pop === "cal" && (
          <Popover className="right-3 sm:right-4">
            <div className="border-b border-white/10 px-4 pt-3.5 pb-2 bg-white/[0.02]">
              <div className="text-[26px] font-light text-white leading-tight">{fmtTime(now, h12)}</div>
              <div className="mb-1 flex items-center gap-2 text-[11.5px] text-slate-400">
                <Clock size={12} className="text-cyan-300" />
                <span>{now.toLocaleDateString(undefined, { weekday: "long" })}</span>
              </div>
            </div>
            <CalendarCard now={now} />
          </Popover>
        )}

        {/* Volume & Sound Popover */}
        {pop === "vol" && (
          <Popover className="right-16 sm:right-24 w-[250px] p-4">
            <div className="mb-2.5 flex items-center justify-between text-[11.5px] uppercase font-bold tracking-[0.16em] text-slate-300">
              <span>Sound Output</span>
              <button
                onClick={() => { setMuted((m) => !m); osSound.click(); }}
                className="rounded-lg p-1 text-white hover:bg-white/10 transition active:scale-95"
              >
                {muted ? <VolumeX size={15} className="text-rose-400" /> : <Volume2 size={15} className="text-cyan-300" />}
              </button>
            </div>
            <input
              type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume}
              onChange={(e) => { setMuted(false); setVolume(parseFloat(e.target.value)); }}
              className="slider h-1.5 w-full cursor-pointer appearance-none rounded-full bg-cyan-300/20"
            />
            <div className="mt-1.5 text-right font-mono text-[10.5px] text-cyan-200 font-bold">{Math.round((muted ? 0 : volume) * 100)}%</div>
            <div className="mt-2.5 border-t border-white/10 pt-2">
              <Toggle on={uiSounds} onClick={() => { setUiSounds((s) => !s); osSound.click(); }} label="Interface audio feedback" />
              <div className="mt-1 flex items-center gap-2 py-0.5 text-[11px] text-slate-400">
                <Mic2 size={12} className="text-cyan-300" /> Sophia can speak
              </div>
            </div>
          </Popover>
        )}

        {/* Network Popover */}
        {pop === "wifi" && (
          <Popover className="right-24 sm:right-32 w-[270px] p-3.5">
            <div className="mb-2.5 text-[11.5px] uppercase font-bold tracking-[0.16em] text-slate-300 flex items-center justify-between">
              <span>Network</span>
              <span className="text-[9.5px] text-emerald-400 uppercase font-mono">Online</span>
            </div>
            {[
              { n: "House net", on: true, speed: "Live" },
              { n: "Office-Secure", on: false, speed: "5 GHz" },
              { n: "Harbor-Lofts-Mesh", on: false, speed: "2.4 GHz" },
            ].map((w) => (
              <div key={w.n} className="flex items-center justify-between rounded-xl p-2 hover:bg-white/5 transition">
                <div className="flex items-center gap-2 text-[12.5px] text-slate-200">
                  <Wifi size={13} className={w.on ? "text-cyan-300" : "text-slate-500"} />
                  <div>
                    <div>{w.n}</div>
                    <div className="text-[9.5px] text-slate-500 font-mono">{w.speed}</div>
                  </div>
                </div>
                {w.on && <span className="text-[9.5px] uppercase tracking-wider text-cyan-300 font-bold bg-cyan-400/10 px-2 py-0.5 rounded-full">Connected</span>}
              </div>
            ))}
          </Popover>
        )}

        {/* Notifications Popover */}
        {pop === "bell" && (
          <Popover className="right-8 sm:right-16 w-[330px] max-w-[calc(100vw-24px)]">
            <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-3 bg-white/[0.02]">
              <span className="text-[12px] uppercase font-bold tracking-[0.16em] text-white">Notifications</span>
              <button className="text-[10.5px] text-cyan-300 hover:underline font-medium" onClick={() => setBells([])}>Clear all</button>
            </div>
            <div className="max-h-[320px] overflow-y-auto os-scroll">
              {bells.length === 0 && (
                <div className="p-8 text-center text-[12px] text-slate-500 flex flex-col items-center gap-2">
                  <CheckCircle2 size={22} className="text-emerald-400/50" />
                  <span>You're all caught up!</span>
                </div>
              )}
              {bells.map((b) => (
                <div key={b.id} className="border-b border-white/5 px-3.5 py-2.5 hover:bg-white/[0.02] transition">
                  <div className="text-[12.5px] font-semibold text-white">{b.t}</div>
                  <div className="text-[11.5px] text-slate-400 mt-0.5 leading-snug">{b.d}</div>
                  <div className="mt-1 text-[9.5px] uppercase font-mono text-slate-500">{b.at.toLocaleTimeString()}</div>
                </div>
              ))}
            </div>
          </Popover>
        )}

        {/* System Settings Popover */}
        {pop === "settings" && (
          <Popover className="right-3 sm:right-4 w-[350px] max-w-[calc(100vw-24px)]">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 bg-white/[0.02]">
              <Gear size={14} className="text-cyan-300" />
              <span className="text-[12.5px] uppercase font-bold tracking-[0.16em] text-white">System Settings</span>
            </div>
            <div className="space-y-1.5 p-3.5 max-h-[400px] overflow-y-auto os-scroll">
              <div className="mb-1 text-[9.5px] uppercase tracking-[0.2em] font-bold text-slate-400">Display & Interface</div>
              <Toggle on={h12} onClick={() => setH12((v) => !v)} label="12-hour clock format" />
              <Toggle on={notifsOn} onClick={() => setNotifsOn((v) => !v)} label="House notices" />
              <Toggle on={uiSounds} onClick={() => setUiSounds((v) => !v)} label="Interface audio feedback" />
              <Toggle on={reduceMotion} onClick={() => setReduceMotion((v) => !v)} label="Reduce UI motion" />

              <div className="mt-2.5 mb-1 text-[9.5px] uppercase tracking-[0.2em] font-bold text-slate-400">Audio Volume</div>
              <div className="flex items-center gap-3 py-1">
                <Volume2 size={14} className="text-slate-400" />
                <input
                  type="range" min={0} max={1} step={0.01} value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="slider h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-cyan-300/20"
                />
                <span className="w-8 text-right font-mono text-[10.5px] text-cyan-200 font-bold">{Math.round(volume * 100)}</span>
              </div>

              <div className="mt-3.5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <SunMoon size={17} className="text-cyan-300 shrink-0" />
                <div>
                  <div className="text-[12px] font-bold text-white">{OS.name}</div>
                  <div className="text-[10.5px] text-slate-400">{OS.companion} · {OS.operator}</div>
                </div>
              </div>
            </div>
          </Popover>
        )}
      </div>

      {/* Desktop App Icons on Wallpaper */}
      <div className="absolute left-3 sm:left-6 top-16 sm:top-18 z-10 grid grid-cols-1 gap-2.5 sm:gap-3.5">
        {[
          { icon: <Home size={21} />, label: "Desk", desc: "The house", run: openWin },
          { icon: <Sparkles size={21} />, label: OS.companion, desc: "Presence", run: () => { osSound.click(); onOpenNeural(); } },
          { icon: <ListTodo size={21} />, label: "Work", desc: "Waiting", run: () => { osSound.click(); setTodoOpen(true); } },
          { icon: <Folder size={21} />, label: "Work", desc: "Waiting", run: () => { osSound.click(); notify("Work", "Two decisions are waiting."); } },
          { icon: <Gear size={21} />, label: "Settings", desc: "Config", run: () => { osSound.click(); setPop("settings"); } },
        ].map((ic) => (
          <button
            key={ic.label}
            onDoubleClick={ic.run}
            onClick={() => {
              if (window.innerWidth < 768) ic.run();
              else osSound.hover();
            }}
            className="group flex w-[64px] sm:w-[72px] flex-col items-center gap-1 rounded-xl p-1.5 text-center transition-all duration-200 hover:bg-white/10 active:scale-95"
          >
            <span className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl border border-white/15 bg-[#091222]/85 text-cyan-100 shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all duration-300 group-hover:-translate-y-1 group-hover:border-cyan-300/40 group-hover:bg-[#0d1a30] group-hover:shadow-[0_12px_32px_rgba(56,189,248,0.3)]">
              {ic.icon}
            </span>
            <span className="text-[10px] sm:text-[10.5px] font-medium leading-tight tracking-[0.01em] text-slate-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
              {ic.label}
            </span>
          </button>
        ))}
      </div>

      {/* Main OS Application Window (Below Top Bar) */}
      {win !== "min" && (
        <div
          className={`absolute z-20 flex flex-col overflow-hidden bg-[#050a14] ${anim ? "os-win-in" : ""} ${
            win === "max"
              ? "left-0 top-11 right-0 bottom-0"
              : "rounded-2xl border border-white/15 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.85)]"
          }`}
          style={
            win === "max"
              ? undefined
              : {
                  left: pos.x,
                  top: pos.y,
                  width: "min(1340px, calc(100vw - 32px))",
                  height: "min(820px, calc(100vh - 72px))",
                }
          }
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Window Titlebar in Restored Mode */}
          {win === "win" && (
            <div
              className="relative flex h-9 shrink-0 cursor-default items-center justify-between border-b border-white/10 bg-[#070e1c]/95 px-3.5 backdrop-blur-md"
              onPointerDown={onTitleDown}
              onPointerMove={onTitleMove}
              onPointerUp={onTitleUp}
              onDoubleClick={maxWin}
            >
              <Traffic onClose={closeWin} onMin={minWin} onMax={maxWin} maximized={false} />
              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold tracking-[0.2em] text-slate-300 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                {OS.name.toUpperCase()}
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <button
                  title={focus ? "Exit focus mode (F)" : "Focus mode — clear panels (F)"}
                  onClick={() => { osSound.click(); setFocus((v) => !v); }}
                  className={`rounded-lg p-1 transition hover:bg-white/10 hover:text-white active:scale-95 ${focus ? "text-cyan-300 bg-cyan-400/15" : ""}`}
                >
                  <PanelRightClose size={13} />
                </button>
                <button className="rounded-lg p-1 hover:bg-white/10 hover:text-white transition active:scale-95" onClick={minWin} title="Minimize"><Minus size={13} /></button>
                <button className="rounded-lg p-1 hover:bg-white/10 hover:text-white transition active:scale-95" onClick={maxWin} title="Maximize">
                  <Maximize2 size={12} />
                </button>
                <button className="rounded-lg p-1 hover:bg-rose-500/20 hover:text-rose-300 transition active:scale-95" onClick={closeWin} title="Close"><X size={13} /></button>
              </div>
            </div>
          )}

          {/* Window Interior Content */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <FlowDesktop
              focus={focus}
              onPanelOpen={() => setFocus(false)}
              onNodeClick={handleNodeClick}
            />

            {/* Focus mode badge toggle */}
            {focus && (
              <button
                onClick={() => { osSound.click(); setFocus(false); }}
                className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-cyan-200/30 bg-[#08111e]/90 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100 shadow-[0_10px_35px_rgba(0,0,0,0.6)] backdrop-blur-xl transition hover:border-cyan-200/60 hover:bg-cyan-950/80 active:scale-95"
                style={{ animation: "os-in 240ms cubic-bezier(.16,1,.3,1)" }}
              >
                <PanelRightClose size={13} /> Focus mode active · Show panels
                <span className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[9.5px] font-mono">F</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ----------------- BOTTOM AGENTS DOCK (5 AGENT BUTTONS + SLIDE UP/DOWN) ----------------- */}
      <AgentQuickDock onSelectAgent={(agent) => setSelectedAgent(agent)} />

      {/* ----------------- AGENT PERSONA PROFILE MODAL (MAC OS ZOOM-IN ANIMATION) ----------------- */}
      <PersonaModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />

      {/* ----------------- COMPACT SIDE PILLOW & TO-DO DRAWER ----------------- */}
      <TodoDrawer open={todoOpen} onToggle={setTodoOpen} />

      {/* Stacked OS Notification Toasts */}
      <div className="pointer-events-none absolute right-4 top-14 z-[60] flex w-[300px] max-w-[calc(100vw-32px)] flex-col gap-2.5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto rounded-2xl border border-white/15 bg-[#08111e]/95 p-3.5 shadow-[0_24px_60px_-10px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
            style={{ animation: "toast-in 320ms cubic-bezier(.16,1,.3,1)" }}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-[0.22em] text-cyan-300">
                <Bell size={11} /> {OS.name.toUpperCase()}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Just now</span>
            </div>
            <div className="text-[12.5px] font-semibold leading-tight text-white">{t.t}</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{t.d}</div>
          </div>
        ))}
      </div>

      {/* Spotlight Command Search Palette */}
      <Spotlight open={spotlight} commands={commands} onClose={() => setSpotlight(false)} />

      {/* Right-click Context Menu */}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  );
}

