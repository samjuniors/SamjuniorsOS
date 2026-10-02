/**
 * ============================================================================
 * M5.1 — REPORT RENDERER (deterministic markdown from a run result)
 * ============================================================================
 * Pure function: BenchmarkRunResult → markdown. No clock, no environment
 * reads — the same result always renders the same report.
 */

import type { BenchmarkRunResult, QueryResult } from './types';

function pct(v: number | null | undefined): string {
  if (typeof v !== 'number') return 'n/a';
  return `${(v * 100).toFixed(0)}%`;
}

function renderQuery(q: QueryResult): string {
  const lines: string[] = [];
  lines.push(`### ${q.query.queryId} — ${q.query.category}`);
  lines.push('');
  lines.push(`> "${q.query.queryText}"`);
  lines.push('');
  lines.push(`| surface | K | gold | retrieved | Recall@K | Precision@K | MRR |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  for (const row of q.metrics.perSurface) {
    lines.push(
      `| ${row.surface} | ${row.k} | ${row.goldCount} | ${row.retrievedCount} | ` +
        `${pct(row.recallAtK)} | ${pct(row.precisionAtK)} | ` +
        `${row.mrr === null ? '—' : row.mrr.toFixed(2)} |`
    );
  }
  lines.push('');
  lines.push(
    `Union recall: **${pct(q.metrics.unionRecall)}** · Render recall: **${pct(q.metrics.renderRecall)}** · ` +
      `Authority: ${q.metrics.authorityCorrect === null ? 'n/a' : q.metrics.authorityCorrect ? 'PASS' : 'FAIL'} · ` +
      `Temporal: ${q.metrics.temporalCorrect === null ? 'n/a' : q.metrics.temporalCorrect ? 'PASS' : 'FAIL'} · ` +
      `Supersession: ${q.metrics.supersessionCorrect === null ? 'n/a' : q.metrics.supersessionCorrect ? 'PASS' : 'FAIL'} · ` +
      `Founder scope: ${q.metrics.founderScopeCorrect ? 'PASS' : 'FAIL'} · ` +
      `Boundary: ${q.metrics.boundaryCorrect ? 'PASS' : 'FAIL'}`
  );
  if (q.failures.length > 0) {
    lines.push('');
    lines.push(`Measured failures (${q.failures.length}):`);
    for (const f of q.failures) {
      lines.push(
        `- **${f.evidenceKey}** (${f.surface}, ${f.kind}, class ${f.failureClass}, ` +
          `primary gap ${f.primaryGap}${f.graphCandidate ? ' — GRAPH CANDIDATE' : ''}): ${f.explanation}`
      );
    }
  } else {
    lines.push('');
    lines.push('No measured failures.');
  }
  lines.push('');
  return lines.join('\n');
}

export function renderMarkdownReport(result: BenchmarkRunResult): string {
  const out: string[] = [];
  out.push('# Memory Retrieval Benchmark — Run Results');
  out.push('');
  out.push(`- Baseline: ${result.baseline}`);
  out.push(`- Fixture digest (SHA-256): \`${result.fixtureDigest}\``);
  out.push(`- Queries: ${result.queries.length} · Failures: ${result.aggregate.overall.failureCount} · ` +
    `Graph-candidate failures: ${result.aggregate.overall.graphCandidateFailures}`);
  out.push('');

  out.push('## Per-category summary');
  out.push('');
  out.push('| category | queries | union recall | render recall | authority | temporal | supersession | failures | graph-candidates |');
  out.push('|---|---|---|---|---|---|---|---|---|');
  for (const [category, stats] of Object.entries(result.aggregate.perCategory)) {
    out.push(
      `| ${category} | ${stats.queryCount} | ${pct(stats.meanUnionRecall)} | ${pct(stats.meanRenderRecall)} | ` +
        `${stats.authorityCorrectCount}/${stats.authorityApplicableCount} | ` +
        `${stats.temporalCorrectCount}/${stats.temporalApplicableCount} | ` +
        `${stats.supersessionCorrectCount}/${stats.supersessionApplicableCount} | ` +
        `${stats.failureCount} | ${stats.graphCandidateFailures} |`
    );
  }
  out.push('');

  out.push('## Primary gap distribution (all failures)');
  out.push('');
  const gapTotals = new Map<string, number>();
  for (const stats of Object.values(result.aggregate.perCategory)) {
    for (const [gap, count] of Object.entries(stats.primaryGaps)) {
      gapTotals.set(gap, (gapTotals.get(gap) ?? 0) + count);
    }
  }
  const sortedGaps = [...gapTotals.entries()].sort((a, b) => b[1] - a[1]);
  if (sortedGaps.length === 0) {
    out.push('No failures measured.');
  } else {
    out.push('| primary gap | count |');
    out.push('|---|---|');
    for (const [gap, count] of sortedGaps) out.push(`| ${gap} | ${count} |`);
  }
  out.push('');

  out.push('## Per-query detail');
  out.push('');
  for (const q of result.queries) out.push(renderQuery(q));

  out.push('---');
  out.push('');
  out.push(
    'NOTE: GENERATION failures are structurally unmeasurable by this harness ' +
    '(no model call is made). Every failure above is RETRIEVAL or ' +
    'AUTHORITY_LIFECYCLE. A generation layer consuming this exact context ' +
    'could still produce a wrong answer; that failure class is out of scope ' +
    'and must be measured by a separate generation-side harness.'
  );
  return out.join('\n');
}
