import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Send, FileSpreadsheet, Mail, Globe, Zap, Brain, Home, Calendar, Database,
  Sparkles, Bot, MessageCircle, Search, Boxes, Radio, GraduationCap,
  Users, BarChart3, CalendarCheck, Building2, ChevronDown,
  Check, Plus, ZoomIn, ZoomOut, Maximize, Crosshair, PanelLeftClose,
  PanelRightClose, PanelBottomClose, Layers, MousePointer2, X, Activity,
  Hand, Map as MapIcon,
} from "lucide-react";
import { FlowEngine, NODES, WORLD, type FlowNode } from "../lib/flow";
import { osSound } from "../lib/osAudio";

/* ------------------------------------------------------------- node meta */

type Meta = { title: string; sub: string; icon: ReactNode; tint?: string; desc?: string };

const META: Record<string, Meta> = {
  website: { title: "Inbox", sub: "", icon: <Building2 size={30} strokeWidth={1.6} />, desc: "What arrived. Mail, notes, and asks waiting for attention." },
  telegram: { title: "Signals", sub: "What came in", icon: <Send size={27} strokeWidth={1.8} />, tint: "#38bdf8", desc: "Live pings. Sophia notices; she does not dump a feed on you." },
  sheets: { title: "Records", sub: "What we keep", icon: <FileSpreadsheet size={29} strokeWidth={1.7} />, tint: "#34d399", desc: "The house memory. Decisions and files, named once." },
  reply: { title: "Briefs", sub: "Short notes", icon: <Send size={27} strokeWidth={1.8} />, tint: "#38bdf8", desc: "One-page reads. Enough to decide, nothing extra." },
  email: { title: "Calendar", sub: "When", icon: <Mail size={29} strokeWidth={1.7} />, desc: "Time that is already spoken for. Atlas keeps it honest." },
  trigger: { title: "Intake", sub: "Something new", icon: <Zap size={29} strokeWidth={1.8} />, tint: "#4ade80", desc: "A new ask enters the desk. Routed, not piled." },
  intent: { title: "Understand", sub: "What it needs", icon: <Brain size={29} strokeWidth={1.7} />, desc: "Iris reads it. You get the point, not the pile." },
  core: { title: "Sophia", sub: "", icon: <Bot size={32} strokeWidth={1.7} />, desc: "The interface. She holds attention and asks you only when a word is needed." },
  match: { title: "Decide", sub: "Your word", icon: <Home size={29} strokeWidth={1.7} />, desc: "Waiting on you. Nothing moves past here without a yes or a no." },
  send: { title: "Dispatch", sub: "After you nod", icon: <Send size={29} strokeWidth={1.7} />, desc: "Reed sends only once you say so." },
  follow: { title: "Follow-through", sub: "Until it's done", icon: <Calendar size={29} strokeWidth={1.7} />, desc: "Atlas closes the loop. No silent drop." },
  gemini: { title: "Memory", sub: "What we remember", icon: <GeminiG />, desc: "Context that survives a closed window." },
  memory: { title: "Context", sub: "This session", icon: <Sparkles size={29} strokeWidth={1.7} />, desc: "What Sophia is holding right now." },
  save: { title: "Archive", sub: "File it", icon: <FileSpreadsheet size={29} strokeWidth={1.7} />, tint: "#34d399", desc: "Voss puts it away so it can be found." },
  db: { title: "Continuity", sub: "The house", icon: <Database size={29} strokeWidth={1.7} />, desc: "The desk as it stood. Restored when you return." },
};

