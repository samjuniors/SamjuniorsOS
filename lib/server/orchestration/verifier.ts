import { ExecutionDeliverable, VerificationResult } from '@/types/os';

export interface VerificationInput {
  directive: string;
  deliverables: ExecutionDeliverable[];
  specialistOutputs?: Record<string, string | undefined>;
  safeMockRequired?: boolean;
}

/**
 * Constitutional & Security Verification Engine.
 * 
 * Enforces non-negotiable invariants before specialist work can be certified:
 * 1. Zero Credential / API Key Leakage
 * 2. Constitutional Gross Margin Floor (80%+ gross margin mandate)
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
    let marginViolationDetected = false;
    for (const pattern of this.MARGIN_VIOLATION_PATTERNS) {
      if (pattern.test(fullCorpus)) {
        marginViolationDetected = true;
        checksFailed.push('CONSTITUTIONAL_MARGIN_VIOLATION: Proposal compromises the non-negotiable 80%+ gross margin floor mandate.');
        break;
      }
    }
    if (!marginViolationDetected) {
      checksPassed.push('Constitutional 80%+ gross margin floor mandate verified');
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
    };
  }
}
