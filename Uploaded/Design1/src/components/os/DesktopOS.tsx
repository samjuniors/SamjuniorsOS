import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Battery, BatteryCharging, Bell, ChevronLeft, ChevronRight, Clock, Maximize2, Mic2, Minus, Monitor,
  Settings as Gear, Volume2, VolumeX, Wifi, WifiOff, X, Search, Power, User, SunMoon, Sparkles, Bot,
  PanelRightClose, Command as CommandIcon, RefreshCw, Image, LayoutGrid, CheckCircle2, Scale, Activity,
  Building2, AlertTriangle, RotateCcw,
} from "lucide-react";
import FlowDesktop from "../FlowDesktop";
import BootLock from "./BootLock";
import Spotlight, { type Command } from "./Spotlight";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import TodoDrawer from "./TodoDrawer";
import AgentQuickDock from "./AgentQuickDock";
import PersonaModal from "./PersonaModal";
import { osSound, setOsMuted, setOsVolume } from "../../lib/osAudio";
import { type FlowNode } from "../../lib/flow";
import { os, useOS, openAttention, openDecisions, activeWork, agentName } from "../../lib/osStore";

type Win = "max" | "win" | "min";
type Pop = null | "start" | "cal" | "vol" | "net" | "bell" | "settings";

// boot only runs once per page load, not on every tab switch
let HAS_BOOTED = false;

function useNow(ms = 1000) {
  const [n, setN] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setN(new Date()), ms); return () => clearInterval(id); }, [ms]);
  return n;
}
const pad = (n: number) => n.toString().padStart(2, "0");
function fmtTime(d: Date, s12: boolean) {
  if (!s12) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  let h = d.getHours() % 12; if (h === 0) h = 12;
  return `${h}:${pad(d.getMinutes())} ${d.getHours() >= 12 ? "PM" : "AM"}`;
}

/** Real device state via web APIs — hidden when unavailable, never simulated. */
function useDevice() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  const [conn, setConn] = useState<string | null>(null);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    type Nav = Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void }>; connection?: { effectiveType?: string; addEventListener?: (t: string, f: () => void) => void } };
    const nav = navigator as Nav;
    nav.getBattery?.().then((b) => {
      const upd = () => setBattery({ level: b.level, charging: b.charging });
      upd(); b.addEventListener("levelchange", upd); b.addEventListener("chargingchange", upd);
    }).catch(() => {});
    const c = nav.connection;
    if (c) { const upd = () => setConn(c.effectiveType ?? null); upd(); c.addEventListener?.("change", upd); }
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return { online, battery, conn };
}

/* ------------------------------------------------------------------ chrome */

function Traffic({ onClose, onMin, onMax }: { onClose: () => void; onMin: () => void; onMax: () => void }) {
  const btn = "h-[12px] w-[12px] rounded-full transition active:scale-90 hover:brightness-110 shadow-sm";
  return (
    <div className="flex items-center gap-2 pl-1">
      <button className={`${btn} border border-[#e0443e] bg-[#ff5f57]`} onClick={onClose} title="Close" />
      <button className={`${btn} border border-[#d89e24] bg-[#febc2e]`} onClick={onMin} title="Minimize" />
      <button className={`${btn} border border-[#1fa030] bg-[#28c840]`} onClick={onMax} title="Restore" />
    </div>
  );
}

function TrayBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button title={title} onClick={() => { osSound.click(); onClick(); }} className={`flex h-7 items-center gap-1.5 rounded-lg px-2 text-slate-300 transition-all duration-200 hover:bg-white/10 hover:text-white active:scale-95 sm:h-8 ${active ? "bg-white/15 text-white shadow-[0_0_12px_rgba(255,255,255,0.15)]" : ""}`}>
      {children}
    </button>
  );
}

