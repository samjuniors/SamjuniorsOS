/**
 * ============================================================================
 * M5.1 — RETRIEVAL HARNESS (runs the EXACT canonical-path functions)
 * ============================================================================
 * For every benchmark query this module executes the retrieval battery the
 * canonical Sophia turn path performs (context-assembly.ts), with the SAME
 * limits and the SAME order, and additionally captures what the full
 * SophiaContextAssembler.assemble() actually RENDERS (the e2e layer).
 *
 * It measures; it never judges (scoring/classification live elsewhere).
 * No LLM is called anywhere in this file — the "answer" is the retrieved
 * evidence set, which is precisely what a generation layer would consume.
 */

import {
  FOUNDER_A,
  PERSONAL_MEMORIES,
  COMPANY_KNOWLEDGE,
  COMPANY_MEMORIES,
  CANONICAL_FACTS,
  EPISTEMIC_CLAIMS,
  STATE_INITIATIVES,
  STATE_DECISIONS,
  EPISODIC_CONVERSATION,
  STATE_FINANCIAL_MODEL,
} from './fixture';
import { BENCHMARK_QUERIES } from './queries';
import type {
  BenchmarkQuery,
  RenderOutcome,
  RetrievalSurface,
  SurfaceRetrieval,
} from './types';
import {
  SophiaMemoryStore,
} from '../../src/lib/server/sophia/personal-memory-store';
import { selectPersonalMindMemories } from '../../src/lib/server/sophia/context-assembly';
import { SophiaContextAssembler } from '../../src/lib/server/sophia';
import { CompanyKnowledgeStore, extractTokens } from '../../src/lib/server/knowledge/knowledge-store';
import { CompanyMemoryStore } from '../../src/lib/server/memory/memory-store';
import { EpistemicClaimStore } from '../../src/lib/server/epistemic/claim-store';
import { CompanyStateStore } from '../../src/lib/server/state/state-store';
import { ConversationStore } from '../../src/lib/server/conversation/store';
import { detectTemporalIntent } from '../../src/lib/server/retrieval/temporal-semantics';
import { DependencyRelationStore } from '../../src/lib/server/retrieval/dependency-relation-store';
import {
  collectDependencyFacts,
  detectDependencyIntent,
  knownEntityKeys,
  resolveDependencyAnchors,
  traverseDependents,
} from '../../src/lib/server/retrieval/dependency-relations';
import type { SeedResult } from './seed';
import { probeCrossFounderAccess } from './seed';

// Truth-bearing vs advisory authorities live in types.ts (single source).

interface EvidenceEntry {
  key: string;
  surface: RetrievalSurface;
  /** The id the surface's retrieval result carries (null for state metrics). */
  retrievalId: string | null;
  /** Substrings that identify this evidence inside assembled slice content. */
  renderFingerprints: string[];
}

/**
 * Runtime evidence registry: maps fixture evidence keys to the identifiers
 * the live stores return (personal memories get generated uuid ids).
 */
