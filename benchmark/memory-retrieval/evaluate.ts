/**
 * ============================================================================
 * M5.1 — QUERY EVALUATOR (combines measurement, metrics, classification)
 * ============================================================================
 * Produces one QueryResult per benchmark query:
 *   - per-surface Recall@K / Precision@K / MRR (metrics.ts, pure)
 *   - union recall (what a generation layer would have had to work with)
 *   - render recall (what actually reached the assembled context)
 *   - hard correctness gates: authority, temporal, supersession,
 *     founder-scope, Personal-vs-Company boundary
 *   - failure records, classified RETRIEVAL vs AUTHORITY_LIFECYCLE with
 *     the A–J gap taxonomy and the graph-candidate flag (classify.ts)
 *
 * The evaluator never consults `expectedGaps` — measurement is independent
 * of the design hypothesis (the report shows both side by side).
 */

import {
  PERSONAL_MEMORIES,
  COMPANY_KNOWLEDGE,
  COMPANY_MEMORIES,
  CANONICAL_FACTS,
  EPISTEMIC_CLAIMS,
  STATE_INITIATIVES,
  STATE_DECISIONS,
  EPISODIC_CONVERSATION,
} from './fixture';
import {
  computePerSurfaceMetrics,
  computeUnionRecall,
} from './metrics';
import {
  classifyForbiddenHit,
  classifyGoldMiss,
  goldBySurface,
  type EvidenceTextProvider,
} from './classify';
import type { HarnessOutcome } from './harness';
import type {
  BenchmarkCategory,
  BenchmarkRunResult,
  FailureRecord,
  QueryResult,
  RetrievalSurface,
} from './types';
import { TRUTH_BEARING_AUTHORITIES as TRUTH_AUTHORITIES } from './types';
import { computeFixtureDigest } from './fixture';

/** Supersession pairs declared by the fixture (predecessor, successor). */
const SUPERSESSION_PAIRS: Array<[string, string]> = [
  ['FACT-OLD-01', 'FACT-CUR-01'],
  ['PM-05', 'PM-06'],
];

function buildEvidenceTextProvider(): EvidenceTextProvider {
  type Entry = {
    surface: RetrievalSurface | null;
    text: string;
    lifecycle: 'active' | 'superseded' | 'pending' | 'rejected' | 'archived' | 'n/a';
  };
  const byKey = new Map<string, Entry>();

  for (const m of PERSONAL_MEMORIES) {
    byKey.set(m.evidenceKey, {
      surface: 'personal_mind',
      text: m.content,
      lifecycle:
        m.transition?.to === 'SUPERSEDED'
          ? 'superseded'
          : m.transition?.to === 'REJECTED'
            ? 'rejected'
            : m.birthState === 'PENDING_REVIEW'
              ? 'pending'
              : 'active',
    });
  }
  for (const k of COMPANY_KNOWLEDGE) {
    byKey.set(k.documentId, {
      surface: 'company_knowledge',
      text: `${k.title} ${k.summary} ${k.content} ${k.tags.join(' ')} ${k.documentId}`,
      lifecycle: 'n/a',
    });
  }
  for (const m of COMPANY_MEMORIES) {
    byKey.set(m.id, {
      surface: 'company_precedent',
      text: `${m.approvedAction} ${m.executionOutcome} ${m.evidenceReferences.join(' ')}`,
      lifecycle: 'n/a',
    });
  }
  for (const f of CANONICAL_FACTS) {
    byKey.set(f.evidenceKey, {
      surface: 'canonical_facts',
      text: `${f.statement} ${f.subject}`,
      lifecycle: f.evidenceKey === 'FACT-OLD-01' ? 'superseded' : 'active',
    });
  }
  for (const c of EPISTEMIC_CLAIMS) {
    byKey.set(c.id, {
      surface: 'unverified_claims',
      text: `${c.statement} ${c.subject}`,
      lifecycle: c.verificationStatus === 'pending' ? 'pending' : 'n/a',
    });
  }
  for (const i of STATE_INITIATIVES) {
    byKey.set(`STATE-${i.id}`, {
      surface: 'company_state',
      text: `${i.title} ${i.currentObjective} ${i.latestResult} ${i.status}`,
      lifecycle: 'n/a',
    });
  }
  for (const d of STATE_DECISIONS) {
    byKey.set(`STATE-${d.id}`, {
      surface: 'company_state',
      text: `${d.title} ${d.recommendation} ${d.evidenceSummary} ${d.date}`,
      lifecycle: 'n/a',
    });
  }
  byKey.set('STATE-FIN-01', {
    surface: 'company_state',
    text: 'company financial state metrics mrr arr burn runway',
    lifecycle: 'n/a',
  });
  byKey.set('CONV-EP-01', {
    surface: 'episodic_conversation',
    text: EPISODIC_CONVERSATION.messages.map((m) => m.content).join(' '),
    lifecycle: 'n/a',
  });

  return (evidenceKey: string) => {
    const found = byKey.get(evidenceKey);
    if (!found) throw new Error(`Unknown evidence key: ${evidenceKey}`);
    return found;
  };
}

