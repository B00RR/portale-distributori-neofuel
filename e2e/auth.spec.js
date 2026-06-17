/**
 * E2E: Flusso di autenticazione (UI).
 *
 * Questi test validano l'interfaccia di login SENZA dipendere da un backend:
 * la pagina di login e' statica e l'unico caso che tocca la rete (credenziali
 * errate) e' mockato. Deterministici e veloci.
 */

import { test, expect } from '@playwright/test';

import { mockSupabaseAuthFailure } from './helpers/mock-supabase.js';

test.describe('Autenticazione (UI)', () => {
  test('mostra il form di login', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
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

  test('credenziali errate mostrano un messaggio di errore', async ({ page }) => {
    await mockSupabaseAuthFailure(page);

    await page.goto('/');
    await page.fill('#email', 'sbagliata@example.com');
    await page.fill('#password', 'password-errata');
    await page.click('button[type="submit"]');

    const errorMsg = page.locator('#login-error');
    await expect(errorMsg).toBeVisible();
    await expect(errorMsg).not.toBeEmpty();
    // Nessun redirect: restiamo sul login.
    await expect(page.locator('#login-container')).toBeVisible();
  });
});
