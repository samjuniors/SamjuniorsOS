/**
 * ============================================================================
 * M5.3-C — EXPLICIT DEPENDENCY RELATIONS (pure, deterministic)
 * ============================================================================
 * The smallest relational representation the benchmark evidence required
 * (M5.1 BQ3a, the sole surviving failure after M5.2): a bounded
 * "which services depend on X?" traversal over DEPENDS_ON edges extracted
 * DETERMINISTICALLY from canonical fact statements.
 *
 * SCOPE GUARDS (task contract):
 *   - ONE relation type: DEPENDS_ON. AFFECTS, forward traversal ("what does
 *     X depend on?"), and arbitrary user-defined relationship semantics are
 *     explicitly DEFERRED until benchmark evidence requires them.
 *   - BOUNDED traversal: MAX_DEPENDENCY_TRAVERSAL_DEPTH (2 — the benchmark's
 *     measured requirement). This is not a general-purpose graph engine.
 *   - DERIVED INDEX ONLY: every edge is extracted from exactly one canonical
 *     fact; canonical truth stays in the fact rows. Dropping the relation
 *     table loses no truth (it is fully rebuildable — rebuildFromFacts).
 *   - NO LLM anywhere: extraction is a versioned regex rule; the same
 *     statement always yields the same edges. No model call can create,
 *     alter, or rank a dependency edge.
 *
 * Like temporal-semantics.ts (M5.2), this module is a library of pure
 * functions: no store calls, no clock, no model, no mutation, no app-runtime
 * imports beyond the shared tokenizer.
 */

import { createHash } from 'crypto';
import { extractTokens } from '@/lib/server/knowledge/knowledge-store';
import type { CanonicalFact } from '@/types/epistemic';

/** Version of the deterministic extraction rule (pinned for provenance). */
export const DEPENDENCY_EXTRACTION_RULE_VERSION = 'dep-rel/1';

/** The ONLY relation type current benchmark evidence justifies. */
export type DependencyRelationType = 'DEPENDS_ON';

/** Bounded traversal depth — the benchmark's measured 2-hop requirement. */
export const MAX_DEPENDENCY_TRAVERSAL_DEPTH = 2;

/** Maximum tokens in an extracted entity phrase (garbage guard). */
const MAX_ENTITY_TOKENS = 6;

/** The structural shape traversal needs from a stored relation row. */
export interface DependencyEdge {
  id: string;
  sourceEntity: string; // normalized key
  targetEntity: string; // normalized key
  relationType: DependencyRelationType;
  sourceFactId: string;
}

