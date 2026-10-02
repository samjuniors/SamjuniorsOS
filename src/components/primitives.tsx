"use client";

import { ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="cvl-label">{children}</div>;
}

export function Section({
  index,
  kicker,
  title,
  blurb,
  children,
  right,
}: {
  index: string;
  kicker: string;
  title: string;
  blurb?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="cvl-panel cvl-rise relative overflow-hidden p-6 sm:p-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>
            {index} — {kicker}
          </Eyebrow>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--cvl-text)] sm:text-2xl">
            {title}
          </h2>
          {blurb ? (
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--cvl-muted)]">
              {blurb}
            </p>
          ) : null}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

export function SubLabel({ id, text }: { id: string; text: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="cvl-label">{id}</span>
      <span className="cvl-label !text-[var(--cvl-muted)]">{text}</span>
      <span className="h-px flex-1 bg-[var(--cvl-line-soft)]" />
    </div>
  );
}

export function Chip({
  children,
  accent = "#38bdf8",
  active = false,
  onClick,
}: {
  children: ReactNode;
  accent?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cvl-mono rounded-md border px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] transition-all duration-300"
      style={{
        borderColor: active ? accent : "var(--cvl-line)",
        color: active ? accent : "var(--cvl-muted)",
        background: active ? `${accent}14` : "transparent",
        boxShadow: active ? `0 0 18px ${accent}26` : "none",
      }}
    >
      {children}
    </button>
  );
}
