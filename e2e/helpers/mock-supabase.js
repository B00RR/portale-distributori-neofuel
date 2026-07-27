/**
 * Helper di mock per Supabase (E2E ermetici).
 *
 * Intercetta a livello di rete le chiamate auth/REST di Supabase cosi' la
 * suite E2E e' deterministica e NON dipende da un backend live ne' da un
 * utente realmente esistente. Questo elimina i timeout/flakiness che
 * rendevano la suite rossa per ~28 minuti.
 *
 * Le route vanno registrate PRIMA di page.goto(): Playwright da' priorita'
 * alle route registrate piu' tardi, quindi il catch-all REST e' aggiunto per
 * primo e le route specifiche (users / user_stations) lo sovrascrivono.
 */

import { expect } from '@playwright/test';
import { deriveSeedAuthIdentity } from '../../scripts/e2e-live-seed.mjs';

const E2E_ENV = globalThis.process?.env || {};
export const isLiveSupabaseE2E = (env = E2E_ENV) => env.E2E_SUPABASE_MODE === 'live';

export function resolveE2ECredentials(role = 'admin', env = E2E_ENV) {
  const isLive = isLiveSupabaseE2E(env);
  if (isLive) {
    const rawUsername = role === 'operator' ? env.TEST_OPERATOR_USERNAME : env.TEST_ADMIN_USERNAME;
    const rawPassword = role === 'operator' ? env.TEST_OPERATOR_PASSWORD : env.TEST_ADMIN_PASSWORD;
    const runId = env.E2E_RUN_ID;

    if (!rawUsername || !rawUsername.trim()) {
      throw new Error(
        `TEST_${role === 'operator' ? 'OPERATOR' : 'ADMIN'}_USERNAME is required for live E2E login`
      );
    }
    if (!rawPassword || !rawPassword.trim()) {
      throw new Error(
        `TEST_${role === 'operator' ? 'OPERATOR' : 'ADMIN'}_PASSWORD is required for live E2E login`
      );
    }
    if (!runId || !runId.trim()) {
      throw new Error('E2E_RUN_ID is required for live E2E login');
    }

    const { username } = deriveSeedAuthIdentity(rawUsername, undefined, runId);
    return {
      username,
      password: rawPassword.trim()
    };
  }

  if (role === 'operator') {
    return {
      username: env.TEST_OPERATOR_USERNAME || 'e2e-operator',
      password: env.TEST_OPERATOR_PASSWORD || env.TEST_USER_PASS || 'password-e2e-operator'
    };
  }

  return {
    username: env.TEST_ADMIN_USERNAME || 'e2e-admin',
    password: env.TEST_ADMIN_PASSWORD || env.TEST_USER_PASS || 'password-e2e-admin'
  };
}

const AUTH_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e-admin@neofuel.local',
  email_confirmed_at: new Date().toISOString(),
  confirmed_at: new Date().toISOString(),
  phone: '',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Utente E2E' },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

function buildSession(user = AUTH_USER) {
  return {
    access_token: 'e2e-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'e2e-refresh-token',
    user
  };
}

const json = (route, status, payload) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: typeof payload === 'string' ? payload : JSON.stringify(payload)
  });

/**
 * Simula credenziali errate: l'endpoint token risponde 400.
 * Usato dai test "credenziali non valide".
 */
export async function mockSupabaseAuthFailure(page) {
  if (isLiveSupabaseE2E()) {
    return;
  }

  // Ogni eventuale accesso REST resta ermetico e viene negato come in
  // produzione per il ruolo anon. Il test verifica che non venga chiamato.
  await page.route(/\/rest\/v1\//, route =>
    json(route, 403, {
      code: '42501',
      message: 'permission denied'
    })
  );

  await page.route(/\/auth\/v1\/token/, route =>
    json(route, 400, {
      error: 'invalid_grant',
      error_description: 'Invalid login credentials',
      msg: 'Invalid login credentials',
      code: 'invalid_credentials'
    })
  );
}

/**
 * Simula una sessione valida + i dati minimi per montare la shell.
 * @param {import('@playwright/test').Page} page
 * @param {{ role?: 'admin'|'operator' }} opts
 */
export async function mockSupabaseSession(page, { role = 'admin' } = {}) {
  if (isLiveSupabaseE2E()) {
    return;
  }

  // Catch-all REST: registrato per primo (priorita' piu' bassa).
  // Per le query .single()/.maybeSingle() (header Accept object+json)
  // restituisce `null`; per le liste restituisce `[]`.
  await page.route(/\/rest\/v1\//, route => {
    const accept = route.request().headers()['accept'] || '';
    const wantsSingle = accept.includes('vnd.pgrst.object+json');
    const status = route.request().method() === 'GET' ? 200 : 201;
    return json(route, status, wantsSingle ? 'null' : '[]');
  });

  let authenticatedUser = AUTH_USER;

  // Endpoint auth (login, refresh, /user).
  await page.route(/\/auth\/v1\/(token|user|logout)/, route => {
    if (route.request().url().includes('/logout')) {
      return route.fulfill({ status: 204, body: '' });
    }
    if (route.request().url().includes('/user')) {
      return json(route, 200, authenticatedUser);
    }

    const credentials = route.request().postDataJSON();
    if (typeof credentials?.email === 'string') {
      authenticatedUser = { ...AUTH_USER, email: credentials.email };
    }
    return json(route, 200, buildSession(authenticatedUser));
  });

  // Profilo applicativo server-authoritative: e' leggibile soltanto con la
  // sessione ottenuta dal login, mai con la chiave anonima.
  await page.route(/\/rest\/v1\/users(\?|$|\/)/, route => {
    if (route.request().headers()['authorization'] !== 'Bearer e2e-access-token') {
      return json(route, 403, {
        code: '42501',
        message: 'permission denied'
      });
    }

    return json(route, 200, {
      user_id: 1,
      created_by_auth: AUTH_USER.id,
      email: authenticatedUser.email,
      full_name: 'Utente E2E',
      role,
      station_id: 1,
      user_stations: [{ station_id: 1, fuel_stations: { station_name: 'Stazione E2E' } }]
    });
  });

  // user_stations (app.ts percorso operatore -> .select()): lista assegnazioni.
  await page.route(/\/rest\/v1\/user_stations/, route =>
    json(route, 200, [{ station_id: 1, fuel_stations: { station_name: 'Stazione E2E' } }])
  );
}

