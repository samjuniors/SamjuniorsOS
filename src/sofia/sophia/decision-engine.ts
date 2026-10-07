/**
 * sophia/decision-engine.ts
 *
 * Intelligent Decision Engine for Sofia.
 *
 * Solves:
 * 1. Smart Music Routing:
 *    - Generic music ("play music", "ambient", "study vibes") -> Uses Sofia's native in-app audio engine
 *      without opening disruptive external browser tabs.
 *    - Artist/song queries -> Intelligently routes to preferred provider (Spotify, YouTube Music, or in-app player).
 *    - Explicit service commands ("on Spotify", "on YouTube") -> Respects user directive.
 *
 * 2. Session Follow-up & Browser Reuse:
 *    - Tracks active browser sessions.
 *    - Avoids spamming new tabs on every query.
 *    - Reuses existing browser panel for navigation, searches, and follow-ups.
 *    - Translates interactive instructions (scroll, tab press, enter, play/pause) into DOM & postMessage actions.
 */

export interface MusicDecision {
  provider: 'inapp_ambient' | 'spotify' | 'youtube' | 'youtube_music' | 'soundcloud';
  url?: string;
  query?: string;
  inApp: boolean;
  message: string;
  action: 'inapp_ambient' | 'open_browser' | 'open_app' | 'stream_media';
}

export interface BrowserInteractionDecision {
  type: 'navigate' | 'scroll' | 'press_key' | 'play_pause' | 'search_in_page' | 'open_new';
  direction?: 'up' | 'down' | 'top' | 'bottom';
  key?: 'Tab' | 'Enter' | 'Escape' | 'Space';
  query?: string;
  url?: string;
  message: string;
}

export type PreferredMusicSource = 'smart' | 'inapp' | 'spotify' | 'youtube';

class SofiaDecisionEngine {
  private preferredMusic: PreferredMusicSource = 'smart';
  private browserOpen = false;
  private currentBrowserUrl = 'sophia://home';

  constructor() {
    this.loadPrefs();
  }

