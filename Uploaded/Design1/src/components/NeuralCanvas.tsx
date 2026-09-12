import { useEffect, useRef } from "react";
import { NeuralField, type Settings } from "../lib/field";

export type Stats = { nodes: number; links: number; packets: number; fps: number };

type Props = {
  settings: Settings;
  onStats?: (s: Stats) => void;
  fieldRef?: (f: NeuralField | null) => void;
};

export default function NeuralCanvas({ settings, onStats, fieldRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldInst = useRef<NeuralField | null>(null);
  const statsRef = useRef(onStats);
  statsRef.current = onStats;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const field = new NeuralField(canvas, settings);
    fieldInst.current = field;
    field.onStats = (s) => statsRef.current?.(s);
    field.start();
    fieldRef?.(field);

    const ro = new ResizeObserver(() => field.resize());
    ro.observe(canvas);

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      // e.button: 0 left · 1 middle · 2 right. Shift + Left or Middle/Right triggers pan.
      field.pointerDown(p.x, p.y, e.button, e.shiftKey);
    };
    const move = (e: PointerEvent) => {
      const p = pos(e);
      field.pointerMove(p.x, p.y);
      canvas.style.cursor =
        field.panning ? "move" : field.dragIndex >= 0 ? "grabbing" : field.hoverIndex >= 0 ? "grab" : "crosshair";
    };
    const up = (e: PointerEvent) => {
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      field.pointerUp();
    };
    const cancel = () => field.pointerUp();
    const leave = () => { if (!field.orbiting && field.dragIndex < 0) field.pointerLeave(); };
    const ctxMenu = (e: Event) => e.preventDefault();
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      field.zoomBy(e.deltaY * unit);
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointercancel", cancel);
    window.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("contextmenu", ctxMenu);
    canvas.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("resize", () => field.resize());

    return () => {
      field.stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointercancel", cancel);
      window.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("contextmenu", ctxMenu);
      canvas.removeEventListener("wheel", wheel);
      fieldRef?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fieldInst.current?.applySettings(settings);
  }, [settings]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}