/** A relation extracted from one canonical fact (pre-persistence shape). */
export interface ExtractedDependencyRelation {
  sourceEntity: string;
  sourceEntityDisplay: string;
  targetEntity: string;
  targetEntityDisplay: string;
  relationType: DependencyRelationType;
  sourceFactId: string;
  observedAt: string;
  provenance: {
    statementHash: string;
    extractionRule: string;
    statement: string;
  };
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Clean a raw entity phrase: strip leading/trailing punctuation, strip a
 * leading article, collapse whitespace. Deterministic; no case folding here
 * (display form keeps the statement's casing).
 */
function cleanEntityPhrase(raw: string): string {
  return raw
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/[^A-Za-z0-9\s&.-]+$/, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Entity-likeness guard: every token must start uppercase or a digit
 * (proper-noun systems/services), 1..MAX_ENTITY_TOKENS tokens. Rejects
 * lowercase generic phrases ("the pricing team") and clause fragments.
 */
function isEntityLike(phrase: string): boolean {
  const tokens = phrase.split(' ').filter((t) => t.length > 0);
  if (tokens.length === 0 || tokens.length > MAX_ENTITY_TOKENS) return false;
  return tokens.every((t) => /^[A-Z0-9]/.test(t));
}

/**
 * The deterministic DEPENDS_ON extraction rule (dep-rel/1).
 *
 * Statement grammar: "<Source Entity> depends on <the> <Target Entity>[ for
 * <purpose clause>]". Matched case-insensitively over the FIRST sentence;
 * both sides must be entity-like proper-noun phrases. Returns [] for every
 * other shape — no partial matches, no guesses.
 */
export function extractDependencyRelations(fact: CanonicalFact): ExtractedDependencyRelation[] {
  const statement = (fact.statement || '').trim();
  if (!statement) return [];
  const firstSentence = statement.split(/(?<=[.!?])\s+/)[0] ?? statement;
  const match = firstSentence.match(/^(.+?)\s+depends\s+on\s+(.+)$/i);
  if (!match) return [];

  const sourceDisplay = cleanEntityPhrase(match[1]);
  // Cut the purpose clause ("... for token verification") before cleaning.
  const targetRaw = match[2].split(/\s+for\s+/i)[0];
  const targetDisplay = cleanEntityPhrase(targetRaw);
  if (!isEntityLike(sourceDisplay) || !isEntityLike(targetDisplay)) return [];

  const sourceEntity = normalizeEntityKey(sourceDisplay);
  const targetEntity = normalizeEntityKey(targetDisplay);
  if (!sourceEntity || !targetEntity || sourceEntity === targetEntity) return [];

  return [
    {
      sourceEntity,
      sourceEntityDisplay: sourceDisplay,
      targetEntity,
      targetEntityDisplay: targetDisplay,
      relationType: 'DEPENDS_ON',
      sourceFactId: fact.id,
      observedAt: fact.promotedAt,
      provenance: {
        statementHash: sha256(statement),
        extractionRule: DEPENDENCY_EXTRACTION_RULE_VERSION,
        statement,
      },
    },
  ];
}

/** Normalized entity key: shared tokenizer tokens joined by single spaces. */
export function normalizeEntityKey(display: string): string {
  return extractTokens(display).join(' ');
}

/**
 * Deterministic dependency-intent detection. Cue list mirrors the
 * temporal-semantics convention (regex cues, matched case-insensitively,
 * fixed result shape for audits/tests).
 */
const DEPENDENCY_CUES: RegExp[] = [
  /\bdepend(?:s|ed|ing)?\s+on\b/i,
  /\brel(?:y|ies|ied|iance)\s+on\b/i,
];

export interface DependencyIntentResult {
  intent: boolean;
  /** The cue substrings that fired (deterministic order — for audits/tests). */
  cues: string[];
}

export function detectDependencyIntent(message: string | null | undefined): DependencyIntentResult {
  const text = (message ?? '').trim();
  if (text.length === 0) return { intent: false, cues: [] };
  const fired: string[] = [];
  for (const cue of DEPENDENCY_CUES) {
    const m = text.match(cue);
    if (m) fired.push(m[0]);
  }
  return { intent: fired.length > 0, cues: fired };
}

/**
 * Resolve which known entities the query anchors on. An entity anchors iff
 * ALL of its normalized tokens appear among the query's tokens (token-set
 * subset — "Helix Identity Store" anchors "… depend on the Helix Identity
 * Store?"). Longest match first, then lexicographic — deterministic.
 */
export function resolveDependencyAnchors(
  message: string,
  knownEntityKeys: string[]
): string[] {
  const queryTokens = new Set(extractTokens(message));
  if (queryTokens.size === 0) return [];
  return knownEntityKeys
    .filter((key) => {
      const tokens = key.split(' ').filter((t) => t.length > 0);
      return tokens.length > 0 && tokens.every((t) => queryTokens.has(t));
    })
    .sort((a, b) => {
      const ta = b.split(' ').length - a.split(' ').length;
      return ta !== 0 ? ta : a.localeCompare(b);
    });
}

/** One traversal hop: source depends on target, at BFS depth from an anchor. */
export interface DependencyHop {
  /** The dependent entity (normalized key). */
  fromKey: string;
  /** The entity it depends on (normalized key). */
  toKey: string;
  /** BFS depth from the anchor (1 = direct dependent, 2 = transitive). */
  depth: number;
  /** The relation rows that evidence this edge (deterministic order). */
  viaRelationIds: string[];
}

/**
 * BOUNDED reverse traversal ("who depends on X?"): BFS over edges whose
 * TARGET is in the frontier, collecting their SOURCEs as dependents, up to
 * MAX_DEPENDENCY_TRAVERSAL_DEPTH. Cycle-safe (visited-edge guard) and fully
 * deterministic (frontier expansion in sorted key order; hops sorted by
 * depth, then fromKey, then toKey). Only the caller-filtered edges are
 * considered — pass ACTIVE relations for CURRENT-dependency questions.
 */
export function traverseDependents(
  anchorKeys: string[],
  edges: Array<Pick<DependencyEdge, 'id' | 'sourceEntity' | 'targetEntity'>>,
  maxDepth: number = MAX_DEPENDENCY_TRAVERSAL_DEPTH
): DependencyHop[] {
  const hops: DependencyHop[] = [];
  const seenPairs = new Map<string, DependencyHop>();
  let frontier = [...new Set(anchorKeys)].sort();

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const nextFrontier = new Set<string>();
    // Deterministic scan order: sort edges by (target, source, id).
    const ordered = [...edges].sort((a, b) =>
      a.targetEntity === b.targetEntity
        ? a.sourceEntity === b.sourceEntity
          ? a.id < b.id
            ? -1
            : 1
          : a.sourceEntity.localeCompare(b.sourceEntity)
        : a.targetEntity.localeCompare(b.targetEntity)
    );
    for (const edge of ordered) {
      if (!frontier.includes(edge.targetEntity)) continue;
      const pairKey = `${edge.sourceEntity}\u0000${edge.targetEntity}`;
      const existing = seenPairs.get(pairKey);
      if (existing) {
        if (!existing.viaRelationIds.includes(edge.id)) existing.viaRelationIds.push(edge.id);
        continue;
      }
      const hop: DependencyHop = {
        fromKey: edge.sourceEntity,
        toKey: edge.targetEntity,
        depth,
        viaRelationIds: [edge.id],
      };
      seenPairs.set(pairKey, hop);
      hops.push(hop);
      nextFrontier.add(edge.sourceEntity);
    }
    frontier = [...nextFrontier].sort();
  }
  return hops.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.fromKey !== b.fromKey) return a.fromKey.localeCompare(b.fromKey);
    return a.toKey.localeCompare(b.toKey);
  });
}

