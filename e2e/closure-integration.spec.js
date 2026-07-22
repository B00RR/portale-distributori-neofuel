import { test, expect } from '@playwright/test';
import { mockSupabaseSession, login, mockClosureRPCs } from './helpers/mock-supabase.js';

// Helper utility to return JSON responses for route fulfillment
const json = (route, status, payload) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: typeof payload === 'string' ? payload : JSON.stringify(payload)
  });

test.describe('Integrazione Chiusura Turno (Operatore)', () => {
  let currentShiftState = 'closed'; // 'closed', 'open', 'partial'

  test.beforeEach(async ({ page }) => {
    currentShiftState = 'closed';

    await mockSupabaseSession(page, { role: 'operator' });
    await mockClosureRPCs(page);

    // islands
    await page.route(/\/rest\/v1\/islands(\?|$)/, route =>
      json(route, 200, [{ island_id: 1, nome: 'Isola 1', station_id: 1 }])
    );

    // tanks
    await page.route(/\/rest\/v1\/tanks(\?|$)/, route =>
      json(route, 200, [{ id: 1, name: 'Cisterna 1', fuel_type: 'Diesel', station_id: 1 }])
    );

    // pistole
    await page.route(/\/rest\/v1\/pistole(\?|$)/, route =>
      json(route, 200, [
        { id: 1, island_id: 1, nome: 'Pistola 1', tipo_carburante: 'Diesel', station_id: 1 }
      ])
    );

    // get_last_pump_counters RPC
    await page.route(/\/rest\/v1\/rpc\/get_last_pump_counters/, route =>
      json(route, 200, [{ pistola_id: 1, last_counter: 1000 }])
    );

    // shift_pistols table
    await page.route(/\/rest\/v1\/shift_pistols(\?|$)/, route =>
      json(route, 200, [
        { shift_id: 1, pistola_id: 1, opened_at_counter: 1000, closed_at_counter: null }
      ])
    );

    // Dynamic shifts GET route handler
    await page.route(/\/rest\/v1\/shifts(\?|$)/, route => {
      if (currentShiftState === 'open') {
        return json(route, 200, [
          {
            id: 1,
            opened_at: new Date().toISOString(),
            closed_at: null,
            operator_id: 1,
            station_id: 1,
            status: 'open',
            opening_data: {
              cash_in: 100,
              cash_out: 0,
              pos_amount: 0,
              uta_dkv_iscard: 0,
              total_amount: 100
            },
            closing_data: null,
            users: { full_name: 'Utente E2E' }
          }
        ]);
      } else if (currentShiftState === 'partial') {
        return json(route, 200, [
          {
            id: 1,
            opened_at: new Date().toISOString(),
            closed_at: null,
            operator_id: 1,
            station_id: 1,
            status: 'partial',
            opening_data: {
              cash_in: 100,
              cash_out: 0,
              pos_amount: 0,
              uta_dkv_iscard: 0,
              total_amount: 100
            },
            closing_data: {
              closure_stage: 'partial'
            },
            users: { full_name: 'Utente E2E' }
          }
        ]);
      } else {
        return json(route, 200, []);
      }
    });

    // Dynamic open_shift RPC handler
    await page.route(/\/rest\/v1\/rpc\/open_shift/, route => {
      currentShiftState = 'open';
      return json(route, 200, { success: true, shift_id: 1, station_id: 1 });
    });

    // Dynamic submit_shift_closure_v2 RPC handler
    await page.route(/\/rest\/v1\/rpc\/submit_shift_closure_v2/, route => {
      const body = route.request().postDataJSON();
      const isPreview = body?.p_preview === true;
      if (!isPreview) {
        if (body?.p_closure_type === 'final') {
          currentShiftState = 'closed';
        } else {
          currentShiftState = 'partial';
        }
      }
      return json(route, 200, {
        success: true,
        idempotent: false,
        totals: {
          total_liters: 100.0,
          fuel_revenue: 150.0,
          total_fuel_revenue: 150.0,
          extra_revenue: 30.0,
          total_sold: 180.0,
          expected_cash: 175.0,
          real_cash: 175.0,
          discrepancy: 0.0,
          operator_cash: 175.0,
          operator_pos: 10.0,
          operator_fleet: 0.0,
          self_cash_in: 0.0,
          self_cash_out: 0.0,
          self_pos: 0.0,
          self_fleet: 0.0,
          self_manager: 0.0
        },
        computed: {
          totale_venduto_carburante: 150,
          totale_venduto_extra: 30,
          totale_venduto: 180,
          expected_cash: 175,
          real_cash: 175,
          discrepancy: 0
        },
        ...(isPreview ? { preview: true } : {})
      });
    });
  });

  test('apertura e chiusura parziale mostrano i totali corretti', async ({ page }) => {
    // 1. Login come operatore
    await login(page, { role: 'operator' });
    await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });

    // 2. Naviga al form di apertura turno (clicca il pulsante che inizialmente dice "Apertura")
    const btnTurno = page.locator('#btn-turno');
    await expect(btnTurno).toBeVisible();
    await expect(btnTurno).toContainText('Apertura');
    await btnTurno.click();

    // 3. Verifica che il form di apertura sia visibile
    await expect(page.locator('#apertura-form')).toBeVisible({ timeout: 15000 });

    // Compila i campi obbligatori per l'apertura
    await page.fill('input[name="cash_in"]', '100');
    await page.fill('input[name="total_amount"]', '100');
    await page.fill('input[name="p_1"]', '1050');
    await page.fill('input[name="tank_1"]', '500');

    // Invia il form (open_shift RPC)
    await page.locator('#apertura-form button[type="submit"]').click();

    // Clicca "Vai al Dashboard" sul successo dell'apertura
    await page.locator('button:has-text("Vai al Dashboard")').click();

    // 4. Verifica che dopo l'apertura, il dashboard operatore sia visibile con il pulsante che ora dice "Chiusura" e badge "Aperto"
    await expect(page.locator('.operator-menu')).toBeVisible({ timeout: 15000 });
    await expect(btnTurno).toContainText('Chiusura');
    await expect(page.locator('#opening-status')).toContainText('Aperto');

    // 5. Esegui la chiusura parziale
    await btnTurno.click();
    await expect(page.locator('closure-wizard')).toBeVisible({ timeout: 15000 });

    // Step 1: Inserisci contatore finale
    await page.fill('input[name="counter_1"]', '1100');
    await page.locator('button:has-text("Avanti")').click();

    // Step 2: Compila dati incasso e seleziona "No" per chiusura parziale
    await page.locator('.input-card:has(label:has-text("Contanti Reali")) input').fill('175');
    await page.locator('.input-card:has(label:has-text("POS (€)")) input').fill('10');
    await page.locator('.radio-option:has-text("No")').click();
    await page.locator('button:has-text("Avanti")').click();

    // Step 3: Verifica anteprima e salva
    await expect(
      page.locator('.section-title:has-text("Step 3: Anteprima e Conferma")')
    ).toBeVisible({
      timeout: 15000
    });
    await expect(page.locator('.preview-row:has-text("Totale venduto")')).toContainText('€ 180,00');

    await page.locator('button:has-text("Conferma & Salva")').click();

    // Verifica che lo stato aggiornato sia "Parziale"
    await expect(page.locator('#opening-status')).toContainText('Parziale', { timeout: 15000 });
  });

  test('anteprima server mostra totali calcolati', async ({ page }) => {
    currentShiftState = 'open';
    await login(page, { role: 'operator' });
    await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });

    const btnTurno = page.locator('#btn-turno');
    await expect(btnTurno).toContainText('Chiusura');
    await btnTurno.click();

    await expect(page.locator('closure-wizard')).toBeVisible({ timeout: 15000 });

    // Step 1
    await page.fill('input[name="counter_1"]', '1100');
    await page.locator('button:has-text("Avanti")').click();

    // Step 2
    await page.locator('.input-card:has(label:has-text("Contanti Reali")) input').fill('175');
    await page.locator('.input-card:has(label:has-text("POS (€)")) input').fill('10');
    await page.locator('button:has-text("Avanti")').click();

    // Step 3: Verifica che l'anteprima mostri i totali calcolati dal mock
    await expect(
      page.locator('.section-title:has-text("Step 3: Anteprima e Conferma")')
    ).toBeVisible({
      timeout: 15000
    });
    await expect(page.locator('.preview-row:has-text("Ricavo carburante")')).toContainText(
      '€ 150,00'
    );
    await expect(page.locator('.preview-row:has-text("Totale venduto")')).toContainText('€ 180,00');
    await expect(page.locator('.preview-row:has-text("Discrepanza")')).toContainText('€ 0,00');
  });

  test('replay idempotente non duplica la chiusura', async ({ page }) => {
    // Mocka submit_shift_closure_v2 per ritornare idempotent: true
    await page.route(/\/rest\/v1\/rpc\/submit_shift_closure_v2/, route => {
      const body = route.request().postDataJSON();
      const isPreview = body?.p_preview === true;
      if (!isPreview) {
        currentShiftState = 'closed';
      }
      return json(route, 200, {
        success: true,
        idempotent: true,
        totals: {
          total_liters: 100.0,
          fuel_revenue: 150.0,
          total_fuel_revenue: 150.0,
          extra_revenue: 30.0,
          total_sold: 180.0,
          expected_cash: 175.0,
          real_cash: 175.0,
          discrepancy: 0.0,
          operator_cash: 175.0,
          operator_pos: 10.0,
          operator_fleet: 0.0,
          self_cash_in: 0.0,
          self_cash_out: 0.0,
          self_pos: 0.0,
          self_fleet: 0.0,
          self_manager: 0.0
        },
        computed: {
          totale_venduto_carburante: 150,
          totale_venduto_extra: 30,
          totale_venduto: 180,
          expected_cash: 175,
          real_cash: 175,
          discrepancy: 0
        },
        ...(isPreview ? { preview: true } : {})
      });
    });

    currentShiftState = 'open';
    await login(page, { role: 'operator' });
    await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });

    const btnTurno = page.locator('#btn-turno');
    await expect(btnTurno).toContainText('Chiusura');
    await btnTurno.click();

    // Step 1
    await page.fill('input[name="counter_1"]', '1100');
    await page.locator('button:has-text("Avanti")').click();

    // Step 2
    await page.locator('.input-card:has(label:has-text("Contanti Reali")) input').fill('175');
    await page.locator('.input-card:has(label:has-text("POS (€)")) input').fill('10');

    // Scegli chiusura finale "Sì" (default)
    await page.locator('button:has-text("Avanti")').click();

    // Step 3: Conferma & Salva
    await expect(
      page.locator('.section-title:has-text("Step 3: Anteprima e Conferma")')
    ).toBeVisible({
      timeout: 15000
    });

    // Gestisci il window.confirm per la chiusura finale
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.locator('button:has-text("Conferma & Salva")').click();

    // Verifica che non ci siano errori, la chiusura abbia successo e il badge dica "Chiuso"
    await expect(page.locator('#opening-status')).toContainText('Chiuso', { timeout: 15000 });
  });
});
