import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Send, FileSpreadsheet, Mail, Globe, Zap, Brain, Home, Calendar, Database,
  Sparkles, Bot, MessageCircle, Search, Boxes, ScanSearch, Radio, GraduationCap,
  Users, BarChart3, CalendarCheck, TrendingUp, Building2,
} from "lucide-react";
import { DESIGN_H, DESIGN_W, FlowEngine, NODES, type FlowNode } from "../lib/flow";

/* ------------------------------------------------------------- node meta */

type Meta = { title: string; sub: string; icon: ReactNode; tint?: string };

const META: Record<string, Meta> = {
  website: { title: "Website / Portal", sub: "", icon: <Building2 size={34} strokeWidth={1.6} /> },
  telegram: { title: "Telegram", sub: "Chats, groups", icon: <Send size={30} strokeWidth={1.8} />, tint: "#38bdf8" },
  sheets: { title: "Stavt Mapi", sub: "Property data", icon: <FileSpreadsheet size={32} strokeWidth={1.7} />, tint: "#34d399" },
  reply: { title: "Reply to Lead", sub: "Auto replies", icon: <Send size={30} strokeWidth={1.8} />, tint: "#38bdf8" },
  email: { title: "Email", sub: "Inbox monitoring", icon: <Mail size={32} strokeWidth={1.7} /> },
  trigger: { title: "Trigger", sub: "New lead / event", icon: <Zap size={32} strokeWidth={1.8} />, tint: "#4ade80" },
  intent: { title: "Intent Detection", sub: "Understand needs", icon: <Brain size={32} strokeWidth={1.7} /> },
  core: { title: "Real Estate\nAI Agent", sub: "", icon: <Bot size={34} strokeWidth={1.7} /> },
  match: { title: "Property Match", sub: "Find best options", icon: <Home size={32} strokeWidth={1.7} /> },
  send: { title: "Send Response", sub: "Personalized reply", icon: <Send size={32} strokeWidth={1.7} /> },
  follow: { title: "Follow Up", sub: "Nurture & convert", icon: <Calendar size={32} strokeWidth={1.7} /> },
  gemini: { title: "Google Gemini\nChat Model", sub: "Natural conversations", icon: <GeminiG /> },
  memory: { title: "Conversation\nMemory", sub: "Context aware", icon: <Sparkles size={32} strokeWidth={1.7} /> },
  save: { title: "Save Lead\nto Sheet", sub: "Log & track", icon: <FileSpreadsheet size={32} strokeWidth={1.7} />, tint: "#34d399" },
  db: { title: "Save Lead to Sheet", sub: "Central database", icon: <Database size={32} strokeWidth={1.7} /> },
};