export function buildEvidenceRegistry(seed: SeedResult): Map<string, EvidenceEntry> {
  const registry = new Map<string, EvidenceEntry>();

  for (const spec of PERSONAL_MEMORIES) {
    registry.set(spec.evidenceKey, {
      key: spec.evidenceKey,
      surface: 'personal_mind',
      retrievalId: seed.personalIdByKey.get(spec.evidenceKey) ?? null,
      renderFingerprints: [spec.content.slice(0, 24)],
    });
  }
  for (const item of COMPANY_KNOWLEDGE) {
    registry.set(item.documentId, {
      key: item.documentId,
      surface: 'company_knowledge',
      retrievalId: item.documentId,
      renderFingerprints: [`[${item.documentId}]`],
    });
  }
  for (const mem of COMPANY_MEMORIES) {
    registry.set(mem.id, {
      key: mem.id,
      surface: 'company_precedent',
      retrievalId: mem.id,
      renderFingerprints: [`Precedent [${mem.id}]`],
    });
  }
  for (const fact of CANONICAL_FACTS) {
    registry.set(fact.evidenceKey, {
      key: fact.evidenceKey,
      surface: 'canonical_facts',
      retrievalId: fact.id,
      renderFingerprints: [`[FACT-${fact.id}]`],
    });
  }
  for (const claim of EPISTEMIC_CLAIMS) {
    registry.set(claim.id, {
      key: claim.id,
      surface: 'canonical_facts',
      retrievalId: claim.id,
      renderFingerprints: [`[CLAIM-${claim.id}]`],
    });
  }
  // CompanyState — metrics fingerprinted by their canonical digit runs
  // (locale-tolerant: non-digits stripped before matching).
  registry.set('STATE-FIN-01', {
    key: 'STATE-FIN-01',
    surface: 'company_state',
    retrievalId: null,
    renderFingerprints: [
      String(STATE_FINANCIAL_MODEL.mrr),
      String(STATE_FINANCIAL_MODEL.arr),
      String(STATE_FINANCIAL_MODEL.burnRate),
    ],
    });
  for (const init of STATE_INITIATIVES) {
    registry.set(`STATE-${init.id}`, {
      key: `STATE-${init.id}`,
      surface: 'company_state',
      retrievalId: init.id,
      renderFingerprints: [`[${init.id}]`],
    });
  }
  for (const dec of STATE_DECISIONS) {
    registry.set(`STATE-${dec.id}`, {
      key: `STATE-${dec.id}`,
      surface: 'company_state',
      retrievalId: dec.id,
      // Decisions have NO render slice in A0 (slice 1 renders financials +
      // active initiatives only) — the fingerprint exists so that IF a future
      // path ever renders them, the benchmark measures it.
      renderFingerprints: [`[${dec.id}]`, dec.title.slice(0, 24)],
    });
  }
  // Episodic conversation (messages fingerprinted by content prefix).
  registry.set('CONV-EP-01', {
    key: 'CONV-EP-01',
    surface: 'episodic_conversation',
    retrievalId: EPISODIC_CONVERSATION.conversationId,
    renderFingerprints: EPISODIC_CONVERSATION.messages
      .filter((m) => m.sender === 'assistant')
      .map((m) => m.content.slice(0, 24)),
  });

  return registry;
}

