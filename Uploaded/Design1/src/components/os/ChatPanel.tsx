import { useEffect, useRef, useState } from "react";
import { MessageSquare, X, Send, Bot, Sparkles } from "lucide-react";
import { useOS, type Agent } from "../../lib/osStore";
import { osSound } from "../../lib/osAudio";

type Message = {
  id: string;
  sender: "user" | "agent";
  agentId: string;
  text: string;
  at: number;
  read: boolean;
};

const INITIAL_MESSAGES: Message[] = [];

const PROMPTS: Record<string, string[]> = {
  sophia: ["What needs my attention?", "Summarize this UI session", "What is the execution path?"],
  ops: ["Are any tasks blocked?", "What is my current assignment?", "What requires Founder approval?"],
};

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [activeContactId, setActiveContactId] = useState<string>("sophia");
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const agents = useOS((s) => s.agents);
  const attention = useOS((s) => s.attention);
  const decisions = useOS((s) => s.decisions);
  const work = useOS((s) => s.work);
  const company = useOS((s) => s.company);

  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeAgent = agents.find((a) => a.id === activeContactId) ?? agents[0];
  const unreadCount = messages.filter((m) => !m.read && m.sender === "agent").length;

  // Mark messages from active contact as read when open
  useEffect(() => {
    if (!open) return;
    setMessages((prev) =>
      prev.map((m) => (m.agentId === activeContactId && !m.read ? { ...m, read: true } : m))
    );
  }, [open, activeContactId]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, isTyping]);

  // Hotkey toggle: "C" to toggle, "Escape" to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        setOpen((v) => {
          if (!v) osSound.open();
          else osSound.close();
          return !v;
        });
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        osSound.close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggleOpen = () => {
    if (!open) osSound.open();
    else osSound.close();
    setOpen((v) => !v);
  };

  const selectContact = (id: string) => {
    osSound.click();
    setActiveContactId(id);
    setMessages((prev) =>
      prev.map((m) => (m.agentId === id && !m.read ? { ...m, read: true } : m))
    );
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const getAgentReply = (text: string, agent: Agent): string => {
    const lower = text.toLowerCase();
    if (agent.id === "sophia") {
      if (lower.includes("attention") || lower.includes("need")) {
        return attention.length
          ? `You have ${attention.length} item${attention.length > 1 ? "s" : ""} needing you right now (${decisions.length} open decision${decisions.length > 1 ? "s" : ""}). Check your Briefing pill.`
          : "All quiet across the board. No items currently require founder intervention.";
      }
      if (lower.includes("decision")) {
        return decisions.length
          ? `There are ${decisions.length} decision${decisions.length > 1 ? "s" : ""} waiting for your direction. I have drafted context for each.`
          : "Zero open decisions waiting. The workforce is operating within its defined guardrails.";
      }
      if (lower.includes("focus")) {
        return company.focus
          ? `Current focus is set to: "${company.focus}". All inputs are triaged against this standard.`
          : "Focus is not currently set. You can set it in the Company Card or Settings.";
      }
      return `Captured in this UI session: "${text}". This surface is not connected to the workflow runtime, so no work was dispatched.`;
    }

    if (agent.id === "ops") {
      if (lower.includes("block")) {
        const blocked = work.filter((w) => w.state === "blocked");
        return blocked.length
          ? `${blocked.length} workstream is currently marked as blocked. Immediate unblocking review recommended.`
          : "No blocked workstreams. All active execution pipelines are progressing through discovery and review stages.";
      }
      return "This UI session has no live Thorne execution state. The implemented path is Sophia → Thorne → typed artifact → deterministic verification → Founder approval when consequential.";
    }

    return "Received and noted. Operating strictly within constitutional constraints.";
  };

  const handleSend = (textToSend?: string) => {
    const raw = textToSend ?? input;
    const txt = raw.trim();
    if (!txt) return;

    osSound.click();
    const userMsg: Message = {
      id: `m-user-${Date.now()}`,
      sender: "user",
      agentId: activeContactId,
      text: txt,
      at: Date.now(),
      read: true,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      osSound.notify();
      const replyText = getAgentReply(txt, activeAgent);
      const agentMsg: Message = {
        id: `m-agent-${Date.now()}`,
        sender: "agent",
        agentId: activeContactId,
        text: replyText,
        at: Date.now(),
        read: open,
      };
      setMessages((prev) => [...prev, agentMsg]);
    }, 550);
  };

  const activeThread = messages.filter((m) => m.agentId === activeContactId);

  return (
    <>
      {/* ---------------- Floating Chat Trigger Icon ---------------- */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          onClick={toggleOpen}
          title={open ? "Close chat (C)" : "Open agent messages & chat (C)"}
          className={`group relative flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-2xl transition-all duration-300 hover:scale-105 active:scale-95 ${
            open
              ? "border-cyan-300 bg-cyan-950/90 text-white shadow-[0_0_24px_rgba(56,189,248,0.5)]"
              : "border-cyan-400/30 bg-[#07101e]/90 text-cyan-200 shadow-[0_8px_25px_rgba(0,0,0,0.7),0_0_18px_rgba(56,189,248,0.3)] hover:border-cyan-300 hover:bg-[#0c1a2e]"
          }`}
          aria-label="Toggle agent chat"
        >
          {open ? (
            <X size={19} strokeWidth={2.2} className="transition-transform group-hover:rotate-90" />
          ) : (
            <MessageSquare size={19} strokeWidth={2.2} className="transition-transform group-hover:scale-110" />
          )}

          {/* Live unread message notification pill */}
          {!open && unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-1 text-[9px] font-bold text-white shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* ---------------- Small Handy Chat Panel ---------------- */}
      {open && (
        <div
          className="fixed bottom-20 right-5 z-50 flex h-[510px] max-h-[calc(100vh-6.5rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-cyan-400/25 bg-[#060c18]/96 shadow-[0_25px_70px_rgba(0,0,0,0.9),0_0_35px_-5px_rgba(56,189,248,0.25)] backdrop-blur-2xl"
          style={{ animation: "os-in 220ms cubic-bezier(.16,1,.3,1)" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Header with Active Contact Identity */}
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span
                className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-white/12"
                style={{
                  background: `linear-gradient(135deg, ${activeAgent.glow.replace("0.4", "0.15")}, rgba(255,255,255,0.03))`,
                  boxShadow: `0 0 14px -2px ${activeAgent.glow}`,
                }}
              >
                {activeAgent.id === "sophia" ? (
                  <Sparkles size={16} className={activeAgent.tint} />
                ) : (
                  <Bot size={16} className={activeAgent.tint} />
                )}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#060c18] ${
                    activeAgent.state === "working"
                      ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                      : activeAgent.state === "waiting"
                      ? "bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.9)]"
                      : "bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.8)]"
                  }`}
                />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-bold text-white">{activeAgent.name}</span>
                  <span className="rounded bg-cyan-400/10 px-1 py-0.2 font-mono text-[8.5px] uppercase tracking-wider text-cyan-200">
                    {activeAgent.role}
                  </span>
                </div>
                <div className="truncate text-[10px] text-slate-400">
                  {activeAgent.current ?? activeAgent.state}
                </div>
              </div>
            </div>

            <button
              onClick={() => { osSound.close(); setOpen(false); }}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90"
              title="Close chat"
            >
              <X size={14} />
            </button>
          </div>

          {/* Contact / Sender Selector Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/5 bg-[#040813]/60 px-3 py-2 [scrollbar-width:none]">
            <span className="mr-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Contact:</span>
            {agents.map((ag) => {
              const unreadInContact = messages.some((m) => m.agentId === ag.id && !m.read && m.sender === "agent");
              const isSelected = ag.id === activeContactId;
              return (
                <button
                  key={ag.id}
                  onClick={() => selectContact(ag.id)}
                  title={`${ag.name} (${ag.role})`}
                  className={`group relative flex items-center gap-1 rounded-xl px-2 py-1 text-[10.5px] font-medium transition active:scale-95 ${
                    isSelected
                      ? "border border-cyan-400/40 bg-cyan-400/20 text-cyan-100 shadow-[0_0_12px_rgba(56,189,248,0.3)]"
                      : "border border-white/5 bg-white/[0.03] text-slate-400 hover:border-white/15 hover:bg-white/10 hover:text-slate-200"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-cyan-300" : "bg-slate-500"}`} />
                  <span>{ag.name}</span>
                  {unreadInContact && (
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_4px_rgba(244,63,94,0.9)]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Conversation Thread */}
          <div className="os-scroll flex-1 space-y-3 overflow-y-auto p-3.5">
            {activeThread.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-[11.5px] text-slate-500">
                <MessageSquare size={20} className="mb-2 text-slate-600" />
                <span>No messages yet with {activeAgent.name}.</span>
                <span className="mt-1 text-[10px] text-slate-600">Type a message below to start a thread.</span>
              </div>
            ) : (
              activeThread.map((m) => {
                const isUser = m.sender === "user";
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                  >
                    <div className="mb-0.5 flex items-center gap-1.5 text-[9.5px] text-slate-500">
                      {isUser ? (
                        <>
                          <span className="font-semibold text-cyan-200/80">You</span>
                          <span>·</span>
                          <span className="font-mono">{fmtTime(m.at)}</span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-white">{activeAgent.name}</span>
                          <span>·</span>
                          <span className="font-mono">{fmtTime(m.at)}</span>
                        </>
                      )}
                    </div>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
                        isUser
                          ? "rounded-tr-xs border border-cyan-400/30 bg-gradient-to-br from-cyan-500/25 to-sky-600/20 text-cyan-50 shadow-[0_2px_12px_rgba(56,189,248,0.2)]"
                          : "rounded-tl-xs border border-white/10 bg-white/[0.04] text-slate-200 shadow-sm"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })
            )}

            {isTyping && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5">
                  <Bot size={11} className={activeAgent.tint} />
                </span>
                <span className="italic">{activeAgent.name} is thinking...</span>
                <span className="flex gap-0.5">
                  <span className="h-1 w-1 animate-bounce rounded-full bg-cyan-300" style={{ animationDelay: "0ms" }} />
                  <span className="h-1 w-1 animate-bounce rounded-full bg-cyan-300" style={{ animationDelay: "150ms" }} />
                  <span className="h-1 w-1 animate-bounce rounded-full bg-cyan-300" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Quick Prompts */}
          {PROMPTS[activeContactId] && (
            <div className="flex items-center gap-1.5 overflow-x-auto border-t border-white/5 bg-white/[0.015] px-3 py-1.5 [scrollbar-width:none]">
              {PROMPTS[activeContactId].map((p) => (
                <button
                  key={p}
                  onClick={() => handleSend(p)}
                  className="whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-slate-400 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-200 active:scale-95"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input Bar */}
          <div className="border-t border-white/10 bg-[#050b16]/90 p-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] p-1 pl-3 transition focus-within:border-cyan-400/50 focus-within:bg-[#081224]"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Message ${activeAgent.name}...`}
                className="min-w-0 flex-1 bg-transparent py-1 text-[12px] text-white outline-none placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-sky-500 text-slate-950 shadow-[0_0_10px_rgba(56,189,248,0.4)] transition hover:brightness-110 active:scale-90 disabled:opacity-30 disabled:shadow-none"
              >
                <Send size={12} strokeWidth={2.5} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
