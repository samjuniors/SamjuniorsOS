/**
 * ============================================================================
 * M5.4 — GENERATION-FAITHFULNESS HARNESS (assemble → generate → grade)
 * ============================================================================
 * One scenario run = three phases with different reproducibility contracts
 * (design §2):
 *   1. ASSEMBLE  — byte-deterministic (no LLM): SophiaContextAssembler over
 *                 the seeded frozen universe (adversarial variants are
 *                 harness-built copies — adversarial.ts); digests recorded.
 *   2. GENERATE  — the model under test: ONE governed zai-client call per
 *                 scenario run with pinned model/temperature/max-tokens and
 *                 a versioned prompt (prompt/1 baseline / prompt/2
 *                 remediation experiment); the FULL request+response is
 *                 archived (answer, usage, reported model, latencies, every
 *                 transport attempt).
 *   3. GRADE     — byte-deterministic pure graders (grade/1) over
 *                 (question, assembledContext, answer).
 *
 * FLAKE POLICY (design §4, learned from the audit-reproduced live-LLM 429
 * nondeterminism): transport/quota errors get BOUNDED retries with backoff;
 * every attempt is recorded verbatim in the run JSON; a scenario that could
 * not complete is marked GF_ENVIRONMENT_LIMITED and the battery is INVALID —
 * never silently dropped, never counted as passed, and always distinguishable
 * from an actual generation failure (a graded FAIL verdict is never retried
 * away).
 */

import { createHash } from 'crypto';
import { SophiaContextAssembler } from '../../src/lib/server/sophia';
import { getAIClient } from '../../src/lib/server/ai/zai-client';
import type { SophiaAssembledContext, SophiaContextSlice } from '../../src/lib/server/sophia/types';
import { SCENARIO_BATTERY, GOLD, type ScenarioSpec } from './scenarios';
import { buildPrompt, BASELINE_PROMPT_VERSION, type PromptVersion } from './prompts';
import { gradeAnswer, GRADER_VERSION, CRITICAL_FAILURE_CLASSES, type GfFailureClass } from './graders';
import {
  buildIrrelevantInjectionContext,
  buildStaleInjectionContext,
} from './adversarial';
import { computeFixtureDigest } from '../memory-retrieval/fixture';
import type { SeedResult } from '../memory-retrieval/seed';

// ---------------------------------------------------------------------------
// Generation pinning (recorded in every run artifact)
// ---------------------------------------------------------------------------

export const MODEL_UNDER_TEST = 'glm-4-plus';
export const GENERATION_PARAMS = { temperature: 0, maxTokens: 2048 } as const;

// ---------------------------------------------------------------------------
// Recorded artifact types
// ---------------------------------------------------------------------------

export interface GenerationAttempt {
  attempt: number;
  startedAt: string;
  latencyMs: number;
  outcome: 'completed' | 'transport-error';
  error?: string;
  contentLength?: number;
}

export interface ScenarioRunRecord {
  scenarioId: string;
  classId: string;
  className: string;
  question: string;
  contextMode: string;
  promptVersion: string;
  graderVersion: string;
  fixtureDigest: string;
  contextDigest: string;
  promptDigest: string;
  model: { requested: string; reported: string | null };
  generationParams: { temperature: number; maxTokens: number };
  attempts: GenerationAttempt[];
  /** The graded answer (null when the scenario was environment-limited). */
  answer: string | null;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  verdict: 'PASS' | 'FAIL' | 'ENVIRONMENT_LIMITED';
  failureClass: GfFailureClass | null;
  critical: boolean;
  details: string;
  checks: Array<{ id: string; passed: boolean; note?: string }>;
  injectedContext: string[];
  latencyMs: number;
  /** The exact assembled context (re-grading input — archived by design). */
  assembledContext: string;
  slices: Array<{ label: string; authority: string }>;
}

// ---------------------------------------------------------------------------
// Flake policy constants (bounded, recorded, deterministic in policy)
// ---------------------------------------------------------------------------

