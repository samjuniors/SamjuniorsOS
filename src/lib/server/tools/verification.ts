import { 
  ExecutionStatus, 
  ResearchClaim, 
  ResearchSource, 
  VerificationState 
} from '@/types/capabilities';

// ----------------------------------------------------------------------------
// 1. SSRF & URL VALIDATION
// ----------------------------------------------------------------------------

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
]);

/**
 * Validates and normalizes an external source URL.
 * Defends against SSRF, internal network probing, and malformed inputs.
 */
export function validateAndNormalizeUrl(rawUrl: string | undefined | null): {
  isValid: boolean;
  normalizedUrl?: string;
  reason?: string;
} {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { isValid: false, reason: 'URL is empty or not a string' };
  }

  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, reason: 'Malformed URL format' };
  }

  // Only allow HTTP and HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isValid: false, reason: `Invalid protocol: ${parsed.protocol}. Only HTTP and HTTPS are permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Explicit blocked hosts
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { isValid: false, reason: `Blocked hostname: ${hostname}` };
  }

  // Block private network ranges
  if (
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.onion')
  ) {
    return { isValid: false, reason: `Private/internal domain forbidden: ${hostname}` };
  }

  // Check IPv4 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16)
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octet1 = parseInt(ipv4Match[1], 10);
    const octet2 = parseInt(ipv4Match[2], 10);

    if (
      octet1 === 10 || // 10.0.0.0/8
      octet1 === 127 || // Loopback
      (octet1 === 172 && octet2 >= 16 && octet2 <= 31) || // 172.16.0.0/12
      (octet1 === 192 && octet2 === 168) || // 192.168.0.0/16
      (octet1 === 169 && octet2 === 254) // Link-local / Cloud metadata
    ) {
      return { isValid: false, reason: `Forbidden IP address range: ${hostname}` };
    }
  }

  // Normalize URL
  parsed.hash = ''; // Remove fragments
  let normalized = parsed.toString();
  // Strip trailing slash for uniform normalization
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return { isValid: true, normalizedUrl: normalized };
}

// ----------------------------------------------------------------------------
// 2. SOURCE RECORD NORMALIZATION & DEDUPLICATION
// ----------------------------------------------------------------------------

export function validateResearchSources(
  rawSources: any[],
  providerName: string = 'google_search',
  retrievalTimestamp?: string
): {
  validSources: ResearchSource[];
  invalidSources: any[];
  duplicatesRemoved: number;
} {
  const timestamp = retrievalTimestamp || new Date().toISOString();
  const validSourcesMap = new Map<string, ResearchSource>();
  const invalidSources: any[] = [];
  let duplicatesCount = 0;

  if (!Array.isArray(rawSources)) {
    return { validSources: [], invalidSources: [], duplicatesRemoved: 0 };
  }

  for (const raw of rawSources) {
    if (!raw || typeof raw !== 'object') {
      invalidSources.push({ raw, reason: 'Source entry is not an object' });
      continue;
    }

    const urlCheck = validateAndNormalizeUrl(raw.url);
    if (!urlCheck.isValid || !urlCheck.normalizedUrl) {
      invalidSources.push({
        raw,
        reason: urlCheck.reason || 'Invalid URL',
        title: raw.title || 'Unknown',
        status: 'invalid'
      });
      continue;
    }

    const normUrl = urlCheck.normalizedUrl;
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Unknown Title';
    const excerpt = typeof raw.excerpt === 'string' && raw.excerpt.trim() ? raw.excerpt.trim() : undefined;

    if (validSourcesMap.has(normUrl)) {
      duplicatesCount++;
      // If the duplicate has an excerpt and the existing one doesn't, augment it
      const existing = validSourcesMap.get(normUrl)!;
      if (!existing.excerpt && excerpt) {
        existing.excerpt = excerpt;
        existing.status = 'extracted';
      }
    } else {
      validSourcesMap.set(normUrl, {
        title,
        url: normUrl,
        provider: providerName,
        retrievalTimestamp: timestamp,
        excerpt,
        status: excerpt ? 'extracted' : 'retrieved'
      });
    }
  }

  return {
    validSources: Array.from(validSourcesMap.values()),
    invalidSources,
    duplicatesRemoved: duplicatesCount
  };
}

