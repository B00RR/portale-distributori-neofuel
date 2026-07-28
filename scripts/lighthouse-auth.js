/* global localStorage */

/**
 * Lighthouse CI Authenticated Journeys & Hermetic Safety Script (#342)
 *
 * Implements deterministic network interception, pre-authenticated session setup,
 * and fail-closed safety guards for Lighthouse audits.
 *
 * NON-NEGOTIABLE SAFETY GUARANTEES:
 * - Live Supabase mode (E2E_SUPABASE_MODE=live) is strictly forbidden.
 * - Production Supabase project ref (ahlmgafaurossyghimxc) is strictly forbidden.
 * - All network requests to auth/REST/Storage/Realtime endpoints are mocked or blocked hermetically.
 */

import { URL } from 'node:url';

export const PRODUCTION_PROJECT_REF = 'ahlmgafaurossyghimxc';
export const STUB_SUPABASE_URL = 'https://stub-project.supabase.co';
export const STUB_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhYmFzZSIsInJlZiI6InN0dWItcHJvamVjdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjIwMTk2NDMyMDB9.stub-anon-key';

export const AUTHENTICATED_JOURNEYS = Object.freeze([
  '/',
  '/#admin/dashboard',
  '/#admin/shifts',
  '/#admin/vouchers',
  '/#admin/invoices',
  '/#operator/apertura'
]);

/**
 * Validates fail-closed safety guards for Lighthouse CI.
 * @param {Record<string, string | undefined>} [env=globalThis.process?.env]
 */
export function validateLighthouseSafety(env = globalThis.process?.env || {}) {
  if (env.E2E_SUPABASE_MODE === 'live') {
    throw new Error(
      '[Lighthouse Safety Guard] E2E_SUPABASE_MODE=live is strictly forbidden for Lighthouse CI audits.'
    );
  }

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  if (supabaseUrl.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(
      `[Lighthouse Safety Guard] Production Supabase project ref (${PRODUCTION_PROJECT_REF}) detected in SUPABASE_URL. Lighthouse CI must be hermetic and isolated.`
    );
  }

  if (env.LHCI_ALLOW_LIVE === 'true') {
    throw new Error(
      '[Lighthouse Safety Guard] Live backend mode is strictly forbidden in Lighthouse CI.'
    );
  }
}

/**
 * Strict authorization header validator.
 * Accepts ONLY the exact synthetic Bearer token ('Bearer lhci-stub-access-token').
 * Rejects wrong tokens, empty strings, missing tokens, or malformed headers.
 * @param {string | undefined} authHeader
 * @returns {boolean}
 */
export function isValidLhciAuthHeader(authHeader) {
  if (typeof authHeader !== 'string' || !authHeader.trim()) {
    return false;
  }
  const normalized = authHeader.trim().replace(/\s+/g, ' ');
  const [scheme, token] = normalized.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return false;
  }
  return token === getMockSession().access_token;
}

/**
 * Classifies a network request URL for hermetic handling or fail-closed blocking.
 * @param {string} urlStr
 * @param {string} [allowedHost='stub-project.supabase.co']
 * @returns {'ALLOW_LOCAL' | 'BLOCK_UNAUTHORIZED_HOST' | 'BLOCK_REALTIME' | 'MOCK_AUTH_TOKEN' | 'MOCK_AUTH_USER' | 'MOCK_AUTH_LOGOUT' | 'MOCK_AUTH_GENERIC' | 'MOCK_REST_USERS' | 'MOCK_REST_STATIONS' | 'MOCK_REST_RPC' | 'MOCK_REST_GENERIC' | 'MOCK_STORAGE'}
 */
