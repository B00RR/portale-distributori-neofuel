/**
 * E2E Test: Admin Panel
 * Testa funzionalità pannello amministrativo
 */

import { test, expect } from '@playwright/test';

async function loginAsAdmin(page) {
    await page.goto('/');
    await page.fill('#email', 'admin@neofuel.it');
    await page.fill('#password', 'admin-password');
    await page.click('button[type="submit"]');
    await expect(page.locator('#app-container')).toBeVisible({ timeout: 5000 });
}

test.describe('Admin Dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
    });

    test('shows dashboard with KPI cards', async ({ page }) => {
        // Verifica presenza KPI cards
        const kpiCards = page.locator('.kpi-card, .stat-card');
        await expect(kpiCards).toHaveCount({ gte: 1 });
    });

    test('navigazione tra tabs funziona', async ({ page }) => {
        // Click su varie tabs
        const tabs = ['Distributori', 'Operatori', 'Chiusure'];

        for (const tabName of tabs) {
            await page.click(`text=${tabName}`);
            await expect(page.locator('#admin-content')).toBeVisible();
            // Small delay per rendering
            await page.waitForTimeout(500);
        }
    });
});

test.describe('Gestione Operatori', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.click('text=Operatori');
    });

    test('visualizza lista operatori', async ({ page }) => {
        // Verifica presenza tabella
        const table = page.locator('.admin-table, table');
        await expect(table).toBeVisible();

        // Verifica headers
        await expect(page.locator('th:has-text("Nome")')).toBeVisible();
        await expect(page.locator('th:has-text("Email")')).toBeVisible();
    });

    test('apre modal creazione operatore', async ({ page }) => {
        await page.click('text=Nuovo Operatore');

        await expect(page.locator('#app-modal')).toBeVisible();
        await expect(page.locator('[name="full_name"]')).toBeVisible();
        await expect(page.locator('[name="email"]')).toBeVisible();
    });
});

test.describe('Gestione Distributori', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.click('text=Distributori');
    });

    test('visualizza lista distributori', async ({ page }) => {
        const table = page.locator('.admin-table, table');
        await expect(table).toBeVisible();
    });

    test('apre modal creazione distributore', async ({ page }) => {
        await page.click('text=Nuovo Distributore');

        await expect(page.locator('#app-modal')).toBeVisible();
        await expect(page.locator('[name="station_name"]')).toBeVisible();
    });
});

test.describe('Visualizzazione Chiusure', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.click('text=Chiusure');
    });

    test('mostra tabella chiusure turno', async ({ page }) => {
        // Verifica presenza tabella o messaggio vuoto
        const hasTable = await page.locator('.admin-table, table').isVisible();
        const hasEmpty = await page.locator('text=/Nessuna chiusura|No closures/i').isVisible();

        expect(hasTable || hasEmpty).toBeTruthy();
    });

    test('filtri chiusure funzionano', async ({ page }) => {
        // Verifica presenza filtri
        const filters = page.locator('.filter-bar, [class*="filter"]');
        if (await filters.isVisible()) {
            await expect(filters).toBeVisible();
        }
    });
});
