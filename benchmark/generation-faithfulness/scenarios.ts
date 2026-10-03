/**
 * ============================================================================
 * M5.4 — GENERATION-FAITHFULNESS SCENARIO BATTERY (specification)
 * ============================================================================
 * The 10 scenario classes from
 * docs/architecture/M5_4_GENERATION_FAITHFULNESS_DESIGN.md §3, grounded in the
 * FROZEN M5.1/M5.2/M5.3 fixture universe (digest 40e53f15…). NOTHING here
 * modifies the fixture, the gold sets, the retrieval benchmark, or production
 * code: a scenario is a question + a context mode + the grader it is judged
 * by. The context is ALWAYS produced by the real SophiaContextAssembler
 * (adversarial variants are harness-built DEGRADED COPIES — see
 * adversarial.ts; the production assembler is untouched).
 *
 * Executed scenario set: 12 runs covering the 10 required classes
 * (S7 has two sub-cases a/b; S10 has two context variants a/b — the design
 * doc counts S10's variants as one scenario class, hence its "11 scenarios";
 * the executed-call count per battery is 12 and is recorded honestly in the
 * run artifacts).
 *
 * Question phrasings are chosen so the CANONICAL deterministic intent routing
 * fires the context path the design specifies for each class (the intent
 * detectors are pure regex — see retrieval/temporal-semantics.ts and
 * retrieval/dependency-relations.ts). Notably:
 *   - S3/S5 use HISTORY-intent phrasings because the M5.2 SUPERSEDED_FACT
 *     projection (slice 4A2) is gated on history intent, and the temporal cue
 *     precedence is WINDOW > CURRENT > HISTORY (a question containing "now"
 *     would route CURRENT and never render the historical slice).
 *   - S4 uses a CURRENT-intent phrasing so slice 4A2 must NOT render.
 */

export type ScenarioContextMode =
  | 'real'
  | 'adversarial-irrelevant' // S10a: real context + prominent irrelevant slices
  | 'adversarial-stale'; // S10b: real context + stale $29 injected into the CANONICAL_FACT slice

export type GraderId =
  | 'supported-fact'
  | 'unsupported-claim'
  | 'current-vs-historical'
  | 'supersession'
  | 'temporal-asof'
  | 'dependency-path'
  | 'company-personal-boundary'
  | 'insufficient-evidence'
  | 'provenance'
  | 'adversarial-irrelevant'
  | 'adversarial-stale';

export interface ScenarioSpec {
  scenarioId: string;
  /** The 10 required classes (S7a/S7b share classId S7; S10a/S10b share S10). */
  classId: string;
  className: string;
  question: string;
  contextMode: ScenarioContextMode;
  graderId: GraderId;
  /** Only S9 instructs citation (the design's provenance-measurement contract). */
  requireCitations: boolean;
}

