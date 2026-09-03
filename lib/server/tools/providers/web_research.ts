import { GoogleGenAI } from '@google/genai';

export interface WebResearchInput {
  query: string;
}

export interface ResearchSource {
  title: string;
  url: string;
}

export interface WebResearchResult {
  query: string;
  summary: string;
  sources: ResearchSource[];
  timestamp: string;
}

export async function executeWebResearch(input: WebResearchInput): Promise<WebResearchResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: `Conduct web research on the following topic: "${input.query}". 
Provide a concise summary of the key findings. 
You MUST append a JSON block containing the sources you used at the very end of your response.
Format the JSON block exactly as follows, enclosed in triple backticks with "json":
\`\`\`json
{
  "sources": [
    {"title": "Source 1", "url": "https://example.com/1"},
    {"title": "Source 2", "url": "https://example.com/2"}
  ]
}
\`\`\``
  });

  const candidate = response.candidates?.[0];
  const fullText = candidate?.content?.parts?.[0]?.text || '';
  
  if (!fullText) {
     throw new Error("Provider returned empty response");
  }
  
  let summary = fullText;
  let sources: ResearchSource[] = [];
  
  const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/) || fullText.match(/([\{\[][\s\S]*[\}\]])/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.sources && Array.isArray(parsed.sources)) {
        sources = parsed.sources;
      }
      summary = fullText.replace(jsonMatch[0], '').trim();
    } catch (e) {
      console.error('Failed to parse sources JSON', e);
    }
  }

  if (sources.length === 0) {
    const urlRegex = /(https?:\/\/[^\s\)]+)/g;
    const matches = fullText.match(urlRegex);
    if (matches) {
      sources = matches.map(url => ({ title: 'Extracted URL', url: url }));
    }
  }

  const uniqueSources = Array.from(new Map(sources.map(s => [s.url, s])).values());

  return {
    query: input.query,
    summary: summary || 'No summary available.',
    sources: uniqueSources,
    timestamp: new Date().toISOString(),
  };
}
