/**
 * [SofiaUI Sophia engine — shared reference port]
 * Ported from SofiaUI (github.com/samjuniors/SofiaUI) @ commit 9e88dee:
 *   src/sophia/layout.ts
 * The SofiaUI repository remains independent; this is a one-way port into
 * SamjuniorsOS per the approved migration plan.
 *
 * Shared home: this copy serves BOTH Sophia consumers — the full-screen
 * Sophia surface (src/sofia/App.tsx) and the voice-presence widget
 * (src/os/components/voice/VoicePresence.tsx).
 *
 * ADAPTATION (the only one in this file): stageLayout takes an optional
 * cyRatio. SofiaUI's original full-viewport rule places the sphere at
 * 0.44h (reserving room for the identity copy beneath the orb) — that is
 * the DEFAULT. The circular voice-presence widget passes 0.5 (canvas
 * centre) because it renders no copy beneath the orb. The radius rule is
 * unchanged and scales to either stage size.
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

/** SofiaUI's original full-viewport vertical placement of the sphere. */
export const STAGE_CY_SOFIAUI = 0.44;
/** Canvas-centred placement (square widget stages). */
export const STAGE_CY_CENTERED = 0.5;

export function stageLayout(w: number, h: number, cyRatio = STAGE_CY_SOFIAUI): StageLayout {
  const R = Math.max(40, Math.min(w * 0.23, h * 0.175));
  return { cx: w * 0.5, cy: h * cyRatio, R, ringR: R * ORBIT_OUTER };
}

/** Mini-orb position when content takes the centre stage: bottom-centre dock. */
export function dockLayout(w: number, h: number): StageLayout {
  const R = 26;
  return { cx: w * 0.5, cy: h - 78, R, ringR: R * ORBIT_OUTER };
}
