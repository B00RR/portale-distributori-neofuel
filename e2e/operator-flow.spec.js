/**
 * E2E Test: Operator Flow (Apertura/Chiusura Turno)
 * Testa il flusso completo operatore
 */

import { test, expect } from '@playwright/test';

// Helper function per login
async function login(page, role = 'operator') {
    await page.goto('/');

    const credentials = {
        operator: { email: 'operator@neofuel.it', password: 'test-password' },
        admin: { email: 'admin@neofuel.it', password: 'admin-password' }
    };

    const { email, password } = credentials[role];

    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');

    // Attendi caricamento dashboard
    await expect(page.locator('#app-container')).toBeVisible({ timeout: 5000 });
}

test.describe('Apertura Turno', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('completa apertura turno con contatori pistole', async ({ page }) => {
        // Click su apertura turno
        await page.click('text=Apertura');

        // Attendi caricamento modal
        await expect(page.locator('#app-modal')).toBeVisible();

        // Verifica presenza form contatori
        const counters = page.locator('[name^="pistola_"]');
        await expect(counters).toHaveCount({ gte: 1 });

        // Compila primo contatore
        await counters.first().fill('1234.56');

        // Compila secondo contatore se esiste
        const count = await counters.count();
        if (count > 1) {
            await counters.nth(1).fill('5678.90');
        }

        // Submit apertura
        await page.click('button:has-text("Conferma")');

        // Verifica toast successo
        await expect(page.locator('.toast')).toContainText(/turno aperto|successo/i, { timeout: 5000 });
    });

    test('mostra errore se turno già aperto', async ({ page }) => {
        // Prova ad aprire turno quando uno è già attivo
        await page.click('text=Apertura');

        // Dovrebbe mostrare messaggio o impedire apertura
        const warning = page.locator('text=/Turno già aperto|already open/i');
        await expect(warning).toBeVisible({ timeout: 3000 });
    });
});

test.describe('Chiusura Turno', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('wizard chiusura - step 1: contatori pistole', async ({ page }) => {
        await page.click('text=Chiusura');

        await expect(page.locator('#app-modal')).toBeVisible();

        // Compila contatori chiusura
        const counters = page.locator('[name*="numeratore"]');
        if (await counters.count() > 0) {
            await counters.first().fill('2000.50');
        }

        // Procedi allo step 2
        await page.click('button:has-text("Avanti")');

        // Verifica step 2 visibile
        await expect(page.locator('text=/Totali Auto-Dichiarati|Self-Reported/i')).toBeVisible();
    });

    test('wizard chiusura - step 2: totali autodichiarati', async ({ page }) => {
        // TODO: Completa il flow fino allo step 2
        // Questo test richiede che ci sia un turno aperto
    });

    test('wizard chiusura - step 3: riepilogo e conferma', async ({ page }) => {
        // TODO: Test completo fino alla conferma finale
    });
});

test.describe('Voucher Redemption', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('riscatta voucher con codice manuale', async ({ page }) => {
        await page.click('text=Voucher');

        await expect(page.locator('#app-modal')).toBeVisible();

        // Inserisci codice voucher
        const codeInput = page.locator('[name="voucher_code"]');
        await codeInput.fill('TEST1234');

        await page.click('button:has-text("Verifica")');

        // Verifica risultato (dipende dallo stato del mock/db)
        // Potrebbe essere successo o errore "voucher not found"
        const result = page.locator('[id*="voucher-result"]');
        await expect(result).toBeVisible({ timeout: 3000 });
    });
});

test.describe('Modifica Prezzi', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('aggiorna prezzi carburante', async ({ page }) => {
        await page.click('text=Prezzi');

        await expect(page.locator('#app-modal')).toBeVisible();

        // Modifica prezzo benzina
        const benzinaInput = page.locator('[name="benzina"]');
        await benzinaInput.fill('1.899');

        // Modifica prezzo gasolio
        const gasolioInput = page.locator('[name="gasolio"]');
        await gasolioInput.fill('1.659');

        // Salva
        await page.click('button[type="submit"]');

        // Verifica toast successo
        await expect(page.locator('.toast')).toContainText(/prezzi|success/i, { timeout: 5000 });
    });
});
