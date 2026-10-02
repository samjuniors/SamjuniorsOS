/**
 * ============================================================================
 * M5.4 — VERSIONED PROMPT TEMPLATES (prompt/1, prompt/2)
 * ============================================================================
 * DESIGN DECISION (M5_4_GENERATION_FAITHFULNESS_DESIGN.md §2): the harness
 * uses its OWN versioned prompts that embed the assembled context slices
 * VERBATIM, including their authority labels — NOT the evolving production
 * persona prompt. The variable under test is CONTEXT USAGE; coupling the
 * benchmark to a product prompt would make verdicts non-reproducible across
 * product changes and would measure prompt engineering, not faithfulness.
 *
 * The citation instruction (design §2 citation contract) is included ONLY in
 * the S9 variant (requireCitations flag) — it exists to make provenance
 * behavior measurable; the grader checks cited keys are real and supplied,
 * never that prose is fluent.
 *
 * VERSIONS (design §8 "Prompt optimization": increments allowed ONLY as
 * versioned prompt/2+ with archived before/after batteries; questions and
 * gold stay frozen):
 *
 *   prompt/1 — the M5.4 baseline: the four-clause contract. BYTE-FROZEN: its
 *              digests are pinned by the committed run-g* baseline batteries
 *              (the regrade suite rebuilds them byte-exactly), so any edit
 *              to this text is a new version, never a silent change.
 *   prompt/2 — the M5.4 remediation experiment
 *              (docs/architecture/M5_4_PROMPT2_REMEDIATION.md): adds ONE
 *              general clause (5) on transitive relationships and
 *              completeness, and renumbers the S9 citation clause to 6.
 *              It is a GENERAL instruction — no fixture entity, no scenario
 *              answer, no dependency path (pinned offline by the
 *              scenario-contract suite, CD3). Everything else is
 *              byte-identical to prompt/1.
 *
 * Everything here is deterministic: same inputs → byte-identical prompt →
 * same digest (pinned by the offline scenario-contract suite).
 */

import { createHash } from 'crypto';
import type { ScenarioSpec } from './scenarios';

export type PromptVersion = 'prompt/1' | 'prompt/2';

/** The immutable M5.4 baseline — also the default when no version is requested. */
export const BASELINE_PROMPT_VERSION: PromptVersion = 'prompt/1';

export const SYSTEM_INSTRUCTION_BASE = [
  'You are Sophia, the AI chief of staff for SamJuniors. Answer the founder\'s question strictly from the assembled company context provided below.',
  '',
  'Contract:',
  '1. Use only the supplied context. Never invent facts, figures, entities, dates, or metrics.',
  '2. If the context does not contain the evidence needed to answer, say so explicitly (for example: "not in my records", "I don\'t have that information") instead of guessing.',
  '3. Respect the authority labels of each context block: canonical facts and operational state are company truth; superseded facts are historical only; personal memory is never company truth.',
  '4. When records conflict, the newest dated authoritative record is the current truth; older values belong to their time and must be attributed as such.',
].join('\n');

export const CITATION_INSTRUCTION =
  '5. When you state a fact from the context, cite the evidence record it came from, e.g. [FACT-...].';

/**
 * prompt/2 experiment clause (M5.4 remediation): a GENERAL instruction on
 * transitive relationships and completeness. Deliberately contains NO
 * fixture-specific entity, scenario, or expected output — pinned offline by
 * the scenario-contract suite (CD3). Answers stay normal and concise; this
 * is not a request for chain-of-thought.
 */
export const RELATIONSHIP_INSTRUCTION =
  '5. When a question asks about relationships between entities (for example, dependencies), inspect all supplied evidence for directly supported relationships AND relationships that follow transitively: if the evidence shows A depends on B and B depends on C, then A also depends on C. Distinguish direct from transitive relationships in your answer, and never claim a list is complete or exhaustive unless the supplied evidence explicitly establishes that.';

/** Same citation contract as prompt/1, renumbered to follow clause 5. */
export const CITATION_INSTRUCTION_V2 =
  '6. When you state a fact from the context, cite the evidence record it came from, e.g. [FACT-...].';

export interface PromptDefinition {
  version: PromptVersion;
  /** The contract clauses 1..N (the system message when citations are not required). */
  systemBase: string;
  /** The citation clause appended for S9 (requireCitations). */
  citationClause: string;
}

export const PROMPT_VERSIONS: Record<PromptVersion, PromptDefinition> = {
  'prompt/1': {
    version: 'prompt/1',
    systemBase: SYSTEM_INSTRUCTION_BASE,
    citationClause: CITATION_INSTRUCTION,
  },
  'prompt/2': {
    version: 'prompt/2',
    systemBase: `${SYSTEM_INSTRUCTION_BASE}\n${RELATIONSHIP_INSTRUCTION}`,
    citationClause: CITATION_INSTRUCTION_V2,
  },
};

export interface BuiltPrompt {
  promptVersion: string;
  /** The exact system instruction (assistant-role leading message). */
  system: string;
  /** The exact user message content. */
  user: string;
  /** SHA-256 over the canonical serialization of {system, user}. */
  promptDigest: string;
}

/** Builds the requested prompt version for one scenario over the verbatim assembled context. */
export function buildPrompt(
  spec: ScenarioSpec,
  assembledContext: string,
  version: PromptVersion = BASELINE_PROMPT_VERSION
): BuiltPrompt {
  const def = PROMPT_VERSIONS[version];
  if (!def) {
    throw new Error(`Unknown prompt version: ${String(version)} (known: ${Object.keys(PROMPT_VERSIONS).join(', ')})`);
  }

  const system = spec.requireCitations
    ? `${def.systemBase}\n${def.citationClause}`
    : def.systemBase;

  const user = [
    'ASSEMBLED CONTEXT (authority-labeled, verbatim):',
    '"""',
    assembledContext,
    '"""',
    '',
    `FOUNDER'S QUESTION:`,
    spec.question,
    '',
    'Answer the founder\'s question now.',
  ].join('\n');

  const promptDigest = createHash('sha256')
    .update(JSON.stringify({ system, user }))
    .digest('hex');

  return { promptVersion: def.version, system, user, promptDigest };
}
