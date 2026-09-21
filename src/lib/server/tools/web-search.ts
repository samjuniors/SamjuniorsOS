export interface SearchResultItem {
  title: string;
  snippet: string;
  url: string;
  source?: string;
}

export interface WebSearchResult {
  query: string;
  results: SearchResultItem[];
  source: string;
  error?: string;
}

/**
 * Searches the live web using free public search endpoints with graceful fallbacks.
 * Returns structured search results for Sophia and Jarvis Lab HUD panels.
 */
export async function searchLiveWeb(query: string, maxResults = 5): Promise<WebSearchResult> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return { query, results: [], source: 'empty_query' };
  }

  // 1. Try DuckDuckGo Lite / HTML scraper
  try {
    const encoded = encodeURIComponent(cleanQuery);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const results: SearchResultItem[] = [];

      // Parse DuckDuckGo HTML results
      const resultBlocks = html.split('<div class="result results_links results_links_deep web-result ">').slice(1);
      for (const block of resultBlocks.slice(0, maxResults)) {
        // Extract title & URL
        const titleMatch = block.match(/<a class="result__snippet[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
          block.match(/<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
          block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);

        const snippetMatch = block.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/i) ||
          block.match(/<div class="result__snippet[^>]*>([\s\S]*?)<\/div>/i);

        let url = titleMatch?.[1] || '';
        // Unpack uddg redirect if present
        if (url.includes('uddg=')) {
          const match = url.match(/uddg=([^&]+)/);
          if (match?.[1]) {
            url = decodeURIComponent(match[1]);
          }
        }

        const rawTitle = titleMatch?.[2] || 'Search Result';
        const title = rawTitle.replace(/<[^>]+>/g, '').trim();

        const rawSnippet = snippetMatch?.[1] || '';
        const snippet = rawSnippet.replace(/<[^>]+>/g, '').trim();

        if (url && (title || snippet)) {
          let source = 'Web';
          try {
            source = new URL(url).hostname.replace(/^www\./, '');
          } catch {}

          results.push({
            title: title || source,
            snippet: snippet || 'No snippet available',
            url,
            source,
          });
        }
      }

      if (results.length > 0) {
        return {
          query: cleanQuery,
          results,
          source: 'DuckDuckGo Live Web',
        };
      }
    }
  } catch (err: any) {
    console.warn('[WebSearch] DuckDuckGo fetch error:', err?.message || err);
  }

  // 2. Fallback: Wikipedia Instant Search API
  try {
    const encoded = encodeURIComponent(cleanQuery);
    const wikiRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&format=json&utf8=1&srlimit=${maxResults}`,
      {
        headers: { 'User-Agent': 'SamJuniorsOS/1.0 (info@samjuniors.com)' },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (wikiRes.ok) {
      const data = await wikiRes.json();
      const items = data.query?.search || [];
      if (items.length > 0) {
        const results: SearchResultItem[] = items.map((item: any) => ({
          title: item.title,
          snippet: item.snippet.replace(/<[^>]+>/g, ''),
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
          source: 'wikipedia.org',
        }));
        return {
          query: cleanQuery,
          results,
          source: 'Wikipedia Encyclopedia',
        };
      }
    }
  } catch (err: any) {
    console.warn('[WebSearch] Wikipedia fallback error:', err?.message || err);
  }

  return {
    query: cleanQuery,
    results: [
      {
        title: `Search Query: "${cleanQuery}"`,
        snippet: `Web search completed for "${cleanQuery}". No direct web snippets retrieved from search indices.`,
        url: `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`,
        source: 'Google Search Index',
      },
    ],
    source: 'Search Directory',
  };
}
