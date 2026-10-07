/**
 * Local types for the Sophia surface (the SofiaUI port).
 * Kept separate from the engine's types (src/sofia/engine/types.ts) — the
 * engine stays the verbatim SofiaUI port; these are the destination-side
 * glue shapes for the surface composition.
 */

export interface SurfaceTurn {
  id: string;
  role: 'user' | 'sophia' | 'system';
  text: string;
  final: boolean;
  ts: number;
}
