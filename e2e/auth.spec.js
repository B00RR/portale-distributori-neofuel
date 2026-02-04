/**
 * E2E Test: Authentication Flow
 * Testa login, logout, e gestione errori
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
    test('successful login redirects to dashboard', async ({ page }) => {
        await page.goto('/');

        // Verifica form login visibile
        await expect(page.locator('#login-form')).toBeVisible();

        // Compila credenziali valide
        await page.fill('#email', 'operator@neofuel.it');
        await page.fill('#password', 'test-password');

        // Submit form
        await page.click('button[type="submit"]');

        // Attendi redirect e verifica dashboard visibile
        await expect(page.locator('#app-container')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#login-container')).not.toBeVisible();

        // Verifica presenza menu operator
        await expect(page.locator('.menu-button')).toHaveCount({ gte: 1 });
    });

    test('invalid credentials show error message', async ({ page }) => {
        await page.goto('/');

        // Compila credenziali errate
        await page.fill('#email', 'wrong@example.com');
        await page.fill('#password', 'wrongpassword');

        // Submit
        await page.click('button[type="submit"]');

        // Verifica messaggio errore
        const errorMsg = page.locator('#login-error');
        await expect(errorMsg).toBeVisible();
        await expect(errorMsg).toContainText(/errore|invalid|credenziali|errati/i);

        // Verifica che non c'è redirect
        await expect(page.locator('#login-container')).toBeVisible();
    });

    test('empty form shows validation error', async ({ page }) => {
        await page.goto('/');

        // Click submit senza compilare
        await page.click('button[type="submit"]');

        // HTML5 validation dovrebbe impedire submit
        await expect(page.locator('#login-form')).toBeVisible();
    });

    test('toggle password visibility works', async ({ page }) => {
        await page.goto('/');

        await page.fill('#password', 'testpassword');

        // Verifica campo password inizialmente nascosto
        await expect(page.locator('#password')).toHaveAttribute('type', 'password');

        // Click toggle
        await page.click('#toggle-password');

        // Verifica campo ora visibile
        await expect(page.locator('#password')).toHaveAttribute('type', 'text');

        // Click di nuovo
        await page.click('#toggle-password');

        // Verifica campo nascosto di nuovo
        await expect(page.locator('#password')).toHaveAttribute('type', 'password');
    });
});
