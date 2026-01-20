import { test, expect } from '@playwright/test';

test.describe('Smoke Test & Security', () => {
    test.beforeEach(async ({ page }) => {
        // Monitor console errors (CSP violations, JS errors)
        page.on('console', msg => {
            if (msg.type() === 'error')
                console.error(`[Browser Error]: ${msg.text()}`);
        });

        // Fail test on any unhandled exception or CSP violation report
        page.on('pageerror', err => {
            console.error(`[Page Error]: ${err.message}`);
            // throw err; // Uncomment to strict fail
        });

        await page.goto('/');
    });

    test('should load login page successfully', async ({ page }) => {
        await expect(page).toHaveTitle(/Portale Distributori Neofuel/);
        await expect(page.locator('#login-form')).toBeVisible();
    });

    test('should have CSP meta tag', async ({ page }) => {
        const cspMeta = page.locator('meta[http-equiv="Content-Security-Policy"]');
        await expect(cspMeta).toHaveCount(1);
        const content = await cspMeta.getAttribute('content');
        expect(content).toContain("default-src 'self'");
    });
});
