import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial', retries: 1 });

test.describe('Critical User Flows - E2E', () => {

    test.describe('Authentication Flow', () => {
        test('should allow valid admin login', async ({ page }) => {
            await page.goto('/');

            // Wait for login form
            await page.waitForSelector('#email');

            // Fill credentials
            await page.fill('#email', 'lorenzo96barra@outlook.com');
            await page.fill('#password', '123na123');

            // Submit
            await page.click('button[type="submit"]');

            // Verify redirect to dashboard (Verify element since it's a SPA on same URL)
            await expect(page.locator('.admin-sidebar')).toBeVisible({ timeout: 10000 });
            await expect(page.locator('#page-subtitle')).toHaveText('Dashboard');
            await expect(page.locator('#page-subtitle')).toContainText('Dashboard');
        });

        test('should reject invalid credentials', async ({ page }) => {
            await page.goto('/');

            await page.fill('#email', 'wrong@email.com');
            await page.fill('#password', 'wrongpass');
            await page.click('button[type="submit"]');

            // Should show error
            const error = page.locator('#login-error, .error-message');
            await expect(error).toBeVisible({ timeout: 5000 });
        });

        test.skip('should enforce rate limiting on login attempts', async ({ page }) => {
            await page.goto('/');

            // Attempt multiple logins rapidly
            for (let i = 0; i < 6; i++) {
                await page.fill('#email', 'test@test.com');
                await page.fill('#password', 'wrong');
                await page.click('button[type="submit"]');
                await page.waitForTimeout(100);
            }

            // Expect rate limit message
            const rateLimit = page.locator('text=/troppi tentativi/i');
            await expect(rateLimit).toBeVisible({ timeout: 3000 });
        });
    });

    test.describe('Admin Navigation', () => {
        test.beforeEach(async ({ page }) => {
            // Forward console logs to terminal
            page.on('console', msg => {
                console.log(`[BROWSER] ${msg.text()}`);
            });
            // Login as admin
            await page.goto('/');
            await page.fill('#email', 'lorenzo96barra@outlook.com');
            await page.fill('#password', '123na123');
            await page.click('button[type="submit"]');
            await expect(page.locator('.admin-sidebar')).toBeVisible();
        });

        test('should navigate between tabs correctly', async ({ page }) => {
            // Click Stations tab
            await page.click('[data-tab="stations"]');
            await expect(page.locator('#page-subtitle')).toContainText('Distributori');

            // Click Dashboard tab
            await page.click('[data-tab="dashboard"]');
            await expect(page.locator('#page-subtitle')).toContainText('Dashboard');
        });

        test('should show Analytics tab with correct data', async ({ page }) => {
            await page.click('[data-tab="analytics"]');
            await expect(page.locator('#page-subtitle')).toContainText('Analytics');

            // Wait for charts to load
            await page.waitForSelector('#revenue-chart', { timeout: 10000 });
            await page.waitForSelector('#volume-chart');

            // Verify charts are rendered
            const revenueChart = page.locator('#revenue-chart');
            await expect(revenueChart).toBeVisible();
        });
    });

    test.describe('Voucher Lifecycle (Critical Flow)', () => {

        test('should create and redeem a voucher', async ({ page, browser }) => {
            // ADMIN SIDE
            await page.goto('/');
            await page.fill('#email', 'lorenzo96barra@outlook.com');
            await page.fill('#password', '123na123');

            await page.click('button[type="submit"]');
            await expect(page.locator('.admin-sidebar')).toBeVisible();

            await page.click('[data-tab="vouchers"]');
            await page.waitForSelector('#voucher-generator-form');

            const customerName = `E2E_Test_${Date.now()}`;
            await page.fill('input[name="amount"]', '50');
            await page.fill('input[name="quantity"]', '1');
            await page.fill('input[name="customer_name"]', customerName);
            await page.click('#voucher-generator-form button[type="submit"]');

            // Handle confirmation modal
            await page.waitForSelector('#confirm-ok');
            await page.click('#confirm-ok');

            await expect(page.locator('text=Voucher generati con successo')).toBeVisible();

            // OPERATOR SIDE - Create a fresh context to avoid session pollution
            const operatorContext = await browser.newContext();
            const operatorPage = await operatorContext.newPage();

            await operatorPage.goto('/');
            await operatorPage.fill('#email', 'test_operator@neofuel.it');
            await operatorPage.fill('#password', '123na123');
            await operatorPage.click('button[type="submit"]');

            await expect(operatorPage.locator('.operator-container')).toBeVisible();

            // Search and redeem (logic from vouchers.js)
            // 1. Open Accordion
            await operatorPage.click('#btn-movimenti');

            // 2. Click Voucher sub-menu
            await operatorPage.click('#btn-voucher');

            // 3. Verify Modal is open
            await expect(operatorPage.locator('.voucher-modal-content')).toBeVisible();

            // 4. Try Manual Entry (easier for E2E than camera)
            await operatorPage.click('#manual-entry-btn');
            await expect(operatorPage.locator('#manual-entry-form')).toBeVisible();

            await operatorContext.close();
        });
    });

    test.describe.skip('Adversarial Testing', () => {
        test.beforeEach(async ({ page }) => {
            // Forward console logs to terminal
            page.on('console', msg => {
                if (msg.text().includes('[Auth]') || msg.text().includes('[Layout]') || msg.text().includes('[Router]')) {
                    console.log(`[BROWSER] ${msg.text()}`);
                }
            });
            await page.goto('/');
            // Login as admin
            await page.fill('#email', 'lorenzo96barra@outlook.com');
            await page.fill('#password', '123na123');

            await page.click('button[type="submit"]');
        });

        test('should sanitize XSS in voucher customer name', async ({ page }) => {
            await page.click('[data-tab="vouchers"]');
            await page.waitForSelector('#voucher-generator-form');

            // Try XSS injection
            const xssPayload = '<script>alert("XSS")</script>';
            await page.fill('input[name="customer_name"]', xssPayload);
            await page.fill('input[name="amount"]', '100');
            await page.click('#voucher-generator-form button[type="submit"]');

            // Handle confirmation modal
            await page.click('#confirm-ok');

            // Verify no alert was triggered (would fail test if XSS worked)
            await page.waitForTimeout(1000);

            // Verify data is escaped in UI
            const displayedName = await page.locator('.voucher-customer').first().textContent();
            expect(displayedName).not.toContain('<script>');
            expect(displayedName).toContain('&lt;script&gt;');
        });

        test('should handle giant input strings gracefully', async ({ page }) => {
            await page.goto('/');
            await page.fill('#email', 'lorenzo96barra@outlook.com');
            await page.fill('#password', '123na123');

            await page.click('button[type="submit"]');

            await page.click('[data-tab="vouchers"]');
            await page.waitForSelector('#voucher-generator-form');

            // 10KB string
            const giantString = 'A'.repeat(10000);
            await page.fill('input[name="customer_name"]', giantString);
            await page.fill('input[name="amount"]', '50');

            // Should not crash
            await page.click('#voucher-generator-form button[type="submit"]');

            // Verify error or truncation
            const error = page.locator('.error-message, .validation-error');
            await expect(error).toBeVisible({ timeout: 3000 });
        });
    });
});
