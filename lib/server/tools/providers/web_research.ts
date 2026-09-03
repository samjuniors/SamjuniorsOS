import { GoogleGenAI } from '@google/genai';
import { 
  ExecutionStatus, 
  ResearchClaim, 
  ResearchSource, 
  VerificationState 
} from '@/types/capabilities';
import { 
  evaluateEvidenceStatus, 
  sanitizeExternalResearchText, 
  validateResearchSources, 
  verifyClaimsAgainstSources 
} from '../verification';

export interface WebResearchInput {
  query: string;
}

export interface WebResearchResult {
  query: string;
  summary: string;
  sources: ResearchSource[];
  claims: ResearchClaim[];
  executionStatus: ExecutionStatus;
  verificationState: VerificationState;
  limitations: string[];
  timestamp: string;
  injectionDetected?: boolean;
}

export async function executeWebResearch(input: WebResearchInput): Promise<WebResearchResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const ai = new GoogleGenAI({ apiKey });
  const timestamp = new Date().toISOString();
  
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: `Conduct objective external web research on the following topic: "${input.query}". 
Provide a concise executive summary of key facts and market developments. 
Do not extrapolate, assume, or fabricate citations.

You MUST append a structured JSON block at the very end of your response inside triple backticks with "json", formatted as follows:
\`\`\`json
{
  "sources": [
    {
      "title": "Exact Article or Source Title",
      "url": "https://example.com/valid-url",
      "excerpt": "Specific factual excerpt from the source"
    }
  ],
  "claims": [
    {
      "statement": "Specific factual claim established by research",
      "supportingSourceUrls": ["https://example.com/valid-url"],
      "evidenceExcerpt": "Supporting quote or evidence"
    }
  ]
}
\`\`\``
  });

  const candidate = response.candidates?.[0];
  const fullText = candidate?.content?.parts?.[0]?.text || '';
  
  if (!fullText) {
    throw new Error("Provider returned empty response");
  }

  // 1. Untrusted Data Defense & Sanitization
  const { sanitizedText, injectionDetected } = sanitizeExternalResearchText(fullText);
  
  let summary = sanitizedText;
  let rawSources: any[] = [];
  let rawClaims: any[] = [];
  
  // 2. Parse candidate structured JSON
  const jsonMatch = sanitizedText.match(/```json\s*([\s\S]*?)\s*```/) || sanitizedText.match(/([\{\[][\s\S]*[\}\]])/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed.sources)) {
        rawSources = parsed.sources;
      }
      if (Array.isArray(parsed.claims)) {
        rawClaims = parsed.claims;
      }
      summary = sanitizedText.replace(jsonMatch[0], '').trim();
    } catch (e) {
      console.error('Failed to parse candidate research JSON block', e);
    }
  }

  // Fallback: extract plain URLs if JSON sources were empty
  if (rawSources.length === 0) {
    const urlRegex = /(https?:\/\/[^\s\)]+)/g;
    const matches = sanitizedText.match(urlRegex);
    if (matches) {
      rawSources = matches.map(url => ({ title: 'Discovered URL', url }));
    }
  }

  // 3. Authoritative Source Validation & Deduplication (SSRF protected)
  const { validSources, invalidSources } = validateResearchSources(rawSources, 'google_search', timestamp);

  // 4. Authoritative Claim-to-Source Verification Engine
  const { verifiedClaims, overallVerificationState, conflictDetected, limitations } = verifyClaimsAgainstSources({
    candidateClaims: rawClaims,
    validSources,
    rawSummary: summary
  });

  // 5. Evaluate Execution and Evidence Status
  const supportedClaimsCount = verifiedClaims.filter(c => c.verificationState === 'claim_supported').length;
  const statusEvaluation = evaluateEvidenceStatus({
    providerSuccess: true,
    validSourcesCount: validSources.length,
    invalidSourcesCount: invalidSources.length,
    claimsSupportedCount: supportedClaimsCount,
    conflictDetected,
  });

  if (injectionDetected) {
    limitations.push('Adversarial prompt injection pattern detected in external research content and neutralized.');
  }

  const allLimitations = Array.from(new Set([...limitations, ...statusEvaluation.limitations]));

  return {
    query: input.query,
    summary: summary || 'No summary available.',
    sources: validSources,
    claims: verifiedClaims,
    executionStatus: statusEvaluation.status,
    verificationState: overallVerificationState,
    limitations: allLimitations,
    timestamp,
    injectionDetected
  };
}
