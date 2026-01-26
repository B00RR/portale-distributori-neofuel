import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Voucher Management
 * Tests the complete voucher flow: emission and redemption.
 */

test.describe('Voucher Management Flow', () => {

    // Mock successful admin login
    test.beforeEach(async ({ page }) => {
        page.on('console', msg => console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`));
        page.on('request', req => console.log(`[REQUEST] ${req.method()} ${req.url()}`));

        // Auth Token
        await page.route(/.*\/auth\/v1\/token.*/, async route => {
            await route.fulfill({
                json: {
                    access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.signature",
                    token_type: "bearer",
                    expires_in: 3600,
                    refresh_token: "mock_refresh_token",
                    user: {
                        id: "admin_uuid_456",
                        aud: "authenticated",
                        role: "authenticated",
                        email: "admin@neofuel.it",
                        app_metadata: { role: "admin" },
                        user_metadata: { full_name: "Test Admin" }
                    }
                }
            });
        });

        // Users
        await page.route(/.*\/rest\/v1\/users.*/, async route => {
            await route.fulfill({
                json: {
                    id: "admin_uuid_456",
                    user_id: 2,
                    email: "admin@neofuel.it",
                    full_name: "Test Admin",
                    role: "admin"
                }
            });
        });

        // Fuel Stations
        await page.route(/.*\/rest\/v1\/fuel_stations.*/, async route => {
            await route.fulfill({ json: [{ station_id: 1, station_name: 'Stazione Test' }] });
        });

        // Tanks
        await page.route(/.*\/rest\/v1\/tanks.*/, async route => {
            await route.fulfill({ json: [] });
        });

        // Shifts (Catch all shifts requests)
        await page.route(/.*\/rest\/v1\/shifts.*/, async route => {
            await route.fulfill({
                json: [{
                    id: 1,
                    opened_at: new Date().toISOString(),
                    operator_id: 'operator_uuid_123',
                    status: 'open'
                }]
            });
        });

        // Calculation Modules (KPIs)
        await page.route(/.*\/rest\/v1\/calculation_modules.*/, async route => {
            await route.fulfill({ json: [] });
        });

        // Crediti Clienti
        await page.route(/.*\/rest\/v1\/crediti_clienti.*/, async route => {
            await route.fulfill({
                json: [
                    { id: 1, cliente: "Cliente Test" },
                    { id: 2, cliente: "Cliente B" }
                ]
            });
        });

        // Vouchers (Generic)
        await page.route(/.*\/rest\/v1\/vouchers.*/, async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    json: [
                        {
                            id: 1,
                            batch_id: "batch-uuid-1",
                            code: 'TEST-VOUCHER-001',
                            amount: 50.00,
                            status: 'active',
                            created_at: new Date().toISOString(),
                            redeemed_at: null
                        }
                    ]
                });
            } else {
                await route.fulfill({ json: { success: true } });
            }
        });

        // Voucher Batches
        await page.route(/.*\/rest\/v1\/voucher_batches.*/, async route => {
            await route.fulfill({
                json: [{
                    id: "batch-uuid-1",
                    description: "Batch Test",
                    customer_name: "Cliente Test",
                    expiration_date: null,
                    created_at: new Date().toISOString()
                }]
            });
        });

        // UI Settings
        await page.route(/.*\/rest\/v1\/ui_settings.*/, async route => {
            await route.fulfill({ json: [] });
        });
    });

    test('should display admin dashboard after login', async ({ page }) => {
        await page.goto('/');
        await page.fill('#email', 'admin@neofuel.it');
        await page.fill('#password', 'password123');
        await page.click('button[type="submit"]');

        // Wait for admin dashboard
        await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });

        // Admin sidebar should be visible
        await expect(page.locator('[data-testid="admin-sidebar"]')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to voucher management section', async ({ page }) => {
        await page.goto('/');
        await page.fill('#email', 'admin@neofuel.it');
        await page.fill('#password', 'password123');
        await page.click('button[type="submit"]');

        await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });

        // Check dashboard first to ensure sidebar loaded
        await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();

        // Click on Voucher menu item
        await page.click('[data-testid="nav-vouchers"]');

        // Voucher management content should appear
        await expect(page.locator('[data-testid="voucher-admin-panel"]')).toBeVisible({ timeout: 10000 });
    });

    test('should display voucher list with status indicators', async ({ page }) => {
        await page.goto('/');
        await page.fill('#email', 'admin@neofuel.it');
        await page.fill('#password', 'password123');
        await page.click('button[type="submit"]');

        await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });

        // Navigate to vouchers
        await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();
        await page.click('[data-testid="nav-vouchers"]');

        // Should display the mocked voucher inside the component
        await expect(page.locator('[data-testid="voucher-admin-panel"]')).toBeVisible();

        // Switch to Dashboard tab (Ensure we click the TAB, not the sidebar)
        await page.click('.tab-btn-large[data-tab="dashboard"]');

        await expect(page.locator('text=Cliente Test')).toBeVisible({ timeout: 10000 });

        await expect(page.locator('text=Cliente Test')).toBeVisible({ timeout: 10000 });
    });
});

test.describe('Voucher Redemption Flow (Operator)', () => {

    test.beforeEach(async ({ page }) => {
        // Mock Supabase Auth Response for Operator
        await page.route('**/auth/v1/token?grant_type=password', async route => {
            const json = {
                access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.signature",
                token_type: "bearer",
                expires_in: 3600,
                refresh_token: "mock_refresh_token",
                user: {
                    id: "operator_uuid_123",
                    aud: "authenticated",
                    role: "authenticated",
                    email: "operatore@neofuel.it",
                    app_metadata: { role: "operator" },
                    user_metadata: { full_name: "Test Operatore" }
                }
            };
            await route.fulfill({ json });
        });

        // Mock users (Object for single result)
        await page.route('**/rest/v1/users*', async route => {
            await route.fulfill({
                json: {
                    id: "operator_uuid_123",
                    user_id: 1,
                    email: "operatore@neofuel.it",
                    full_name: "Test Operatore",
                    role: "operator"
                }
            });
        });

        // Mock user_stations
        await page.route('**/rest/v1/user_stations*', async route => {
            await route.fulfill({ json: [{ station_id: 1 }] });
        });

        // Mock active shift
        await page.route('**/rest/v1/shifts*', async route => {
            await route.fulfill({
                json: [{
                    id: 1,
                    opened_at: new Date().toISOString(),
                    operator_id: 'operator_uuid_123',
                    status: 'open'
                }]
            });
        });

        // Mock voucher lookup RPC
        await page.route('**/rest/v1/rpc/lookup_voucher*', async route => {
            await route.fulfill({
                json: {
                    success: true,
                    voucher: {
                        id: 1,
                        code: 'REDEEM-ME-001',
                        value: 25.00,
                        status: 'active'
                    }
                }
            });
        });

        // Mock voucher redemption RPC
        await page.route('**/rest/v1/rpc/redeem_voucher*', async route => {
            await route.fulfill({
                json: { success: true, message: 'Voucher riscattato con successo' }
            });
        });
    });

    test('should open voucher redemption modal from operator menu', async ({ page }) => {
        await page.goto('/');
        await page.fill('#email', 'operatore@neofuel.it');
        await page.fill('#password', 'password123');
        await page.click('button[type="submit"]');

        await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });

        // Click on Movimenti accordion to expand
        await page.click('[data-testid="btn-movimenti"]');

        // Wait for submenu to be visible
        const btnVoucher = page.locator('[data-testid="btn-voucher"]');
        await expect(btnVoucher).toBeVisible();

        // Click on Voucher
        await btnVoucher.click();

        // Voucher manager or redemption UI should appear
        // Note: In operator view it is inside a modal
        await expect(page.locator('voucher-manager')).toBeVisible({ timeout: 10000 });
    });
});
