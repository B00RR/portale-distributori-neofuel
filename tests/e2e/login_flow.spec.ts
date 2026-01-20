import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {

    test('should show error message on invalid credentials', async ({ page }) => {
        await page.goto('/');
        await page.fill('#email', 'wrong@example.com');
        await page.fill('#password', 'wrongpassword');
        await page.click('button[type="submit"]');

        // Expect error message container to contain some text (actual text depends on Supabase response or generic handler)
        // Adjust timeout because network request might take a bit
        await expect(page.locator('#login-error')).toBeVisible({ timeout: 10000 });
        const errorText = await page.locator('#login-error').textContent();
        expect(errorText?.length).toBeGreaterThan(0);
    });

    test('should navigate to dashboard on successful login (mocked)', async ({ page }) => {
        // Mock Supabase Auth Response
        await page.route('**/auth/v1/token?grant_type=password', async route => {
            const json = {
                access_token: "mock_access_token",
                token_type: "bearer",
                expires_in: 3600,
                refresh_token: "mock_refresh_token",
                user: {
                    id: "mock_user_id",
                    aud: "authenticated",
                    role: "authenticated",
                    email: "test@neofuel.it",
                    app_metadata: { role: "admin" }, // Mock as admin
                    user_metadata: { full_name: "Test Admin" }
                }
            };
            await route.fulfill({ json });
        });

        // Mock UI Settings table request (to prevent errors after login)
        await page.route('**/rest/v1/ui_settings*', async route => {
            await route.fulfill({ json: [] });
        });


        await page.goto('/');
        await page.fill('#email', 'admin@neofuel.it');
        await page.fill('#password', 'password123'); // Doesn't matter due to mock
        await page.click('button[type="submit"]');

        // Waif for navigation or UI update
        // The app should switch from #login-container to #app-container
        await expect(page.locator('#app-container')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#login-container')).not.toBeVisible();
    });
});
