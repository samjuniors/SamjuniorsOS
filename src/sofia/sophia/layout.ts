/**
 * Shared stage geometry — the renderer (device px), the focus mapping and
 * the HUD all derive Sophia's position from this single rule so the copy
 * beneath her always clears the outer orbit ring on any viewport.
 */

export interface StageLayout {
  cx: number; // css px
  cy: number;
  R: number; // sphere radius, css px
  ringR: number; // outer orbit radius, css px
}

export const ORBIT_INNER = 1.3;
export const ORBIT_OUTER = 1.52;

export function stageLayout(w: number, h: number): StageLayout {
  const R = Math.max(40, Math.min(w * 0.23, h * 0.175));
  return { cx: w * 0.5, cy: h * 0.44, R, ringR: R * ORBIT_OUTER };
}

/** Mini-orb position when content takes the centre stage: bottom-centre dock. */
export function dockLayout(w: number, h: number): StageLayout {
  const R = 26;
  return { cx: w * 0.5, cy: h - 78, R, ringR: R * ORBIT_OUTER };
}
