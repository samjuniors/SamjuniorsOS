import { SHAPE_SIZE, shapePort, type NodeShape, type Point, type PortSide } from "./shape-geometry";
export type Pt = Point;
export interface PortGeom { d0: Point; d1: Point; p0: Point; p1: Point; axis: "h" | "v"; sourceSide: PortSide; targetSide: PortSide }
export type ShapeNode = { x: number; y: number; shape: NodeShape };
export interface PortOptions { sourceSide?: PortSide; targetSide?: PortSide; sourceOffset?: number; targetOffset?: number }

/** Exact shape-border coordinates, shared by sockets, SVG connections and fire. */
export function portPoints(a: ShapeNode, b: ShapeNode, w: number, h: number, options: PortOptions = {}): PortGeom {
  const ca = { x: a.x * w / 100, y: a.y * h / 100 };
  const cb = { x: b.x * w / 100, y: b.y * h / 100 };
  const dx = cb.x - ca.x, dy = cb.y - ca.y;
  const horizontal = options.sourceSide ? ["left", "right"].includes(options.sourceSide) : Math.abs(dx) >= Math.abs(dy);
  const axis = horizontal ? "h" : "v";
  const sourceSide = options.sourceSide ?? (horizontal ? dx >= 0 ? "right" : "left" : dy >= 0 ? "bottom" : "top");
  const targetSide = options.targetSide ?? (horizontal ? dx >= 0 ? "left" : "right" : dy >= 0 ? "top" : "bottom");
  const d0 = shapePort(a.shape, ca, sourceSide, options.sourceOffset ?? 0);
  const d1 = shapePort(b.shape, cb, targetSide, options.targetOffset ?? 0);
  return { d0, d1, p0: d0, p1: d1, axis, sourceSide, targetSide };
}

const vector: Record<PortSide, Point> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };
export function edgeControl(g: PortGeom): [Point, Point] {
  const distance = Math.max(25, Math.hypot(g.d1.x - g.d0.x, g.d1.y - g.d0.y) * .45);
  const a = vector[g.sourceSide], b = vector[g.targetSide];
  return [{ x: g.d0.x + a.x * distance, y: g.d0.y + a.y * distance }, { x: g.d1.x + b.x * distance, y: g.d1.y + b.y * distance }];
}
export function edgePath(g: PortGeom): string {
  const [a, b] = edgeControl(g);
  return `M ${g.d0.x} ${g.d0.y} C ${a.x} ${a.y}, ${b.x} ${b.y}, ${g.d1.x} ${g.d1.y}`;
}

/** Root/terminal nodes use the opposite boundary when there is no external edge. */
export function oppositePort(node: ShapeNode, connected: Point, w: number, h: number): Point {
  const center = { x: node.x * w / 100, y: node.y * h / 100 };
  const size = SHAPE_SIZE[node.shape];
  const dx = (connected.x - center.x) / size.w;
  const dy = (connected.y - center.y) / size.h;
  return shapePort(node.shape, center, Math.abs(dx) >= Math.abs(dy) ? dx > 0 ? "left" : "right" : dy > 0 ? "top" : "bottom");
}