/** The A0 retrieval battery for ONE query, exactly as the canonical path runs it. */
async function runRetrievalBattery(
  query: BenchmarkQuery,
  seed: SeedResult
): Promise<SurfaceRetrieval[]> {
  const surfaces: SurfaceRetrieval[] = [];

  // --- Personal Mind (slice 6B path) --------------------------------------
  const sophiaMemory = SophiaMemoryStore.getInstance();
  const activePool = await sophiaMemory.listAllMemories(seed.founderA, { active: true });
  const selected = selectPersonalMindMemories(activePool, query.queryText);
  surfaces.push({
    surface: 'personal_mind',
    retrieved: selected.map((m) => {
      const key =
        [...seed.personalIdByKey.entries()].find(([, id]) => id === m.id)?.[0] ?? `unmapped:${m.id}`;
      return { evidenceKey: key, rank: 0, score: null };
    }).map((entry, index) => ({ ...entry, rank: index + 1 })),
    effectiveK: 20,
    note: `selection over ${activePool.length} ACTIVE records (M4-C/M4-D conditioned policy)`,
  });

  // --- Company Knowledge (slice 5A path) ----------------------------------
  const knowledge = CompanyKnowledgeStore.getInstance();
  const knowledgeItems = await knowledge.queryKnowledge({
    queryText: query.queryText,
    limit: 2,
  });
  surfaces.push({
    surface: 'company_knowledge',
    retrieved: knowledgeItems.map((k, index) => ({
      evidenceKey: k.documentId,
      rank: index + 1,
      score: k.relevanceScore,
    })),
    effectiveK: 2,
  });

  // --- Company Precedent (slice 5B path) ----------------------------------
  const precedent = CompanyMemoryStore.getInstance();
  const precedentItems = await precedent.queryMemories({
    queryText: query.queryText,
    limit: 2,
  });
  surfaces.push({
    surface: 'company_precedent',
    retrieved: precedentItems.map((m, index) => ({
      evidenceKey: m.memoryId ?? m.id ?? `unmapped-precedent-${index}`,
      rank: index + 1,
      score: m.relevanceScore ?? null,
    })),
    effectiveK: 2,
  });

  // --- Canonical Facts (slice 4A path) ------------------------------------
  // M5.2: slice 4A is now QUERY-CONDITIONED — EpistemicClaimStore.queryFacts
  // (active facts, shared lexical scoring) with the slice's documented
  // never-empty fallback to the 3 newest active facts when nothing matches.
  // The battery mirrors the canonical path exactly: conditioned results
  // first; on a zero-match turn the A0 unconditioned top-3-newest projection
  // (so rank-based misses stay classifiable at the same effective K).
  // Superseded facts NEVER enter this battery — they render only under the
  // non-truth-bearing SUPERSEDED_FACT / CHANGE_RECORD projections, which the
  // render capture measures.
  //
  // M5.3-C: the canonical path adds the DEPENDENCY-ANCHORED facts (slice 4A3,
  // bounded DEPENDS_ON traversal over the derived relation index) AHEAD of
  // the lexical matches for dependency-intent queries whose anchors resolve.
  // They are canonical facts rendered under CANONICAL_FACT authority, so
  // the canonical_facts surface battery includes them — same K (3), same
  // dedup, deterministic order (traversal evidence first). Queries without
  // resolvable dependency anchors are byte-identical to A1.
  const epistemic = EpistemicClaimStore.getInstance();
  const depIntent = detectDependencyIntent(query.queryText);
  let dependencyFacts: Array<{ id: string }> = [];
  if (depIntent.intent) {
    try {
      const activeRelations = await DependencyRelationStore.getInstance().listActiveRelations();
      const depAnchors = resolveDependencyAnchors(
        query.queryText,
        knownEntityKeys(activeRelations)
      );
      if (depAnchors.length > 0) {
        const depHops = traverseDependents(depAnchors, activeRelations);
        const activeFactPool = await epistemic.listActiveFacts();
        dependencyFacts = collectDependencyFacts(depHops, depAnchors, activeFactPool);
      }
    } catch {
      dependencyFacts = []; // fail-safe: dependency battery leg degrades to A1
    }
  }
  // M5.2 two-tier facts battery (mirrors slice 4A exactly): dependency-
  // anchored facts first, then query-matched facts, then newest-active fill
  // to 3; zero matches → the exact A0 top-3-newest projection.
  const factMatches = await epistemic.queryFacts({ queryText: query.queryText, limit: 3 });
  const newestActiveFacts = await epistemic.listActiveFacts();
  const depFactIds = new Set(dependencyFacts.map((f) => f.id));
  const factMatchIds = new Set(factMatches.map((f) => f.id));
  const activeFacts = [
    ...dependencyFacts,
    ...factMatches.filter((f) => !depFactIds.has(f.id)),
    ...newestActiveFacts.filter((f) => !depFactIds.has(f.id) && !factMatchIds.has(f.id)),
  ].slice(0, 3);
  const factsFallback = factMatches.length === 0 && dependencyFacts.length === 0;
  const pendingClaims = (await epistemic.listClaims()).filter(
    (c) => c.verificationStatus === 'pending' || c.verificationStatus === 'under_review'
  );
  const factKeyById = new Map(CANONICAL_FACTS.map((f) => [f.id, f.evidenceKey]));
  surfaces.push({
    surface: 'canonical_facts',
    retrieved: activeFacts.map((f, index) => ({
      evidenceKey: factKeyById.get(f.id) ?? f.id,
      rank: index + 1,
      score: null,
    })),
    effectiveK: 3,
    note: factsFallback
      ? 'zero query matches — the M5.2 slice falls back to the A0 unconditioned projection (3 newest active facts)'
      : dependencyFacts.length > 0
        ? 'M5.3-C dependency-anchored facts (bounded DEPENDS_ON traversal) + M5.2 query-conditioned facts slice'
        : 'M5.2 query-conditioned facts slice (shared lexical scorer; ranked score DESC, promotedAt DESC, id ASC)',
  });

  // --- Unverified claims (slice 4B path, EPISTEMIC WARNING label) -----------
  surfaces.push({
    surface: 'unverified_claims',
    retrieved: pendingClaims.map((c, index) => ({
      evidenceKey: c.id,
      rank: index + 1,
      score: null,
    })),
    effectiveK: 3,
    note: 'surface is NOT query-conditioned in A0 — up to 3 pending claims render under the EPISTEMIC WARNING label regardless of the query',
  });

  // --- Company State (slice 1 path) ---------------------------------------
  // M5.2: slice 1 now renders metrics + QUERY-MATCHED decisions (top 2,
  // strict match-only — unmatched queries render no decisions; WINDOW-intent
  // queries render NO lexically-matched decisions, their decision surface is
  // the date-filtered CHANGE_RECORD block) + top-3 active initiatives, in
  // that render order. The battery mirrors the canonical path exactly.
  const state = CompanyStateStore.getInstance();
  const metrics = await state.getFinancialMetrics();
  const initiatives = (await state.getInitiatives()).filter((i) =>
    ['Active', 'In Progress', 'active', 'in_progress'].includes(i.status)
  );
  const queryTemporalIntent = detectTemporalIntent(query.queryText).intent;
  const decisionQueryTokens = new Set(extractTokens(query.queryText));
  const matchedDecisions =
    queryTemporalIntent === 'window'
      ? []
      : (await state.getDecisions())
          .map((dec) => {
            const decTokens = new Set([
              ...extractTokens(dec.title),
              ...extractTokens(dec.recommendation),
              ...extractTokens(dec.category),
              ...extractTokens(dec.businessImpact),
              ...extractTokens(dec.evidenceSummary),
            ]);
            let matched = 0;
            for (const token of decisionQueryTokens) {
              if (decTokens.has(token)) matched++;
            }
            return { dec, matched };
          })
          .filter((entry) => entry.matched > 0)
          .sort((a, b) => {
            if (b.matched !== a.matched) return b.matched - a.matched;
            const ta = Date.parse(a.dec.date) || 0;
            const tb = Date.parse(b.dec.date) || 0;
            if (tb !== ta) return tb - ta;
            return a.dec.id < b.dec.id ? -1 : 1;
          })
          .slice(0, 2);
  const stateRetrieved: SurfaceRetrieval['retrieved'] = [];
  if (metrics && typeof metrics.mrr === 'number') {
    stateRetrieved.push({ evidenceKey: 'STATE-FIN-01', rank: 1, score: null });
  }
  matchedDecisions.forEach(({ dec }, index) => {
    stateRetrieved.push({ evidenceKey: `STATE-${dec.id}`, rank: index + 2, score: null });
  });
  initiatives.slice(0, 3).forEach((i, index) => {
    stateRetrieved.push({ evidenceKey: `STATE-${i.id}`, rank: index + 2 + matchedDecisions.length, score: null });
  });
  surfaces.push({
    surface: 'company_state',
    retrieved: stateRetrieved,
    effectiveK: 3,
    note: 'M5.2: metrics render unconditionally; decisions render QUERY-MATCHED (strict — unmatched queries render none); initiatives remain the top-3 active projection',
  });

  // --- Episodic conversation (M5.2 retrieval projection) --------------------
  // The canonical path now searches PAST conversations through the founder-
  // scoped ConversationStore.searchConversations (deterministic lexical
  // scoring with the M4-D fold). The battery mirrors it exactly.
  const conversations = ConversationStore.getInstance();
  const episodicHits = await conversations.searchConversations(
    seed.founderA,
    query.queryText,
    3
  );
  // Mechanical conversation-id → evidence-key translation (the registry maps
  // CONV-EP-01 to the fixture conversation id; non-fixture conversations pass
  // through under their own id).
  const episodicKeyByConvId = new Map<string, string>([
    [EPISODIC_CONVERSATION.conversationId, 'CONV-EP-01'],
  ]);
  surfaces.push({
    surface: 'episodic_conversation',
    retrieved: episodicHits.map((hit, index) => ({
      evidenceKey: episodicKeyByConvId.get(hit.conversationId) ?? hit.conversationId,
      rank: index + 1,
      score: hit.score,
    })),
    effectiveK: 10,
    note: 'M5.2: founder-scoped past-conversation search over the canonical ConversationStore (advisory EPISODIC_MEMORY slice; never company truth)',
  });

  return surfaces;
}

