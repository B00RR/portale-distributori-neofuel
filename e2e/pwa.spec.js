/**
 * E2E: smoke PWA (progetto dedicato con serviceWorkers: 'allow').
 *
 * Il resto della suite blocca i service worker per non interferire con i mock
 * di rete; qui invece li abilitiamo per verificare manifest e registrazione
 * del service worker. Deterministico: nessuna dipendenza da Supabase.
 */

import { test, expect } from '@playwright/test';

test.describe('PWA', () => {
  test('il manifest e collegato ed espone i campi richiesti', async ({ page }) => {
    await page.goto('/');

    const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(manifestHref).toBeTruthy();

    const response = await page.request.get(new URL(manifestHref, page.url()).toString());
    expect(response.ok()).toBeTruthy();

    const manifest = await response.json();
    expect(manifest.name).toBe('Neofuel Portal - Distributori');
    expect(manifest.short_name).toBe('Neofuel');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('la meta theme-color e presente', async ({ page }) => {
    await page.goto('/');
    const themeColor = await page.getAttribute('meta[name="theme-color"]', 'content');
    expect(themeColor).toBeTruthy();
  });

  test('il service worker si registra quando abilitato', async ({ page }) => {
    await page.goto('/');

    // Con serviceWorkers: 'allow' e vite-plugin-pwa, il SW viene registrato.
    // Attendiamo una registrazione (o controller) con un timeout generoso.
    const registered = await page
      .waitForFunction(
        async () => {
          if (!('serviceWorker' in navigator)) {
            return false;
          }
          const regs = await navigator.serviceWorker.getRegistrations();
          return regs.length > 0 || navigator.serviceWorker.controller !== null;
        },
        undefined,
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);

    expect(registered).toBe(true);
  });
});