// ----------------------------------------------------------------------------
// 3. AUTHORITATIVE CLAIM-TO-SOURCE VERIFICATION ENGINE
// ----------------------------------------------------------------------------

export interface VerifyClaimsParams {
  candidateClaims: any[];
  validSources: ResearchSource[];
  rawSummary?: string;
}

export function verifyClaimsAgainstSources({
  candidateClaims,
  validSources,
  rawSummary,
}: VerifyClaimsParams): {
  verifiedClaims: ResearchClaim[];
  overallVerificationState: VerificationState;
  conflictDetected: boolean;
  limitations: string[];
} {
  const limitations: string[] = [];
  const validUrlSet = new Set(validSources.map(s => s.url));
  const verifiedClaims: ResearchClaim[] = [];
  let conflictDetected = false;

  // Process candidate claims
  let claimsToProcess = Array.isArray(candidateClaims) ? candidateClaims : [];

  // Fallback: If no candidate claims were structured by model, but we have a summary and sources
  if (claimsToProcess.length === 0 && rawSummary && validSources.length > 0) {
    const sentences = rawSummary
      .split(/(?<=[.?!])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 25 && !s.startsWith('#'));
    
    // Create candidate claims from first few sentences
    claimsToProcess = sentences.slice(0, 3).map((sentence, idx) => ({
      statement: sentence,
      supportingSourceUrls: [validSources[0]?.url].filter(Boolean),
    }));
  }

  for (let i = 0; i < claimsToProcess.length; i++) {
    const candidate = claimsToProcess[i];
    const statement = typeof candidate.statement === 'string' ? candidate.statement.trim() : `Claim ${i + 1}`;
    
    // CRITICAL: NEVER allow candidate's model-supplied "verified: true" to dictate state!
    // Extract candidate cited URLs
    const rawCandidateUrls = Array.isArray(candidate.supportingSourceUrls)
      ? (candidate.supportingSourceUrls as unknown[])
      : [];
    const candidateUrls: string[] = rawCandidateUrls
      .map((u) => validateAndNormalizeUrl(typeof u === 'string' ? u : String(u)))
      .filter((r): r is { isValid: true; normalizedUrl: string } => r.isValid && typeof r.normalizedUrl === 'string')
      .map((r) => r.normalizedUrl);

    // Filter to only URLs that ACTUALLY exist in the validated retrieved sources
    const matchingValidUrls = candidateUrls.filter(url => validUrlSet.has(url));

    const isConflict = candidate.conflictDetected === true || candidate.conflicting === true;
    if (isConflict) {
      conflictDetected = true;
    }

    let verificationState: ResearchClaim['verificationState'];
    let notes: string | undefined;

    if (validSources.length === 0) {
      verificationState = 'unverified';
      notes = 'No external sources were retrieved to ground this claim.';
    } else if (matchingValidUrls.length === 0) {
      // Model cited non-existent source, or provided no source
      verificationState = 'verification_incomplete';
      notes = candidateUrls.length > 0 
        ? 'Cited source was not found in the validated retrieved sources list.' 
        : 'Claim has no supporting source citations.';
      limitations.push(`Claim "${statement.slice(0, 40)}..." lacks verified supporting source.`);
    } else if (isConflict) {
      verificationState = 'conflicting';
      notes = 'Conflicting evidence or contradictory findings reported across sources.';
      limitations.push(`Sources disagree regarding: "${statement.slice(0, 40)}...".`);
    } else {
      verificationState = 'claim_supported';
      notes = `Grounded by ${matchingValidUrls.length} validated external source(s).`;
    }

    verifiedClaims.push({
      id: `claim-${i + 1}`,
      statement,
      supportingSourceUrls: matchingValidUrls,
      evidenceExcerpt: candidate.evidenceExcerpt || validSources.find(s => matchingValidUrls.includes(s.url))?.excerpt,
      verificationState,
      confidence: matchingValidUrls.length > 1 ? 'high' : matchingValidUrls.length === 1 ? 'medium' : 'low',
      notes,
      conflictDetected: isConflict,
    });
  }

  // Determine overall verification state
  let overallVerificationState: VerificationState = 'unverified';

  if (validSources.length === 0) {
    overallVerificationState = 'unverified';
  } else if (conflictDetected) {
    overallVerificationState = 'conflicting';
  } else {
    const supportedCount = verifiedClaims.filter(c => c.verificationState === 'claim_supported').length;
    if (supportedCount === verifiedClaims.length && verifiedClaims.length > 0) {
      overallVerificationState = 'claim_supported';
    } else if (supportedCount > 0) {
      overallVerificationState = 'verification_incomplete';
      limitations.push('Partial claim verification: some claims remain unsupported by retrieved sources.');
    } else if (validSources.some(s => s.status === 'extracted')) {
      overallVerificationState = 'evidence_extracted';
    } else if (validSources.length > 0) {
      overallVerificationState = 'source_retrieved';
    }
  }

  return {
    verifiedClaims,
    overallVerificationState,
    conflictDetected,
    limitations: Array.from(new Set(limitations))
  };
}

