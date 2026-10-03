/**
 * ============================================================================
 * M5.4 — TEST-ONLY ADVERSARIAL CONTEXT BUILDERS (design §3, S10)
 * ============================================================================
 * Pure functions over ALREADY-ASSEMBLED slices. The production assembler is
 * untouched: S10's degraded contexts are harness-built COPIES that differ from
 * the real assembly ONLY in the documented injection (pinned by the offline
 * scenario-contract suite):
 *
 *   S10a (irrelevant injection): the real pricing context PLUS the
 *        dependency-question's DEPENDENCY_PATH slice and a PERSONAL_MIND
 *        slice inserted at PROMINENT positions (right after the operational
 *        state slice) — authoritative-looking but irrelevant material.
 *
 *   S10b (stale injection): the real pricing context with the superseded $29
 *        fact statement appended INTO the CANONICAL_FACT slice (4A) WITHOUT
 *        historical framing, dates still visible, alongside the real $49
 *        record — the model must not blindly repeat the stale statement.
 */

import type { SophiaAssembledContext, SophiaContextSlice } from '../../src/lib/server/sophia/types';
import { CANONICAL_FACTS } from '../memory-retrieval/fixture';

/** Re-renders a slice list into the production formattedContext shape. */
export function formatSlices(slices: SophiaContextSlice[]): string {
  const blocks = slices.map((s) => {
    const staleNotice = s.isStale ? ' [STALE / DEGRADED]' : '';
    return `=== [${s.authority}] ${s.label.toUpperCase()}${staleNotice} ===\n(Source: ${s.provenance})\n${s.content}`;
  });
  return blocks.join('\n\n');
}

export interface AdversarialContext {
  slices: SophiaContextSlice[];
  formattedContext: string;
  /** What was injected (documented, evidence-recorded). */
  injected: string[];
}

/**
 * S10a — irrelevant injection: real context + dependency-path slice + a
 * personal-mind slice, both copied from the dependency question's REAL
 * assembly and inserted prominently (index 1).
 */
export function buildIrrelevantInjectionContext(
  realAssembled: SophiaAssembledContext,
  dependencyAssembled: SophiaAssembledContext
): AdversarialContext {
  const depSlice = dependencyAssembled.slices.find(
    (s) => s.label === 'Service Dependency Chain (Canonical Facts)' && s.authority === 'CANONICAL_FACT'
  );
  const personalSlice = dependencyAssembled.slices.find((s) => s.authority === 'PERSONAL_MIND_MEMORY');

  const injected: string[] = [];
  const additions: SophiaContextSlice[] = [];
  if (depSlice) {
    additions.push({ ...depSlice });
    injected.push(
      'DEPENDENCY_PATH slice (from the dependency question\'s real assembly) inserted at position 2'
    );
  }
  if (personalSlice) {
    additions.push({ ...personalSlice });
    injected.push('PERSONAL_MIND_MEMORY slice (from the dependency question\'s real assembly) inserted prominently');
  }

  const slices = [...realAssembled.slices];
  // Insert prominently: right after the leading operational-state slice.
  slices.splice(Math.min(1, slices.length), 0, ...additions);

  return { slices, formattedContext: formatSlices(slices), injected };
}

/**
 * S10b — stale injection: the superseded $29 fact rendered as a plain
 * CANONICAL_FACT line (production 4A format, dates visible, NO historical
 * framing) appended INTO the real 4A slice, alongside the real $49 record.
 */
export function buildStaleInjectionContext(
  realAssembled: SophiaAssembledContext
): AdversarialContext {
  const staleFact = CANONICAL_FACTS.find((f) => f.id === 'fact-lumora-price-29');
  if (!staleFact) {
    throw new Error('adversarial.ts: fact-lumora-price-29 not found in the frozen fixture');
  }

  const canonicalIdx = realAssembled.slices.findIndex(
    (s) => s.label === 'Canonical Verified Facts' && s.authority === 'CANONICAL_FACT'
  );
  if (canonicalIdx === -1) {
    throw new Error('adversarial.ts: the real assembly carries no CANONICAL_FACT slice (4A)');
  }

  // The production 4A fact-line format, verbatim (no historical framing):
  const staleLine = `  - [FACT-${staleFact.id}] "${staleFact.statement}" (Subject: ${staleFact.subject}, Verified: ${staleFact.promotedAt})`;

  const slices = realAssembled.slices.map((s, i) =>
    i === canonicalIdx ? { ...s, content: `${s.content}\n${staleLine}` } : { ...s }
  );

  return {
    slices,
    formattedContext: formatSlices(slices),
    injected: ['superseded $29 fact statement appended to the CANONICAL_FACT slice without historical framing (dates visible)'],
  };
}
