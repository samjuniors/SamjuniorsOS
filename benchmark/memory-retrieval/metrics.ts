/**
 * ============================================================================
 * M5.1 — PURE METRICS (recall / precision / MRR)
 * ============================================================================
 * Pure functions only. Every value is derived from fixture-declared gold sets
 * and measured retrieval lists; nothing here reads the clock, the network,
 * a model, or a store.
 */

import type {
  PerSurfaceMetrics,
  RetrievalSurface,
  SurfaceRetrieval,
} from './types';

/** |retrieved[0..k) ∩ gold| / |gold|. Zero gold → 0 (not NaN). */
export function recallAtK(retrievedKeys: string[], goldKeys: string[], k: number): number {
  if (goldKeys.length === 0) return 0;
  const window = new Set(retrievedKeys.slice(0, k));
  const hits = goldKeys.filter((g) => window.has(g)).length;
  return hits / goldKeys.length;
}

/** |retrieved[0..k) ∩ gold| / k. Zero retrieved → 0 (not NaN). */
export function precisionAtK(retrievedKeys: string[], goldKeys: string[], k: number): number {
  const window = retrievedKeys.slice(0, k);
  if (window.length === 0) return 0;
  const gold = new Set(goldKeys);
  const hits = window.filter((r) => gold.has(r)).length;
  return hits / window.length;
}

/** 1 / rank of the first gold item. No gold item retrieved → null. */
export function mrr(retrievedKeys: string[], goldKeys: string[]): number | null {
  const gold = new Set(goldKeys);
  for (let i = 0; i < retrievedKeys.length; i++) {
    if (gold.has(retrievedKeys[i])) return 1 / (i + 1);
  }
  return null;
}

/** Mean over defined values (nulls skipped); empty input → null. */
export function mean(values: Array<number | null>): number | null {
  const defined = values.filter((v): v is number => typeof v === 'number');
  if (defined.length === 0) return null;
  return defined.reduce((a, b) => a + b, 0) / defined.length;
}

/**
 * Per-surface metrics table for one query. Only surfaces with declared gold
 * OR non-empty retrieval produce rows (empty rows are noise, not signal).
 */
export function computePerSurfaceMetrics(
  surfaces: SurfaceRetrieval[],
  goldBySurface: Partial<Record<RetrievalSurface, string[]>>
): PerSurfaceMetrics[] {
  const rows: PerSurfaceMetrics[] = [];
  for (const surface of surfaces) {
    const gold = goldBySurface[surface.surface] ?? [];
    if (gold.length === 0 && surface.retrieved.length === 0) continue;
    const retrievedKeys = surface.retrieved.map((r) => r.evidenceKey);
    rows.push({
      surface: surface.surface,
      k: surface.effectiveK,
      goldCount: gold.length,
      retrievedCount: surface.retrieved.length,
      recallAtK: recallAtK(retrievedKeys, gold, surface.effectiveK),
      precisionAtK: precisionAtK(retrievedKeys, gold, surface.effectiveK),
      mrr: mrr(retrievedKeys, gold),
    });
  }
  return rows;
}

/**
 * Union recall: gold items (across ALL surfaces) present in any surface's
 * retrieved list at rank ≤ its effectiveK. This is "what a generation layer
 * would have had to work with". Rank-based (not list-position-based): the
 * recorded lists may contain beyond-K entries for classification purposes.
 */
export function computeUnionRecall(
  surfaces: SurfaceRetrieval[],
  goldBySurface: Partial<Record<RetrievalSurface, string[]>>
): number {
  const totalGold = Object.values(goldBySurface).reduce((a, g) => a + (g?.length ?? 0), 0);
  if (totalGold === 0) return 0;
  let hits = 0;
  for (const [surface, gold] of Object.entries(goldBySurface)) {
    if (!gold) continue;
    const surfaceResult = surfaces.find((s) => s.surface === surface);
    if (!surfaceResult) continue;
    const window = new Set(
      surfaceResult.retrieved
        .filter((r) => r.rank <= surfaceResult.effectiveK)
        .map((r) => r.evidenceKey)
    );
    hits += gold.filter((g) => window.has(g)).length;
  }
  return hits / totalGold;
}