/**
 * Semina dati voucher per la tab admin Voucher (data-driven).
 * Deve essere chiamato DOPO mockSupabaseSession cosi' le route specifiche
 * (registrate piu' tardi) hanno priorita' sul catch-all REST.
 * @param {import('@playwright/test').Page} page
 * @param {{ batches?: Array<object>, vouchers?: Array<object> }} data
 */
export async function mockAdminVouchers(page, { batches = [], vouchers = [] } = {}) {
  if (isLiveSupabaseE2E()) {
    return;
  }

  await page.route(/\/rest\/v1\/voucher_batches/, route => json(route, 200, batches));
  await page.route(/\/rest\/v1\/vouchers(\?|$|\/)/, route => json(route, 200, vouchers));
}

/**
 * Semina richieste fattura per la tab admin Fatture (data-driven).
 * Deve essere chiamato DOPO mockSupabaseSession.
 * @param {import('@playwright/test').Page} page
 * @param {Array<object>} invoices
 */
export async function mockAdminInvoices(page, invoices = []) {
  if (isLiveSupabaseE2E()) {
    return;
  }

  await page.route(/\/rest\/v1\/invoices/, route => json(route, 200, invoices));
}

/**
 * Su viewport mobile la sidebar e' un drawer fuori dal viewport (chiuso di
 * default). Prima di cliccare un nav-btn Playwright deve poterlo portare
 * nell'area visibile: apriamo il drawer come farebbe un utente reale tramite
 * #sidebar-toggle. Su desktop la sidebar e' sempre visibile, quindi il toggle
 * non esiste e la funzione e' un no-op.
 * @param {import('@playwright/test').Page} page
 */
export async function openSidebarIfMobile(page) {
  const shouldOpen = await page.evaluate(() => {
    const toggle = document.getElementById('sidebar-toggle');
    const sb = document.querySelector('.admin-sidebar');
    if (!toggle || !sb) return false;
    const cs = getComputedStyle(toggle);
    const rect = toggle.getBoundingClientRect();
    const toggleVisible =
      cs.display !== 'none' && cs.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    return toggleVisible && !sb.classList.contains('open');
  });

  if (shouldOpen) {
    await page.locator('#sidebar-toggle').click();
    await expect(page.locator('.admin-sidebar')).toHaveClass(/open/, {
      timeout: 5000
    });
  }
}

/**
 * Esegue il login compilando il form. Le route devono essere gia' mockate.
 */
export async function login(page, { role = 'admin' } = {}) {
  const query = role === 'operator' ? '/?test_role=operator' : '/';
  await page.goto(query);
  const credentials = resolveE2ECredentials(role, E2E_ENV);
  await page.fill('#username', credentials.username);
  await page.fill('#password', credentials.password);
  await page.click('button[type="submit"]');
}

/**
 * Registra le route per le RPC di chiusura
 */
export async function mockClosureRPCs(page) {
  if (isLiveSupabaseE2E()) return;

  // open_shift RPC
  await page.route(/\/rest\/v1\/rpc\/open_shift/, route =>
    json(route, 200, { success: true, shift_id: 1, station_id: 1 })
  );

  // submit_shift_closure_v2 RPC
  await page.route(/\/rest\/v1\/rpc\/submit_shift_closure_v2/, route => {
    const body = route.request().postDataJSON();
    const isPreview = body?.p_preview === true;
    return json(route, 200, {
      success: true,
      idempotent: false,
      totals: {
        total_liters: 100.0,
        fuel_revenue: 150.0,
        total_fuel_revenue: 150.0,
        extra_revenue: 30.0,
        total_sold: 180.0,
        expected_cash: 175.0,
        real_cash: 175.0,
        discrepancy: 0.0,
        operator_cash: 175.0,
        operator_pos: 10.0,
        operator_fleet: 0.0,
        self_cash_in: 0.0,
        self_cash_out: 0.0,
        self_pos: 0.0,
        self_fleet: 0.0,
        self_manager: 0.0
      },
      computed: {
        totale_venduto_carburante: 150,
        totale_venduto_extra: 30,
        totale_venduto: 180,
        expected_cash: 175,
        real_cash: 175,
        discrepancy: 0
      },
      ...(isPreview ? { preview: true } : {})
    });
  });
}
