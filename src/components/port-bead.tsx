"use client";

/** A physical socket, not an effect ring. Runtime heat is applied by the shared stroke engine. */
export function PortBead({ x, y, active = false, accent = "#ff9a3c" }: { x: number; y: number; active?: boolean; accent?: string }) {
  return <g data-port-x={x} data-port-y={y} style={{ filter: active ? `drop-shadow(0 0 4px ${accent})` : undefined, transition: "filter 220ms ease" }}>
    <circle cx={x} cy={y} r="4.2" fill="#080d16" stroke={active ? accent : "#526179"} strokeWidth="1.3" style={{ transition: "stroke 220ms ease" }} />
    <circle cx={x} cy={y} r="1.4" fill={active ? accent : "#253449"} style={{ transition: "fill 220ms ease" }} />
  </g>;
}
