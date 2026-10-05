/**
 * [SofiaUI voice-presence engine — reference port]
 * Ported from SofiaUI (github.com/samjuniors/SofiaUI) @ commit 9e88dee:
 *   src/sophia/layout.ts
 * The SofiaUI repository remains independent; this is a one-way port into
 * SamJuniorsOS per the approved migration plan.
 *
 * ADAPTATION (the only one in this file): the stage is a floating presence
 * WIDGET canvas (its own square stage), not SofiaUI's full-viewport stage —
 * so the sphere sits at the canvas centre (cy 0.5h) instead of SofiaUI's
 * 0.44h, which reserved room for a transcript line beneath the orb that this
 * widget does not render (the destination's LiveTranscriptRibbon owns
 * transcripts). The radius rule is unchanged and scales to the widget size.
 */

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
  return { cx: w * 0.5, cy: h * 0.5, R, ringR: R * ORBIT_OUTER };
}

/** Mini-orb position when content takes the centre stage: bottom-centre dock. */
export function dockLayout(w: number, h: number): StageLayout {
  const R = 26;
  return { cx: w * 0.5, cy: h - 78, R, ringR: R * ORBIT_OUTER };
}
