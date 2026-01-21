import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Voucher Management
 * Tests the complete voucher flow: emission and redemption.
 */

test.describe('Voucher Management Flow', () => {

    // Mock successful admin login
    test.beforeEach(async ({ page }) => {
        // Mock Supabase Auth Response for Admin
        await page.route('**/auth/v1/token?grant_type=password', async route => {
            const json = {
                access_token: "mock_access_token_admin",
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
            };
            await route.fulfill({ json });
        });

        // Mock users table lookup
        await page.route('**/rest/v1/users*', async route => {
            await route.fulfill({
                json: [{
                    id: "admin_uuid_456",
                    user_id: 2,
                    email: "admin@neofuel.it",
                    full_name: "Test Admin",
                    role: "admin"
                }]
            });
        });

        // Mock fuel_stations
        await page.route('**/rest/v1/fuel_stations*', async route => {
            await route.fulfill({
                json: [{ station_id: 1, station_name: 'Stazione Test' }]
            });
        });

        // Mock vouchers table
        await page.route('**/rest/v1/vouchers*', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    json: [
                        {
                            id: 1,
                            code: 'TEST-VOUCHER-001',
                            value: 50.00,
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

        // Mock UI settings
        await page.route('**/rest/v1/ui_settings*', async route => {
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
        await expect(page.locator('.sidebar, .admin-sidebar, [class*="sidebar"]')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to voucher management section', async ({ page }) => {
        await page.goto('/');
        await page.fill('#email', 'admin@neofuel.it');
        await page.fill('#password', 'password123');
        await page.click('button[type="submit"]');

        await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });

        // Click on Voucher menu item
        await page.click('text=Voucher');

        // Voucher management content should appear
        await expect(page.locator('text=Gestione Voucher, voucher-manager, [data-section="vouchers"]')).toBeVisible({ timeout: 10000 });
    });

    test('should display voucher list with status indicators', async ({ page }) => {
        await page.goto('/');
        await page.fill('#email', 'admin@neofuel.it');
        await page.fill('#password', 'password123');
        await page.click('button[type="submit"]');

        await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });

        // Navigate to vouchers
        await page.click('text=Voucher');

        // Should display the mocked voucher
        await expect(page.locator('text=TEST-VOUCHER-001')).toBeVisible({ timeout: 10000 });
    });
});

test.describe('Voucher Redemption Flow (Operator)', () => {

    test.beforeEach(async ({ page }) => {
        // Mock Supabase Auth Response for Operator
        await page.route('**/auth/v1/token?grant_type=password', async route => {
            const json = {
                access_token: "mock_access_token_operator",
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

        // Mock users
        await page.route('**/rest/v1/users*', async route => {
            await route.fulfill({
                json: [{
                    id: "operator_uuid_123",
                    user_id: 1,
                    email: "operatore@neofuel.it",
                    full_name: "Test Operatore",
                    role: "operator"
                }]
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

        // Click on Voucher/Riscatto menu item
        await page.click('text=Voucher');

        // Voucher manager or redemption UI should appear
        await expect(page.locator('.modal, voucher-manager, [data-section="vouchers"]')).toBeVisible({ timeout: 10000 });
    });
});
