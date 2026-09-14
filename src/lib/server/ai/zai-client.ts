import ZAI from 'z-ai-web-dev-sdk';

/**
 * Shared z-ai-web-dev-sdk client (server-side only).
 *
 * SamjuniorsOS was originally built on @google/genai (Gemini). In this
 * environment the backend AI provider is z-ai-web-dev-sdk, which is
 * pre-configured and requires no API key. All AI surfaces of the OS
 * (advisor, agent executor, chat, collaboration, web research) route
 * through this module.
 */

export type ZAIInstance = Awaited<ReturnType<typeof ZAI.create>>;

let instancePromise: Promise<ZAIInstance> | null = null;

/** Lazily-created singleton ZAI client. Retried if initial creation fails. */
export async function getAIClient(): Promise<ZAIInstance> {
  if (!instancePromise) {
    instancePromise = ZAI.create();
    // Reset on failure so the next request can retry initialization.
    instancePromise.catch(() => {
      instancePromise = null;
    });
  }
  return instancePromise;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  /** System instruction (sent as the leading assistant message). */
  system?: string;
  messages: ChatMessage[];
}

/** Non-streaming text completion via the shared client. */
export async function generateText(options: GenerateOptions): Promise<string> {
  const zai = await getAIClient();
  const messages: ChatMessage[] = [];
  if (options.system && options.system.trim().length > 0) {
    messages.push({ role: 'assistant', content: options.system });
  }
  messages.push(...options.messages);

  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: 'disabled' },
  });

  return completion.choices[0]?.message?.content || '';
}

/** Defensively parse a model response that should contain JSON. */
export function parseJsonLoose(raw: string): any {
  const cleaned = (raw || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    // Phase 4.4B: models occasionally emit RAW control characters inside
    // string literals (e.g. a literal newline or tab in a report), which is
    // illegal JSON and made JSON.parse fail the whole completion ("Bad
    // control character in string literal"). Valid JSON never contains raw
    // control chars (they must be escaped), so replacing them with spaces can
    // never corrupt a well-formed response — it only rescues malformed ones.
    .replace(/[\x00-\x1F]/g, ' ')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall back to extracting the first balanced JSON object or array.
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
      return JSON.parse(cleaned.slice(objStart, objEnd + 1));
    }
    const arrStart = cleaned.indexOf('[');
    const arrEnd = cleaned.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd > arrStart) {
      return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
    }
    throw new Error('Failed to parse AI JSON response');
  }
}

/** JSON completion: asks the model for raw JSON and parses defensively. */
export async function generateJson<T = any>(options: GenerateOptions): Promise<T> {
  const raw = await generateText(options);
  return parseJsonLoose(raw) as T;
}

export interface WebSearchResultItem {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  rank: number;
  date: string;
  favicon: string;
}

/** Real web search via the SDK search function. */
export async function searchWeb(
  query: string,
  num = 10,
  recencyDays?: number
): Promise<WebSearchResultItem[]> {
  const zai = await getAIClient();
  const args: { query: string; num?: number; recency_days?: number } = { query, num };
  if (recencyDays && recencyDays > 0) {
    args.recency_days = recencyDays;
  }
  const results = await zai.functions.invoke('web_search', args);
  return Array.isArray(results) ? (results as WebSearchResultItem[]) : [];
}

/**
 * Synchronous availability probe used by services that expose an
 * `isConfigured()` contract. The SDK is pre-provisioned in this
 * environment, so AI is considered configured; per-request failures are
 * handled by each caller's error path.
 */
export function isAIConfigured(): boolean {
  return true;
}
