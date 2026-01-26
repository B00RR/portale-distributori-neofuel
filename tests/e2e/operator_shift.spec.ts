import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Operator Shift Operations
 * Tests the critical flows: shift opening, closure, and related operations.
 */

test.describe('Operator Shift Flow', () => {

    // Mock successful operator login
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

        // Mock users table lookup
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

        // Mock user_stations lookup
        await page.route('**/rest/v1/user_stations*', async route => {
            await route.fulfill({
                json: [{ station_id: 1 }]
            });
        });

        // Mock shifts table (no active shift initially)
        await page.route('**/rest/v1/shifts*', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({ json: [] });
            } else {
                await route.fulfill({ json: { id: 1, status: 'open' } });
            }
        });

        // Mock islands
        await page.route('**/rest/v1/islands*', async route => {
            await route.fulfill({
                json: [
                    { island_id: 1, nome: 'Isola 1', station_id: 1 },
                    { island_id: 2, nome: 'Isola 2', station_id: 1 }
                ]
            });
        });

        // Mock pistole (fuel pumps)
        await page.route('**/rest/v1/pistole*', async route => {
            await route.fulfill({
                json: [
                    { id: 1, nome: 'Pistola 1', island_id: 1, tipo_carburante: 'benzina' },
                    { id: 2, nome: 'Pistola 2', island_id: 1, tipo_carburante: 'gasolio' },
                    { id: 3, nome: 'Pistola 3', island_id: 2, tipo_carburante: 'benzina' }
                ]
            });
        });

        // Mock fuel_stations config
        await page.route('**/rest/v1/fuel_stations*', async route => {
            await route.fulfill({
                json: [{ station_id: 1, station_name: 'Stazione Test', allow_partial_closure: true }]
            });
        });
    });

    test('should display operator menu after login', async ({ page }) => {
        await page.goto('/');
        await page.fill('#email', 'operatore@neofuel.it');
        await page.fill('#password', 'password123');
        await page.click('button[type="submit"]');

        // Wait for operator menu to appear
        await expect(page.locator('[data-testid="operator-menu"]')).toBeVisible({ timeout: 15000 });

        // Menu items should be visible (apertura, chiusura, etc. via data-testid)
        await expect(page.locator('[data-testid="btn-turno"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Apertura')).toBeVisible();
    });

    test('should open shift opener component when clicking Apertura', async ({ page }) => {
        await page.goto('/');
        await page.fill('#email', 'operatore@neofuel.it');
        await page.fill('#password', 'password123');
        await page.click('button[type="submit"]');

        // Wait for operator menu
        await expect(page.locator('[data-testid="operator-menu"]')).toBeVisible({ timeout: 15000 });

        // Click on Apertura button
        await page.click('[data-testid="btn-turno"]');

        // Modal with shift-opener component should appear
        await expect(page.locator('shift-opener')).toBeVisible({ timeout: 10000 });
    });

    test('should show closure wizard when clicking Chiusura with active shift', async ({ page }) => {
        // Override shifts mock to return an active shift
        await page.route('**/rest/v1/shifts*', async route => {
            await route.fulfill({
                json: [{
                    id: 1,
                    opened_at: new Date().toISOString(),
                    operator_id: 'operator_uuid_123',
                    status: 'open',
                    closing_data: null
                }]
            });
        });

        await page.goto('/');
        await page.fill('#email', 'operatore@neofuel.it');
        await page.fill('#password', 'password123');
        await page.click('button[type="submit"]');

        await expect(page.locator('[data-testid="operator-menu"]')).toBeVisible({ timeout: 15000 });

        // Click on Chiusura (Dynamically updated button)
        await page.click('[data-testid="btn-turno"]');

        // Closure wizard should appear
        await expect(page.locator('closure-wizard')).toBeVisible({ timeout: 10000 });
    });
});
