/**
 * Browser navigation bridge — allows non-React code (control layer, voice tools)
 * to imperatively navigate the BrowserPanel without importing the component.
 *
 * Queues a pending navigation if the panel is not mounted yet (open-then-navigate race).
 */

export function browseProxyPath(target: string): string {
  return `/api/sophia/browse?url=${encodeURIComponent(target)}`;
}

let _navigateFn: ((url: string, title?: string) => void) | null = null;
let _pending: { url: string; title?: string } | null = null;

export function registerBrowserNavigate(fn: (url: string, title?: string) => void) {
  _navigateFn = fn;
  if (_pending) {
    const next = _pending;
    _pending = null;
    fn(next.url, next.title);
  }
}

export function unregisterBrowserNavigate() {
  _navigateFn = null;
}

/** Navigate the browser panel to a URL. Queues if the panel is not open yet. */
export function navigateBrowserTo(url: string, title?: string) {
  if (_navigateFn) _navigateFn(url, title);
  else _pending = { url, title };
}

export function hasBrowserPanel(): boolean {
  return Boolean(_navigateFn);
}
