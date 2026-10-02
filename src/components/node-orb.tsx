"use client";

import { ReactNode } from "react";
import { StateKey, stateAccent } from "@/lib/tokens";

export function NodeOrb({
  state = "idle",
  size = 96,
  glyph,
  label,
  caption,
  hanger = false,
  animated = true,
}: {
  state?: StateKey;
  size?: number;
  glyph: ReactNode;
  label?: string;
  caption?: string;
  hanger?: boolean;
  animated?: boolean;
}) {
  const accent = stateAccent[state];
  const lit = state !== "idle";
  return (
    <div className="group flex w-[132px] flex-col items-center">
      {hanger ? (
        <div className="flex flex-col items-center">
          <div
            className="h-10 w-px"
            style={{
              backgroundImage: `repeating-linear-gradient(to bottom, ${accent}88 0 6px, transparent 6px 12px)`,
            }}
          />
          <div
            className="h-3 w-3 rounded-full border"
            style={{ borderColor: `${accent}aa`, background: "var(--cvl-panel)" }}
          />
        </div>
      ) : null}
      <div
        className="relative grid place-items-center transition-transform duration-500 group-hover:scale-[1.06]"
        style={{ width: size, height: size }}
      >
        {lit && animated ? (
          <span
            className="absolute inset-0 rounded-full"
            style={{
              border: `1px solid ${accent}66`,
              animation: "cvl-pulse-ring 2.6s ease-out infinite",
            }}
          />
        ) : null}

        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 50% 35%, ${lit ? accent + "26" : "rgba(255,255,255,0.04)"}, rgba(8,12,20,0.9) 70%)`,
            border: `1px solid ${lit ? accent + "99" : "var(--cvl-line)"}`,
            boxShadow: lit ? `0 0 28px ${accent}33, inset 0 0 22px ${accent}1f` : "none",
          }}
        />

        {state === "running" && animated ? (
          <svg
            className="cvl-spin-slow absolute inset-0"
            viewBox="0 0 100 100"
            style={{ width: size, height: size }}
          >
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke={accent}
              strokeWidth="1.5"
              strokeDasharray="30 250"
              strokeLinecap="round"
            />
          </svg>
        ) : null}

        {state === "approval" && animated ? (
          <span
            className="cvl-breathe absolute rounded-full"
            style={{
              inset: 8,
              border: `1px dashed ${accent}88`,
            }}
          />
        ) : null}

        <span
          className="relative grid place-items-center text-[var(--cvl-text)]"
          style={{ width: size * 0.44, height: size * 0.44 }}
        >
          {glyph}
        </span>
      </div>

      {label ? (
        <div className="mt-3 text-center">
          <div className="text-[12px] font-semibold leading-tight tracking-tight">{label}</div>
          {caption ? (
            <div className="cvl-mono mt-1 text-[9px] uppercase tracking-[0.16em] text-[var(--cvl-dim)]">
              {caption}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProgressRing({
  value,
  size = 84,
  accent = "#38bdf8",
  label,
}: {
  value: number;
  size?: number;
  accent?: string;
  label?: string;
}) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="-rotate-90" style={{ width: size, height: size }}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="#182233" strokeWidth="4" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={accent}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * value) / 100}
            style={{
              transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)",
              filter: `drop-shadow(0 0 6px ${accent}66)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="cvl-mono text-[13px]" style={{ color: accent }}>
            {value}%
          </span>
        </div>
      </div>
      {label ? <span className="cvl-label">{label}</span> : null}
    </div>
  );
}
