/**
 * tools/web-search.ts
 *
 * Multi-provider web-search tool.
 *
 * Priority chain (first configured provider wins):
 *   1. Tavily   — best AI-optimised results, 1 000 req/month free
 *   2. Brave    — 2 000 req/month free, privacy-focused
 *   3. DuckDuckGo Instant Answer API — zero cost, no key, limited to instant answers
 *   4. Gemini Google Search grounding — uses the existing GEMINI_API_KEY
 *
 * The client side calls  POST /api/sophia/tools/web-search
 * which selects the provider and returns structured SearchResultItem[].
 */

import type { ITool, ToolResult, WebSearchData } from './types';

const ENDPOINT = '/api/sophia/tools/web-search';

export class WebSearchTool implements ITool {
  readonly name = 'web_search';
  readonly description =
    'Search the web for current events, news, facts, weather, prices or any external information. ' +
    'Use only when the answer requires up-to-date or external data. ' +
    'Returns a summary and source list.';

  /** Abort controllers keyed by callId so in-flight requests can be cancelled. */
  private readonly controllers = new Map<string, AbortController>();

  async invoke(
    args: Record<string, unknown>,
    callId?: string,
  ): Promise<ToolResult<WebSearchData>> {
    const query = String(args.query ?? '').trim();
    if (!query) {
      return { success: false, error: 'missing_query', errorDetail: 'No search query provided.' };
    }

    const controller = new AbortController();
    if (callId) this.controllers.set(callId, controller);

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      if (callId) this.controllers.delete(callId);

      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
        return {
          success: false,
          error: 'search_failed',
          errorDetail: String(payload.error ?? `HTTP ${res.status}`),
        };
      }

      const data = await res.json() as WebSearchData;

      if (!data.results?.length) {
        return {
          success: false,
          error: 'no_results',
          errorDetail: `No results found for "${query}".`,
          data: { ...data, results: [] },
        };
      }

      return { success: true, data };
    } catch (err: any) {
      if (callId) this.controllers.delete(callId);
      if (err.name === 'AbortError') {
        return { success: false, error: 'cancelled', errorDetail: 'Search was cancelled.' };
      }
      return {
        success: false,
        error: 'network_error',
        errorDetail: err.message ?? 'Network error during web search.',
      };
    }
  }

  cancel(callId: string) {
    const ctrl = this.controllers.get(callId);
    if (ctrl) {
      ctrl.abort();
      this.controllers.delete(callId);
    }
  }
}

export const webSearchTool = new WebSearchTool();