export const MAX_GENERATION_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = [2000, 8000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Transport/quota error detection (the documented flake classes). A
 * successfully-returned answer is NEVER retried, whatever it says — retrying
 * a graded answer would be optimizing for a desired result.
 */
function isTransportError(err: unknown): boolean {
  const e = err as { message?: string; status?: number; code?: string };
  const status = typeof e?.status === 'number' ? e.status : null;
  if (status !== null && (status === 429 || status >= 500)) return true;
  const text = `${e?.message ?? ''} ${e?.code ?? ''}`.toLowerCase();
  return /429|too many requests|rate.?limit|quota|overloaded|server error|internal error|\b5\d\d\b|econnreset|etimedout|timeout|fetch failed|network|unavailable|epipe|socket hang up/.test(
    text
  );
}

// ---------------------------------------------------------------------------
// Phase 1 — ASSEMBLE (byte-deterministic)
// ---------------------------------------------------------------------------

export interface AssembledScenarioContext {
  formattedContext: string;
  contextDigest: string;
  slices: SophiaContextSlice[];
  injected: string[];
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export async function assembleScenarioContext(
  spec: ScenarioSpec,
  seed: SeedResult
): Promise<AssembledScenarioContext> {
  const real = await SophiaContextAssembler.assemble({
    message: spec.question,
    founderId: seed.founderA,
  });

  if (spec.contextMode === 'real') {
    return {
      formattedContext: real.formattedContext,
      contextDigest: sha256(real.formattedContext),
      slices: real.slices,
      injected: [],
    };
  }

  if (spec.contextMode === 'adversarial-irrelevant') {
    const dependencyQuestion = SCENARIO_BATTERY.find((s) => s.scenarioId === 'S6')!.question;
    const dependencyAssembled = await SophiaContextAssembler.assemble({
      message: dependencyQuestion,
      founderId: seed.founderA,
    });
    const degraded = buildIrrelevantInjectionContext(real, dependencyAssembled);
    return {
      formattedContext: degraded.formattedContext,
      contextDigest: sha256(degraded.formattedContext),
      slices: degraded.slices,
      injected: degraded.injected,
    };
  }

  // adversarial-stale
  const degraded = buildStaleInjectionContext(real);
  return {
    formattedContext: degraded.formattedContext,
    contextDigest: sha256(degraded.formattedContext),
    slices: degraded.slices,
    injected: degraded.injected,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — GENERATE (model under test; bounded recorded retries)
// ---------------------------------------------------------------------------

interface GenerationResult {
  attempts: GenerationAttempt[];
  answer: string | null;
  usage: ScenarioRunRecord['usage'];
  reportedModel: string | null;
  latencyMs: number;
  environmentLimited: boolean;
}

export async function generateWithRetry(system: string, user: string): Promise<GenerationResult> {
  const zai = await getAIClient();
  const attempts: GenerationAttempt[] = [];
  const started = Date.now();

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const attemptStart = new Date().toISOString();
    const t0 = Date.now();
    try {
      const completion = await zai.chat.completions.create({
        model: MODEL_UNDER_TEST,
        temperature: GENERATION_PARAMS.temperature,
        max_tokens: GENERATION_PARAMS.maxTokens,
        messages: [
          { role: 'assistant', content: system },
          { role: 'user', content: user },
        ],
        thinking: { type: 'disabled' },
      });
      const latencyMs = Date.now() - t0;
      const content = completion?.choices?.[0]?.message?.content ?? '';
      attempts.push({
        attempt,
        startedAt: attemptStart,
        latencyMs,
        outcome: 'completed',
        contentLength: content.length,
      });
      return {
        attempts,
        answer: content,
        usage: completion?.usage
          ? {
              prompt_tokens: completion.usage.prompt_tokens,
              completion_tokens: completion.usage.completion_tokens,
              total_tokens: completion.usage.total_tokens,
            }
          : null,
        reportedModel: completion?.model ?? null,
        latencyMs: Date.now() - started,
        environmentLimited: false,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - t0;
      const isTransport = isTransportError(err);
      attempts.push({
        attempt,
        startedAt: attemptStart,
        latencyMs,
        outcome: 'transport-error',
        error: `${(err as { message?: string })?.message ?? String(err)}`.slice(0, 500),
      });
      if (!isTransport) {
        // A non-transport generation error is a HARNESS finding, not a flake:
        // record it and fail the scenario deterministically (no retry).
        return {
          attempts,
          answer: null,
          usage: null,
          reportedModel: null,
          latencyMs: Date.now() - started,
          environmentLimited: true,
        };
      }
      if (attempt < MAX_GENERATION_ATTEMPTS) {
        await sleep(RETRY_BACKOFF_MS[attempt - 1]);
      }
    }
  }

  return {
    attempts,
    answer: null,
    usage: null,
    reportedModel: null,
    latencyMs: Date.now() - started,
    environmentLimited: true,
  };
}

// ---------------------------------------------------------------------------
// Phases 1+2+3 — one scenario run
// ---------------------------------------------------------------------------

export interface BatteryOptions {
  /** Which versioned prompt the battery runs (default: the prompt/1 baseline). */
  promptVersion?: PromptVersion;
}

export async function runScenario(
  spec: ScenarioSpec,
  seed: SeedResult,
  promptVersion: PromptVersion = BASELINE_PROMPT_VERSION
): Promise<ScenarioRunRecord> {
  const assembled = await assembleScenarioContext(spec, seed);
  const prompt = buildPrompt(spec, assembled.formattedContext, promptVersion);
  const generation = await generateWithRetry(prompt.system, prompt.user);

  const base = {
    scenarioId: spec.scenarioId,
    classId: spec.classId,
    className: spec.className,
    question: spec.question,
    contextMode: spec.contextMode,
    promptVersion: prompt.promptVersion,
    graderVersion: GRADER_VERSION,
    fixtureDigest: computeFixtureDigest(),
    contextDigest: assembled.contextDigest,
    promptDigest: prompt.promptDigest,
    model: { requested: MODEL_UNDER_TEST, reported: generation.reportedModel },
    generationParams: { ...GENERATION_PARAMS },
    attempts: generation.attempts,
    answer: generation.answer,
    usage: generation.usage,
    injectedContext: assembled.injected,
    latencyMs: generation.latencyMs,
    assembledContext: assembled.formattedContext,
    slices: assembled.slices.map((s) => ({ label: s.label, authority: s.authority })),
  };

  if (generation.environmentLimited || generation.answer === null) {
    return {
      ...base,
      verdict: 'ENVIRONMENT_LIMITED',
      failureClass: 'GF_ENVIRONMENT_LIMITED',
      critical: false,
      details:
        'Generation could not complete within the bounded retry policy (transport/quota). ' +
        'This is NOT a verdict — the battery is invalid and must be re-run.',
      checks: [],
    };
  }

  const verdict = gradeAnswer({
    scenarioId: spec.scenarioId,
    question: spec.question,
    assembledContext: assembled.formattedContext,
    answer: generation.answer,
  });

  return {
    ...base,
    verdict: verdict.verdict,
    failureClass: verdict.failureClass,
    critical: verdict.verdict === 'FAIL' && verdict.failureClass !== null && CRITICAL_FAILURE_CLASSES.has(verdict.failureClass),
    details: verdict.details,
    checks: verdict.checks,
  };
}

// ---------------------------------------------------------------------------
// Battery
// ---------------------------------------------------------------------------

export interface BatterySummary {
  total: number;
  passed: number;
  failed: number;
  environmentLimited: number;
  criticalViolations: string[];
  byFailureClass: Record<string, number>;
  retriesUsed: number;
}

export interface BatteryOutcome {
  scenarios: ScenarioRunRecord[];
  summary: BatterySummary;
  batteryValid: boolean;
  allScenariosPass: boolean;
  zeroCritical: boolean;
}

export function summarizeBattery(scenarios: ScenarioRunRecord[]): BatteryOutcome {
  const byFailureClass: Record<string, number> = {};
  for (const s of scenarios) {
    if (s.failureClass) byFailureClass[s.failureClass] = (byFailureClass[s.failureClass] ?? 0) + 1;
  }
  const summary: BatterySummary = {
    total: scenarios.length,
    passed: scenarios.filter((s) => s.verdict === 'PASS').length,
    failed: scenarios.filter((s) => s.verdict === 'FAIL').length,
    environmentLimited: scenarios.filter((s) => s.verdict === 'ENVIRONMENT_LIMITED').length,
    criticalViolations: scenarios.filter((s) => s.critical).map((s) => `${s.scenarioId}:${s.failureClass}`),
    byFailureClass,
    retriesUsed: scenarios.reduce((n, s) => n + Math.max(0, s.attempts.length - 1), 0),
  };
  return {
    scenarios,
    summary,
    batteryValid: summary.environmentLimited === 0,
    allScenariosPass: summary.failed === 0 && summary.environmentLimited === 0,
    zeroCritical: summary.criticalViolations.length === 0,
  };
}

export async function runBattery(seed: SeedResult, opts: BatteryOptions = {}): Promise<BatteryOutcome> {
  const promptVersion = opts.promptVersion ?? BASELINE_PROMPT_VERSION;
  const scenarios: ScenarioRunRecord[] = [];
  for (const spec of SCENARIO_BATTERY) {
    const record = await runScenario(spec, seed, promptVersion);
    const flag = record.verdict === 'PASS' ? 'PASS' : record.verdict === 'FAIL' ? `FAIL(${record.failureClass})` : 'ENV-LIMITED';
    process.stderr.write(`  ${record.scenarioId.padEnd(5)} ${flag}${record.attempts.length > 1 ? ` [${record.attempts.length} attempts]` : ''}\n`);
    scenarios.push(record);
  }
  return summarizeBattery(scenarios);
}

/** Exported for the regrade test: pure re-grade of an archived record. */
export function regradeArchived(record: ScenarioRunRecord): ScenarioRunRecord['verdict'] {
  if (record.verdict === 'ENVIRONMENT_LIMITED' || record.answer === null) return 'ENVIRONMENT_LIMITED';
  return gradeAnswer({
    scenarioId: record.scenarioId,
    question: record.question,
    assembledContext: record.assembledContext,
    answer: record.answer,
  }).verdict;
}

// Convenience re-export for the CLI/tests.
export { GOLD };