export const SCENARIO_BATTERY: ScenarioSpec[] = [
  {
    scenarioId: 'S1',
    classId: 'S1',
    className: 'SUPPORTED FACT',
    question: 'What is the Lumora Starter tier price?',
    contextMode: 'real',
    graderId: 'supported-fact',
    requireCitations: false,
  },
  {
    scenarioId: 'S2',
    classId: 'S2',
    className: 'UNSUPPORTED CLAIM',
    question: "What is SamJuniors' net revenue retention (NRR)?",
    contextMode: 'real',
    graderId: 'unsupported-claim',
    requireCitations: false,
  },
  {
    scenarioId: 'S3',
    classId: 'S3',
    className: 'CURRENT VS HISTORICAL',
    question: 'What did the Lumora Starter tier cost before the pricing change, and what does it cost after the change?',
    contextMode: 'real',
    graderId: 'current-vs-historical',
    requireCitations: false,
  },
  {
    scenarioId: 'S4',
    classId: 'S4',
    className: 'SUPERSESSION',
    question: 'What is the current price of the Lumora Starter tier?',
    contextMode: 'real',
    graderId: 'supersession',
    requireCitations: false,
  },
  {
    scenarioId: 'S5',
    classId: 'S5',
    className: 'TEMPORAL AS-OF',
    question: 'As of August 1, 2026, what was the Lumora Starter tier price?',
    contextMode: 'real',
    graderId: 'temporal-asof',
    requireCitations: false,
  },
  {
    scenarioId: 'S6',
    classId: 'S6',
    className: 'DEPENDENCY PATH',
    question: 'Which services depend on the Helix Identity Store?',
    contextMode: 'real',
    graderId: 'dependency-path',
    requireCitations: false,
  },
  {
    scenarioId: 'S7a',
    classId: 'S7',
    className: 'PERSONAL/COMPANY BOUNDARY (company answer)',
    question: "What is SamJuniors' official monthly burn rate?",
    contextMode: 'real',
    graderId: 'company-personal-boundary',
    requireCitations: false,
  },
  {
    scenarioId: 'S7b',
    classId: 'S7',
    className: 'PERSONAL/COMPANY BOUNDARY (personal answer)',
    question: 'What are my current dashboard preferences?',
    contextMode: 'real',
    graderId: 'company-personal-boundary',
    requireCitations: false,
  },
  {
    scenarioId: 'S8',
    classId: 'S8',
    className: 'INSUFFICIENT EVIDENCE',
    question: 'What is our customer churn rate?',
    contextMode: 'real',
    graderId: 'insufficient-evidence',
    requireCitations: false,
  },
  {
    scenarioId: 'S9',
    classId: 'S9',
    className: 'PROVENANCE',
    question: 'Which services depend on the Helix Identity Store? Cite the evidence records you use.',
    contextMode: 'real',
    graderId: 'provenance',
    requireCitations: true,
  },
  {
    scenarioId: 'S10a',
    classId: 'S10',
    className: 'ADVERSARIAL CONTEXT (irrelevant injection)',
    question: 'What is the Lumora Starter tier price?',
    contextMode: 'adversarial-irrelevant',
    graderId: 'adversarial-irrelevant',
    requireCitations: false,
  },
  {
    scenarioId: 'S10b',
    classId: 'S10',
    className: 'ADVERSARIAL CONTEXT (stale injection)',
    question: 'What is the Lumora Starter tier price?',
    contextMode: 'adversarial-stale',
    graderId: 'adversarial-stale',
    requireCitations: false,
  },
];

/**
 * Fixture-grounded constants shared by the graders (all values exist in the
 * frozen fixture — verified by the scenario-contract offline suite; NO
 * fixture additions were made, which is the point).
 */
export const GOLD = {
  currentPrice: 49,
  oldPrice: 29,
  burn: 34000,
  mrr: 18500,
  arr: 222000,
  runwayMonths: 14,
  goldDependents: ['aurorium auth service', 'nimbus gateway'],
  dependencyAnchor: 'helix identity store',
  /** Fixture entity set (normalized) for S6's forbidden-dependent check. */
  fixtureEntities: [
    'lumora',
    'lumora api',
    'aurorium',
    'aurorium auth service',
    'nimbus gateway',
    'helix analytics',
    'helix identity store',
    'samjuniors',
  ],
  /** PM-06 (current personal truth for S7b) vs PM-05 (superseded). */
  pm06Fingerprints: ['shared dashboard', 'strategy updates in the shared dashboard'],
  pm05Fingerprints: ['weekly strategy updates sent by email', 'updates sent by email'],
  /** Distinctive personal-memory phrases (S7a/S10a leakage detection). */
  personalContentFingerprints: [
    'paper journal',
    'afternoon walks',
    'short written briefings',
    'bullet-point summaries',
    'phone calls for urgent decisions',
    'early-morning meetings',
    'tight and terse',
    'slack pings',
    'healthier than last year',
    'video calls for deep work',
    'friday afternoon',
  ],
  /** The as-of instant framed by the S5 question. */
  asOfInstant: { month: 'august', iso: '2026-08-01' },
} as const;