function evaluateOne(outcome: HarnessOutcome): QueryResult {
  const { query, surfaces, render } = outcome;
  const goldMap = goldBySurface(query.expected);
  const getText = buildEvidenceTextProvider();

  const perSurface = computePerSurfaceMetrics(surfaces, goldMap);
  const unionRecall = computeUnionRecall(surfaces, goldMap);

  const allGold = query.expected.flatMap((p) => p.evidenceKeys);
  const goldRendered = allGold.filter((k) => render.renderedEvidenceKeys.includes(k));
  const renderRecall = allGold.length > 0 ? goldRendered.length / allGold.length : null;

  const failures: FailureRecord[] = [];
  const personalSurface = surfaces.find((s) => s.surface === 'personal_mind');

  // -------------------------------------------------------------------------
  // Gold misses (retrieval layer) + render misses (assembly layer).
  //
  // M5.2 MEASUREMENT-CONSISTENCY CORRECTION (documented as a benchmark
  // correction, NOT a success): a gold item counts as REACHABLE when it is
  // retrieved within effective K on its declared surface OR when it actually
  // RENDERED in the assembled context — exactly the definition this
  // evaluator's own goldHits union-recall gate (below) has always used.
  // The A0 failure-record loop required surface retrieval only, which made
  // render-reachable gold (a historical projection, a derived change
  // enumeration) record phantom GOLD_NOT_RETRIEVED failures even though a
  // generation layer consuming this exact context could derive the answer.
  // PROVEN A0-INVARIANT: every one of the 14 A0 failures was ALSO unrendered
  // in the A0 run (verified against results/baseline-a0.json before this
  // change shipped) — the correction changes zero A0 numbers; it only lets
  // post-M5.2 render paths be measured honestly. Gold sets untouched.
  // -------------------------------------------------------------------------
  for (const pointer of query.expected) {
    const surfaceResult = surfaces.find((s) => s.surface === pointer.surface);
    for (const key of pointer.evidenceKeys) {
      const entry = surfaceResult?.retrieved.find((r) => r.evidenceKey === key);
      const rendered = render.renderedByAuthority[key] !== undefined;
      if (!entry && !rendered) {
        failures.push(
          classifyGoldMiss(query, pointer.surface, key, 'GOLD_NOT_RETRIEVED', {
            surfaceResult,
            getText,
            rendered,
          })
        );
      } else if (entry && !rendered && entry.rank > (surfaceResult?.effectiveK ?? 0)) {
        failures.push(
          classifyGoldMiss(query, pointer.surface, key, 'GOLD_BEYOND_EFFECTIVE_K', {
            surfaceResult,
            getText,
            rendered,
          })
        );
      } else if (!rendered) {
        failures.push(
          classifyGoldMiss(query, pointer.surface, key, 'GOLD_NOT_RENDERED', {
            surfaceResult,
            getText,
            rendered,
          })
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Forbidden hits (authority/lifecycle layer).
  // -------------------------------------------------------------------------
  for (const pointer of query.forbidden) {
    const surfaceResult = surfaces.find((s) => s.surface === pointer.surface);
    for (const key of pointer.evidenceKeys) {
      const record = classifyForbiddenHit(query, pointer, key, {
        retrieved: surfaceResult?.retrieved.some((r) => r.evidenceKey === key) ?? false,
        renderedUnder: render.renderedByAuthority[key] ?? [],
      });
      if (record) failures.push(record);
    }
  }

  // -------------------------------------------------------------------------
  // Founder-scope: other-founder records must never enter this founder's
  // selection; cross-founder reads must fail closed.
  // -------------------------------------------------------------------------
  const leakedFounderKeys = (personalSurface?.retrieved ?? [])
    .map((r) => r.evidenceKey)
    .filter((key) => key.startsWith('PM-B'));
  if (leakedFounderKeys.length > 0 || outcome.crossFounderProbe === 'ALLOWED') {
    for (const key of leakedFounderKeys.length > 0 ? leakedFounderKeys : ['PM-B1']) {
      failures.push({
        queryId: query.queryId,
        category: query.category,
        surface: 'personal_mind',
        kind: 'SCOPE_LEAK',
        evidenceKey: key,
        failureClass: 'AUTHORITY_LIFECYCLE',
        gapTags: ['I_authorization'],
        primaryGap: 'I_authorization',
        graphCandidate: false,
        explanation:
          outcome.crossFounderProbe === 'ALLOWED'
            ? `Cross-founder access probe returned ALLOWED (expected BLOCKED_403) — key ${key}`
            : `Other-founder record ${key} entered this founder's Personal Mind selection`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Personal-vs-Company boundary (structural): personal evidence must never
  // render under a truth-bearing authority; company evidence must never render
  // inside the PERSONAL_MIND container.
  // -------------------------------------------------------------------------
  let boundaryCorrect: 0 | 1 = 1;
  for (const [key, authorities] of Object.entries(render.renderedByAuthority)) {
    const isPersonal = key.startsWith('PM-');
    const inTruth = authorities.some((a) => (TRUTH_AUTHORITIES as readonly string[]).includes(a));
    const inPersonalContainer = authorities.includes('PERSONAL_MIND_MEMORY');
    if (isPersonal && inTruth) {
      boundaryCorrect = 0;
      failures.push({
        queryId: query.queryId,
        category: query.category,
        surface: 'render',
        kind: 'SCOPE_LEAK',
        evidenceKey: key,
        failureClass: 'AUTHORITY_LIFECYCLE',
        gapTags: ['I_authorization'],
        primaryGap: 'I_authorization',
        graphCandidate: false,
        explanation: `Personal evidence ${key} rendered under truth-bearing authority [${authorities.join(', ')}]`,
      });
    }
    if (!isPersonal && inPersonalContainer) {
      boundaryCorrect = 0;
      failures.push({
        queryId: query.queryId,
        category: query.category,
        surface: 'render',
        kind: 'SCOPE_LEAK',
        evidenceKey: key,
        failureClass: 'AUTHORITY_LIFECYCLE',
        gapTags: ['I_authorization'],
        primaryGap: 'I_authorization',
        graphCandidate: false,
        explanation: `Company evidence ${key} rendered inside the PERSONAL_MIND container`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Correctness gates.
  // -------------------------------------------------------------------------
  const goldHits = allGold.filter((key) => {
    const pointer = query.expected.find((p) => p.evidenceKeys.includes(key));
    if (!pointer) return false;
    const surfaceResult = surfaces.find((s) => s.surface === pointer.surface);
    const entry = surfaceResult?.retrieved.find((r) => r.evidenceKey === key);
    return (
      (entry !== undefined && entry.rank <= (surfaceResult?.effectiveK ?? 0)) ||
      render.renderedEvidenceKeys.includes(key)
    );
  });
  const anyRetrieved = surfaces.some((s) => s.retrieved.length > 0);
  const authorityViolation = failures.some(
    (f) =>
      f.failureClass === 'AUTHORITY_LIFECYCLE' &&
      (f.kind === 'FORBIDDEN_RETRIEVED' || f.kind === 'FORBIDDEN_RENDERED' || f.kind === 'FORBIDDEN_AS_AUTHORITY' || f.kind === 'SCOPE_LEAK')
  );
  const authorityCorrect: 0 | 1 | null =
    query.requiredAuthority === 'personal_mind'
      ? null // personal queries: authority = advisory by definition (boundary checks cover leakage)
      : authorityViolation
        ? 0
        : goldHits.length > 0
          ? 1
          : anyRetrieved
            ? 0 // answered from non-authoritative material only
            : null; // nothing retrieved — honest-failure territory (authority vacuous)

  // Temporal gate.
  let temporalCorrect: 0 | 1 | null = null;
  if (query.temporal) {
    if (query.temporal.intent === 'current') {
      temporalCorrect = goldHits.length > 0 && !authorityViolation ? 1 : 0;
    } else {
      // history / window: ALL gold must be reachable, and no forbidden hit.
      temporalCorrect =
        goldHits.length === allGold.length && !authorityViolation ? 1 : 0;
    }
  }

  // Supersession gate: when the query touches a declared pair, the successor
  // must be present and the predecessor must not appear in an eligible
  // (truth-bearing) position.
  let supersessionCorrect: 0 | 1 | null = null;
  const touchedPairs = SUPERSESSION_PAIRS.filter(
    ([pre, succ]) =>
      allGold.includes(pre) ||
      allGold.includes(succ) ||
      query.forbidden.some((f) => f.evidenceKeys.includes(pre) || f.evidenceKeys.includes(succ))
  );
  if (touchedPairs.length > 0) {
    let ok = true;
    for (const [pre, succ] of touchedPairs) {
      const succPresent =
        render.renderedEvidenceKeys.includes(succ) ||
        surfaces.some(
          (s) =>
            s.surface !== 'canonical_facts' &&
            s.retrieved.some((r) => r.evidenceKey === succ && r.rank <= s.effectiveK)
        ) ||
        surfaces.some((s) => {
          if (s.surface !== 'canonical_facts') return false;
          // facts render top-3 (effectiveK); claims render after facts.
          const factEntries = s.retrieved.filter((r) => r.evidenceKey.startsWith('FACT-'));
          return factEntries.slice(0, s.effectiveK).some((r) => r.evidenceKey === succ);
        });
      if (!succPresent) ok = false;
      // Predecessor in an eligible truth position = violation.
      const preInFactsTop = (() => {
        const factsSurface = surfaces.find((s) => s.surface === 'canonical_facts');
        if (!factsSurface) return false;
        const factEntries = factsSurface.retrieved.filter((r) => r.evidenceKey.startsWith('FACT-'));
        return factEntries.slice(0, factsSurface.effectiveK).some((r) => r.evidenceKey === pre);
      })();
      const preInPersonalSelection = (personalSurface?.retrieved ?? []).some(
        (r) => r.evidenceKey === pre
      );
      const preRenderedAsTruth = (render.renderedByAuthority[pre] ?? []).some((a) =>
        (TRUTH_AUTHORITIES as readonly string[]).includes(a)
      );
      if (preInFactsTop || preInPersonalSelection || preRenderedAsTruth) ok = false;
    }
    supersessionCorrect = ok ? 1 : 0;
  }

  // Founder-scope gate (personal surface always executes).
  const founderScopeCorrect: 0 | 1 =
    leakedFounderKeys.length === 0 && outcome.crossFounderProbe === 'BLOCKED_403' ? 1 : 0;

  return {
    query,
    surfaces,
    render,
    metrics: {
      perSurface,
      unionRecall,
      renderRecall,
      authorityCorrect,
      temporalCorrect,
      supersessionCorrect,
      founderScopeCorrect,
      boundaryCorrect,
    },
    failures,
  };
}

function aggregateResults(queries: QueryResult[]): BenchmarkRunResult['aggregate'] {
  const categories: BenchmarkCategory[] = [
    'TEMPORAL',
    'CHANGE_DETECTION',
    'MULTI_HOP',
    'ENTITY_CENTRIC',
    'CONTRADICTION_SUPERSESSION',
    'EPISODIC',
    'PERSONAL_MEMORY',
    'COMPANY_AUTHORITY',
  ];
  const perCategory = {} as BenchmarkRunResult['aggregate']['perCategory'];
  for (const category of categories) {
    const rows = queries.filter((q) => q.query.category === category);
    const mean = (nums: number[]) =>
      rows.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
    const renderValues = rows
      .map((r) => r.metrics.renderRecall)
      .filter((v): v is number => typeof v === 'number');
    perCategory[category] = {
      queryCount: rows.length,
      meanUnionRecall: mean(rows.map((r) => r.metrics.unionRecall)),
      meanRenderRecall:
        renderValues.length > 0
          ? renderValues.reduce((a, b) => a + b, 0) / renderValues.length
          : null,
      authorityCorrectCount: rows.filter((r) => r.metrics.authorityCorrect === 1).length,
      authorityApplicableCount: rows.filter((r) => r.metrics.authorityCorrect !== null).length,
      temporalCorrectCount: rows.filter((r) => r.metrics.temporalCorrect === 1).length,
      temporalApplicableCount: rows.filter((r) => r.metrics.temporalCorrect !== null).length,
      supersessionCorrectCount: rows.filter((r) => r.metrics.supersessionCorrect === 1).length,
      supersessionApplicableCount: rows.filter((r) => r.metrics.supersessionCorrect !== null).length,
      failureCount: rows.reduce((a, r) => a + r.failures.length, 0),
      failureClasses: rows.reduce<Record<string, number>>((acc, r) => {
        for (const f of r.failures) acc[f.failureClass] = (acc[f.failureClass] ?? 0) + 1;
        return acc;
      }, {}),
      primaryGaps: rows.reduce<Record<string, number>>((acc, r) => {
        for (const f of r.failures) acc[f.primaryGap] = (acc[f.primaryGap] ?? 0) + 1;
        return acc;
      }, {}),
      graphCandidateFailures: rows.reduce((a, r) => a + r.failures.filter((f) => f.graphCandidate).length, 0),
    };
  }
  const renderValues = queries
    .map((r) => r.metrics.renderRecall)
    .filter((v): v is number => typeof v === 'number');
  return {
    perCategory,
    overall: {
      queryCount: queries.length,
      meanUnionRecall:
        queries.reduce((a, r) => a + r.metrics.unionRecall, 0) / Math.max(1, queries.length),
      meanRenderRecall:
        renderValues.length > 0
          ? renderValues.reduce((a, b) => a + b, 0) / renderValues.length
          : null,
      failureCount: queries.reduce((a, r) => a + r.failures.length, 0),
      graphCandidateFailures: queries.reduce(
        (a, r) => a + r.failures.filter((f) => f.graphCandidate).length,
        0
      ),
    },
  };
}

export function evaluateBenchmark(outcomes: HarnessOutcome[]): BenchmarkRunResult {
  const queries = outcomes.map(evaluateOne);
  return {
    fixtureDigest: computeFixtureDigest(),
    baseline:
      'A1 — M5.2 retrieval hygiene (feat/m52-retrieval-hygiene); fixture and gold sets byte-identical to A0 @ b9d1504',
    queries,
    aggregate: aggregateResults(queries),
  };
}