export function classifyLighthouseRequest(urlStr, allowedHost = 'stub-project.supabase.co') {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return 'BLOCK_UNAUTHORIZED_HOST';
  }

  const { protocol, host, pathname } = parsed;

  // Local static app assets (http/https on localhost or 127.0.0.1, data:, blob:)
  if (
    protocol === 'data:' ||
    protocol === 'blob:' ||
    host.startsWith('localhost:') ||
    host.startsWith('127.0.0.1:') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  ) {
    return 'ALLOW_LOCAL';
  }

  const isSupabaseDomain =
    host.endsWith('.supabase.co') || host === allowedHost || host.includes('supabase');

  if (isSupabaseDomain) {
    // Fail-closed guard: Reject any Supabase host that does NOT match the expected stub host exactly
    if (host !== allowedHost) {
      return 'BLOCK_UNAUTHORIZED_HOST';
    }

    // Fail-closed guard: Block WebSocket / Realtime connections to Supabase
    if (protocol === 'ws:' || protocol === 'wss:' || pathname.includes('/realtime/v1')) {
      return 'BLOCK_REALTIME';
    }

    // Auth routes
    if (pathname.includes('/auth/v1/token')) return 'MOCK_AUTH_TOKEN';
    if (pathname.includes('/auth/v1/user')) return 'MOCK_AUTH_USER';
    if (pathname.includes('/auth/v1/logout')) return 'MOCK_AUTH_LOGOUT';
    if (pathname.startsWith('/auth/v1/')) return 'MOCK_AUTH_GENERIC';

    // REST routes
    if (pathname.includes('/rest/v1/users')) return 'MOCK_REST_USERS';
    if (pathname.includes('/rest/v1/user_stations')) return 'MOCK_REST_STATIONS';
    if (pathname.includes('/rest/v1/rpc/')) return 'MOCK_REST_RPC';
    if (pathname.startsWith('/rest/v1/')) return 'MOCK_REST_GENERIC';

    // Storage routes (e.g. system bucket download)
    if (pathname.startsWith('/storage/v1/')) return 'MOCK_STORAGE';

    return 'BLOCK_UNAUTHORIZED_HOST';
  }

  return 'BLOCK_UNAUTHORIZED_HOST';
}

/**
 * Returns synthetic auth user fixture.
 * @param {'admin' | 'operator'} [role='admin']
 */
export function getMockAuthUser(role = 'admin') {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: role === 'operator' ? 'lhci-operator@neofuel.local' : 'lhci-admin@neofuel.local',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    confirmed_at: '2026-01-01T00:00:00.000Z',
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: role === 'operator' ? 'Operatore LHCI' : 'Admin LHCI' },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  };
}

/**
 * Returns synthetic session fixture.
 * @param {'admin' | 'operator'} [role='admin']
 */
export function getMockSession(role = 'admin') {
  const user = getMockAuthUser(role);
  return {
    access_token: 'lhci-stub-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'lhci-stub-refresh-token',
    user
  };
}

/**
 * Returns synthetic server-authoritative profile fixture.
 * @param {'admin' | 'operator'} [role='admin']
 */
export function getMockProfile(role = 'admin') {
  const authUser = getMockAuthUser(role);
  return {
    user_id: role === 'operator' ? 2 : 1,
    created_by_auth: authUser.id,
    email: authUser.email,
    full_name: authUser.user_metadata.full_name,
    role,
    is_active: true,
    station_id: 1,
    user_stations: [{ station_id: 1, fuel_stations: { station_name: 'Stazione Audit LHCI' } }]
  };
}

const pageRequestHandlers = new WeakMap();

/**
 * Puppeteer setup function invoked by @lhci/cli before auditing target URLs.
 * @param {any} browser
 * @param {{ url?: string }} [opts={}]
 */
