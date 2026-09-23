import {
  SOPHIA_MEMORY_TYPES,
  SOPHIA_MEMORY_CONTENT_MAX_CHARS,
  SOPHIA_MEMORY_PROVENANCE_MAX_CHARS,
  SophiaMemoryType,
} from './personal-memory-store';
import { evaluateAuthorityContent } from './authority-content-guard';

/**
 * ============================================================================
 * SOPHIA MEMORY GATE (M4-A — deterministic capture gate)
 * ============================================================================
 * Small, pure, deterministic validation module that decides what may become a
 * PERSISTED personal-memory candidate. The LLM extraction layer may only
 * PROPOSE candidates; every decision below is made by deterministic code.
 *
 * DETERMINISTIC vs LLM RESPONSIBILITY (M4-A contract):
 *   The LLM (SophiaMemoryExtractor) may propose:
 *     - that a personal preference/fact might exist
 *     - a memoryType, normalized content, a confidence
 *   The LLM must NEVER decide:
 *     - founder identity, authorization, or ownership
 *     - whether secrets are allowed
 *     - whether instruction-shaped content is allowed
 *     - whether content belongs to the Company Brain
 *     - persistence, idempotency, lifecycle, provenance, audit state
 *   Those decisions are made HERE and by the capture stage — deterministically.
 *
 * M4-A DECISION MODEL (explicit):
 *   REJECT       — the candidate is NOT persisted (no record is written).
 *   NEEDS_REVIEW — the candidate is persisted as an INACTIVE personal-memory
 *                  candidate; ONLY an explicit Founder confirmation (the
 *                  governed PATCH active:true on /api/sofia/memory) can
 *                  activate it.
 *   ACCEPT       — EXISTS IN THE TYPE FOR FUTURE COMPATIBILITY ONLY.
 *                  M4-A NEVER RETURNS ACCEPT: there is NO operational
 *                  ACCEPT path and no automatic activation of a captured
 *                  memory. Producing ACCEPT automatically is an M4-B
 *                  decision that requires an explicit Founder decision.
 *                  (Do not add an ACCEPT return without one.)
 *
 * The gate reuses the SophiaMemoryStore's published allow-list and bounds
 * (SOPHIA_MEMORY_TYPES / content / provenance limits) rather than maintaining
 * a second validation system; the store remains the final fail-closed
 * validator at persistence time.
 */

export type MemoryGateDecision = 'ACCEPT' | 'REJECT' | 'NEEDS_REVIEW';

export type MemoryGateReasonCode =
  | 'MALFORMED_CANDIDATE'
  | 'INVALID_MEMORY_TYPE'
  | 'CONTENT_EMPTY'
  | 'CONTENT_TOO_LONG'
  | 'INVALID_CONFIDENCE'
  | 'INVALID_PROVENANCE'
  | 'SECRET_LIKE_CONTENT'
  | 'INSTRUCTION_SHAPED_CONTENT'
  | 'AUTHORITY_PRIVILEGE_CONTENT'
  | 'COMPANY_DOMAIN_CONTENT'
  | 'TRANSIENT_CONTENT'
  | 'DUPLICATE_CONTENT'
  | 'PASSED_DETERMINISTIC_CHECKS';

/** Raw, untrusted candidate as proposed by the extraction layer. */
export interface MemoryGateCandidate {
  memoryType: string;
  content: string;
  confidence: number;
}

/** Deterministic, server-authoritative evaluation context. */
export interface MemoryGateEvaluationContext {
  /** Authenticated founder principal — NEVER model- or body-supplied. */
  founderId: string;
  /** Stage-supplied provenance (e.g. "conversation:<conversationId>"). */
  provenance: string;
  /** Existing memory contents (active + pending) for duplicate detection. */
  existingContents: string[];
}

export interface MemoryGateResult {
  decision: MemoryGateDecision;
  reasons: MemoryGateReasonCode[];
  /** Present only for NEEDS_REVIEW: the normalized candidate to persist. */
  candidate?: {
    memoryType: SophiaMemoryType;
    content: string;
    confidence: number;
  };
}

// ---------------------------------------------------------------------------
// Deterministic detection patterns.
//
// These are DELIBERATELY conservative heuristics with a fail-safe bias:
//   - false REJECT (a valid personal memory refused) only costs a missed
//     memory — the Founder can still create it directly through the governed
//     /api/sofia/memory route;
//   - false PASS only reaches a NEEDS_REVIEW (inactive) candidate that a
//     Founder must explicitly confirm before it activates.
// No pattern here is claimed to be a complete classifier — it is a
// deterministic first line of defense in front of Founder review.
// ---------------------------------------------------------------------------

