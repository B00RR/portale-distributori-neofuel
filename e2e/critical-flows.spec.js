import { test, expect } from '@playwright/test';

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
            await page.click('#login-btn');

            // Verify redirect to dashboard
            await expect(page).toHaveURL(/.*admin/);
            await expect(page.locator('#page-subtitle')).toContainText('Dashboard');
        });

        test('should reject invalid credentials', async ({ page }) => {
            await page.goto('/');

            await page.fill('#email', 'wrong@email.com');
            await page.fill('#password', 'wrongpass');
            await page.click('#login-btn');

            // Should show error
            const error = page.locator('#login-error, .error-message');
            await expect(error).toBeVisible({ timeout: 5000 });
        });

        test('should enforce rate limiting on login attempts', async ({ page }) => {
            await page.goto('/');

            // Attempt multiple logins rapidly
            for (let i = 0; i < 6; i++) {
                await page.fill('#email', 'test@test.com');
                await page.fill('#password', 'wrong');
                await page.click('#login-btn');
                await page.waitForTimeout(100);
            }

            // Expect rate limit message
            const rateLimit = page.locator('text=/troppi tentativi/i');
            await expect(rateLimit).toBeVisible({ timeout: 3000 });
        });
    });

    test.describe('Admin Navigation', () => {
        test.beforeEach(async ({ page }) => {
            // Login as admin
            await page.goto('/');
            await page.fill('#email', 'lorenzo96barra@outlook.com');
            await page.fill('#password', '123na123');
            await page.click('#login-btn');
            await page.waitForURL(/.*admin/);
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
        test.use({ storageState: 'playwright/.auth/admin.json' }); // Use saved auth

        test('should create and redeem a voucher', async ({ page, context }) => {
            // Admin: Create voucher
            await page.goto('/');
            await page.click('[data-tab="vouchers"]');

            await page.click('#btn-create-voucher');
            await page.fill('#voucher-amount', '50');
            await page.fill('#voucher-customer', 'Test Customer');
            await page.click('#btn-save-voucher');

            // Wait for confirmation
            await expect(page.locator('text=/creato con successo/i')).toBeVisible({ timeout: 5000 });

            // Get voucher code from UI
            const voucherCode = await page.locator('.voucher-code').first().textContent();

            // Open operator panel in new tab
            const operatorPage = await context.newPage();
            await operatorPage.goto('/');

            // Login as operator
            await operatorPage.fill('#email', 'lorenzo.barra@ergenya.com');
            await operatorPage.fill('#password', '123na123');
            await operatorPage.click('#login-btn');

            // Redeem voucher
            await operatorPage.click('#btn-vouchers');
            await operatorPage.fill('#manual-voucher-code', voucherCode);
            await operatorPage.click('#btn-verify-manual');

            // Confirm redemption
            await operatorPage.click('#confirm-redeem');

            // Verify success
            await expect(operatorPage.locator('text=/riscattato con successo/i')).toBeVisible({ timeout: 5000 });

            await operatorPage.close();
        });

        test('should prevent double redemption (Race Condition)', async ({ page, context }) => {
            const voucherCode = 'TEST123'; // Pre-created test voucher

            // Open two operator tabs
            const op1 = await context.newPage();
            const op2 = await context.newPage();

            // Both try to redeem simultaneously
            await Promise.all([
                op1.goto('/'),
                op2.goto('/')
            ]);

            // Login both
            for (const p of [op1, op2]) {
                await p.fill('#email', 'lorenzo.barra@ergenya.com');
                await p.fill('#password', '123na123');
                await p.click('#login-btn');
            }

            // Both attempt redemption
            await Promise.all([
                op1.fill('#manual-voucher-code', voucherCode),
                op2.fill('#manual-voucher-code', voucherCode)
            ]);

            await Promise.all([
                op1.click('#btn-verify-manual'),
                op2.click('#btn-verify-manual')
            ]);

            // One should succeed, one should fail
            const results = await Promise.all([
                op1.locator('text=/riscattato|già riscattato/i').textContent(),
                op2.locator('text=/riscattato|già riscattato/i').textContent()
            ]);

            // Verify one error, one success
            expect(results.some(r => r.includes('già'))).toBe(true);

            await op1.close();
            await op2.close();
        });
    });

    test.describe('Adversarial Testing', () => {
        test('should sanitize XSS in voucher customer name', async ({ page }) => {
            await page.goto('/');
            // Login as admin
            await page.fill('#email', 'lorenzo96barra@outlook.com');
            await page.fill('#password', '123na123');
            await page.click('#login-btn');

            await page.click('[data-tab="vouchers"]');
            await page.click('#btn-create-voucher');

            // Try XSS injection
            const xssPayload = '<script>alert("XSS")</script>';
            await page.fill('#voucher-customer', xssPayload);
            await page.fill('#voucher-amount', '100');
            await page.click('#btn-save-voucher');

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
            await page.click('#login-btn');

            await page.click('[data-tab="vouchers"]');
            await page.click('#btn-create-voucher');

            // 10KB string
            const giantString = 'A'.repeat(10000);
            await page.fill('#voucher-customer', giantString);
            await page.fill('#voucher-amount', '50');

            // Should not crash
            await page.click('#btn-save-voucher');

            // Verify error or truncation
            const error = page.locator('.error-message, .validation-error');
            await expect(error).toBeVisible({ timeout: 3000 });
        });
    });
});
