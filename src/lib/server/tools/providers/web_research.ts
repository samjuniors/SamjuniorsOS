import { generateText, searchWeb } from '../../ai/zai-client';
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
  const timestamp = new Date().toISOString();

  // 0. Perform REAL web search via the z-ai backend search function so that
  //    research claims are grounded in actual retrieved sources rather than
  //    model-recalled (potentially hallucinated) citations.
  const searchResults = await searchWeb(input.query, 8);

  const formattedSearchContext = searchResults
    .map((r, i) => `[${i + 1}] ${r.name} (${r.host_name})\nURL: ${r.url}\nExcerpt: ${r.snippet}`)
    .join('\n\n');

  const responseText = await generateText({
    system: `You are an objective research analyst. You are given REAL web search results retrieved live from the internet. Summarize the key facts and market developments strictly based on the provided search results. Do not extrapolate, assume, or fabricate citations. If the search results are insufficient, say so explicitly.`,
    messages: [
      {
        role: 'user',
        content: `Conduct objective external web research on the following topic: "${input.query}".

Below are the live web search results retrieved for this query:

${formattedSearchContext || '(No search results were returned. State that research could not be grounded and refuse to fabricate findings.)'}

Provide a concise executive summary of key facts and market developments strictly grounded in the search results above.

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
\`\`\`
Only reference URLs that appear verbatim in the search results above.`,
      },
    ],
  });

  const fullText = responseText || '';
  
  if (!fullText) {
    throw new Error("Provider returned empty response");
  }

  // Ground-truth source pool: real URLs actually returned by the search provider.
  const retrievedUrlSet = new Set(searchResults.map((r) => r.url));
  const retrievedSources: any[] = searchResults.map((r) => ({
    title: r.name,
    url: r.url,
    excerpt: r.snippet,
  }));

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
        // Only trust model-echoed sources that map to URLs the search provider actually returned.
        rawSources = parsed.sources.filter(
          (s: any) => typeof s?.url === 'string' && retrievedUrlSet.has(s.url)
        );
      }
      if (Array.isArray(parsed.claims)) {
        // Drop any claims that cite URLs not present in the retrieved search results.
        rawClaims = parsed.claims.filter(
          (c: any) =>
            !Array.isArray(c?.supportingSourceUrls) ||
            c.supportingSourceUrls.every((u: string) => retrievedUrlSet.has(u))
        );
      }
      summary = sanitizedText.replace(jsonMatch[0], '').trim();
    } catch (e) {
      console.error('Failed to parse candidate research JSON block', e);
    }
  }

  // Prefer real retrieved sources over model-echoed ones.
  if (retrievedSources.length > 0) {
    rawSources = retrievedSources;
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
