/**
 * E2E: Flusso di autenticazione (UI).
 *
 * Questi test validano l'interfaccia di login SENZA dipendere da un backend:
 * la pagina di login e' statica e l'unico caso che tocca la rete (credenziali
 * errate) e' mockato. Deterministici e veloci.
 */

import { test, expect } from '@playwright/test';

import { mockSupabaseAuthFailure, mockSupabaseSession } from './helpers/mock-supabase.js';

const GENERIC_LOGIN_ERROR = 'Username o password errati.';
const LIVE_SUPABASE_E2E = process.env.E2E_SUPABASE_MODE === 'live';

test.describe('Autenticazione (UI)', () => {
  test('mostra il form di login', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('il form vuoto non viene inviato (validazione HTML5)', async ({ page }) => {
    await page.goto('/');
    await page.click('button[type="submit"]');
    // I campi required impediscono il submit: restiamo sulla schermata di login.
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#app-container')).toBeHidden();
  });

  test('il toggle di visibilita password funziona', async ({ page }) => {
    await page.goto('/');
    await page.fill('#password', 'segreto123');

    await expect(page.locator('#password')).toHaveAttribute('type', 'password');
    await page.click('#toggle-password');
    await expect(page.locator('#password')).toHaveAttribute('type', 'text');
    await page.click('#toggle-password');
    await expect(page.locator('#password')).toHaveAttribute('type', 'password');
  });

  test('username inesistente e password errata sono indistinguibili', async ({ browser }) => {
    const attempts = [
      { username: 'account-sconosciuto', password: 'password-e2e-admin' },
      { username: 'e2e-admin', password: 'password-errata' }
    ];
    const messages = [];

    for (const credentials of attempts) {
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();
      const requests = [];
      page.on('request', request => requests.push(request.url()));
      await mockSupabaseAuthFailure(page);

      await page.goto('/');
      await page.fill('#username', credentials.username);
      await page.fill('#password', credentials.password);
      await page.click('button[type="submit"]');

      const errorMsg = page.locator('#login-error');
      await expect(errorMsg).toBeVisible();
      await expect(errorMsg).toHaveText(GENERIC_LOGIN_ERROR);
      messages.push(await errorMsg.textContent());
      expect(requests.filter(url => url.includes('/auth/v1/token'))).toHaveLength(1);
      expect(requests.filter(url => url.includes('/rest/v1/users'))).toHaveLength(0);
      await expect(page.locator('#login-container')).toBeVisible();

      await context.close();
    }

    expect(new Set(messages)).toEqual(new Set([GENERIC_LOGIN_ERROR]));
  });

  test("fresh-session usa l'alias deterministico prima del profilo", async ({ browser }) => {
    test.skip(
      LIVE_SUPABASE_E2E,
      'Le asserzioni su token e UUID sono specifiche del backend ermetico'
    );
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const requests = [];
    page.on('request', request => {
      if (request.url().includes('/auth/v1/token') || request.url().includes('/rest/v1/users')) {
        requests.push({
          url: request.url(),
          body: request.postData() ? request.postDataJSON() : null,
          authorization: request.headers()['authorization']
        });
      }
    });
    await mockSupabaseSession(page);

    await page.goto('/');
    expect(
      await page.evaluate(() =>
        [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter(
          key => key.startsWith('sb-') || key.toLowerCase().includes('supabase')
        )
      )
    ).toEqual([]);

    await page.fill('#username', '  E2E-ADMIN  ');
    await page.fill('#password', 'password-e2e-admin');
    await page.click('button[type=submit]');

    await expect(page.locator('#app-container')).toBeVisible();

    const authIndex = requests.findIndex(request => request.url.includes('/auth/v1/token'));
    const profileIndex = requests.findIndex(request => request.url.includes('/rest/v1/users'));
    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(profileIndex).toBeGreaterThan(authIndex);
    expect(requests[authIndex].body).toMatchObject({
      email: 'e2e-admin@neofuel.local',
      password: 'password-e2e-admin'
    });
    expect(requests[profileIndex].authorization).toBe('Bearer e2e-access-token');
    expect(new URL(requests[profileIndex].url).searchParams.get('created_by_auth')).toBe(
      'eq.00000000-0000-0000-0000-000000000001'
    );

    await context.close();
  });
});
