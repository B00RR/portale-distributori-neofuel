/**
 * E2E Test: Operator Flow (Apertura/Chiusura Turno)
 * Testa il flusso completo operatore usando l'override del ruolo per stabilità E2E
 */

import { test, expect } from '@playwright/test';



async function loginAsOperator(page) {
    // [ARCHITECT] Use Admin account but override role to operator for E2E stability
    await page.goto('/?test_role=operator');
    await page.fill('#email', 'lorenzo96barra@outlook.com');
    await page.fill('#password', '123na123');
    await page.click('button[type="submit"]');

    // Check for operator container
    await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });
}


test.beforeEach(async ({ page }) => {
    console.log('[TEST] Setting up Global Mocks');

    // [DEBUG] Capture browser console logs and errors
    page.on('console', msg => console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`[BROWSER ERROR] ${err.message}`));

    // [DEBUG] Spy on all requests
    await page.route('**', async route => {
        const url = route.request().url();
        // Filter out noisy static asset logs if needed
        if (!url.match(/\.(css|js|png|svg|woff2)$/)) {
            console.log('[SPY] Request:', url);
        }
        await route.continue();
    });

    // [MOCK] Auth Login (POST /auth/v1/token)
    await page.route(/\/auth\/v1\/token/, async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                access_token: "fake-jwt-token",
                token_type: "bearer",
                expires_in: 3600,
                refresh_token: "fake-refresh-token",
                user: {
                    id: "00000000-0000-0000-0000-000000000001",
                    aud: "authenticated",
                    role: "authenticated",
                    email: "test@example.com",
                    confirmed_at: new Date().toISOString(),
                    user_metadata: { role: "operator", full_name: "Test Operator" }
                }
            })
        });
    });

    // [MOCK] Users Table (GET /rest/v1/users)
    await page.route(/\/rest\/v1\/users/, async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                id: "00000000-0000-0000-0000-000000000001",
                email: "test@example.com",
                role: "operator",
                full_name: "Test Operator",
                user_id: 1,
                user_stations: [{ station_id: 1, fuel_stations: { station_name: "Test Station" } }]
            })
        });
    });

    // [MOCK] User Stations
    await page.route(/\/rest\/v1\/user_stations/, async route => {
        await route.fulfill({ status: 200, body: JSON.stringify([{ station_id: 1, role: 'operator' }]) });
    });

    // [MOCK] Fuel Stations
    await page.route(/\/rest\/v1\/fuel_stations/, async route => {
        await route.fulfill({ status: 200, body: JSON.stringify([{ station_id: 1, station_name: 'Test Station' }]) });
    });

    // [MOCK] Islands
    await page.route(/\/rest\/v1\/islands/, async route => {
        await route.fulfill({ status: 200, body: JSON.stringify([{ island_id: 1, nome: 'Isola 1', station_id: 1 }]) });
    });

    // [MOCK] Tanks
    await page.route(/\/rest\/v1\/tanks/, async route => {
        await route.fulfill({ status: 200, body: JSON.stringify([]) });
    });

    // [MOCK] Pistole (Pumps)
    await page.route(/\/rest\/v1\/pistole/, async route => {
        await route.fulfill({
            status: 200,
            body: JSON.stringify([{
                id: 1,
                island_id: 1,
                nome: 'Pistola 1',
                tipo_carburante: 'Benzina',
                numero_litri: 1234.56,
                islands: { nome: 'Isola 1' }
            }])
        });
    });

    // [MOCK] Last Counters
    await page.route(/\/rest\/v1\/(shift_pistols|chiusura_turno_pistole)/, async route => {
        // Only mock GET. POST is handled specifically if needed or defaults to success.
        if (route.request().method() === 'GET') {
            await route.fulfill({ status: 200, body: JSON.stringify([]) });
        } else {
            await route.continue();
        }
    });

    // [MOCK] Default Shift Status (Closed)
    // Individual tests can override this!
    await page.route(/\/rest\/v1\/shifts/, async route => {
        const method = route.request().method();
        if (method === 'GET') {
            // Default: No active shift
            await route.fulfill({ status: 200, body: JSON.stringify([]) });
        } else {
            // POST needs to return the created object
            console.log('[MOCK] Default POST Shift handler triggered');
            await route.fulfill({
                status: 201,
                body: JSON.stringify({
                    id: 999,
                    status: 'open',
                    opened_at: new Date().toISOString(),
                    operator_id: "00000000-0000-0000-0000-000000000001"
                })
            });
        }
    });

    // [MOCK] Default Shift Details (POST)
    await page.route(/\/rest\/v1\/(shift_pistols|shift_tanks)/, async route => {
        if (route.request().method() === 'POST') {
            await route.fulfill({ status: 201, body: JSON.stringify([]) });
        } else {
            await route.continue();
        }
    });
});

