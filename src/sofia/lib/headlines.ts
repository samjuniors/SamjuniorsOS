/**
 * lib/headlines.ts — the World Monitor's news wire (Phase 5 Theatre).
 *
 * Front-page headlines from Hacker News' keyless Algolia API, with a
 * cached last-good copy and an embedded fallback so the monitor never
 * sits empty. Pure parse + cache helpers; the component owns fetching.
 */

export interface Headline {
  title: string;
  url: string;
  points: number;
  source: string;
  comments: number;
}

export const HEADLINES_URL = 'https://hn.algolia.com/api/v1/search?tags=front_page';
export const HEADLINES_CACHE_KEY = 'sophia:headlines:v1';
export const HEADLINES_TIMEOUT_MS = 8000;

/** Timeless fallback wire for first-run-offline. Marked as cached. */
export const FALLBACK_HEADLINES: Headline[] = [
  { title: 'Hello from orbit — the wire is warming up', url: 'https://news.ycombinator.com', points: 42, source: 'cached', comments: 0 },
  { title: 'Local-first software keeps your data at home', url: 'https://news.ycombinator.com', points: 314, source: 'cached', comments: 0 },
  { title: 'Small teams ship fast with boring technology', url: 'https://news.ycombinator.com', points: 271, source: 'cached', comments: 0 },
];

interface HnHit {
  title?: unknown;
  url?: unknown;
  points?: unknown;
  author?: unknown;
  num_comments?: unknown;
  objectID?: unknown;
}

/** Parse the Algolia payload defensively — junk in, clean list out. */
export function parseHeadlines(payload: unknown, limit = 8): Headline[] {
  const hits = (payload as { hits?: unknown })?.hits;
  if (!Array.isArray(hits)) return [];
  const out: Headline[] = [];
  for (const h of hits) {
    const hit = (h ?? {}) as HnHit;
    const title = typeof hit.title === 'string' ? hit.title.trim() : '';
    if (!title) continue;
    const points = typeof hit.points === 'number' && Number.isFinite(hit.points) ? Math.max(0, Math.round(hit.points)) : 0;
    const comments =
      typeof hit.num_comments === 'number' && Number.isFinite(hit.num_comments) ? Math.max(0, Math.round(hit.num_comments)) : 0;
    const url =
      typeof hit.url === 'string' && hit.url.startsWith('http')
        ? hit.url
        : typeof hit.objectID === 'string' || typeof hit.objectID === 'number'
          ? `https://news.ycombinator.com/item?id=${hit.objectID}`
          : 'https://news.ycombinator.com';
    let source = 'news.ycombinator.com';
    try {
      source = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      /* keep default */
    }
    out.push({ title, url, points, source, comments });
    if (out.length >= limit) break;
  }
  return out;
}

export interface HeadlineCache {
  at: number;
  items: Headline[];
}

export function readHeadlineCache(): HeadlineCache | null {
  try {
    const raw = localStorage.getItem(HEADLINES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HeadlineCache>;
    if (typeof parsed.at !== 'number' || !Array.isArray(parsed.items)) return null;
    return { at: parsed.at, items: parseHeadlines({ hits: parsed.items }) };
  } catch {
    return null;
  }
}

export function writeHeadlineCache(items: Headline[], now: number = Date.now()): void {
  try {
    localStorage.setItem(HEADLINES_CACHE_KEY, JSON.stringify({ at: now, items }));
  } catch {
    /* storage full or unavailable — the wire still works */
  }
}

/** Fetch with a timeout. Rejects on network trouble — callers fall back. */
export async function fetchHeadlines(
  fetcher: typeof fetch = fetch,
  timeoutMs: number = HEADLINES_TIMEOUT_MS,
): Promise<Headline[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetcher(HEADLINES_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`wire answered ${res.status}`);
    return parseHeadlines(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Human age for the "updated Xm ago" line. */
export function ageLabel(at: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