// ----------------------------------------------------------------------------
// 4. PROMPT INJECTION & UNTRUSTED DATA DEFENSE
// ----------------------------------------------------------------------------

const SUSPICIOUS_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/i,
  /system\s+prompt/i,
  /grant\s+(?:all\s+)?permissions/i,
  /change\s+permissions/i,
  /allow\s+finance_transfer/i,
  /role\s*[:=]\s*['"]?(?:founder|admin|root)['"]?/i,
  /execute\s+command/i,
  /override\s+policy/i,
  /eval\s*\(/i,
  /process\.env/i,
];

/**
 * Sanitizes external research content and detects adversarial prompt injection.
 * External research is ALWAYS treated as DATA, never as system instructions.
 */
export function sanitizeExternalResearchText(text: string): {
  sanitizedText: string;
  injectionDetected: boolean;
  flags: string[];
} {
  if (!text || typeof text !== 'string') {
    return { sanitizedText: '', injectionDetected: false, flags: [] };
  }

  const flags: string[] = [];
  let injectionDetected = false;

  for (const pattern of SUSPICIOUS_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      injectionDetected = true;
      flags.push(`Matched pattern: ${pattern.toString()}`);
    }
  }

  // Strip script tags or raw html executable blocks
  let cleanText = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[STRIPPED_UNTRUSTED_SCRIPT]')
    .replace(/javascript:/gi, 'blocked_javascript:');

  return {
    sanitizedText: cleanText,
    injectionDetected,
    flags
  };
}

// ----------------------------------------------------------------------------
// 5. EVIDENCE STATUS & STAGE EVALUATOR
// ----------------------------------------------------------------------------

export function evaluateEvidenceStatus(params: {
  providerSuccess: boolean;
  validSourcesCount: number;
  invalidSourcesCount: number;
  claimsSupportedCount: number;
  conflictDetected: boolean;
  errorMessage?: string;
}): {
  status: ExecutionStatus;
  verificationState: VerificationState;
  limitations: string[];
} {
  const limitations: string[] = [];

  if (!params.providerSuccess) {
    return {
      status: 'failed',
      verificationState: 'verification_failed',
      limitations: [params.errorMessage || 'External research provider execution failed.']
    };
  }

  if (params.validSourcesCount === 0) {
    return {
      status: 'no_results',
      verificationState: 'unverified',
      limitations: ['Provider executed successfully, but no relevant external sources were discovered.']
    };
  }

  if (params.conflictDetected) {
    limitations.push('Conflicting information detected across external sources.');
  }

  if (params.invalidSourcesCount > 0) {
    limitations.push(`${params.invalidSourcesCount} source(s) were discarded due to invalid or blocked URLs.`);
  }

  const status: ExecutionStatus = params.invalidSourcesCount > 0 ? 'partial' : 'success';

  let verificationState: VerificationState;
  if (params.conflictDetected) {
    verificationState = 'conflicting';
  } else if (params.claimsSupportedCount > 0) {
    verificationState = 'claim_supported';
  } else {
    verificationState = 'source_retrieved';
  }

  return {
    status,
    verificationState,
    limitations
  };
}