function GeminiG() {
  return (
    <svg width={30} height={30} viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const EASE = "cubic-bezier(.16,1,.3,1)";
const MIN_K = 0.16;
const MAX_K = 2.4;

/* ------------------------------------------------------------------ nodes */

function NodeCard({
  n, selected, onClick, onDoubleClick,
}: {
  n: FlowNode; selected?: boolean; onClick?: (n: FlowNode) => void; onDoubleClick?: (n: FlowNode) => void;
}) {
  const m = META[n.id];
  const titleLines = m.title.split("\n");
  if (n.kind === "core") {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick?.(n); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(n); }}
        className={`group absolute flex cursor-pointer select-none items-center justify-center gap-3 rounded-2xl border text-white transition-all duration-200 hover:-translate-y-1 active:scale-95 ${selected ? "border-orange-200/90" : "border-orange-300/50"}`}
        style={{
          left: n.x - n.w / 2, top: n.y - n.h / 2, width: n.w, height: n.h,
          background: "linear-gradient(160deg, rgba(60,40,30,0.94), rgba(25,18,14,0.97))",
          boxShadow: selected
            ? "inset 0 0 30px rgba(255,140,60,0.35), 0 0 60px rgba(255,120,40,0.6), 0 0 0 2px rgba(255,200,140,0.5)"
            : "inset 0 0 30px rgba(255,140,60,0.25), 0 0 40px rgba(255,120,40,0.35)",
        }}
      >
        <span className="text-orange-100 drop-shadow-[0_0_10px_rgba(255,170,80,0.9)] transition-transform duration-200 group-hover:scale-110">{m.icon}</span>
        <div className="text-[20px] font-semibold leading-[1.05] tracking-[-0.01em] drop-shadow-[0_0_14px_rgba(255,190,120,0.8)]">
          {titleLines.map((l) => <div key={l}>{l}</div>)}
        </div>
        {selected && <span className="pointer-events-none absolute -inset-2 animate-pulse rounded-3xl border border-orange-200/40" />}
      </div>
    );
  }
  const round = n.kind === "round";
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(n); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(n); }}
      className="group absolute cursor-pointer select-none"
      style={{ left: n.x - 90, top: n.y - n.h / 2, width: 180 }}
    >
      <div
        className={`mx-auto flex items-center justify-center text-white transition-all duration-200 group-hover:-translate-y-1 group-hover:scale-105 active:scale-95 ${round ? "rounded-full" : "rounded-2xl"} ${selected ? "ring-2 ring-cyan-200/80" : ""}`}
        style={{
          width: n.w, height: n.h,
          color: m.tint ?? "#f3f7ff",
          background: round
            ? "radial-gradient(circle at 50% 40%, rgba(40,70,120,0.92), rgba(14,22,40,0.96))"
            : "linear-gradient(160deg, rgba(58,64,78,0.96), rgba(28,32,42,0.98))",
          border: selected
            ? "1px solid rgba(160,230,255,0.9)"
            : round ? "1px solid rgba(120,190,255,0.55)" : "1px solid rgba(255,255,255,0.14)",
          boxShadow: selected
            ? "0 0 34px rgba(103,232,249,0.55), inset 0 0 18px rgba(103,232,249,0.25)"
            : round
              ? "0 0 26px rgba(80,160,255,0.45), inset 0 0 18px rgba(80,160,255,0.25)"
              : "0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <span className="transition-transform duration-200 group-hover:scale-110">{m.icon}</span>
      </div>
      <div className="pointer-events-none mt-2 text-center">
        <div className={`text-[15px] font-semibold leading-[1.15] tracking-[-0.008em] transition-colors ${selected ? "text-cyan-100" : "text-white group-hover:text-cyan-100"}`} style={{ textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>
          {titleLines.map((l) => <div key={l}>{l}</div>)}
        </div>
        {m.sub && <div className="mt-0.5 text-[11px] tracking-[0.005em] text-slate-300/90" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.9)" }}>{m.sub}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ panels */

function SideCard({ title, icon, children, defaultOpen = true }: { title: string; icon?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="shrink-0 rounded-2xl border border-white/10 bg-[#0a1120]/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_-18px_rgba(0,0,0,0.75)] backdrop-blur-md">
      <button type="button" onClick={() => { osSound.click(); setOpen((o) => !o); }} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/90">
          {icon && <span className="text-cyan-300/80">{icon}</span>}{title}
        </span>
        <ChevronDown size={14} className={`text-white/40 transition-transform duration-300 ${open ? "" : "-rotate-90"}`} />
      </button>
      <div className="overflow-hidden" style={{ maxHeight: open ? 640 : 0, opacity: open ? 1 : 0, transition: `max-height 420ms ${EASE}, opacity 280ms ease` }}>
        <div className="px-4 pb-4">{children}</div>
      </div>
    </section>
  );
}

function ListItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="-mx-1 flex cursor-default items-center gap-2.5 rounded-lg px-1 py-1.5 transition hover:bg-white/[0.05]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white">{icon}</span>
      <span className="text-[12.5px] leading-tight text-slate-200">{label}</span>
    </div>
  );
}

function MiniTile({ icon, label, tint }: { icon: ReactNode; label: string; tint?: string }) {
  return (
    <button className="group flex min-w-[64px] flex-col items-center gap-1.5 rounded-xl px-2 py-2 transition hover:bg-white/[0.06] active:scale-95">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] transition group-hover:border-white/25" style={{ color: tint ?? "#fff" }}>{icon}</span>
      <span className="max-w-[72px] truncate text-center text-[10px] leading-tight text-slate-300">{label}</span>
    </button>
  );
}

type Todo = { id: number; text: string; done: boolean; tag?: string };
const SEED_TODOS: Todo[] = [
  { id: 1, text: "Read Sophia's morning brief", done: true, tag: "desk" },
  { id: 2, text: "Decide on the partnership note", done: false, tag: "you" },
  { id: 3, text: "Approve Reed's draft", done: false, tag: "you" },
  { id: 4, text: "Let Voss archive last week", done: false, tag: "desk" },
];

function TodoList() {
  const [todos, setTodos] = useState<Todo[]>(SEED_TODOS);
  const [draft, setDraft] = useState("");
  const done = todos.filter((t) => t.done).length;
  const pct = todos.length ? Math.round((done / todos.length) * 100) : 0;
  const toggle = (id: number) => { osSound.click(); setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t))); };
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    osSound.open();
    setTodos((ts) => [...ts, { id: Date.now(), text, done: false }]);
    setDraft("");
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="tnum text-[10.5px] uppercase tracking-[0.14em] text-slate-400">{done}/{todos.length} complete</span>
        <span className="tnum text-[10.5px] font-semibold text-cyan-200">{pct}%</span>
      </div>
      <div className="mb-2.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-sky-400 transition-[width] duration-500" style={{ width: `${pct}%`, transitionTimingFunction: EASE }} />
      </div>
      <div className="max-h-[150px] space-y-0.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
        {todos.map((t) => (
          <button key={t.id} onClick={() => toggle(t.id)} className="flex w-full items-start gap-2 rounded-lg px-1 py-1.5 text-left transition hover:bg-white/[0.05]">
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-all ${t.done ? "border-cyan-300/70 bg-cyan-400/90 text-[#04121b]" : "border-white/25 bg-white/[0.03]"}`}>
              {t.done && <Check size={11} strokeWidth={3.2} />}
            </span>
            <span className={`flex-1 text-[12.5px] leading-snug ${t.done ? "text-slate-500 line-through" : "text-slate-200"}`}>{t.text}</span>
            {t.tag && <span className="mt-0.5 rounded border border-white/10 bg-white/[0.04] px-1 py-px text-[8.5px] uppercase tracking-[0.12em] text-slate-400">{t.tag}</span>}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 transition focus-within:border-cyan-200/40">
        <Plus size={13} className="shrink-0 text-slate-500" />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Add work" className="w-full bg-transparent text-[12px] text-white outline-none placeholder:text-slate-500" />
      </div>
    </div>
  );
}

function Minimap({ vw, vh, k, pan, onJump }: { vw: number; vh: number; k: number; pan: { x: number; y: number }; onJump: (wx: number, wy: number) => void }) {
  const MW = 132, MH = 84;
  const ms = Math.min(MW / WORLD.W, MH / WORLD.H);
  const ox = (MW - WORLD.W * ms) / 2, oy = (MH - WORLD.H * ms) / 2;
  const toMini = (wx: number, wy: number) => ({ x: ox + (wx - (WORLD.CX - WORLD.W / 2)) * ms, y: oy + (wy - (WORLD.CY - WORLD.H / 2)) * ms });
  const tx = vw / 2 + pan.x - WORLD.CX * k;
  const ty = vh / 2 + pan.y - WORLD.CY * k;
  const wl = (0 - tx) / k, wr = (vw - tx) / k, wt = (0 - ty) / k, wb = (vh - ty) / k;
  const a = toMini(wl, wt), b = toMini(wr, wb);
  return (
    <div className="overflow-hidden rounded-xl border border-white/12 bg-[#060c18]/90 shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur-md">
      <svg
        width={MW} height={MH} className="block cursor-crosshair"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const mx = e.clientX - r.left, my = e.clientY - r.top;
          const wx = (mx - ox) / ms + (WORLD.CX - WORLD.W / 2);
          const wy = (my - oy) / ms + (WORLD.CY - WORLD.H / 2);
          onJump(wx, wy);
        }}
      >
        <rect x={0} y={0} width={MW} height={MH} fill="rgba(10,20,36,0.6)" />
        {NODES.map((n) => {
          const p = toMini(n.x, n.y);
          return <circle key={n.id} cx={p.x} cy={p.y} r={n.id === "core" ? 3.4 : 1.8} fill={n.id === "core" ? "#fb923c" : "#7dd3fc"} opacity={0.9} />;
        })}
        <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.max(6, Math.abs(b.x - a.x))} height={Math.max(6, Math.abs(b.y - a.y))} fill="rgba(103,232,249,0.12)" stroke="rgba(103,232,249,0.7)" strokeWidth={1} rx={2} />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------- component */

export default function FlowDesktop({
  focus = false,
  onPanelOpen,
  onNodeClick,
}: {
  focus?: boolean;
  onPanelOpen?: () => void;
  onNodeClick?: (node: FlowNode) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<FlowEngine | null>(null);
  const cursorRef = useRef<HTMLSpanElement | null>(null);

  // viewport pixel size (layout only — never drives zoom by itself)
  const [vw, setVw] = useState(900);
  const [vh, setVh] = useState(560);
  // absolute camera: k = world->screen scale. Independent of panel layout.
  const [cam, setCam] = useState({ x: 0, y: 0, k: 0.55 });
  const [selected, setSelected] = useState<FlowNode | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [leftOpen, setLeftOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 1024 : true));
  const [rightOpen, setRightOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 1280 : true));
  const [bottomOpen, setBottomOpen] = useState(true);
  const [gridOn, setGridOn] = useState(true);
  const [mapOn, setMapOn] = useState(true);
  const [spaceDown, setSpaceDown] = useState(false);

  const vwRef = useRef(vw);
  const vhRef = useRef(vh);
  const camRef = useRef(cam);
  const spaceRef = useRef(false);
  const didFit = useRef(false);
  const baseFit = useRef(0.55);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; k: number; mx: number; my: number; px: number; py: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const animId = useRef(0);

  vwRef.current = vw;
  vhRef.current = vh;
  camRef.current = cam;

  const tx = vw / 2 + cam.x - WORLD.CX * cam.k;
  const ty = vh / 2 + cam.y - WORLD.CY * cam.k;

  /* engine lifecycle */
  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new FlowEngine(canvas);
    engineRef.current = engine;
    engine.start();
    return () => engine.stop();
  }, []);

  /* measure viewport — fit ONLY on first mount, never again (3D-app behaviour) */
  useEffect(() => {
    const el = viewportRef.current!;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(240, r.width), h = Math.max(240, r.height);
      setVw(w); setVh(h);
      if (!didFit.current && w > 10 && h > 10) {
        didFit.current = true;
        const fit = Math.min(w / WORLD.W, h / WORLD.H) * 0.94;
        const k = Math.min(MAX_K, Math.max(MIN_K, fit));
        baseFit.current = k;
        setCam({ x: 0, y: 0, k });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* sync engine camera */
  useEffect(() => {
    engineRef.current?.setViewport(vw, vh, cam.k, tx, ty);
  }, [vw, vh, cam, tx, ty]);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 6500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => () => cancelAnimationFrame(animId.current), []);

  /* ---------------- camera helpers (stable, ref-based) ---------------- */

  const animateTo = useCallback((target: { x: number; y: number; k: number }, dur = 380) => {
    cancelAnimationFrame(animId.current);
    const start = { ...camRef.current };
    const k = Math.min(MAX_K, Math.max(MIN_K, target.k));
    const vw = vwRef.current, vh = vhRef.current;
    const mx = (WORLD.W * k) / 2 + vw / 2 + 120;
    const my = (WORLD.H * k) / 2 + vh / 2 + 120;
    const end = { x: Math.max(-mx, Math.min(mx, target.x)), y: Math.max(-my, Math.min(my, target.y)), k };
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      setCam({ x: start.x + (end.x - start.x) * e, y: start.y + (end.y - start.y) * e, k: start.k + (end.k - start.k) * e });
      if (t < 1) animId.current = requestAnimationFrame(tick);
    };
    animId.current = requestAnimationFrame(tick);
  }, []);

  const zoomAt = useCallback((mx: number, my: number, factor: number) => {
    const vw = vwRef.current, vh = vhRef.current;
    setCam((prev) => {
      const nk = Math.min(MAX_K, Math.max(MIN_K, prev.k * factor));
      if (Math.abs(nk - prev.k) < 1e-6) return prev;
      const f = nk / prev.k;
      const nx = mx - vw / 2 - ((mx - vw / 2 - prev.x) * f);
      const ny = my - vh / 2 - ((my - vh / 2 - prev.y) * f);
      const mxm = (WORLD.W * nk) / 2 + vw / 2 + 120;
      const mym = (WORLD.H * nk) / 2 + vh / 2 + 120;
      return { x: Math.max(-mxm, Math.min(mxm, nx)), y: Math.max(-mym, Math.min(mym, ny)), k: nk };
    });
  }, []);

  const fitView = useCallback(() => {
    osSound.click();
    const vw = vwRef.current, vh = vhRef.current;
    const fit = Math.min(vw / WORLD.W, vh / WORLD.H) * 0.94;
    animateTo({ x: 0, y: 0, k: Math.min(MAX_K, Math.max(MIN_K, fit)) });
  }, [animateTo]);

  const recenter = useCallback(() => {
    osSound.click();
    animateTo({ x: 0, y: 0, k: camRef.current.k });
  }, [animateTo]);

  const jumpTo = useCallback((wx: number, wy: number) => {
    osSound.click();
    const k = camRef.current.k;
    animateTo({ x: -(wx - WORLD.CX) * k, y: -(wy - WORLD.CY) * k, k }, 320);
  }, [animateTo]);

  const focusNode = useCallback((n: FlowNode) => {
    const vw = vwRef.current, vh = vhRef.current;
    const fit = Math.min(vw / WORLD.W, vh / WORLD.H) * 0.94;
    const k = Math.min(1.5, Math.max(camRef.current.k, fit * 1.7));
    animateTo({ x: -(n.x - WORLD.CX) * k, y: -(n.y - WORLD.CY) * k, k });
  }, [animateTo]);

  /* wheel zoom — attached once */
  useEffect(() => {
    const el = viewportRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0014));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* keyboard */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.code === "Space" && !typing) {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        spaceRef.current = true;
        setSpaceDown(true);
        return;
      }
      if (typing) return;
      const vw = vwRef.current, vh = vhRef.current;
      if (e.key === "+" || e.key === "=") zoomAt(vw / 2, vh / 2, 1.15);
      else if (e.key === "-" || e.key === "_") zoomAt(vw / 2, vh / 2, 1 / 1.15);
      else if (e.key === "0") fitView();
      else if (e.key === "Escape") setSelected(null);
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 160 : 48;
        const dx = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
        const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
        setCam((p) => {
          const mx = (WORLD.W * p.k) / 2 + vw / 2 + 120;
          const my = (WORLD.H * p.k) / 2 + vh / 2 + 120;
          return { ...p, x: Math.max(-mx, Math.min(mx, p.x + dx)), y: Math.max(-my, Math.min(my, p.y + dy)) };
        });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") { spaceRef.current = false; setSpaceDown(false); }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [zoomAt, fitView]);

  /* ---------------- pointer: pan + pinch (viewport only) ---------------- */

  const isInteractive = (t: EventTarget | null) =>
    !!(t as HTMLElement | null) && !!((t as HTMLElement).closest?.("button,input,a,textarea,.cursor-pointer"));

  const updateCursorReadout = (clientX: number, clientY: number) => {
    const el = viewportRef.current;
    if (!el || !cursorRef.current) return;
    const r = el.getBoundingClientRect();
    const c = camRef.current;
    const w = vwRef.current, h = vhRef.current;
    const cTx = w / 2 + c.x - WORLD.CX * c.k;
    const cTy = h / 2 + c.y - WORLD.CY * c.k;
    const wx = Math.round(((clientX - r.left) - cTx) / c.k);
    const wy = Math.round(((clientY - r.top) - cTy) / c.k);
    cursorRef.current.textContent = `${wx}, ${wy}`;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = viewportRef.current!.getBoundingClientRect();
      const c = camRef.current;
      pinch.current = {
        d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        k: c.k,
        mx: (a.x + b.x) / 2 - r.left,
        my: (a.y + b.y) / 2 - r.top,
        px: c.x, py: c.y,
      };
      panStart.current = null;
      return;
    }
    const forcePan = e.button === 1 || e.button === 2 || spaceRef.current;
    if (forcePan || (e.button === 0 && !isInteractive(e.target))) {
      if (e.button === 1) e.preventDefault();
      const c = camRef.current;
      panStart.current = { x: c.x, y: c.y, px: e.clientX, py: e.clientY, moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    updateCursorReadout(e.clientX, e.clientY);
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const r = viewportRef.current!.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const base = pinch.current;
      const vw = vwRef.current, vh = vhRef.current;
      const nk = Math.min(MAX_K, Math.max(MIN_K, base.k * (d / base.d)));
      const f = nk / base.k;
      const nx = mx - vw / 2 - ((base.mx - vw / 2 - base.px) * f) + (mx - base.mx);
      const ny = my - vh / 2 - ((base.my - vh / 2 - base.py) * f) + (my - base.my);
      const mxm = (WORLD.W * nk) / 2 + vw / 2 + 120;
      const mym = (WORLD.H * nk) / 2 + vh / 2 + 120;
      setCam({ x: Math.max(-mxm, Math.min(mxm, nx)), y: Math.max(-mym, Math.min(mym, ny)), k: nk });
      setShowHint(false);
      return;
    }
    const ps = panStart.current;
    if (ps) {
      const dx = e.clientX - ps.px, dy = e.clientY - ps.py;
      if (Math.abs(dx) + Math.abs(dy) > 3) { ps.moved = true; setShowHint(false); }
      const vw = vwRef.current, vh = vhRef.current;
      const k = camRef.current.k;
      const mxm = (WORLD.W * k) / 2 + vw / 2 + 120;
      const mym = (WORLD.H * k) / 2 + vh / 2 + 120;
      setCam((p) => ({ ...p, x: Math.max(-mxm, Math.min(mxm, ps.x + dx)), y: Math.max(-mym, Math.min(mym, ps.y + dy)) }));
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    const ps = panStart.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) panStart.current = null;
    // click (no drag) on empty canvas clears selection
    if (ps && !ps.moved && e.button === 0 && !spaceRef.current && !isInteractive(e.target)) {
      setSelected(null);
    }
  };

  const handleNodeClick = (n: FlowNode) => {
    osSound.open();
    engineRef.current?.arrive(n.id, n.x, n.y);
    setSelected(n);
    onNodeClick?.(n);
  };

  const effLeft = leftOpen && !focus;
  const effRight = rightOpen && !focus;
  const effBottom = bottomOpen && !focus;

  const gridMinor = 44 * cam.k;
  const gridMajor = 220 * cam.k;
  const selMeta = selected ? META[selected.id] : null;

  return (
    <div className="flex h-full w-full flex-col gap-2 overflow-hidden bg-[#04060d] p-2 sm:gap-2.5 sm:p-2.5">
      {/* ============================ app header (fixed) ============================ */}
      <header className="flex h-[54px] shrink-0 items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-[#060c18]/90 px-2.5 backdrop-blur-md sm:px-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={() => { osSound.click(); setLeftOpen((v) => { if (!v) onPanelOpen?.(); return !v; }); }} title={effLeft ? "Hide left panel" : "Show left panel"} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/10 hover:text-white active:scale-95 ${effLeft ? "text-cyan-200" : "text-slate-500"}`}>
            <PanelLeftClose size={16} />
          </button>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.03]">
            <Home size={17} className="text-white" />
          </div>
          <div className="hidden leading-none min-[420px]:block">
            <div className="text-[15px] font-bold tracking-[0.22em] text-white">SAMJUNIORSOS</div>
            <div className="mt-1 text-[8px] tracking-[0.3em] text-slate-500">SOPHIA HOLDS THE ROOM</div>
          </div>
        </div>

        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] tracking-[0.18em] text-slate-400 md:flex">
          <Layers size={12} className="text-cyan-300" />
          THE DESK
          <span className="text-slate-700">·</span>
          <span className="tnum font-mono text-cyan-200">{Math.round((cam.k / Math.max(0.001, baseFit.current)) * 100)}%</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5">
          <div className="mr-1 hidden items-center gap-2 text-[10px] tracking-[0.2em] text-slate-300 sm:flex">
            LIVE <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.8)]" />
            <span className="text-slate-600">•</span> SOPHIA PRESENT
          </div>
          <button onClick={() => { osSound.click(); setBottomOpen((v) => { if (!v) onPanelOpen?.(); return !v; }); }} title={effBottom ? "Hide bottom dock" : "Show bottom dock"} className={`flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/10 hover:text-white active:scale-95 ${effBottom ? "text-cyan-200" : "text-slate-500"}`}>
            <PanelBottomClose size={16} />
          </button>
          <button onClick={() => { osSound.click(); setRightOpen((v) => { if (!v) onPanelOpen?.(); return !v; }); }} title={effRight ? "Hide right panel" : "Show right panel"} className={`flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/10 hover:text-white active:scale-95 ${effRight ? "text-cyan-200" : "text-slate-500"}`}>
            <PanelRightClose size={16} />
          </button>
        </div>
      </header>

      {/* ============================ main row ============================ */}
      <div className="relative flex min-h-0 flex-1 gap-2 sm:gap-2.5">
        {/* ---------------- left rail (fixed — never zooms) ---------------- */}
        <aside
          className={`z-20 flex w-[248px] shrink-0 flex-col gap-2.5 overflow-y-auto overflow-x-hidden rounded-2xl border border-white/[0.08] bg-[#060c18]/80 p-3 backdrop-blur-md transition-all duration-500 [scrollbar-width:thin] max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:w-[270px] max-lg:border-white/12 max-lg:bg-[#060c18]/96 max-lg:shadow-[24px_0_60px_rgba(0,0,0,0.65)] ${effLeft ? "max-lg:translate-x-0" : "max-lg:-translate-x-[112%]"}`}
          style={effLeft ? undefined : { marginLeft: -260, opacity: 0, pointerEvents: "none" }}
        >
          <div className="w-[224px] max-lg:w-[246px]">
            <h2 className="text-[25px] font-bold leading-[1.05] tracking-[-0.02em] text-white">Attend.<br />Decide.<br />Continue.</h2>
            <p className="mt-2 text-[12px] leading-snug text-slate-400">Sophia holds attention. The desk holds the work.</p>
          </div>
          <div className="w-[224px] max-lg:w-[246px]">
            <SideCard title="House" icon={<Activity size={13} />}>
              {[
                ["Session", "Open"],
                ["Attention", "Listening"],
                ["Decisions", "Waiting"],
                ["Work", "In motion"],
                ["Workforce", "Present"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between border-b border-white/[0.07] py-2.5 last:border-0">
                  <span className="text-[12px] text-slate-400">{k}</span>
                  <span className="text-[13px] font-medium text-white">{v}</span>
                </div>
              ))}
            </SideCard>
          </div>
          <div className="mt-auto w-[224px] pt-1 max-lg:w-[246px]">
            <svg width="100%" height="40" viewBox="0 0 190 50" preserveAspectRatio="none" className="opacity-90">
              <polyline fill="none" stroke="rgba(110,200,255,0.9)" strokeWidth="1.4" points="0,30 14,30 22,12 28,44 36,30 60,30 70,20 78,38 84,30 110,30 120,8 128,46 136,30 160,30 170,22 178,36 190,30" strokeDasharray="600" strokeDashoffset="600" style={{ animation: "dash 3s linear infinite" }} />
            </svg>
            <div className="mt-1 text-[9px] tracking-[0.26em] text-slate-600">THE HOUSE IS QUIET WHEN IT CAN BE.</div>
          </div>
        </aside>

        {/* ---------------- center column ---------------- */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 sm:gap-2.5">
          {/* ============ CANVAS VIEWPORT — the ONLY pannable/zoomable surface ============ */}
          <div
            ref={viewportRef}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onPointerLeave={endPointer}
            onDoubleClick={(e) => {
              const t = e.target as HTMLElement;
              if ((t as HTMLElement).closest?.("button,input,a,textarea,.cursor-pointer")) return;
              const r = viewportRef.current!.getBoundingClientRect();
              zoomAt(e.clientX - r.left, e.clientY - r.top, e.shiftKey ? 1 / 1.35 : 1.35);
            }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className={`relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#030710] shadow-[0_30px_80px_-24px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] outline-none ${spaceDown ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing"}`}
            style={{ touchAction: "none" }}
          >
            {/* infinite world grid — pans & zooms with the camera */}
            {gridOn && (
              <>
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage: "linear-gradient(rgba(120,170,255,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(120,170,255,0.09) 1px, transparent 1px)",
                    backgroundSize: `${gridMinor}px ${gridMinor}px`,
                    backgroundPosition: `${tx}px ${ty}px`,
                    opacity: cam.k < 0.3 ? 0.5 : 1,
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage: "linear-gradient(rgba(120,190,255,0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(120,190,255,0.13) 1px, transparent 1px)",
                    backgroundSize: `${gridMajor}px ${gridMajor}px`,
                    backgroundPosition: `${tx}px ${ty}px`,
                  }}
                />
              </>
            )}
            {/* fixed lighting (not part of the world) */}
            <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(30,60,120,0.28), transparent 62%), radial-gradient(ellipse at 50% 115%, rgba(40,90,180,0.24), transparent 55%)" }} />

            {/* ---- world layer: nodes + labels (transformed) ---- */}
            <div className="absolute left-0 top-0 h-0 w-0" style={{ transform: `translate(${tx}px, ${ty}px) scale(${cam.k})`, transformOrigin: "0 0" }}>
              <div className="absolute whitespace-nowrap text-[11px] font-bold tracking-[0.24em] text-white/85" style={{ left: 740, top: 58 }}>ATTENTION</div>
              <div className="absolute whitespace-nowrap text-[11px] font-bold tracking-[0.24em] text-white/85" style={{ left: 285, top: 366 }}>COMMAND</div>
              <div className="absolute flex items-center gap-2 whitespace-nowrap text-[11px] font-bold tracking-[0.22em] text-cyan-300" style={{ left: 478, top: 579 }}>
                <span className="text-orange-400">➜</span> CONTINUITY
              </div>
              {NODES.map((n) => (
                <NodeCard key={n.id} n={n} selected={selected?.id === n.id} onClick={handleNodeClick} onDoubleClick={focusNode} />
              ))}
            </div>

            {/* ---- flow engine canvas (same camera) ---- */}
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

            {/* fixed vignette */}
            <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(2,6,14,0.5))" }} />
            {/* viewport corner ticks */}
            <div className="pointer-events-none absolute inset-2.5 opacity-40">
              <span className="absolute left-0 top-0 h-3 w-3 rounded-tl-md border-l border-t border-cyan-200/40" />
              <span className="absolute right-0 top-0 h-3 w-3 rounded-tr-md border-r border-t border-cyan-200/40" />
              <span className="absolute bottom-0 left-0 h-3 w-3 rounded-bl-md border-b border-l border-cyan-200/40" />
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-br-md border-b border-r border-cyan-200/40" />
            </div>

            {/* ================= HUD — fixed, never zooms ================= */}
            <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-[#060c18]/85 py-1.5 pl-3 pr-2.5 text-[10px] tracking-[0.18em] text-slate-300 backdrop-blur-md">
              {spaceDown ? <Hand size={11} className="text-amber-300" /> : <MousePointer2 size={11} className="text-cyan-300" />}
              {spaceDown ? "PAN" : "CANVAS"}
              <span className="tnum rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-cyan-200">
                {Math.round((cam.k / Math.max(0.001, baseFit.current)) * 100)}%
              </span>
            </div>

            {focus && (
              <button onClick={() => { osSound.click(); onPanelOpen?.(); }} className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-cyan-200/30 bg-[#081120]/90 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100 backdrop-blur-md transition hover:bg-cyan-300/10 active:scale-95">
                Focus mode · press F to exit
              </button>
            )}

            {selected && selMeta && !focus && (
              <div className="absolute left-1/2 top-14 z-10 w-[320px] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl border border-cyan-200/25 bg-[#081120]/94 p-3.5 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:top-3 sm:max-w-[calc(100%-20rem)]" style={{ animation: `os-in 220ms ${EASE}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.05]" style={{ color: selMeta.tint ?? "#fff" }}>{selMeta.icon}</span>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold leading-tight text-white">{selMeta.title.replace("\n", " ")}</div>
                      {selMeta.sub && <div className="truncate text-[11px] text-slate-400">{selMeta.sub}</div>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => { osSound.click(); selected && focusNode(selected); }} title="Center on node" className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-cyan-200"><Crosshair size={13} /></button>
                    <button onClick={() => { osSound.click(); setSelected(null); }} title="Close" className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white"><X size={13} /></button>
                  </div>
                </div>
                {selMeta.desc && <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">{selMeta.desc}</p>}
              </div>
            )}

            <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-white/10 bg-[#060c18]/85 p-1 backdrop-blur-md">
              <button onClick={() => { osSound.click(); setGridOn((v) => !v); }} title="Toggle grid" className={`rounded-lg p-1.5 transition active:scale-90 ${gridOn ? "bg-cyan-300/15 text-cyan-200" : "text-slate-500 hover:text-slate-200"}`}><Layers size={13} /></button>
              <button onClick={() => { osSound.click(); setMapOn((v) => !v); }} title="Toggle minimap" className={`hidden rounded-lg p-1.5 transition active:scale-90 sm:block ${mapOn ? "bg-cyan-300/15 text-cyan-200" : "text-slate-500 hover:text-slate-200"}`}><MapIcon size={13} /></button>
              <button onClick={fitView} title="Fit to view (0)" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90"><Maximize size={13} /></button>
              <button onClick={recenter} title="Recenter" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90"><Crosshair size={13} /></button>
            </div>

            {/* left / right edge panel handles — fixed to the viewport */}
            <button onClick={() => { osSound.click(); setLeftOpen((v) => { if (!v) onPanelOpen?.(); return !v; }); }} title={effLeft ? "Hide left panel" : "Show left panel"} className="absolute left-0 top-1/2 z-10 hidden h-14 w-4 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-white/10 bg-[#0a1220]/90 text-[11px] text-slate-400 backdrop-blur-md transition hover:text-cyan-200 lg:flex">
              <span className={`transition-transform duration-300 ${effLeft ? "" : "rotate-180"}`}>‹</span>
            </button>
            <button onClick={() => { osSound.click(); setRightOpen((v) => { if (!v) onPanelOpen?.(); return !v; }); }} title={effRight ? "Hide right panel" : "Show right panel"} className="absolute right-0 top-1/2 z-10 hidden h-14 w-4 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-white/10 bg-[#0a1220]/90 text-[11px] text-slate-400 backdrop-blur-md transition hover:text-cyan-200 lg:flex">
              <span className={`transition-transform duration-300 ${effRight ? "" : "rotate-180"}`}>›</span>
            </button>

            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-xl border border-white/10 bg-[#060c18]/88 p-1 backdrop-blur-md">
              <button onClick={() => zoomAt(vw / 2, vh / 2, 1 / 1.18)} title="Zoom out (−)" className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white active:scale-90"><ZoomOut size={14} /></button>
              <span className="tnum min-w-[46px] text-center font-mono text-[11px] font-semibold text-cyan-200">{Math.round((cam.k / Math.max(0.001, baseFit.current)) * 100)}%</span>
              <button onClick={() => zoomAt(vw / 2, vh / 2, 1.18)} title="Zoom in (+)" className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white active:scale-90"><ZoomIn size={14} /></button>
              <span className="mx-0.5 hidden h-4 w-px bg-white/10 sm:block" />
              <span className="tnum hidden px-1.5 font-mono text-[10.5px] text-slate-500 sm:block"><span ref={cursorRef}>–, –</span></span>
            </div>

            {mapOn && (
              <div className="absolute bottom-3 right-3 z-10 hidden sm:block">
                <Minimap vw={vw} vh={vh} k={cam.k} pan={{ x: cam.x, y: cam.y }} onJump={jumpTo} />
              </div>
            )}

            {showHint && !focus && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-[#060c18]/85 px-3.5 py-1.5 text-[10.5px] tracking-wide text-slate-400 backdrop-blur-md lg:flex" style={{ animation: `os-in 400ms ${EASE}` }}>
                <Hand size={11} className="text-cyan-300" /> Drag empty space to pan
                <span className="text-slate-600">·</span> Scroll to zoom
                <span className="text-slate-600">·</span> <MousePointer2 size={11} className="text-cyan-300" /> Click any node
              </div>
            )}
          </div>

          {/* ============ bottom dock (fixed — never zooms) ============ */}
          <div className={`grid shrink-0 transition-all duration-500 ${effBottom ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
              <div className="flex items-stretch gap-2 overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#060c18]/85 px-2.5 py-2 backdrop-blur-md [scrollbar-width:thin]">
                <div className="flex min-w-0 shrink-0 items-center gap-0.5">
                  <span className="hidden px-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-600 [writing-mode:vertical-rl] xl:block" style={{ transform: "rotate(180deg)" }}>Channels</span>
                  <MiniTile icon={<Send size={17} />} label="Inbox" tint="#38bdf8" />
                  <MiniTile icon={<Mail size={17} />} label="Mail" tint="#f87171" />
                  <MiniTile icon={<FileSpreadsheet size={17} />} label="Files" tint="#34d399" />
                  <MiniTile icon={<Globe size={17} />} label="Notes" tint="#60a5fa" />
                  <MiniTile icon={<MessageCircle size={17} />} label="Voice" tint="#4ade80" />
                </div>
                <div className="w-px shrink-0 self-stretch bg-white/10" />
                <div className="flex min-w-0 shrink-0 items-center gap-0.5">
                  <span className="hidden px-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-600 [writing-mode:vertical-rl] xl:block" style={{ transform: "rotate(180deg)" }}>Ends</span>
                  <MiniTile icon={<Users size={17} />} label="Clear attention" />
                  <MiniTile icon={<Zap size={17} />} label="A decision" />
                  <MiniTile icon={<BarChart3 size={17} />} label="A record" />
                  <MiniTile icon={<CalendarCheck size={17} />} label="Follow-through" />
                </div>
                <div className="ml-auto hidden shrink-0 items-center gap-3 pr-1 md:flex">
                  <span className="text-[9px] tracking-[0.24em] text-slate-600">SAM JUNIOR · THE HOUSE</span>
                  <button onClick={() => { osSound.click(); setBottomOpen(false); }} title="Hide dock" className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white"><ChevronDown size={13} /></button>
                </div>
              </div>
            </div>
          </div>
          {!effBottom && (
            <button onClick={() => { osSound.click(); setBottomOpen(true); onPanelOpen?.(); }} className="mx-auto flex shrink-0 -translate-y-0.5 items-center gap-2 rounded-full border border-white/10 bg-[#0a1220]/90 px-3.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 backdrop-blur-md transition hover:text-cyan-200 active:scale-95" style={{ animation: `os-in 240ms ${EASE}` }}>
              Platforms & Outcomes <ChevronDown size={11} className="rotate-180" />
            </button>
          )}
        </main>

        {/* ---------------- right rail (fixed — never zooms) ---------------- */}
        <aside
          className={`z-20 flex w-[264px] shrink-0 flex-col gap-2.5 overflow-y-auto overflow-x-hidden rounded-2xl border border-white/[0.08] bg-[#060c18]/80 p-3 backdrop-blur-md transition-all duration-500 [scrollbar-width:thin] max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:w-[280px] max-lg:border-white/12 max-lg:bg-[#060c18]/96 max-lg:shadow-[-24px_0_60px_rgba(0,0,0,0.65)] ${effRight ? "max-lg:translate-x-0" : "max-lg:translate-x-[112%]"}`}
          style={effRight ? undefined : { marginRight: -276, opacity: 0, pointerEvents: "none" }}
        >
          <div className="w-[240px] max-lg:w-[256px]">
            <SideCard title="How the house works" icon={<Brain size={13} />}>
              <ListItem icon={<MessageCircle size={15} />} label="Hear it once" />
              <ListItem icon={<Boxes size={15} />} label="Keep a record" />
              <ListItem icon={<Search size={15} />} label="Find what matters" />
              <ListItem icon={<Radio size={15} />} label="Speak in one voice" />
              <ListItem icon={<GraduationCap size={15} />} label="Remember the house" />
            </SideCard>
          </div>
          <div className="w-[240px] max-lg:w-[256px]">
            <SideCard title="Work" icon={<Check size={13} />}>
              <TodoList />
            </SideCard>
          </div>
          <div className="mt-auto w-[240px] pt-1 text-right text-[9px] tracking-[0.22em] text-slate-700 max-lg:w-[256px]">SAMJUNIORSOS</div>
        </aside>

        {/* mobile scrim */}
        {(effLeft || effRight) && (
          <button aria-label="Close panels" className="absolute inset-0 z-10 bg-black/45 backdrop-blur-[1px] lg:hidden" onClick={() => { setLeftOpen(false); setRightOpen(false); }} />
        )}
      </div>
    </div>
  );
}