function GeminiG() {
  return (
    <svg width="34" height="34" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/* --------------------------------------------------------------- pieces */

function NodeCard({ n }: { n: FlowNode }) {
  const m = META[n.id];
  const titleLines = m.title.split("\n");
  if (n.kind === "core") {
    return (
      <div
        className="absolute flex items-center justify-center gap-4 rounded-2xl border border-orange-300/50 text-white"
        style={{
          left: n.x - n.w / 2, top: n.y - n.h / 2, width: n.w, height: n.h,
          background: "linear-gradient(160deg, rgba(60,40,30,0.92), rgba(25,18,14,0.96))",
          boxShadow: "inset 0 0 30px rgba(255,140,60,0.25), 0 0 40px rgba(255,120,40,0.35)",
        }}
      >
        <span className="text-orange-100 drop-shadow-[0_0_10px_rgba(255,170,80,0.9)]">{m.icon}</span>
        <div className="text-[21px] font-semibold leading-[1.05] tracking-tight drop-shadow-[0_0_14px_rgba(255,190,120,0.8)]">
          {titleLines.map((l) => <div key={l}>{l}</div>)}
        </div>
      </div>
    );
  }
  const round = n.kind === "round";
  return (
    <div className="absolute" style={{ left: n.x - 90, top: n.y - n.h / 2, width: 180 }}>
      <div
        className={`mx-auto flex items-center justify-center text-white ${round ? "rounded-full" : "rounded-2xl"}`}
        style={{
          width: n.w, height: n.h,
          color: m.tint ?? "#f3f7ff",
          background: round
            ? "radial-gradient(circle at 50% 40%, rgba(40,70,120,0.9), rgba(14,22,40,0.95))"
            : "linear-gradient(160deg, rgba(58,64,78,0.95), rgba(28,32,42,0.98))",
          border: round ? "1px solid rgba(120,190,255,0.55)" : "1px solid rgba(255,255,255,0.14)",
          boxShadow: round
            ? "0 0 26px rgba(80,160,255,0.45), inset 0 0 18px rgba(80,160,255,0.25)"
            : "0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {m.icon}
      </div>
      <div className="mt-2 text-center">
        <div className="text-[16px] font-semibold leading-[1.1] text-white">
          {titleLines.map((l) => <div key={l}>{l}</div>)}
        </div>
        {m.sub && <div className="mt-0.5 text-[12px] text-slate-400">{m.sub}</div>}
      </div>
    </div>
  );
}

function Panel({ x, y, w, h, title, children, className = "" }: {
  x: number; y: number; w: number; h?: number; title?: string; children: ReactNode; className?: string;
}) {
  return (
    <div
      className={`absolute rounded-2xl border border-white/10 bg-[#0a1120]/80 p-5 backdrop-blur-sm ${className}`}
      style={{ left: x, top: y, width: w, height: h, boxShadow: "0 0 0 1px rgba(255,255,255,0.02), 0 20px 50px rgba(0,0,0,0.45)" }}
    >
      {title && <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.18em] text-white">{title}</div>}
      {children}
    </div>
  );
}

function useCountUp(target: number, ms = 1600) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Stat({ label, value, delta }: { label: string; value: number; delta: string }) {
  const v = useCountUp(value);
  return (
    <div className="border-b border-white/8 py-3 last:border-0">
      <div className="text-[13px] text-slate-400">{label}</div>
      <div className="flex items-end justify-between">
        <div className="text-[28px] font-semibold leading-none text-white">{v.toLocaleString()}</div>
        <div className="flex items-center gap-1 text-[13px] font-medium text-emerald-400">
          <TrendingUp size={13} /> {delta}
        </div>
      </div>
    </div>
  );
}

function ListItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white">{icon}</span>
      <span className="text-[14px] leading-tight text-slate-200">{label}</span>
    </div>
  );
}

function Tile({ icon, label, tint }: { icon: ReactNode; label: string; tint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"
        style={{ color: tint ?? "#fff" }}
      >
        {icon}
      </span>
      <span className="text-center text-[12px] leading-tight text-slate-200">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------- component */

export default function FlowDesktop() {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scale, setScale] = useState(1);
  const engineRef = useRef<FlowEngine | null>(null);

  useEffect(() => {
    const outer = outerRef.current!;
    const canvas = canvasRef.current!;
    const engine = new FlowEngine(canvas);
    engineRef.current = engine;

    const fit = () => {
      const r = outer.getBoundingClientRect();
      const s = Math.min(r.width / DESIGN_W, r.height / DESIGN_H);
      setScale(s);
      engine.setScale(s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    engine.start();
    return () => { engine.stop(); ro.disconnect(); };
  }, []);

  return (
    <div ref={outerRef} className="relative h-full w-full overflow-hidden bg-[#050a14]">
      {/* background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, rgba(30,60,120,0.35), transparent 60%), radial-gradient(ellipse at 50% 110%, rgba(40,90,180,0.35), transparent 50%), #050a14",
        }}
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(120,170,255,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(120,170,255,0.09) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 85%)",
        }}
      />

      {/* fixed-design stage */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: DESIGN_W, height: DESIGN_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {/* header */}
        <div className="absolute left-8 top-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/20">
            <Home size={22} className="text-white" />
          </div>
          <div>
            <div className="text-[24px] font-bold tracking-[0.22em] text-white">PROPULSE</div>
            <div className="-mt-0.5 text-[10px] tracking-[0.28em] text-slate-400">AI FOR REAL ESTATE GROWTH</div>
          </div>
        </div>
        <div className="absolute right-8 top-8 flex items-center gap-2 text-[11px] tracking-[0.22em] text-slate-300">
          LIVE <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.8)]" />
          <span className="mx-1 text-slate-600">•</span> AGENT ONLINE
        </div>
        <div className="absolute left-0 right-0 top-[18px] mx-auto h-px w-[62%] bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

        {/* hero copy */}
        <div className="absolute left-8 top-[130px] w-[230px]">
          <h2 className="text-[34px] font-bold leading-[1.05] text-white">
            Automate.<br />Converse.<br />Convert.
          </h2>
          <p className="mt-5 text-[17px] leading-snug text-slate-400">
            Your always-on AI agent for leads, listings and closings.
          </p>
        </div>

        {/* stats */}
        <Panel x={30} y={345} w={210}>
          <Stat label="Leads Captured" value={1248} delta="+24%" />
          <Stat label="Conversations" value={892} delta="+18%" />
          <Stat label="Site Visits" value={458} delta="+32%" />
          <Stat label="Appointments" value={112} delta="+27%" />
          <Stat label="Conversions" value={28} delta="+21%" />
        </Panel>

        {/* sparkline */}
        <svg className="absolute left-8 top-[760px]" width="190" height="50" viewBox="0 0 190 50">
          <polyline
            fill="none" stroke="rgba(110,200,255,0.9)" strokeWidth="1.4"
            points="0,30 14,30 22,12 28,44 36,30 60,30 70,20 78,38 84,30 110,30 120,8 128,46 136,30 160,30 170,22 178,36 190,30"
            strokeDasharray="600" strokeDashoffset="600"
            style={{ animation: "dash 3s linear infinite" }}
          />
        </svg>
        <div className="absolute left-8 top-[845px] text-[11px] tracking-[0.26em] text-slate-400">AI WORKS. YOU GROW.</div>
        <div className="absolute right-8 top-[845px] text-[11px] tracking-[0.22em] text-slate-400">REAL ESTATE, REIMAGINED WITH AI</div>

        {/* section labels */}
        <div className="absolute left-[740px] top-[62px] text-[11px] font-bold tracking-[0.22em] text-white">LEAD SOURCES</div>
        <div className="absolute left-[285px] top-[370px] text-[11px] font-bold tracking-[0.22em] text-white">AI CORE</div>
        <div className="absolute left-[478px] top-[583px] flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-cyan-300">
          <span className="text-orange-400">➜</span> AI CAPABILITIES
        </div>
        <div className="absolute left-[478px] top-[196px] text-orange-400">➜</div>

        {/* intelligence layer */}
        <Panel x={1352} y={90} w={225} title="Intelligence Layer">
          <ListItem icon={<MessageCircle size={17} />} label="Natural Language Understanding" />
          <ListItem icon={<Boxes size={17} />} label="Property Knowledge Base" />
          <ListItem icon={<Search size={17} />} label="Smart Matching" />
          <ListItem icon={<Radio size={17} />} label="Multi-Channel Communication" />
          <ListItem icon={<GraduationCap size={17} />} label="Continuous Learning" />
        </Panel>

        {/* supported platforms */}
        <Panel x={262} y={680} w={330} title="Supported Platforms">
          <div className="grid grid-cols-5 gap-2">
            <Tile icon={<Send size={22} />} label="Telegram" tint="#38bdf8" />
            <Tile icon={<Mail size={22} />} label="Gmail" tint="#f87171" />
            <Tile icon={<FileSpreadsheet size={22} />} label="Google Sheets" tint="#34d399" />
            <Tile icon={<Globe size={22} />} label="Website" tint="#60a5fa" />
            <Tile icon={<MessageCircle size={22} />} label="WhatsApp" tint="#4ade80" />
          </div>
        </Panel>

        {/* outcomes */}
        <Panel x={1022} y={680} w={555} title="Outcomes">
          <div className="grid grid-cols-4 gap-3">
            <Tile icon={<Users size={22} />} label="More Qualified Leads" />
            <Tile icon={<Zap size={22} />} label="Faster Responses" />
            <Tile icon={<BarChart3 size={22} />} label="Higher Conversions" />
            <Tile icon={<CalendarCheck size={22} />} label="Effortless Follow Ups" />
          </div>
        </Panel>

        {/* nodes */}
        {NODES.map((n) => <NodeCard key={n.id} n={n} />)}

        {/* corner deco */}
        <ScanSearch className="absolute right-[300px] top-[560px] text-cyan-300/20" size={14} />
      </div>

      {/* animated layer on top */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute left-1/2 top-1/2"
        style={{
          width: DESIGN_W * scale, height: DESIGN_H * scale,
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}
