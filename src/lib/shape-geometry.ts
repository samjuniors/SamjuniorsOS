/** Shared geometry for the visible SVG stroke, ports, and particle execution. */
export type NodeShape = "square" | "rounded" | "circle" | "wide" | "tall" | "pill" | "hex";
export type PortSide = "left" | "right" | "top" | "bottom";
export interface Point { x: number; y: number }
export interface ShapeSize { w: number; h: number; rx: number }
export interface MeasuredPath { points: Point[]; distances: number[]; length: number }

export const SHAPE_SIZE: Record<NodeShape, ShapeSize> = {
  square: { w: 76, h: 64, rx: 10 },
  rounded: { w: 76, h: 64, rx: 18 },
  circle: { w: 72, h: 72, rx: 36 },
  wide: { w: 158, h: 64, rx: 14 },
  tall: { w: 56, h: 84, rx: 14 },
  pill: { w: 92, h: 48, rx: 24 },
  hex: { w: 78, h: 72, rx: 0 },
};

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const wrap = (n: number, size: number) => ((n % size) + size) % size;

/** Coordinates are the exact centerline of the node's existing border. */
export function outlinePath(shape: NodeShape, w = SHAPE_SIZE[shape].w, h = SHAPE_SIZE[shape].h): string {
  if (shape === "circle") {
    return `M ${w / 2} 0 A ${w / 2} ${h / 2} 0 1 1 ${w / 2} ${h} A ${w / 2} ${h / 2} 0 1 1 ${w / 2} 0 Z`;
  }
  if (shape === "hex") return `M ${w * .25} 0 L ${w * .75} 0 L ${w} ${h / 2} L ${w * .75} ${h} L ${w * .25} ${h} L 0 ${h / 2} Z`;
  const r = Math.min(SHAPE_SIZE[shape].rx, w / 2, h / 2);
  return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

export function measurePath(points: Point[]): MeasuredPath {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return { points, distances, length: distances[distances.length - 1] || 0 };
}

export function pointAt(path: MeasuredPath, fraction: number): Point {
  if (!path.length) return path.points[0] ?? { x: 0, y: 0 };
  const distance = clamp01(fraction) * path.length;
  let low = 0;
  let high = path.distances.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (path.distances[mid] <= distance) low = mid;
    else high = mid;
  }
  const span = path.distances[high] - path.distances[low];
  const t = span > 0 ? (distance - path.distances[low]) / span : 0;
  const a = path.points[low], b = path.points[high];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Sub-pixel perimeter sampling, from the very same SVG geometry above. */
export function perimeter(shape: NodeShape, center: Point, w = SHAPE_SIZE[shape].w, h = SHAPE_SIZE[shape].h): MeasuredPath {
  const points: Point[] = [];
  const add = (x: number, y: number) => points.push({ x: center.x - w / 2 + x, y: center.y - h / 2 + y });
  const arc = (x: number, y: number, rx: number, ry: number, start: number, end: number) => {
    const count = Math.max(12, Math.ceil(Math.abs(end - start) * Math.max(rx, ry) / .7));
    for (let i = 0; i <= count; i++) {
      const a = start + (end - start) * i / count;
      add(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
    }
  };
  if (shape === "circle") arc(w / 2, h / 2, w / 2, h / 2, -Math.PI / 2, Math.PI * 1.5);
  else if (shape === "hex") {
    [[w * .25, 0], [w * .75, 0], [w, h / 2], [w * .75, h], [w * .25, h], [0, h / 2], [w * .25, 0]].forEach(([x, y]) => add(x, y));
  } else {
    const r = Math.min(SHAPE_SIZE[shape].rx, w / 2, h / 2);
    add(r, 0);
    arc(w - r, r, r, r, -Math.PI / 2, 0);
    arc(w - r, h - r, r, r, 0, Math.PI / 2);
    arc(r, h - r, r, r, Math.PI / 2, Math.PI);
    arc(r, r, r, r, Math.PI, Math.PI * 1.5);
    add(r, 0);
  }
  return measurePath(points);
}

export function projectToPath(path: MeasuredPath, target: Point): { point: Point; distance: number } {
  let best = Infinity;
  let result = { point: path.points[0], distance: 0 };
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const size = dx * dx + dy * dy;
    if (size < 1e-10) continue;
    const t = clamp01(((target.x - a.x) * dx + (target.y - a.y) * dy) / size);
    const p = { x: a.x + dx * t, y: a.y + dy * t };
    const distance = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
    if (distance < best) {
      best = distance;
      result = { point: p, distance: path.distances[i - 1] + Math.sqrt(size) * t };
    }
  }
  return result;
}

/** Two complementary border routes. Both start at the input and meet at the output. */
export function splitPerimeter(path: MeasuredPath, input: Point, output: Point): [MeasuredPath, MeasuredPath] {
  const a = projectToPath(path, input);
  const b = projectToPath(path, output);
  const clockwise = wrap(b.distance - a.distance, path.length);
  const lengths = [clockwise, path.length - clockwise];
  return lengths.map((length, index) => {
    const direction = index === 0 ? 1 : -1;
    const count = Math.max(2, Math.ceil(length / 1.2));
    const points = Array.from({ length: count + 1 }, (_, i) => pointAt(path, wrap(a.distance + direction * length * i / count, path.length) / path.length));
    points[0] = a.point;
    points[points.length - 1] = b.point;
    return measurePath(points);
  }) as [MeasuredPath, MeasuredPath];
}

export function shapePort(shape: NodeShape, center: Point, side: PortSide, offset = 0, w = SHAPE_SIZE[shape].w, h = SHAPE_SIZE[shape].h): Point {
  const horizontal = side === "left" || side === "right";
  const raw = {
    x: center.x + (horizontal ? (side === "left" ? -w / 2 : w / 2) : offset),
    y: center.y + (horizontal ? offset : side === "top" ? -h / 2 : h / 2),
  };
  return projectToPath(perimeter(shape, center, w, h), raw).point;
}

export function cubicPath(from: Point, control: [Point, Point], to: Point): MeasuredPath {
  const [c0, c1] = control;
  const estimate = Math.hypot(c0.x - from.x, c0.y - from.y) + Math.hypot(c1.x - c0.x, c1.y - c0.y) + Math.hypot(to.x - c1.x, to.y - c1.y);
  const count = Math.max(40, Math.ceil(estimate / 1.5));
  return measurePath(Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, u = 1 - t;
    return {
      x: u ** 3 * from.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t ** 3 * to.x,
      y: u ** 3 * from.y + 3 * u * u * t * c0.y + 3 * u * t * t * c1.y + t ** 3 * to.y,
    };
  }));
}
