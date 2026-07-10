/**
 * E2E: asserzioni data-driven (admin).
 *
 * A differenza dello smoke della shell, qui seminiamo dati Supabase mockati e
 * verifichiamo che i moduli voucher e fatture li rendano davvero nel DOM.
 */

import { test, expect } from '@playwright/test';

import {
  mockSupabaseSession,
  mockAdminVouchers,
  mockAdminInvoices,
  login,
  openSidebarIfMobile
} from './helpers/mock-supabase.js';

test.describe('Admin Voucher (data-driven)', () => {
  test('la tab Voucher renderizza i lotti seminati', async ({ page }) => {
    await mockSupabaseSession(page, { role: 'admin' });
    await mockAdminVouchers(page, {
      batches: [
        {
          id: 'aaaaaaaa-1111-1111-1111-111111111111',
          customer_name: 'Cliente Alfa E2E',
          description: '2x 50,00 €',
          expiration_date: null
        },
        {
          id: 'bbbbbbbb-2222-2222-2222-222222222222',
          customer_name: 'Cliente Beta E2E',
          description: '1x 100,00 €',
          expiration_date: null
        }
      ],
      vouchers: [
        { batch_id: 'aaaaaaaa-1111-1111-1111-111111111111', status: 'active', amount: 50 },
        { batch_id: 'aaaaaaaa-1111-1111-1111-111111111111', status: 'active', amount: 50 },
        { batch_id: 'bbbbbbbb-2222-2222-2222-222222222222', status: 'active', amount: 100 }
      ]
    });

    await login(page, { role: 'admin' });
    await expect(page.locator('.admin-sidebar')).toBeVisible({ timeout: 15000 });
    // Attendiamo che il render async della dashboard iniziale si stabilizzi,
    // altrimenti il suo fetch tardivo sovrascrive la view a cui navighiamo.
    await expect(page.locator('#admin-content')).toContainText('Venduto Oggi', { timeout: 15000 });

    // Su mobile la sidebar e' un drawer: aprirlo prima di cliccare la nav.
    await openSidebarIfMobile(page);
    await page.locator('[data-testid="nav-vouchers"]').click();
    await expect(page.locator('[data-testid="voucher-admin-panel"]')).toBeVisible({
      timeout: 15000
    });

    // La lista lotti e' nella sotto-vista "Dashboard" del pannello voucher.
    await page.locator('#voucher-tabs button[data-tab="dashboard"]').click();

    const rows = page.locator('.voucher-grid-row');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('[data-testid="voucher-admin-panel"]')).toContainText(
      'Cliente Alfa E2E'
    );
    await expect(page.locator('[data-testid="voucher-admin-panel"]')).toContainText(
      'Cliente Beta E2E'
    );
  });
});

test.describe('Admin Fatture (data-driven)', () => {
  test('la tab Fatture renderizza le richieste seminate', async ({ page }) => {
    await mockSupabaseSession(page, { role: 'admin' });
    await mockAdminInvoices(page, [
      {
        id: 1,
        created_at: '2026-07-01T10:00:00Z',
        customer_name: 'Rossi Srl E2E',
        cliente_id: null,
        importo: 120.5,
        metodo_pagamento: 'contanti',
        categoria_prodotto: 'carburante',
        status: 'pending',
        note: '',
        station_id: 1,
        fuel_stations: { station_name: 'Stazione E2E' },
        users: { full_name: 'Operatore E2E', username: 'op-e2e' }
      },
      {
        id: 2,
        created_at: '2026-07-02T11:00:00Z',
        customer_name: 'Bianchi Spa E2E',
        cliente_id: null,
        importo: 80,
        metodo_pagamento: 'carta',
        categoria_prodotto: 'carburante',
        status: 'completed',
        note: '',
        station_id: 1,
        fuel_stations: { station_name: 'Stazione E2E' },
        users: { full_name: 'Operatore E2E', username: 'op-e2e' }
      }
    ]);

    await login(page, { role: 'admin' });
    await expect(page.locator('.admin-sidebar')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#admin-content')).toContainText('Venduto Oggi', { timeout: 15000 });

    // Su mobile la sidebar e' un drawer: aprirlo prima di cliccare la nav.
    await openSidebarIfMobile(page);
    await page.locator('[data-testid="nav-invoices"]').click();

    const table = page.locator('table.admin-table');
    await expect(table).toBeVisible({ timeout: 15000 });
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(table).toContainText('Rossi Srl E2E');
    await expect(table).toContainText('Bianchi Spa E2E');
  });
});
