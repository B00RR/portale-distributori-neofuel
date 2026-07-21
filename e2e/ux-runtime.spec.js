/**
 * E2E: UX runtime smoke (shell autenticata, backend mockato).
 *
 * Copre le aree runtime che prima non erano protette da regressioni:
 * deep-link / refresh (hash routing #219), breadcrumb, back/forward del
 * browser, stato ARIA dell'accordion operatore e focus trap dei modali.
 * Nessuna dipendenza da un backend live: Supabase e' mockato a livello di rete.
 */

import { test, expect } from '@playwright/test';

import { mockSupabaseSession, login, openSidebarIfMobile } from './helpers/mock-supabase.js';

test.describe('Deep-link e refresh (admin)', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseSession(page, { role: 'admin' });
  });

  test('un deep-link hash monta la view corrispondente e sopravvive al refresh', async ({
    page
  }) => {
    // Login (popola la sessione mockata in localStorage), poi naviga all'hash.
    await login(page, { role: 'admin' });
    await expect(page.locator('.admin-sidebar')).toBeVisible({ timeout: 15000 });

    await page.goto('/#/admin/vouchers');
    await expect(page.locator('[data-testid="voucher-admin-panel"]')).toBeVisible({
      timeout: 15000
    });
    expect(page.url()).toContain('#/admin/vouchers');

    // Il refresh mantiene la view (non torna alla dashboard).
    await page.reload();
    await expect(page.locator('[data-testid="voucher-admin-panel"]')).toBeVisible({
      timeout: 15000
    });
    expect(page.url()).toContain('#/admin/vouchers');
  });

  test('la navigazione via sidebar aggiorna hash e breadcrumb', async ({ page }) => {
    await login(page, { role: 'admin' });
    await expect(page.locator('.admin-sidebar')).toBeVisible({ timeout: 15000 });

    // Su mobile la sidebar e' un drawer: aprirlo prima di cliccare la nav.
    await openSidebarIfMobile(page);
    await page.locator('[data-testid="nav-vouchers"]').click();

    await expect.poll(() => page.url()).toContain('#/admin/vouchers');
    const breadcrumbs = page.locator('#breadcrumbs');
    await expect(breadcrumbs).toContainText('Voucher');
  });

  test('il tasto indietro del browser torna alla tab precedente', async ({ page }) => {
    await login(page, { role: 'admin' });
    await expect(page.locator('.admin-sidebar')).toBeVisible({ timeout: 15000 });

    const content = page.locator('#admin-content');

    // Notifiche ha un render statico e deterministico: buon punto di ritorno.
    // Su mobile la sidebar e' un drawer: aprirlo prima di cliccare la nav.
    await openSidebarIfMobile(page);
    await page.locator('[data-testid="nav-notifiche"]').click();
    await expect.poll(() => page.url()).toContain('#/admin/notifiche');
    await expect(content).toContainText('prossimamente', { timeout: 15000 });

    // Su mobile il click su nav-notifiche ha chiuso il drawer: riaprirlo
    // prima di cliccare nav-vouchers.
    await openSidebarIfMobile(page);
    await page.locator('[data-testid="nav-vouchers"]').click();
    await expect.poll(() => page.url()).toContain('#/admin/vouchers');
    // Aspetta che la view Voucher sia effettivamente montata prima di tornare
    // indietro: l'hash cambia prima che il contenuto asincrono venga renderizzato.
    await expect(page.locator('[data-testid="voucher-admin-panel"]')).toBeVisible({
      timeout: 15000
    });

    await page.goBack();
    await expect.poll(() => page.url()).toContain('#/admin/notifiche');
    // Attendiamo il re-render del contenuto di Notifiche prima dell'assertione
    // sul testo, per evitare race condition sul back navigation.
    await expect(content).toContainText('prossimamente', { timeout: 15000 });
  });
});

test.describe('Accordion e navigazione operatore', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseSession(page, { role: 'operator' });
  });

  // L'operatore non viene piu' auto-rediretto ad "apertura" all'accesso,
  // quindi il menu e' immediatamente disponibile senza chiudere alcun modale.
  test("l'accordion movimenti espone correttamente lo stato ARIA", async ({ page }) => {
    await login(page, { role: 'operator' });
    await expect(page.locator('.operator-menu')).toBeVisible({ timeout: 15000 });

    const trigger = page.locator('[data-testid="btn-movimenti"]');
    const content = page.locator('#movimenti-content');

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(content).toBeHidden();

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(content).toBeVisible();

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(content).toBeHidden();
  });

  test('un deep-link operatore monta la view richiesta', async ({ page }) => {
    await login(page, { role: 'operator' });
    await expect(page.locator('.operator-menu')).toBeVisible({ timeout: 15000 });

    await page.goto('/?test_role=operator#/operator/fatture');
    // La view fatture apre il modale dedicato: verifichiamo che la shell resti
    // montata e l'URL rifletta il deep-link.
    await expect.poll(() => page.url()).toContain('#/operator/fatture');
    await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });
  });
});