/**
 * Collect the canonical facts that evidence a traversal: ACTIVE facts whose
 * statement mentions ANY traversed entity (anchor or dependent). Ordered by
 * the minimum depth of a mentioned entity (the direct-dependency evidence
 * first), then promotedAt DESC, then id ASC — the same total-order
 * conventions as the M5.2 fact ranking.
 */
export function collectDependencyFacts(
  hops: DependencyHop[],
  anchorKeys: string[],
  facts: CanonicalFact[]
): CanonicalFact[] {
  const entityDepth = new Map<string, number>();
  for (const anchor of anchorKeys) entityDepth.set(anchor, 0);
  for (const hop of hops) {
    const current = entityDepth.get(hop.fromKey);
    if (current === undefined || hop.depth < current) entityDepth.set(hop.fromKey, hop.depth);
  }
  const entityKeys = [...entityDepth.keys()];

  const matched = facts
    .filter((f) => f.validityState === 'active')
    .map((fact) => {
      const statementTokens = new Set(extractTokens(fact.statement));
      let minDepth = -1;
      for (const key of entityKeys) {
        const tokens = key.split(' ').filter((t) => t.length > 0);
        if (tokens.length > 0 && tokens.every((t) => statementTokens.has(t))) {
          const depth = entityDepth.get(key)!;
          if (minDepth === -1 || depth < minDepth) minDepth = depth;
        }
      }
      return { fact, minDepth };
    })
    .filter((entry) => entry.minDepth !== -1)
    .sort((a, b) => {
      if (a.minDepth !== b.minDepth) return a.minDepth - b.minDepth;
      const ta = Date.parse(a.fact.promotedAt || '') || 0;
      const tb = Date.parse(b.fact.promotedAt || '') || 0;
      if (tb !== ta) return tb - ta;
      return a.fact.id < b.fact.id ? -1 : a.fact.id > b.fact.id ? 1 : 0;
    })
    .map((entry) => ({ ...entry.fact }));
  return matched;
}

/** Union of all entity keys referenced by a set of edges (sorted). */
export function knownEntityKeys(edges: Array<Pick<DependencyEdge, 'sourceEntity' | 'targetEntity'>>): string[] {
  const keys = new Set<string>();
  for (const edge of edges) {
    if (edge.sourceEntity) keys.add(edge.sourceEntity);
    if (edge.targetEntity) keys.add(edge.targetEntity);
  }
  return [...keys].sort();
}
