/**
 * E2E: smoke dei flussi critici (shell autenticata).
 *
 * Backend Supabase mockato a livello di rete (vedi helpers/mock-supabase.js):
 * verifichiamo che, dopo il login, venga montata la shell corretta
 * (admin oppure operatore) con i suoi elementi di navigazione stabili.
 * Niente asserzioni su contenuti data-driven (KPI, tabelle, ...): quelli
 * richiederebbero un backend con dati seminati.
 */

import { test, expect } from '@playwright/test';

import { mockSupabaseSession, login } from './helpers/mock-supabase.js';

test.describe('Shell Admin', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseSession(page, { role: 'admin' });
  });

  test('il login admin monta la sidebar e la navigazione', async ({ page }) => {
    await login(page, { role: 'admin' });

    await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#login-container')).toBeHidden();

    // Shell admin
    await expect(page.locator('.admin-sidebar')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('body')).toHaveClass(/admin-layout/);

    // Voci di navigazione stabili (data-testid univoci della sidebar:
    // [data-tab] da solo e' ambiguo perche' usato anche dai breadcrumb).
    await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-operators"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-vouchers"]')).toBeVisible();
  });
});

test.describe('Shell Operatore', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseSession(page, { role: 'operator' });
  });

  test('il login operatore monta il menu operatore', async ({ page }) => {
    await login(page, { role: 'operator' });

    await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });

    // Shell operatore
    await expect(page.locator('.operator-menu')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#btn-turno')).toBeVisible();
    await expect(page.locator('#btn-voucher')).toBeVisible();
  });
});