  private loadPrefs() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem('sophia_pref_music');
        if (saved && ['smart', 'inapp', 'spotify', 'youtube'].includes(saved)) {
          this.preferredMusic = saved as PreferredMusicSource;
        }
      }
    } catch {
      // ignore
    }
  }

  public setPreferredMusic(source: PreferredMusicSource) {
    this.preferredMusic = source;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('sophia_pref_music', source);
      }
    } catch {
      // ignore
    }
  }

  public getPreferredMusic(): PreferredMusicSource {
    return this.preferredMusic;
  }

  public setBrowserState(isOpen: boolean, url?: string) {
    this.browserOpen = isOpen;
    if (url) this.currentBrowserUrl = url;
  }

  public isBrowserActive(): boolean {
    return this.browserOpen;
  }

  public getCurrentUrl(): string {
    return this.currentBrowserUrl;
  }

  /**
   * Intelligently decide where and how to play music.
   */
  public decideMusic(rawQuery?: string): MusicDecision {
    const q = (rawQuery || '').trim().toLowerCase();

    // 1. Explicit user platform instructions
    if (/\bon\s+spotify\b|spotify/i.test(q)) {
      const cleanQ = q.replace(/\bon\s+spotify\b/i, '').replace(/\bspotify\b/i, '').trim();
      const searchUrl = cleanQ
        ? `https://open.spotify.com/search/${encodeURIComponent(cleanQ)}`
        : 'https://open.spotify.com';
      return {
        provider: 'spotify',
        url: searchUrl,
        query: cleanQ,
        inApp: false,
        action: 'open_app',
        message: cleanQ ? `Playing ${cleanQ} on Spotify.` : 'Opening Spotify.',
      };
    }

    if (/\bon\s+youtube\b|youtube/i.test(q)) {
      const cleanQ = q.replace(/\bon\s+youtube\b/i, '').replace(/\byoutube\b/i, '').trim();
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQ || 'music')}`;
      return {
        provider: 'youtube',
        url: searchUrl,
        query: cleanQ,
        inApp: false,
        action: 'open_browser',
        message: `Searching YouTube for ${cleanQ || 'music'}.`,
      };
    }

    // 2. Generic music requests: ambient, focus, relaxing, study, or no query at all
    const isGeneric =
      !q ||
      /^(?:some\s+)?music$/i.test(q) ||
      /\b(ambient|lofi|lo-fi|relax|relaxing|study|focus|background|chill|peaceful|soft)\b/i.test(q);

    if (isGeneric && (this.preferredMusic === 'smart' || this.preferredMusic === 'inapp')) {
      return {
        provider: 'inapp_ambient',
        inApp: true,
        action: 'inapp_ambient',
        message: 'Playing ambient focus soundscape directly in Sofia.',
      };
    }

    // 3. Specific artist, band, or track named
    const songQuery = q.replace(/^(?:play|stream|put on)\s+/i, '').trim();

    if (this.preferredMusic === 'spotify') {
      return {
        provider: 'spotify',
        url: `https://open.spotify.com/search/${encodeURIComponent(songQuery)}`,
        query: songQuery,
        inApp: false,
        action: 'open_app',
        message: `Playing ${songQuery} on Spotify.`,
      };
    }

    // Default smart action: In-app music embed in the active HUD browser panel without opening new OS tabs
    const embedUrl = `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(songQuery)}&autoplay=1`;
    return {
      provider: 'youtube',
      url: embedUrl,
      query: songQuery,
      inApp: true,
      action: 'stream_media',
      message: `Playing ${songQuery} in Sofia Music Player.`,
    };
  }

  /**
   * Decides browser interaction vs tab opening.
   */
  public decideBrowserInteraction(commandText: string): BrowserInteractionDecision {
    const text = commandText.trim().toLowerCase();

    // Scroll commands
    if (/\b(?:scroll\s+down|down\s+a\s+bit|scroll\s+lower|page\s+down)\b/i.test(text)) {
      return {
        type: 'scroll',
        direction: 'down',
        message: 'Scrolling down the page.',
      };
    }

    if (/\b(?:scroll\s+up|up\s+a\s+bit|scroll\s+higher|page\s+up)\b/i.test(text)) {
      return {
        type: 'scroll',
        direction: 'up',
        message: 'Scrolling up the page.',
      };
    }

    if (/\b(?:scroll\s+to\s+top|go\s+to\s+top|top\s+of\s+page)\b/i.test(text)) {
      return {
        type: 'scroll',
        direction: 'top',
        message: 'Scrolling to top of page.',
      };
    }

    if (/\b(?:scroll\s+to\s+bottom|go\s+to\s+bottom|bottom\s+of\s+page)\b/i.test(text)) {
      return {
        type: 'scroll',
        direction: 'bottom',
        message: 'Scrolling to bottom of page.',
      };
    }

    // Key presses
    if (/\b(?:press\s+tab|hit\s+tab|next\s+field|tab\s+key)\b/i.test(text)) {
      return {
        type: 'press_key',
        key: 'Tab',
        message: 'Pressed Tab.',
      };
    }

    if (/\b(?:press\s+enter|hit\s+enter|submit|return\s+key)\b/i.test(text)) {
      return {
        type: 'press_key',
        key: 'Enter',
        message: 'Pressed Enter.',
      };
    }

    if (/\b(?:press\s+escape|hit\s+escape|cancel|esc)\b/i.test(text)) {
      return {
        type: 'press_key',
        key: 'Escape',
        message: 'Pressed Escape.',
      };
    }

    // Play / Pause media in active page
    if (/\b(?:pause\s+(?:the\s+)?(?:video|music|player)|stop\s+(?:the\s+)?(?:video|music))\b/i.test(text)) {
      return {
        type: 'play_pause',
        message: 'Pausing playback.',
      };
    }

    if (/\b(?:resume\s+(?:the\s+)?(?:video|music|player)|play\s+(?:the\s+)?(?:video|music))\b/i.test(text)) {
      return {
        type: 'play_pause',
        message: 'Resuming playback.',
      };
    }

    // In-page search follow-up
    const searchMatch = text.match(/(?:search|find|look\s+for)\s+(?:in\s+page|on\s+this\s+page|here|for)?\s*(.+)/i);
    if (searchMatch && this.browserOpen) {
      return {
        type: 'navigate',
        query: searchMatch[1].trim(),
        url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchMatch[1].trim())}`,
        message: `Searching for ${searchMatch[1].trim()} in active browser.`,
      };
    }

    return {
      type: 'open_new',
      message: 'Opening new browser request.',
    };
  }
}

export const decisionEngine = new SofiaDecisionEngine();
