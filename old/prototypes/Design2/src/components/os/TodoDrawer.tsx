import { useState, type ReactNode } from "react";
import {
  Check, Plus, Trash2, X, ChevronRight, ChevronLeft,
  ListTodo, Sparkles, Zap, Bot, Flame, Calendar, CheckCircle2,
} from "lucide-react";
import { osSound } from "../../lib/osAudio";
import { DEFAULT_WORK, type WorkTag } from "../../lib/osContent";

export type TodoItem = {
  id: number;
  text: string;
  done: boolean;
  tag: WorkTag;
  due?: string;
};

const DEFAULT_TODOS: TodoItem[] = DEFAULT_WORK;

const TAG_STYLES: Record<TodoItem["tag"], { bg: string; text: string; border: string; icon: ReactNode }> = {
  you: { bg: "bg-rose-500/15", text: "text-rose-300", border: "border-rose-500/30", icon: <Flame size={10} /> },
  desk: { bg: "bg-cyan-500/15", text: "text-cyan-300", border: "border-cyan-500/30", icon: <Zap size={10} /> },
  soon: { bg: "bg-purple-500/15", text: "text-purple-300", border: "border-purple-500/30", icon: <Sparkles size={10} /> },
  held: { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30", icon: <Bot size={10} /> },
};

export default function TodoDrawer({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const [todos, setTodos] = useState<TodoItem[]>(DEFAULT_TODOS);
  const [draft, setDraft] = useState("");
  const [tag, setTag] = useState<TodoItem["tag"]>("you");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  const doneCount = todos.filter((t) => t.done).length;
  const pendingCount = todos.length - doneCount;
  const percent = todos.length ? Math.round((doneCount / todos.length) * 100) : 0;

  const filteredTodos = todos.filter((t) => {
    if (filter === "active") return !t.done;
    if (filter === "completed") return t.done;
    return true;
  });

  const toggleTodo = (id: number) => {
    osSound.click();
    setTodos((ts) =>
      ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const removeTodo = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    osSound.close();
    setTodos((ts) => ts.filter((t) => t.id !== id));
  };

  const addTodo = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    osSound.open();
    setTodos((ts) => [
      { id: Date.now(), text, done: false, tag, due: "Today" },
      ...ts,
    ]);
    setDraft("");
  };

  return (
    <>
      {/* ----------------- REFINED COMPACT PILLOW HANDLE ----------------- */}
      <button
        onClick={() => {
          osSound.click();
          onToggle(!open);
        }}
        title={open ? "Close To-do Panel (T)" : "Open To-do Panel (T)"}
        className={`fixed right-0 top-1/2 z-40 -translate-y-1/2 flex items-center gap-1.5 rounded-l-full border-l border-t border-b border-cyan-400/40 bg-[#07101d]/90 py-2 pl-2 pr-1.5 shadow-[-8px_0_24px_rgba(0,180,255,0.3)] backdrop-blur-xl transition-all duration-300 hover:border-cyan-300 hover:bg-[#0c1a2e] hover:shadow-[-12px_0_32px_rgba(56,189,248,0.5)] active:scale-95 ${
          open
            ? "translate-x-0 border-cyan-400 bg-cyan-950/80 shadow-[-10px_0_30px_rgba(56,189,248,0.6)]"
            : "hover:-translate-x-1"
        }`}
        style={{
          boxShadow: open
            ? "-6px 0 24px rgba(56, 189, 248, 0.45), inset 0 1px 0 rgba(255,255,255,0.2)"
            : "-6px 0 18px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255,255,255,0.12)",
        }}
        aria-label="Toggle To-do list"
      >
        {/* Animated Arrow Chevron */}
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-full bg-cyan-400/20 text-cyan-200 transition-transform duration-300 ${
            open ? "rotate-0 text-cyan-100" : "-rotate-180"
          }`}
        >
          {open ? <ChevronRight size={12} strokeWidth={2.5} /> : <ChevronLeft size={12} strokeWidth={2.5} />}
        </span>

        {/* Small Icon & Badge */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="relative text-cyan-300">
            <ListTodo size={14} />
            {pendingCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-0.5 text-[7.5px] font-bold text-white shadow-[0_0_6px_rgba(249,115,22,0.8)]">
                {pendingCount}
              </span>
            )}
          </span>

          <span
            className="text-[8.5px] font-extrabold uppercase tracking-[0.2em] text-cyan-100/90 [writing-mode:vertical-rl] select-none"
            style={{ transform: "rotate(180deg)" }}
          >
            TODO
          </span>
        </div>
      </button>

      {/* ----------------- COMPACT, NON-INTRUSIVE SLIDE-OUT DRAWER ----------------- */}
      <div
        className={`fixed right-0 top-12 bottom-16 sm:bottom-18 z-40 w-[275px] sm:w-[295px] max-w-[85vw] overflow-hidden rounded-l-2xl border-l border-t border-b border-white/12 bg-[#060c18]/96 shadow-[-16px_0_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl transition-transform duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col ${
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
        style={{
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.08), -20px 0 50px -10px rgba(0,0,0,0.85)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-200/30 bg-cyan-400/10 text-cyan-200 shadow-[0_0_12px_rgba(56,189,248,0.3)]">
              <ListTodo size={14} />
            </span>
            <div>
              <h3 className="text-[12.5px] font-bold tracking-wide text-white leading-tight">
                Work
              </h3>
              <p className="text-[9.5px] tracking-wider text-slate-400">
                WAITING · IN MOTION
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              osSound.close();
              onToggle(false);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition active:scale-90"
            title="Close Panel"
          >
            <X size={14} />
          </button>
        </div>

        {/* Progress Bar & Summary */}
        <div className="border-b border-white/10 px-3.5 py-2 bg-white/[0.01]">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 text-slate-300">
              <CheckCircle2 size={12} className="text-emerald-400" />
              <span className="font-semibold text-white">{doneCount}</span>/{todos.length} done
            </span>
            <span className="font-mono text-cyan-300 font-semibold text-[10.5px]">
              {percent}%
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 border-b border-white/8 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider">
          {(["all", "active", "completed"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                osSound.hover();
                setFilter(t);
              }}
              className={`rounded-md px-2 py-0.5 transition ${
                filter === t
                  ? "bg-cyan-400/20 text-cyan-100 border border-cyan-400/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1.5 os-scroll">
          {filteredTodos.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-slate-500">
              No tasks found.
            </div>
          ) : (
            filteredTodos.map((t) => {
              const tagStyle = TAG_STYLES[t.tag];
              return (
                <div
                  key={t.id}
                  onClick={() => toggleTodo(t.id)}
                  className={`group relative flex items-start gap-2 rounded-lg border p-2 transition-all duration-150 cursor-pointer ${
                    t.done
                      ? "border-white/5 bg-white/[0.02] opacity-60"
                      : "border-white/10 bg-white/[0.03] hover:border-cyan-300/30 hover:bg-white/[0.06]"
                  }`}
                >
                  {/* Custom Checkbox */}
                  <span
                    className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-all duration-150 ${
                      t.done
                        ? "border-emerald-400 bg-emerald-400 text-slate-950 font-bold"
                        : "border-white/30 bg-white/[0.03] group-hover:border-cyan-300"
                    }`}
                  >
                    {t.done && <Check size={10} strokeWidth={3.5} />}
                  </span>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[11.5px] leading-snug break-words ${
                        t.done
                          ? "text-slate-500 line-through decoration-slate-600"
                          : "text-slate-200"
                      }`}
                    >
                      {t.text}
                    </p>

                    {/* Metadata Badges */}
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[8.5px] font-semibold uppercase tracking-wider ${tagStyle.bg} ${tagStyle.text} ${tagStyle.border}`}
                      >
                        {tagStyle.icon}
                        {t.tag}
                      </span>
                      {t.due && (
                        <span className="flex items-center gap-0.5 text-[9.5px] text-slate-500">
                          <Calendar size={9} />
                          {t.due}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={(e) => removeTodo(t.id, e)}
                    className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-300 transition"
                    title="Delete task"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Add Task Input Form */}
        <form
          onSubmit={addTodo}
          className="border-t border-white/10 bg-black/40 p-2.5"
        >
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add work…"
              className="flex-1 rounded-lg border border-white/12 bg-white/5 px-2.5 py-1.5 text-[11.5px] text-white placeholder:text-slate-500 outline-none focus:border-cyan-400 focus:bg-white/[0.08] transition"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950 font-bold transition hover:brightness-110 active:scale-95 disabled:opacity-40"
            >
              <Plus size={14} strokeWidth={2.6} />
            </button>
          </div>

          {/* Quick Tag Selector */}
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-slate-500">
              Tag:
            </span>
            <div className="flex items-center gap-1">
              {(["you", "desk", "soon", "held"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTag(t)}
                  className={`rounded px-1.5 py-0.2 text-[8.5px] uppercase font-medium transition ${
                    tag === t
                      ? "bg-cyan-300/20 text-cyan-200 border border-cyan-300/40"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