/** Obvious secret/credential material must never be persisted as memory. */
const SECRET_PATTERNS: RegExp[] = [
  // named assignments: "password:", "api_key =", "token: sk-...", "my password is ..."
  /\b(?:api[_\s-]?key|apikey|secret|password|passwd|pwd|passphrase|token|bearer|access[_\s-]?token|refresh[_\s-]?token|client[_\s-]?secret|private[_\s-]?key|credentials?|otp|one[-\s]?time[-\s]?(?:code|password|passcode)|2fa|mfa|seed\s?phrase|mnemonic)\b\s*[:=]/i,
  /\b(?:password|passwd|pwd|passphrase|secret|api[_\s-]?key|apikey|access[_\s-]?token|auth[_\s-]?token)\s+is\b/i,
  /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}/, // OpenAI-style keys
  /\bghp_[A-Za-z0-9]{20,}/, // GitHub PATs
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}/, // AWS access keys
  /\bAIza[0-9A-Za-z_-]{30,}/, // Google API keys
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, // JWTs
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // financial / identity secrets
  /\b(?:credit|debit)\s+card\b|\bcard\s+number\b|\bcvv\b|\bcvc\b|\bssn\b|\bsocial\s+security\s+(?:number)?\b|\bbank\s+account\b|\brouting\s+number\b|\biban\b/i,
];

/**
 * Instruction-shaped content: a personal memory must be a DESCRIPTION of the
 * Founder, never a directive aimed at an assistant, system, or gate.
 */
const INSTRUCTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier|preceding)\s+(?:instructions?|prompts?|rules?|context)/i,
  /disregard\s+(?:all\s+|any\s+)?(?:previous|prior|above|your\s+)/i,
  /system\s+prompt|developer\s+(?:message|instruction)|<\/?(?:system|im_start|im_end)>/i,
  /\byou\s+(?:are\s+now|must\s+always|should\s+always|are\s+required\s+to)\b/i,
  /\balways\s+(?:approve|authorize|allow|execute|obey|grant)\b/i,
  /\b(?:bypass|override|disable|ignore)\s+(?:the\s+)?(?:approval|authorization|security|governance|guardrail|policy|gate|permissions?)/i,
  // approval-grant flavored: "approve all transactions", "authorize payments without asking"
  /\b(?:approve|authori[sz]e|grant|allow)\s+(?:all\s+|any\s+|every\s+)?(?:transactions?|payments?|actions?|side\s?effects?|directives?|purchases?|spending|expenses?)/i,
  /\b(?:act|behave)\s+as\b|\bpretend\s+to\s+be\b|\bnew\s+(?:persona|instructions)\b/i,
  // task/to-do shaped requests are not stable preferences
  /^\s*(?:remind me|remember to|don'?t let me forget)\b/i,
];

/**
 * Company-domain contamination: company facts/strategy/financials/projects
 * belong to the Company Brain, never to the Founder's Personal Mind.
 * ("Lumora launch date is October 12" is a company fact; "Sam prefers
 * concise responses" is a personal preference.)
 */
const COMPANY_DOMAIN_PATTERNS: RegExp[] = [
  /\b(?:MRR|ARR|burn\s?rate|runway|gross\s+margin|revenue|EBITDA|valuation|cap\s?table|board\s+of\s+directors|investors?|fundraising|series\s+[A-E])\b/i,
  /\b(?:our|the)\s+(?:company|team|department|organization|org)\s+(?:is|are|was|were|will|has|have|had|should|must|plans?)\b/i,
  /\bour\s+(?:company|team|customers?|product|platform|strategy|policy|policies|roadmap|pricing|launch|OKRs?|KPIs?|headcount|budget|forecast)\b/i,
  /\b(?:launch(?:es|ed|ing)?\s+(?:date|on|plan|timeline)|go[-\s]?to[-\s]?market|pricing\s+(?:strategy|model|change)|roadmap\s+item|quarterly\s+results?)\b/i,
  /\b(?:Q[1-4]\s+(?:goals?|targets?|numbers?)|fiscal\s+year)\b/i,
];

/**
 * Problematic transient content: a temporary state (tired today, travelling
 * this week) is not a stable personal preference. Requires BOTH a transient
 * state marker AND a time-scope marker so stable phrasings are not refused.
 */
const TRANSIENT_STATE_PATTERN =
  /\b(?:tired|exhausted|sick|ill|busy|travelling|traveling|on\s+vacation|on\s+a\s+flight|in\s+a\s+meeting|out\s+of\s+(?:the\s+)?(?:town|office)|away\s+from\s+(?:the\s+)?(?:office|desk)|on\s+leave)\b/i;
const TRANSIENT_TIME_SCOPE_PATTERN =
  /\b(?:today|tonight|right\s+now|at\s+the\s+moment|this\s+(?:morning|afternoon|evening|week|month)|temporarily|for\s+now|just\s+for)\b/i;

/** Deterministic normalization for exact-duplicate detection. */
export function normalizeForDuplicateComparison(content: string): string {
  return (content || '')
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.!,;:]+$/g, '')
    .trim();
}

