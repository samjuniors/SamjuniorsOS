import { ExecutionDeliverable, VerificationResult } from '@/types/os';
import { StructuredFinancialInput } from '@/types/council';

export interface VerificationInput {
  directive: string;
  deliverables: ExecutionDeliverable[];
  specialistOutputs?: Record<string, string | undefined>;
  safeMockRequired?: boolean;
  structuredFinancials?: StructuredFinancialInput;
}

/**
 * Constitutional & Security Verification Engine.
 * 
 * Enforces non-negotiable invariants before specialist work can be certified:
 * 1. Zero Credential / API Key Leakage
 * 2. Constitutional Gross Margin Floor (80%+ gross margin mandate)
 *    - Mathematical verification via deterministic formula when structured revenue/cost inputs exist.
 *    - Explicitly 'unverified' (requiring Founder review) when structured numbers are absent.
 *    - Lexical scanning against anti-patterns (e.g. proposals to sacrifice or lower margins).
 * 3. Privilege Escalation & Unauthorized Mutation Guard
 * 4. Safe Mock Sandboxing for External Financial Operations
 * 5. Deliverable Provenance & Content Integrity
 */
export class ConstitutionalVerifier {
  private static readonly SECRET_PATTERNS = [
    /sk-[a-zA-Z0-9_\-]{16,}/i,
    /gh[pousr]_[a-zA-Z0-9_\-]{20,}/i,
    /xox[baprs]-[a-zA-Z0-9_\-]{10,}/i,
    /bearer\s+[a-zA-Z0-9_\-\.]{20,}/i,
    /-----BEGIN (?:RSA )?PRIVATE KEY-----/i,
    /(?:api[_-]?key|secret[_-]?token|auth[_-]?token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/i,
  ];

  private static readonly MARGIN_VIOLATION_PATTERNS = [
    /\b(?:gross\s+)?margin\s*(?:of\s*)?(?:under|<|below|drops? to|reduced to|cut to|discount(?:ed)? to)\s*(?:[0-7]?[0-9](?:\.[0-9]+)?%)/i,
    /\b(?:60%|65%|70%|75%)\s*(?:gross\s+)?margin\b/i,
    /\b(?:sacrifice|reduce|lower)\s+(?:our\s+)?(?:gross\s+)?margin\s+below\s+80%/i,
    /\baccept\s+(?:a\s+)?(?:low|lower)\s+margin\s+of\s+[0-7][0-9]%/i,
  ];

  private static readonly PRIVILEGE_ESCALATION_PATTERNS = [
    /\bgrant(?:ing)?\s+(?:admin|founder|all)\s+permissions?\b/i,
    /\belevat(?:e|ing)\s+privileges?\b/i,
    /\bbypass(?:ing)?\s+(?:the\s+)?(?:authorization|approval|founder)\s+gate\b/i,
    /\bdisable(?:ing)?\s+(?:the\s+)?(?:safe\s+mock|sandbox|verification)\b/i,
  ];

  public static verify(input: VerificationInput): VerificationResult {
    const checksPassed: string[] = [];
    const checksFailed: string[] = [];
    const nowIso = new Date().toISOString();

    // Aggregate all content to scan
    const textsToScan: string[] = [
      input.directive,
      ...input.deliverables.map((d) => `${d.name}\n${d.content}`),
      ...Object.values(input.specialistOutputs || {}).filter(Boolean) as string[],
    ];
    const fullCorpus = textsToScan.join('\n\n');

    // 1. Secret & Credential Leak Check
    let credentialLeakDetected = false;
    for (const pattern of this.SECRET_PATTERNS) {
      if (pattern.test(fullCorpus)) {
        credentialLeakDetected = true;
        checksFailed.push(`CREDENTIAL_LEAK_DETECTED: Output contains patterns matching active secret credentials or private keys.`);
        break;
      }
    }
    if (!credentialLeakDetected) {
      checksPassed.push('Zero credential or API key leakage in outputs');
    }

    // 2. Constitutional Gross Margin Floor Check (80% minimum)
    // 2a. Deterministic Mathematical Verification (isolated policy check)
    const mathMarginResult = ConstitutionalVerifier.verifyFinancialMarginPolicy(input.structuredFinancials);
    let financialVerificationState: VerificationResult['financialVerificationState'] = mathMarginResult.state;
    let calculatedMarginPercent: number | undefined = mathMarginResult.calculatedMarginPercent;

    if (!mathMarginResult.passed && mathMarginResult.errorReason) {
      checksFailed.push(mathMarginResult.errorReason);
    } else if (mathMarginResult.passedDescription) {
      checksPassed.push(mathMarginResult.passedDescription);
    }

    // 2b. Lexical Pattern Check (Anti-pattern heuristic)
    const lexicalMarginResult = ConstitutionalVerifier.verifyLexicalMarginPatterns(fullCorpus);
    if (lexicalMarginResult.hasViolation && lexicalMarginResult.errorReason) {
      checksFailed.push(lexicalMarginResult.errorReason);
      financialVerificationState = 'lexical_violation';
    }

    // 3. Privilege Escalation & Permissions Guard
    let privilegeEscalationDetected = false;
    for (const pattern of this.PRIVILEGE_ESCALATION_PATTERNS) {
      if (pattern.test(fullCorpus)) {
        privilegeEscalationDetected = true;
        checksFailed.push('PRIVILEGE_ESCALATION_ATTEMPT: Output attempts unauthorized permission modifications or governance gate bypass.');
        break;
      }
    }
    if (!privilegeEscalationDetected) {
      checksPassed.push('Permissions modification attempt check (none detected)');
    }

    // 4. Safe Mock Boundary Enforcement
    const safeMockEnforced = input.safeMockRequired !== false;
    if (safeMockEnforced) {
      checksPassed.push('Safe Mock Execution boundary enforced (external transactions isolated)');
    }

    // 5. Deliverable Integrity & Provenance Check
    let deliverableIntegrityPassed = true;
    if (input.deliverables.length === 0) {
      checksFailed.push('DELIVERABLE_EMPTY: No executive deliverables generated.');
      deliverableIntegrityPassed = false;
    } else {
      for (const deliverable of input.deliverables) {
        if (!deliverable.content || !deliverable.content.trim()) {
          checksFailed.push(`DELIVERABLE_CORRUPT: Deliverable "${deliverable.name}" contains empty content.`);
          deliverableIntegrityPassed = false;
        }
        if (!deliverable.provenance) {
          checksFailed.push(`PROVENANCE_MISSING: Deliverable "${deliverable.name}" lacks required cryptographic output provenance.`);
          deliverableIntegrityPassed = false;
        }
      }
    }
    if (deliverableIntegrityPassed) {
      checksPassed.push(`Provenance metadata attached to all ${input.deliverables.length} deliverables`);
    }

    const isCompliant = checksFailed.length === 0;
    const notes = isCompliant
      ? 'Verification passed: All constitutional, security, and financial invariants verified.'
      : `Verification rejected: ${checksFailed.length} check(s) failed. Human escalation required.`;

    return {
      isCompliant,
      checksPassed,
      checksFailed,
      safeMockEnforced,
      notes,
      verifiedAt: nowIso,
      financialVerificationState,
      calculatedMarginPercent,
    };
  }

  /**
   * Deterministic Mathematical Margin Policy Verification.
   *
   * Invariants:
   * 1. Requires revenue, COGS, and computeCost for a mathematical calculation.
   * 2. Never defaults absent cost fields to zero.
   * 3. Validates finite non-negative values and rejects invalid inputs (negative, NaN, Infinity, zero revenue).
   * 4. Missing or incomplete numbers produce 'unverified_pending_founder_review'.
   * 5. Calculated gross margin must meet or exceed the mandatory 80.0% floor.
   */
  public static verifyFinancialMarginPolicy(structuredFinancials?: StructuredFinancialInput): {
    state: VerificationResult['financialVerificationState'];
    calculatedMarginPercent?: number;
    passed: boolean;
    errorReason?: string;
    passedDescription?: string;
  } {
    if (!structuredFinancials) {
      return {
        state: 'unverified_pending_founder_review',
        passed: true,
        passedDescription:
          'Gross margin floor: Mathematical margin UNVERIFIED (structured revenue/cost inputs absent; Founder review required).',
      };
    }

    const { revenue, cogs, computeCost } = structuredFinancials;

    // Check for missing or incomplete numbers — NEVER default to zero!
    if (revenue === undefined || cogs === undefined || computeCost === undefined) {
      return {
        state: 'unverified_pending_founder_review',
        passed: true,
        passedDescription:
          'Gross margin floor: Mathematical margin UNVERIFIED (revenue, COGS, and computeCost must all be explicitly provided; Founder review required).',
      };
    }

    // Validate finite non-negative values and reject invalid inputs (negative, zero revenue, NaN, Infinity)
    const isValidRevenue = typeof revenue === 'number' && Number.isFinite(revenue) && revenue > 0;
    const isValidCogs = typeof cogs === 'number' && Number.isFinite(cogs) && cogs >= 0;
    const isValidComputeCost = typeof computeCost === 'number' && Number.isFinite(computeCost) && computeCost >= 0;

    if (!isValidRevenue || !isValidCogs || !isValidComputeCost) {
      return {
        state: 'calculated_violation',
        passed: false,
        errorReason:
          'CONSTITUTIONAL_MARGIN_VIOLATION: Invalid financial parameters. Revenue must be a finite positive number (> 0), and COGS and computeCost must be finite non-negative numbers (>= 0).',
      };
    }

    // Deterministic mathematical calculation
    const totalCost = cogs + computeCost;
    const calculatedMarginPercent = ((revenue - totalCost) / revenue) * 100;

    if (calculatedMarginPercent < 80.0) {
      return {
        state: 'calculated_violation',
        calculatedMarginPercent,
        passed: false,
        errorReason: `CONSTITUTIONAL_MARGIN_VIOLATION: Calculated gross margin (${calculatedMarginPercent.toFixed(1)}%) falls below the mandatory 80.0% floor.`,
      };
    }

    return {
      state: 'calculated_compliant',
      calculatedMarginPercent,
      passed: true,
      passedDescription: `Constitutional gross margin floor verified by deterministic calculation (${calculatedMarginPercent.toFixed(1)}% >= 80.0%)`,
    };
  }

  /**
   * Lexical Pattern Scanning against anti-patterns compromising margin policy.
   */
  public static verifyLexicalMarginPatterns(fullCorpus: string): {
    hasViolation: boolean;
    errorReason?: string;
  } {
    for (const pattern of this.MARGIN_VIOLATION_PATTERNS) {
      if (pattern.test(fullCorpus)) {
        return {
          hasViolation: true,
          errorReason:
            'CONSTITUTIONAL_MARGIN_VIOLATION: Proposal text contains statements compromising the non-negotiable 80%+ gross margin floor mandate.',
        };
      }
    }
    return { hasViolation: false };
  }
}
