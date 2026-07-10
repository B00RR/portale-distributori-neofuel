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

const E2E_ENV = globalThis.process?.env || {};
const isLiveSupabaseE2E = () => E2E_ENV.E2E_SUPABASE_MODE === 'live';

const TEST_CREDENTIALS = {
  admin: {
    email: E2E_ENV.TEST_ADMIN_EMAIL || 'e2e-admin@neofuel.test',
    password: E2E_ENV.TEST_ADMIN_PASSWORD || E2E_ENV.TEST_USER_PASS || 'password-e2e-admin'
  },
  operator: {
    email: E2E_ENV.TEST_OPERATOR_EMAIL || 'e2e-operator@neofuel.test',
    password: E2E_ENV.TEST_OPERATOR_PASSWORD || E2E_ENV.TEST_USER_PASS || 'password-e2e-operator'
  }
};

const AUTH_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e@neofuel.test',
  email_confirmed_at: new Date().toISOString(),
  confirmed_at: new Date().toISOString(),
  phone: '',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Utente E2E' },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

function buildSession() {
  return {
    access_token: 'e2e-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'e2e-refresh-token',
    user: AUTH_USER
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

  // Endpoint auth (login, refresh, /user).
  await page.route(/\/auth\/v1\/(token|user|logout)/, route => {
    if (route.request().url().includes('/logout')) {
      return route.fulfill({ status: 204, body: '' });
    }
    if (route.request().url().includes('/user')) {
      return json(route, 200, AUTH_USER);
    }
    return json(route, 200, buildSession());
  });

  // Lookup utente (auth.ts -> .from('users').maybeSingle()): oggetto singolo.
  await page.route(/\/rest\/v1\/users(\?|$|\/)/, route =>
    json(route, 200, {
      user_id: 1,
      email: AUTH_USER.email,
      full_name: 'Utente E2E',
      role,
      station_id: 1,
      user_stations: [{ station_id: 1, fuel_stations: { station_name: 'Stazione E2E' } }]
    })
  );

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
 * Esegue il login compilando il form. Le route devono essere gia' mockate.
 */
export async function login(page, { role = 'admin' } = {}) {
  const query = role === 'operator' ? '/?test_role=operator' : '/';
  await page.goto(query);
  const credentials = TEST_CREDENTIALS[role] || TEST_CREDENTIALS.admin;
  await page.fill('#email', credentials.email);
  await page.fill('#password', credentials.password);
  await page.click('button[type="submit"]');
}