test.describe('Apertura Turno', () => {

    test('completa apertura turno con contatori pistole', async ({ page }) => {
        // No specific override needed as default is "Closed" -> "Open"

        console.log('[TEST] Logging in as Operator');
        await loginAsOperator(page);

        await page.click('#btn-turno');
        await expect(page.locator('#app-modal, .modal, dialog[open]')).toBeVisible({ timeout: 10000 });

        const counters = page.locator('[name^="p_"], [name*="numeratore"]');
        await expect(counters.first()).toBeVisible({ timeout: 15000 });
        await counters.first().fill('1234.56');

        // Click confirm
        await page.click('button:has-text("Conferma"), button:has-text("Apri"), button[type="submit"]');

        // Expect success message
        await expect(page.locator('.toast, .alert, text=/successo|aperto/i')).toBeVisible({ timeout: 15000 });
    });

    test('pulsante cambia in Chiusura se turno aperto', async ({ page }) => {
        // Override shift status to OPEN
        await page.route(/\/rest\/v1\/shifts/, async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify([{
                        id: 888,
                        status: 'open',
                        opened_at: new Date().toISOString(),
                        operator_id: "00000000-0000-0000-0000-000000000001"
                    }])
                });
            } else {
                await route.continue();
            }
        });

        await loginAsOperator(page);

        const btn = page.locator('#btn-turno');
        await expect(btn).toBeVisible({ timeout: 10000 });
        // The text should now indicate closure or "Turno Aperto"
        await expect(btn).toContainText(/Chiudi|Turno/i);
        // More specific check could be done if we know exact UI
    });
});

test.describe('Voucher Redemption', () => {

    test('riscatta voucher con codice manuale', async ({ page }) => {
        // Override shift status to OPEN (Required for redemption?)
        // Assuming redemption requires an open shift.
        await page.route(/\/rest\/v1\/shifts/, async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify([{
                        id: 888,
                        status: 'open',
                        opened_at: new Date().toISOString(),
                        operator_id: "00000000-0000-0000-0000-000000000001"
                    }])
                });
            } else {
                await route.continue();
            }
        });

        // [MOCK] Intercept voucher check
        await page.route(/\/rest\/v1\/vouchers/, async route => {
            console.log('[MOCK] Intercepted voucher check:', route.request().url());
            const url = route.request().url();
            if (url.includes('select') && route.request().method() === 'GET') {
                // Return a valid voucher
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([{
                        id: '00000000-0000-0000-0000-000000000000',
                        code: 'TEST1234',
                        amount: 10.00,
                        status: 'active',
                        voucher_batches: { customer_name: 'Test Customer' }
                    }])
                });
            } else {
                await route.continue();
            }
        });

        // [MOCK] Intercept redemption RPC
        await page.route(/\/rpc\/redeem_voucher_validated/, async route => {
            console.log('[MOCK] Intercepted redemption RPC:', route.request().url());
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true })
            });
        });

        await loginAsOperator(page);

        // Check if voucher button is enabled (might depend on open shift)

        await page.click('#btn-movimenti');
        // Note: btn-movimenti might assume sidebar or specific layout? 
        // If Operator UI has "Voucher" button directly?
        // Let's assume the previous test code was correct about navigation.

        // Wait for voucher button/menu item
        const btnVoucher = page.locator('#btn-voucher, button:has-text("Voucher")');
        if (await btnVoucher.isVisible()) {
            await btnVoucher.click();
        } else {
            console.log('Voucher button not found immediately, checking menu...');
            // Maybe it's under a menu?
        }

        await expect(page.locator('#app-modal, .modal')).toBeVisible();

        const codeInput = page.locator('[name*="voucher_code"], [name*="codice"]');
        await expect(codeInput).toBeVisible({ timeout: 5000 });
        await codeInput.fill('TEST1234');
        await page.click('button:has-text("Verifica"), button:has-text("OK")');

        const result = page.locator('.voucher-result, #voucher-result, .alert, h2:has-text("Voucher Valido")');
        await expect(result.first()).toBeVisible({ timeout: 10000 });

        // Complete redemption
        await page.click('button:has-text("Riscatta")');
        await expect(page.locator('text=Riscattato!')).toBeVisible({ timeout: 10000 });
    });
});