export default async function lighthouseAuth(browser, opts = {}) {
  const currentEnv = globalThis.process?.env || {};
  validateLighthouseSafety(currentEnv);

  const rawSupabaseUrl =
    currentEnv.VITE_SUPABASE_URL || currentEnv.SUPABASE_URL || STUB_SUPABASE_URL;
  let allowedHost = 'stub-project.supabase.co';
  try {
    allowedHost = new URL(rawSupabaseUrl).host;
  } catch {
    allowedHost = 'stub-project.supabase.co';
  }

  const targetUrl = opts.url || 'http://localhost:8080/';
  const parsedUrl = new URL(targetUrl);
  const hash = parsedUrl.hash || '';

  const isOperator = hash.startsWith('#operator/');
  const isAdmin = hash.startsWith('#admin/');
  const isAuthenticated = isAdmin || isOperator;
  const role = isOperator ? 'operator' : 'admin';

  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());

  // Fail-safe: Use CDP to block WebSocket/Realtime network calls at driver level
  try {
    const target = page.target();
    const client = await target.createCDPSession();
    await client.send('Network.enable');
    await client.send('Network.setBlockedURLs', {
      urls: ['*realtime*', 'ws://*', 'wss://*']
    });
  } catch {
    // Fallback if CDP session is unsupported in test stub environment
  }

  await page.setRequestInterception(true);

  const previousHandler = pageRequestHandlers.get(page);
  if (previousHandler) {
    if (typeof page.off === 'function') {
      page.off('request', previousHandler);
    } else if (typeof page.removeListener === 'function') {
      page.removeListener('request', previousHandler);
    }
  }

  const requestHandler = request => {
    const reqUrl = request.url();
    const headers = request.headers();
    const action = classifyLighthouseRequest(reqUrl, allowedHost);

    if (action === 'ALLOW_LOCAL') {
      return request.continue();
    }

    if (action === 'BLOCK_UNAUTHORIZED_HOST') {
      return request.respond({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: '42501', error: 'Blocked unauthorized host' })
      });
    }

    if (action === 'BLOCK_REALTIME') {
      return request.abort('blockedbyclient');
    }

    const authHeader = headers['authorization'] || headers['Authorization'];

    if (action === 'MOCK_AUTH_TOKEN') {
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(getMockSession(role))
      });
    }

    if (action === 'MOCK_AUTH_USER') {
      if (!isValidLhciAuthHeader(authHeader)) {
        return request.respond({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ code: '42501', message: 'permission denied' })
        });
      }
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(getMockAuthUser(role))
      });
    }

    if (action === 'MOCK_AUTH_LOGOUT') {
      return request.respond({
        status: 204,
        body: ''
      });
    }

    if (action === 'MOCK_AUTH_GENERIC') {
      return request.respond({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid auth request' })
      });
    }

    if (action === 'MOCK_REST_USERS') {
      if (!isValidLhciAuthHeader(authHeader)) {
        return request.respond({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ code: '42501', message: 'permission denied' })
        });
      }
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(getMockProfile(role))
      });
    }

    if (action === 'MOCK_REST_STATIONS') {
      if (!isValidLhciAuthHeader(authHeader)) {
        return request.respond({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ code: '42501', message: 'permission denied' })
        });
      }
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { station_id: 1, fuel_stations: { station_name: 'Stazione Audit LHCI' } }
        ])
      });
    }

    if (action === 'MOCK_REST_RPC') {
      if (!isValidLhciAuthHeader(authHeader)) {
        return request.respond({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ code: '42501', message: 'permission denied' })
        });
      }
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    }

    if (action === 'MOCK_REST_GENERIC') {
      if (!isValidLhciAuthHeader(authHeader)) {
        return request.respond({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ code: '42501', message: 'permission denied' })
        });
      }
      const accept = headers['accept'] || headers['Accept'] || '';
      const wantsSingle = accept.includes('vnd.pgrst.object+json');
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: wantsSingle ? 'null' : '[]'
      });
    }

    if (action === 'MOCK_STORAGE') {
      return request.respond({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: '404', error: 'Not Found', message: 'Object not found' })
      });
    }

    return request.respond({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: '42501', error: 'Fail closed' })
    });
  };

  pageRequestHandlers.set(page, requestHandler);
  page.on('request', requestHandler);

  const subDomain = allowedHost.split('.')[0];
  const storageKeys = [
    `sb-${subDomain}-auth-token`,
    'sb-stub-project-auth-token',
    'sb-stub-auth-token'
  ];

  if (isAuthenticated) {
    const origin = parsedUrl.origin;
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      (sessionData, keys) => {
        localStorage.clear();
        for (const key of keys) {
          localStorage.setItem(key, sessionData);
        }
      },
      JSON.stringify(getMockSession(role)),
      storageKeys
    );
  } else {
    const origin = parsedUrl.origin;
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.clear();
    });
  }
}
