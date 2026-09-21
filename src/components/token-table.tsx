"use client";

import { useMemo, useState } from "react";
import { Chip } from "./primitives";

export type TokenRow = {
  id: number;
  category: string;
  name: string;
  value: string;
  note: string;
};

export function TokenTable({ rows, source }: { rows: TokenRow[]; source: string }) {
  const cats = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.category)))],
    [rows],
  );
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");

  const filtered = rows.filter(
    (r) =>
      (cat === "all" || r.category === cat) &&
      (q === "" || `${r.name}${r.value}${r.note}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="cvl-panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--cvl-line-soft)] p-3">
          {cats.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="filter tokens…"
            className="cvl-mono ml-auto w-36 rounded-md border border-[var(--cvl-line)] bg-[#070b12] px-2 py-1.5 text-[11px] text-[var(--cvl-text)] outline-none transition focus:border-sky-400/60"
          />
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-left">
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--cvl-line-soft)] transition-colors hover:bg-sky-400/5"
                >
                  <td className="w-10 py-2.5 pl-3">
                    <span
                      className="block h-4 w-4 rounded border border-white/10"
                      style={{
                        background: r.value.startsWith("#")
                          ? r.value
                          : "linear-gradient(135deg,#1b2637,#0b111b)",
                      }}
                    />
                  </td>
                  <td className="cvl-mono py-2.5 text-[11px] text-[var(--cvl-text)]">
                    {r.category}.{r.name}
                  </td>
                  <td className="cvl-mono py-2.5 text-[11px] text-[var(--cvl-muted)]">{r.value}</td>
                  <td className="cvl-mono py-2.5 pr-3 text-right text-[10px] uppercase tracking-[0.14em] text-[var(--cvl-dim)]">
                    {r.note}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-[12px] text-[var(--cvl-dim)]">
                    no tokens match this predicate
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="cvl-label border-t border-[var(--cvl-line-soft)] p-3">
          {filtered.length} tokens · source: {source}
        </div>
      </div>

      <div className="cvl-panel overflow-hidden">
        <div className="cvl-label border-b border-[var(--cvl-line-soft)] p-3">
          copyable snippet — css custom properties
        </div>
        <pre className="cvl-mono max-h-[420px] overflow-auto p-4 text-[11px] leading-relaxed text-[#9fd2f0]">
{`:root {
${filtered.map((r) => `  --cvl-${r.category}-${r.name}: ${r.value};`).join("\n")}
}`}
        </pre>
      </div>
    </div>
  );
}