/** Captures what assemble() actually rendered, keyed by slice authority. */
async function runRenderCapture(
  query: BenchmarkQuery,
  seed: SeedResult,
  registry: Map<string, EvidenceEntry>
): Promise<RenderOutcome> {
  const assembled = await SophiaContextAssembler.assemble({
    message: query.queryText,
    founderId: seed.founderA,
  });

  const renderedByAuthority: Record<string, string[]> = {};
  const renderedEvidenceKeys: string[] = [];

  for (const slice of assembled.slices) {
    const digitsOnly = slice.content.replace(/[^0-9]/g, '');
    for (const entry of registry.values()) {
      const matched = entry.renderFingerprints.some((fp) => {
        const isDigitFingerprint = /^[0-9]+$/.test(fp);
        return isDigitFingerprint ? digitsOnly.includes(fp) : slice.content.includes(fp);
      });
      if (matched) {
        renderedByAuthority[entry.key] = [...(renderedByAuthority[entry.key] ?? []), slice.authority];
        if (!renderedEvidenceKeys.includes(entry.key)) renderedEvidenceKeys.push(entry.key);
      }
    }
  }

  return {
    renderedEvidenceKeys,
    renderedByAuthority,
    slices: assembled.slices.map((s) => ({ label: s.label, authority: s.authority })),
    personalMindContainerPresent: assembled.slices.some(
      (s) => s.authority === 'PERSONAL_MIND_MEMORY'
    ),
    unverifiedClaimsWarningPresent: assembled.formattedContext.includes('EPISTEMIC WARNING'),
  };
}

export interface HarnessOutcome {
  query: BenchmarkQuery;
  surfaces: SurfaceRetrieval[];
  render: RenderOutcome;
  /** Cross-founder access probe outcome (founder-scope access-control leg). */
  crossFounderProbe: 'BLOCKED_403' | 'ALLOWED';
}

export async function runBenchmarkHarness(seed: SeedResult): Promise<HarnessOutcome[]> {
  const registry = buildEvidenceRegistry(seed);
  const outcomes: HarnessOutcome[] = [];

  // Founder-scope access-control probe (constant across queries; recorded once
  // per outcome for self-contained per-query scoring).
  const founderBKey = 'PM-B1';
  const founderBId = seed.personalIdByKey.get(founderBKey)!;
  const crossFounderProbe = await probeCrossFounderAccess(seed.founderA, founderBId);

  for (const query of BENCHMARK_QUERIES) {
    const surfaces = await runRetrievalBattery(query, seed);
    const render = await runRenderCapture(query, seed, registry);
    outcomes.push({ query, surfaces, render, crossFounderProbe });
  }

  return outcomes;
}

/** Exposed for the benchmark's own test suite (fixture fingerprint checks). */
export { FOUNDER_A };