function Popover({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`absolute top-[48px] overflow-hidden rounded-2xl border border-white/12 bg-[#08101e]/95 backdrop-blur-2xl ${className}`} style={{ animation: "os-in 180ms cubic-bezier(.16,1,.3,1)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 24px 60px rgba(0,0,0,0.8)" }} onPointerDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

function Toggle({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between py-2 text-left transition hover:opacity-90">
      <span><span className="block text-[13px] text-slate-200">{label}</span>{hint && <span className="block text-[10.5px] text-slate-500">{hint}</span>}</span>
      <span className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition duration-300 ${on ? "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]" : "bg-slate-700"}`}><span className={`block h-4 w-4 rounded-full bg-white transition-transform duration-300 ${on ? "translate-x-4" : ""}`} /></span>
    </button>
  );
}

function CalendarCard({ now }: { now: Date }) {
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const isThis = now.getMonth() === m && now.getFullYear() === y;
  return (
    <div className="w-[280px] p-4">
      <div className="mb-3 flex items-center justify-between">
        <button className="rounded-md p-1 text-slate-300 transition hover:bg-white/10 active:scale-95" onClick={() => setCursor(new Date(y, m - 1, 1))}><ChevronLeft size={16} /></button>
        <div className="text-[13px] font-medium tracking-wide text-white">{cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}</div>
        <button className="rounded-md p-1 text-slate-300 transition hover:bg-white/10 active:scale-95" onClick={() => setCursor(new Date(y, m + 1, 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="mb-1 grid grid-cols-7 text-center text-[10px] uppercase tracking-wider text-slate-500">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[12px]">
        {cells.map((d, i) => (
          <div key={i} className="flex h-8 items-center justify-center">
            {d && <span className={`flex h-7 w-7 items-center justify-center rounded-full transition ${isThis && d === now.getDate() ? "bg-cyan-400 font-bold text-[#041018] shadow-[0_0_12px_rgba(34,211,238,0.7)]" : "text-slate-200 hover:bg-white/10"}`}>{d}</span>}
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-white/10 pt-3 text-[12px] text-slate-400">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ main */

export default function DesktopOS({ onOpenNeural }: { onOpenNeural: () => void }) {
  const now = useNow();
  const device = useDevice();
  const [win, setWin] = useState<Win>("max");
  const [pop, setPop] = useState<Pop>(null);
  const [pos, setPos] = useState({ x: 36, y: 52 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const [volume, setVolume] = useState(0.55);
  const [muted, setMuted] = useState(false);
  const [uiSounds, setUiSounds] = useState(true);
  const [notifsOn, setNotifsOn] = useState(true);
  const [h12, setH12] = useState(true);
  const [voice, setVoice] = useState(false);

  const [toasts, setToasts] = useState<{ id: number; t: string; d: string }[]>([]);
  const nid = useRef(1);
  const [focus, setFocus] = useState(false);
  const [anim, setAnim] = useState(false);
  const [booting, setBooting] = useState(!HAS_BOOTED);
  const [spotlight, setSpotlight] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [wallIdx, setWallIdx] = useState(0);
  const [workOpen, setWorkOpen] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);

  const attention = useOS(openAttention);
  const decisions = useOS(openDecisions);
  const work = useOS(activeWork);
  const agents = useOS((s) => s.agents);
  const company = useOS((s) => s.company);
  const log = useOS((s) => s.log);

  useEffect(() => { setOsVolume(uiSounds ? volume : 0); setOsMuted(muted || !uiSounds); }, [volume, muted, uiSounds]);

  const notify = (t: string, d: string) => {
    if (!notifsOn) return;
    const id = nid.current++;
    setToasts((ts) => [{ id, t, d }, ...ts].slice(0, 3));
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4600);
  };

  // Notifications are driven by real OS events (new attention items), not a timer.
  const seenAttention = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!seenAttention.current) { seenAttention.current = new Set(attention.map((a) => a.id)); return; }
    for (const a of attention) {
      if (!seenAttention.current.has(a.id)) {
        seenAttention.current.add(a.id);
        if (a.from !== "you") { notify(a.title, `${agentName(a.from)} · ${a.kind}${a.detail ? ` — ${a.detail}` : ""}`); osSound.notify(); }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attention]);

  useEffect(() => { setAnim(true); const t = setTimeout(() => setAnim(false), 340); return () => clearTimeout(t); }, [win]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setPop(null); setMenu(null); setSpotlight((v) => !v); osSound.open(); return; }
      if (e.key === "Escape") { setPop(null); setMenu(null); setSpotlight(false); setAgentId(null); return; }
      if (typing) return;
      if (e.key === "f" || e.key === "F") { setFocus((v) => !v); osSound.click(); }
      if (e.key === "t" || e.key === "T") { setWorkOpen((v) => !v); osSound.click(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = (p: Pop) => setPop((cur) => (cur === p ? null : p));
  const openWin = () => { setWin("max"); osSound.open(); setPop(null); };
  const closeWin = () => { setWin("min"); osSound.close(); };
  const minWin = () => { setWin("min"); osSound.min(); };
  const maxWin = () => { setWin((w) => (w === "max" ? "win" : "max")); osSound.max(); };

  const onTitleDown = (e: React.PointerEvent) => { if (win !== "win") return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY }; };
  const onTitleMove = (e: React.PointerEvent) => { if (!drag.current) return; setPos({ x: drag.current.x + (e.clientX - drag.current.px), y: drag.current.y + (e.clientY - drag.current.py) }); };
  const onTitleUp = () => { drag.current = null; };

  const WALLS = [
    "radial-gradient(ellipse at 50% 0%, rgba(30,70,140,0.45), transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(20,50,110,0.4), transparent 50%), #050a14",
    "radial-gradient(ellipse at 20% 10%, rgba(90,40,150,0.4), transparent 55%), radial-gradient(ellipse at 90% 90%, rgba(20,60,130,0.45), transparent 55%), #06070f",
    "radial-gradient(ellipse at 70% 15%, rgba(20,110,120,0.4), transparent 55%), radial-gradient(ellipse at 20% 100%, rgba(20,60,110,0.4), transparent 50%), #04090e",
  ];

  const commands: Command[] = [
    { id: "workspace", group: "Workspace", label: "Open operating graph", hint: "Inputs → Sophia → Workforce → You", icon: <LayoutGrid size={15} />, run: openWin },
    { id: "sophia", group: "Workspace", label: "Talk to Sophia", hint: "Assistant view", icon: <Sparkles size={15} />, run: onOpenNeural },
    { id: "work", group: "Workspace", label: "Work drawer", hint: `${work.length} open · T`, icon: <Activity size={15} />, run: () => setWorkOpen((v) => !v) },
    { id: "company", group: "Workspace", label: "Company context", hint: company.focus ? `Focus: ${company.focus}` : "Focus not set", icon: <Building2 size={15} />, run: () => { const v = window.prompt("This week's focus — one sentence:", company.focus); if (v !== null) os.setCompany({ focus: v.trim() }); } },
    ...agents.map((a) => ({ id: `agent-${a.id}`, group: "Workforce", label: `${a.name} · ${a.role}`, hint: a.current ?? a.state, icon: <Bot size={15} />, run: () => setAgentId(a.id) })),
    { id: "decide", group: "Actions", label: "Raise a decision", hint: `${decisions.length} open`, icon: <Scale size={15} />, run: () => { const t = window.prompt("What needs deciding?"); if (t && t.trim()) os.addDecision(t.trim()); } },
    { id: "newwork", group: "Actions", label: "Start a workstream", icon: <Activity size={15} />, run: () => { const t = window.prompt("New workstream:"); if (t && t.trim()) os.addWork(t.trim(), "ops"); } },
    { id: "focus", group: "Actions", label: focus ? "Exit focus mode" : "Focus mode", hint: "Hide panels · F", icon: <PanelRightClose size={15} />, run: () => setFocus((v) => !v) },
    { id: "min", group: "Actions", label: "Minimize window", icon: <Minus size={15} />, run: minWin },
    { id: "max", group: "Actions", label: win === "max" ? "Restore window" : "Maximize window", icon: <Maximize2 size={15} />, run: maxWin },
    { id: "wall", group: "Actions", label: "Shuffle wallpaper", icon: <Image size={15} />, run: () => setWallIdx((i) => (i + 1) % WALLS.length) },
    { id: "voice", group: "Settings", label: voice ? "Sophia voice: on → off" : "Sophia voice: off → on", icon: <Mic2 size={15} />, run: () => setVoice((v) => !v) },
    { id: "mute", group: "Settings", label: muted ? "Unmute interface" : "Mute interface", icon: muted ? <VolumeX size={15} /> : <Volume2 size={15} />, run: () => setMuted((m) => !m) },
    { id: "clock", group: "Settings", label: `Switch to ${h12 ? "24-hour" : "12-hour"} clock`, icon: <Clock size={15} />, run: () => setH12((v) => !v) },
    { id: "settings", group: "Settings", label: "Open settings", icon: <Gear size={15} />, run: () => setPop("settings") },
    { id: "reset", group: "Settings", label: "Reset OS state", hint: "Clears decisions, work, attention", icon: <RotateCcw size={15} />, run: () => { if (window.confirm("Reset SamJuniorsOS to its starting state?")) os.reset(); } },
  ];

  const menuItems: MenuItem[] = [
    { type: "item", label: "Search", icon: <Search size={14} />, shortcut: "⌘K", run: () => setSpotlight(true) },
    { type: "item", label: "Work drawer", icon: <Activity size={14} />, shortcut: "T", run: () => setWorkOpen((v) => !v) },
    { type: "item", label: "Raise a decision", icon: <Scale size={14} />, run: () => { const t = window.prompt("What needs deciding?"); if (t && t.trim()) os.addDecision(t.trim()); } },
    { type: "item", label: focus ? "Exit focus mode" : "Focus mode", icon: <PanelRightClose size={14} />, shortcut: "F", run: () => setFocus((v) => !v) },
    { type: "sep" },
    { type: "item", label: "Operating graph", icon: <LayoutGrid size={14} />, run: openWin },
    { type: "item", label: "Talk to Sophia", icon: <Sparkles size={14} />, run: onOpenNeural },
    { type: "sep" },
    { type: "item", label: "Shuffle wallpaper", icon: <Image size={14} />, run: () => setWallIdx((i) => (i + 1) % WALLS.length) },
    { type: "item", label: "Refresh", icon: <RefreshCw size={14} />, run: () => os.refreshAgents() },
    { type: "item", label: "Display settings", icon: <Monitor size={14} />, run: () => setPop("settings") },
    { type: "sep" },
    { type: "item", label: "Lock", icon: <Power size={14} />, danger: true, run: () => { osSound.close(); setBooting(true); } },
  ];

  if (booting) {
    return <div className="relative h-full w-full overflow-hidden bg-[#03060d]"><BootLock onUnlock={() => { HAS_BOOTED = true; setBooting(false); }} /></div>;
  }

  const handleNodeClick = (node: FlowNode) => {
    const map: Record<string, string> = {
      core: "sophia",
      sophia: "sophia",
      research: "research",
      ops: "ops",
      operations: "ops",
      finance: "finance",
      comms: "comms",
    };
    if (node.id === "decisions") { setFocus(false); return; }
    if (map[node.id]) {
      setAgentId(map[node.id]);
    }
  };

  const batteryPct = device.battery ? Math.round(device.battery.level * 100) : null;

  return (
    <div className="relative h-full w-full select-none overflow-hidden text-slate-200" onPointerDown={() => setPop(null)} onContextMenu={(e) => { e.preventDefault(); setPop(null); setMenu({ x: e.clientX, y: e.clientY }); }}>
      {/* wallpaper + depth layers */}
      <div className="absolute inset-0" style={{ background: WALLS[wallIdx], transition: "background 700ms ease" }} />
      <div className="pointer-events-none absolute inset-0 z-[1] opacity-30" style={{ backgroundImage: "linear-gradient(rgba(120,170,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(120,170,255,0.08) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <div className="pointer-events-none absolute inset-0 z-[1] opacity-[0.35] mix-blend-overlay" style={{ backgroundImage: "repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px)" }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-36" style={{ background: "linear-gradient(180deg, rgba(180,220,255,0.06), transparent)" }} />
      <div className="pointer-events-none absolute inset-0 z-[1]" style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.45))" }} />

      {/* ----------------- top menu bar ----------------- */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-11 items-center justify-between border-b border-white/10 bg-[#060c18]/92 px-3 backdrop-blur-2xl sm:px-4" onPointerDown={(e) => e.stopPropagation()} style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button onClick={() => toggle("start")} className={`group flex h-8 items-center gap-1.5 rounded-lg px-2 text-slate-200 transition-all duration-200 hover:bg-white/10 active:scale-95 sm:px-2.5 ${pop === "start" ? "border border-cyan-400/30 bg-cyan-400/20 text-cyan-100 shadow-[0_0_12px_rgba(56,189,248,0.3)]" : "border border-white/5"}`} title="Menu">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-sky-500 font-bold text-slate-950 shadow-[0_0_10px_rgba(56,189,248,0.5)] transition-transform duration-300 group-hover:scale-105"><LayoutGrid size={12} /></span>
            <span className="text-[11.5px] font-bold tracking-wider text-white">SamJuniorsOS</span>
          </button>
          <button onClick={() => { osSound.open(); setSpotlight(true); }} className="group hidden h-7.5 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-slate-400 transition-all duration-200 hover:border-cyan-300/40 hover:bg-white/[0.08] hover:text-slate-100 active:scale-95 sm:flex" title="Search (⌘K)">
            <Search size={12} className="text-cyan-300 transition-transform group-hover:scale-110" /><span className="hidden md:inline">Search</span>
            <span className="flex items-center gap-0.5 rounded border border-white/15 bg-white/5 px-1 py-0.2 font-mono text-[9px] text-slate-400"><CommandIcon size={8} />K</span>
          </button>
          <div className="hidden items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-0.5 text-[10.5px] text-slate-400 lg:flex">
            {attention.length ? <><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.8)]" /><span className="font-mono text-[10px] tracking-wider text-amber-100">{attention.length} NEED YOU</span></> : <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" /><span className="font-mono text-[10px] tracking-wider">ALL QUIET</span></>}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => { osSound.click(); win === "min" ? openWin() : minWin(); }} className={`flex h-7.5 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-semibold transition active:scale-95 ${win !== "min" ? "border border-cyan-400/30 bg-cyan-400/15 text-cyan-200 shadow-[0_0_12px_rgba(56,189,248,0.25)]" : "text-slate-400 hover:bg-white/10 hover:text-white"}`}>
            <LayoutGrid size={14} className="text-orange-300" /><span className="hidden min-[420px]:inline">Workspace</span>{win !== "min" && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />}
          </button>
          <button onClick={() => { osSound.click(); onOpenNeural(); }} className="flex h-7.5 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white active:scale-95" title="Sophia">
            <Sparkles size={14} className="text-cyan-300" /><span className="hidden sm:inline">Sophia</span>
          </button>
          <button onClick={() => { osSound.click(); setFocus((v) => !v); }} className={`flex h-7.5 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition active:scale-95 ${focus ? "border border-cyan-400/30 bg-cyan-400/20 text-cyan-200" : "text-slate-400 hover:bg-white/10 hover:text-white"}`} title="Focus mode (F)">
            <PanelRightClose size={13} className={focus ? "text-cyan-300" : ""} /><span className="hidden md:inline">Focus</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <TrayBtn active={pop === "net"} onClick={() => toggle("net")} title="Network">{device.online ? <Wifi size={14} /> : <WifiOff size={14} className="text-rose-300" />}</TrayBtn>
          <TrayBtn active={pop === "vol"} onClick={() => toggle("vol")} title="Sound">{muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}</TrayBtn>
          <TrayBtn active={pop === "bell"} onClick={() => toggle("bell")} title="Needs you">
            <span className="relative"><Bell size={14} />{attention.length > 0 && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.9)]" />}</span>
          </TrayBtn>
          <TrayBtn active={pop === "settings"} onClick={() => toggle("settings")} title="Settings"><Gear size={14} /></TrayBtn>
          <button title="Calendar" onClick={() => { osSound.click(); toggle("cal"); }} className={`ml-1 flex h-7.5 items-center gap-1.5 rounded-lg px-2 transition-all duration-200 hover:bg-white/10 active:scale-95 ${pop === "cal" ? "bg-white/15 text-white" : ""}`}>
            <span className="tnum text-[12px] font-bold tracking-tight text-white">{fmtTime(now, h12)}</span>
          </button>
          {batteryPct !== null && (
            <div className="hidden items-center gap-1 pl-1 text-slate-400 sm:flex" title={device.battery?.charging ? "Charging" : "On battery"}>
              {device.battery?.charging ? <BatteryCharging size={14} className="text-emerald-300" /> : <Battery size={14} />}
              <span className="tnum font-mono text-[10px]">{batteryPct}%</span>
            </div>
          )}
        </div>

        {/* ----------------- popovers ----------------- */}
        {pop === "start" && (
          <Popover className="left-3 w-[360px] max-w-[calc(100vw-24px)] sm:left-4">
            <div className="border-b border-white/10 bg-white/[0.02] p-3.5">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input autoFocus placeholder="Search SamJuniorsOS…" onKeyDown={(e) => { if (e.key === "Enter") { setPop(null); setSpotlight(true); } }} className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-[12.5px] text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 p-3.5">
              {[
                { icon: <LayoutGrid size={17} />, l: "Workspace", run: openWin },
                { icon: <Sparkles size={17} />, l: "Sophia", run: onOpenNeural },
                { icon: <Activity size={17} />, l: `Work · ${work.length}`, run: () => setWorkOpen(true) },
                { icon: <Scale size={17} />, l: `Decisions · ${decisions.length}`, run: () => { setFocus(false); openWin(); } },
                { icon: <Bot size={17} />, l: "Workforce", run: () => setAgentId("sophia") },
                { icon: <Building2 size={17} />, l: "Company", run: () => { const v = window.prompt("This week's focus — one sentence:", company.focus); if (v !== null) os.setCompany({ focus: v.trim() }); } },
                { icon: <Bell size={17} />, l: `Needs you · ${attention.length}`, run: () => setPop("bell") },
                { icon: <Gear size={17} />, l: "Settings", run: () => setPop("settings") },
                { icon: <PanelRightClose size={17} />, l: "Focus", run: () => setFocus((v) => !v) },
              ].map((a) => (
                <button key={a.l} onClick={() => { osSound.click(); a.run(); if (a.l !== "Settings" && !a.l.startsWith("Needs")) setPop(null); }} className="group flex flex-col items-center gap-1.5 rounded-2xl p-2.5 transition hover:bg-white/[0.08] active:scale-95">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-200 shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:border-cyan-300/40 group-hover:bg-cyan-950/60">{a.icon}</span>
                  <span className="text-[11px] font-medium text-slate-300 group-hover:text-white">{a.l}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-4 py-2.5">
              <div className="flex items-center gap-2 text-[12px] text-slate-300"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400/20 font-bold text-cyan-200"><User size={13} /></span><span>Sam · {company.name}</span></div>
              <button onClick={() => { osSound.close(); setBooting(true); setPop(null); }} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300 active:scale-95" title="Lock"><Power size={14} /></button>
            </div>
          </Popover>
        )}

        {pop === "cal" && (
          <Popover className="right-3 sm:right-4">
            <div className="border-b border-white/10 bg-white/[0.02] px-4 pb-2 pt-3.5">
              <div className="text-[26px] font-light leading-tight text-white">{fmtTime(now, h12)}</div>
              <div className="mb-1 flex items-center gap-2 text-[11.5px] text-slate-400"><Clock size={12} className="text-cyan-300" /><span>{now.toLocaleDateString(undefined, { weekday: "long" })}</span></div>
            </div>
            <CalendarCard now={now} />
          </Popover>
        )}

        {pop === "vol" && (
          <Popover className="right-16 w-[250px] p-4 sm:right-24">
            <div className="mb-2.5 flex items-center justify-between text-[11.5px] font-bold uppercase tracking-[0.16em] text-slate-300">
              <span>Sound</span>
              <button onClick={() => { setMuted((m) => !m); osSound.click(); }} className="rounded-lg p-1 text-white transition hover:bg-white/10 active:scale-95">{muted ? <VolumeX size={15} className="text-rose-400" /> : <Volume2 size={15} className="text-cyan-300" />}</button>
            </div>
            <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={(e) => { setMuted(false); setVolume(parseFloat(e.target.value)); }} className="slider h-1.5 w-full cursor-pointer appearance-none rounded-full bg-cyan-300/20" />
            <div className="mt-1.5 text-right font-mono text-[10.5px] font-bold text-cyan-200">{Math.round((muted ? 0 : volume) * 100)}%</div>
            <div className="mt-2.5 border-t border-white/10 pt-2">
              <Toggle on={uiSounds} onClick={() => { setUiSounds((s) => !s); osSound.click(); }} label="Interface sounds" />
              <Toggle on={voice} onClick={() => setVoice((v) => !v)} label="Sophia voice" hint="Spoken briefings when something needs you" />
            </div>
          </Popover>
        )}

        {pop === "net" && (
          <Popover className="right-24 w-[260px] p-3.5 sm:right-32">
            <div className="mb-2 flex items-center justify-between text-[11.5px] font-bold uppercase tracking-[0.16em] text-slate-300"><span>Network</span><span className={`font-mono text-[9.5px] uppercase ${device.online ? "text-emerald-400" : "text-rose-300"}`}>{device.online ? "Online" : "Offline"}</span></div>
            <div className="space-y-1 text-[12px] text-slate-300">
              <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-2.5 py-2"><span>Connection</span><span className="font-mono text-[11px] text-cyan-200">{device.online ? (device.conn ? device.conn.toUpperCase() : "Connected") : "None"}</span></div>
              <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-2.5 py-2"><span>Data</span><span className="font-mono text-[11px] text-slate-400">Local only</span></div>
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-slate-500">SamJuniorsOS state lives in this browser. Nothing is sent anywhere.</p>
          </Popover>
        )}

        {pop === "bell" && (
          <Popover className="right-8 w-[340px] max-w-[calc(100vw-24px)] sm:right-16">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-3.5 py-3">
              <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-white">Needs you <span className="tnum ml-1 font-mono text-amber-200">{attention.length}</span></span>
              <button className="text-[10.5px] font-medium text-cyan-300 hover:underline" onClick={() => { attention.forEach((a) => os.handleAttention(a.id)); }}>Mark all handled</button>
            </div>
            <div className="os-scroll max-h-[320px] overflow-y-auto">
              {attention.length === 0 && <div className="flex flex-col items-center gap-2 p-8 text-center text-[12px] text-slate-500"><CheckCircle2 size={22} className="text-emerald-400/50" /><span>Nothing needs you.</span></div>}
              {attention.map((a) => {
                const agent = agents.find((ag) => ag.id === a.from);
                return (
                <div key={a.id} className="group flex items-start gap-2 border-b border-white/5 px-3.5 py-2.5 transition hover:bg-white/[0.02]">
                  <span className={`mt-0.5 shrink-0 ${a.kind === "blocked" ? "text-rose-300" : a.kind === "decision" ? "text-cyan-200" : "text-slate-400"}`}>{a.kind === "blocked" ? <AlertTriangle size={13} /> : a.kind === "decision" ? <Scale size={13} /> : <Bell size={13} />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold text-white">{a.title}</div>
                    {a.detail && <div className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{a.detail}</div>}
                    {/* V2: Agent attending context */}
                    <div className="mt-1 flex items-center gap-2 font-mono text-[9.5px] uppercase text-slate-500">
                      <span>{agentName(a.from)} · {a.kind}</span>
                      {agent?.current && <span className="normal-case text-slate-500/80">· {agent.current}</span>}
                      <span className="text-slate-600">{new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  <button onClick={() => os.handleAttention(a.id)} className="rounded-md p-1 text-slate-500 opacity-0 transition hover:text-cyan-200 group-hover:opacity-100" title="Handled"><CheckCircle2 size={13} /></button>
                </div>
                );
              })}
            </div>
            {log.length > 0 && (
              <div className="border-t border-white/10 px-3.5 py-2">
                <div className="mb-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-500">Recent</div>
                {log.slice(0, 3).map((l) => <div key={l.id} className="truncate text-[11px] text-slate-500">{l.text}</div>)}
              </div>
            )}
          </Popover>
        )}

        {pop === "settings" && (
          <Popover className="right-3 w-[350px] max-w-[calc(100vw-24px)] sm:right-4">
            <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3"><Gear size={14} className="text-cyan-300" /><span className="text-[12.5px] font-bold uppercase tracking-[0.16em] text-white">Settings</span></div>
            <div className="os-scroll max-h-[420px] overflow-y-auto p-3.5">
              {/* V2: Grouped sections with borders */}
              <div className="mb-3 rounded-xl border border-white/8 bg-white/[0.015] p-3">
                <div className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.2em] text-cyan-200/60">Sophia</div>
                <Toggle on={voice} onClick={() => setVoice((v) => !v)} label="Voice" hint="Speaks only when something needs you" />
                <Toggle on={notifsOn} onClick={() => setNotifsOn((v) => !v)} label="Notifications" hint="When the workforce raises something" />
              </div>
              <div className="mb-3 rounded-xl border border-white/8 bg-white/[0.015] p-3">
                <div className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.2em] text-cyan-200/60">Interface</div>
                <Toggle on={h12} onClick={() => setH12((v) => !v)} label="12-hour clock" />
                <Toggle on={uiSounds} onClick={() => setUiSounds((v) => !v)} label="Interface sounds" />
                <div className="flex items-center gap-3 py-1">
                  <Volume2 size={14} className="text-slate-400" />
                  <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="slider h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-cyan-300/20" />
                  <span className="w-8 text-right font-mono text-[10.5px] font-bold text-cyan-200">{Math.round(volume * 100)}</span>
                </div>
              </div>
              <div className="mb-3 rounded-xl border border-white/8 bg-white/[0.015] p-3">
                <div className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.2em] text-cyan-200/60">Company</div>
                <button onClick={() => { const v = window.prompt("Company name:", company.name); if (v && v.trim()) os.setCompany({ name: v.trim() }); }} className="flex w-full items-center justify-between py-2 text-left"><span className="text-[13px] text-slate-200">Name</span><span className="text-[12px] text-cyan-200">{company.name}</span></button>
                <button onClick={() => { const v = window.prompt("This week's focus:", company.focus); if (v !== null) os.setCompany({ focus: v.trim() }); }} className="flex w-full items-center justify-between py-2 text-left"><span className="text-[13px] text-slate-200">Focus</span><span className="max-w-[170px] truncate text-[12px] text-cyan-200">{company.focus || "Not set"}</span></button>
              </div>
              <button onClick={() => { if (window.confirm("Reset SamJuniorsOS to its starting state?")) os.reset(); }} className="flex w-full items-center gap-2 rounded-xl border border-rose-300/15 px-3 py-2 text-[12px] text-rose-200 transition hover:bg-rose-500/10"><RotateCcw size={13} /> Reset OS state</button>
              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <SunMoon size={17} className="shrink-0 text-cyan-300" />
                <div><div className="text-[12px] font-bold text-white">SamJuniorsOS</div><div className="text-[10.5px] text-slate-400">Local · this browser only</div></div>
              </div>
            </div>
          </Popover>
        )}
      </div>

      {/* desktop icons */}
      <div className="absolute left-3 top-16 z-10 grid grid-cols-1 gap-2.5 sm:left-6 sm:top-18 sm:gap-3.5">
        {[
          { icon: <LayoutGrid size={21} />, label: "Workspace", run: openWin },
          { icon: <Sparkles size={21} />, label: "Sophia", run: () => { osSound.click(); onOpenNeural(); } },
          { icon: <Activity size={21} />, label: "Work", run: () => { osSound.click(); setWorkOpen(true); } },
          { icon: <Scale size={21} />, label: "Decisions", run: () => { osSound.click(); setFocus(false); openWin(); } },
          { icon: <Gear size={21} />, label: "Settings", run: () => { osSound.click(); setPop("settings"); } },
        ].map((ic) => (
          <button key={ic.label} onDoubleClick={ic.run} onClick={() => { if (window.innerWidth < 768) ic.run(); else osSound.hover(); }} className="group flex w-[64px] flex-col items-center gap-1 rounded-xl p-1.5 text-center transition-all duration-200 hover:bg-white/10 active:scale-95 sm:w-[72px]">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-[#091222]/85 text-cyan-100 shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all duration-300 group-hover:-translate-y-1 group-hover:border-cyan-300/40 group-hover:bg-[#0d1a30] group-hover:shadow-[0_12px_32px_rgba(56,189,248,0.3)] sm:h-11 sm:w-11">{ic.icon}</span>
            <span className="text-[10px] font-medium leading-tight tracking-[0.01em] text-slate-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] sm:text-[10.5px]">{ic.label}</span>
          </button>
        ))}
      </div>

      {/* window */}
      {win !== "min" && (
        <div
          className={`absolute z-20 flex flex-col overflow-hidden bg-[#050a14] ${anim ? "os-win-in" : ""} ${win === "max" ? "bottom-0 left-0 right-0 top-11" : "rounded-2xl border border-white/15 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.85)]"}`}
          style={win === "max" ? undefined : { left: pos.x, top: pos.y, width: "min(1340px, calc(100vw - 32px))", height: "min(820px, calc(100vh - 72px))" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {win === "win" && (
            <div className="relative flex h-9 shrink-0 cursor-default items-center justify-between border-b border-white/10 bg-[#070e1c]/95 px-3.5 backdrop-blur-md" onPointerDown={onTitleDown} onPointerMove={onTitleMove} onPointerUp={onTitleUp} onDoubleClick={maxWin}>
              <Traffic onClose={closeWin} onMin={minWin} onMax={maxWin} />
              <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-slate-300">
                <span className={`h-2 w-2 rounded-full ${attention.length ? "animate-pulse bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"}`} />
                {company.name.toUpperCase()} · WORKSPACE
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <button title="Focus (F)" onClick={() => { osSound.click(); setFocus((v) => !v); }} className={`rounded-lg p-1 transition hover:bg-white/10 hover:text-white active:scale-95 ${focus ? "bg-cyan-400/15 text-cyan-300" : ""}`}><PanelRightClose size={13} /></button>
                <button className="rounded-lg p-1 transition hover:bg-white/10 hover:text-white active:scale-95" onClick={minWin} title="Minimize"><Minus size={13} /></button>
                <button className="rounded-lg p-1 transition hover:bg-white/10 hover:text-white active:scale-95" onClick={maxWin} title="Maximize"><Maximize2 size={12} /></button>
                <button className="rounded-lg p-1 transition hover:bg-rose-500/20 hover:text-rose-300 active:scale-95" onClick={closeWin} title="Close"><X size={13} /></button>
              </div>
            </div>
          )}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <FlowDesktop focus={focus} onPanelOpen={() => setFocus(false)} onNodeClick={handleNodeClick} onOpenAgent={(id) => setAgentId(id)} voice={voice} onVoice={setVoice} />
          </div>
        </div>
      )}

      <AgentQuickDock onSelectAgent={(id) => setAgentId(id)} />
      <PersonaModal agentId={agentId} onClose={() => setAgentId(null)} />
      <TodoDrawer open={workOpen} onToggle={setWorkOpen} />

      {/* toasts — real events only */}
      <div className="pointer-events-none absolute right-4 top-14 z-[60] flex w-[300px] max-w-[calc(100vw-32px)] flex-col gap-2.5">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto rounded-2xl border border-white/15 bg-[#08111e]/95 p-3.5 shadow-[0_24px_60px_-10px_rgba(0,0,0,0.85)] backdrop-blur-2xl" style={{ animation: "toast-in 320ms cubic-bezier(.16,1,.3,1)" }}>
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300"><Bell size={11} /> Needs you</span>
              <span className="font-mono text-[10px] text-slate-500">now</span>
            </div>
            <div className="text-[12.5px] font-semibold leading-tight text-white">{t.t}</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{t.d}</div>
          </div>
        ))}
      </div>

      <Spotlight open={spotlight} commands={commands} onClose={() => setSpotlight(false)} />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  );
}