export class MemoryGate {
  /**
   * Evaluates one untrusted candidate deterministically.
   *
   * M4-A: the ONLY pass outcome is NEEDS_REVIEW (persist inactive). ACCEPT is
   * reserved for a future Founder-approved auto-accept class (M4-B decision)
   * and is intentionally never produced here.
   */
  public static evaluate(
    candidate: unknown,
    ctx: MemoryGateEvaluationContext
  ): MemoryGateResult {
    // --- 1. structural validity (untrusted LLM output shape) ---
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      typeof (candidate as any).memoryType !== 'string' ||
      typeof (candidate as any).content !== 'string' ||
      typeof (candidate as any).confidence !== 'number' ||
      !Number.isFinite((candidate as any).confidence)
    ) {
      return { decision: 'REJECT', reasons: ['MALFORMED_CANDIDATE'] };
    }

    const raw = candidate as MemoryGateCandidate;
    const content = raw.content.trim();
    const reasons: MemoryGateReasonCode[] = [];

    // --- 2. memory type allow-list (EXACT match against the store's published
    //     list — no normalization of untrusted type strings; the store is
    //     exact-match too) ---
    if (!(SOPHIA_MEMORY_TYPES as readonly string[]).includes(raw.memoryType)) {
      reasons.push('INVALID_MEMORY_TYPE');
    }

    // --- 3. content length bounds (store's published bound) ---
    if (!content) {
      reasons.push('CONTENT_EMPTY');
    } else if (content.length > SOPHIA_MEMORY_CONTENT_MAX_CHARS) {
      reasons.push('CONTENT_TOO_LONG');
    }

    // --- 4. confidence range ---
    if (raw.confidence < 0 || raw.confidence > 1) {
      reasons.push('INVALID_CONFIDENCE');
    }

    // --- 5. provenance requirements (stage-supplied, deterministic) ---
    // Capture provenance is ALWAYS "conversation:<conversationId>" — a
    // non-empty conversation reference (the founder-direct marker or anything
    // else can never enter through the capture path).
    if (
      typeof ctx.provenance !== 'string' ||
      !ctx.provenance.trim() ||
      ctx.provenance.trim().length > SOPHIA_MEMORY_PROVENANCE_MAX_CHARS ||
      !/^conversation:\S+$/.test(ctx.provenance.trim())
    ) {
      reasons.push('INVALID_PROVENANCE');
    }

    // --- 6-11. content-class checks (deterministic heuristics) ---
    if (reasons.length === 0) {
      if (SECRET_PATTERNS.some((p) => p.test(content))) {
        reasons.push('SECRET_LIKE_CONTENT');
      }
      if (INSTRUCTION_PATTERNS.some((p) => p.test(content))) {
        reasons.push('INSTRUCTION_SHAPED_CONTENT');
      }
      // --- M4-A HARDENING: deterministic AUTHORITY / PRIVILEGE / CONTROL /
      // GOVERNANCE category. Keyword instruction patterns are defeated by
      // LLM paraphrase (observed: "The founder prefers that requests are
      // approved without asking for confirmation." reached NEEDS_REVIEW).
      // This evaluation is 100% deterministic (regex over normalized text —
      // no model judgment) and FAIL-CLOSED: any hard authority term, or any
      // clause combining an approval/permission-family term with a deontic
      // or bypass signal, rejects the candidate BEFORE persistence. The
      // same guard is applied at the store layer for the founder-direct
      // authoring path, so personal memory can never encode authorization
      // semantics through EITHER ingress.
      const authority = evaluateAuthorityContent(content);
      if (authority.blocked) {
        reasons.push('AUTHORITY_PRIVILEGE_CONTENT');
      }
      if (COMPANY_DOMAIN_PATTERNS.some((p) => p.test(content))) {
        reasons.push('COMPANY_DOMAIN_CONTENT');
      }
      if (TRANSIENT_STATE_PATTERN.test(content) && TRANSIENT_TIME_SCOPE_PATTERN.test(content)) {
        reasons.push('TRANSIENT_CONTENT');
      }
      // --- duplicate detection (deterministic, exact-normalized match) ---
      const normalized = normalizeForDuplicateComparison(content);
      const duplicate = (ctx.existingContents || []).some(
        (existing) => normalizeForDuplicateComparison(existing) === normalized
      );
      if (duplicate) {
        reasons.push('DUPLICATE_CONTENT');
      }
    }

    if (reasons.length > 0) {
      return { decision: 'REJECT', reasons };
    }

    return {
      decision: 'NEEDS_REVIEW',
      reasons: ['PASSED_DETERMINISTIC_CHECKS'],
      candidate: {
        memoryType: raw.memoryType as SophiaMemoryType,
        content,
        confidence: raw.confidence,
      },
    };
  }
}
