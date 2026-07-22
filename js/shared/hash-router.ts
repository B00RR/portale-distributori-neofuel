/**
 * Hash Router (shared)
 * Minimal hash-based routing primitives so admin/operator views survive
 * refresh and support deep links and browser back/forward.
 * URL format: #/<area>/<view> (e.g. #/admin/vouchers, #/operator/fatture).
 */

export type RouteArea = 'admin' | 'operator';

export interface HashRoute {
  area: RouteArea;
  view: string;
}

const HASH_PREFIX = '#/';
const VIEW_PATTERN = /^[a-z0-9_-]+$/i;

/**
 * Parse a location hash into a route. Returns null for anything that is not
 * a well-formed two-segment route; callers validate the view against their
 * own typed whitelist before navigating.
 */
export function parseHash(hash: string): HashRoute | null {
  if (!hash.startsWith(HASH_PREFIX)) {
    return null;
  }

  const segments = hash.slice(HASH_PREFIX.length).split('/');
  if (segments.length !== 2) {
    return null;
  }

  const [area, view] = segments;
  if (area !== 'admin' && area !== 'operator') {
    return null;
  }
  if (!view || !VIEW_PATTERN.test(view)) {
    return null;
  }

  return { area, view };
}

/**
 * Subscribe to hash changes (browser back/forward or manual URL edits) for
 * one area; routes of other areas or malformed hashes are ignored.
 * Listens to both `hashchange` and `popstate`:
 *   - `popstate` covers browser back/forward after `history.pushState` updates;
 *   - `hashchange` covers direct hash edits and deep-link loads where the hash
 *     is set before/while the app boots (e.g. Playwright `page.goto('/#/admin/vouchers')`).
 * Returns the unsubscribe function.
 */
export function onHashChange(
  area: RouteArea,
  handler: (view: string) => void,
  options: { immediate?: boolean } = {}
): () => void {
  const listener = (): void => {
    const route = getCurrentRoute();
    if (route && route.area === area) {
      handler(route.view);
    }
  };

  window.addEventListener('hashchange', listener);
  window.addEventListener('popstate', listener);

  if (options.immediate) {
    listener();
  }

  return (): void => {
    window.removeEventListener('hashchange', listener);
    window.removeEventListener('popstate', listener);
  };
}

/**
 * Route currently encoded in the URL, if any.
 */
export function getCurrentRoute(): HashRoute | null {
  return parseHash(window.location.hash);
}

/**
 * Record a navigation in the URL. No-ops when the hash is already current so
 * repeated navigations to the same view don't pollute history.
 * Usa location.hash anziche' pushState: pushState e' silenzioso per quanto
 * riguarda hashchange, ma browser diversi (e WebKit in particolare) non
 * sincronizzano sempre la barra degli indirizzi prima che il test lo legga.
 * location.hash e' atomico, genera un hashchange, e mantiene coerenti URL e
 * routing.
 */
export function updateHash(area: RouteArea, view: string): void {
  const target = `${HASH_PREFIX}${area}/${view}`;
  if (window.location.hash === target) {
    return;
  }
  window.location.hash = target;
}
