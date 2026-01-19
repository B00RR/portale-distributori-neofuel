import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: '../e2e',

    // Test timeout
    timeout: 30 * 1000,
    expect: {
        timeout: 5000
    },

    // Run tests in parallel
    fullyParallel: true,

    // Fail fast on CI
    forbidOnly: !!process.env.CI,

    // Retry on CI
    retries: process.env.CI ? 2 : 0,

    // Reporters
    reporter: [
        ['html'],
        ['list']
    ],

    use: {
        // Base URL
        baseURL: 'http://localhost:5173',

        // Collect trace on failure
        trace: 'on-first-retry',

        // Screenshot on failure
        screenshot: 'only-on-failure',

        // Video on failure
        video: 'retain-on-failure',
    },

    // Configure projects for different browsers
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        // Mobile viewport
        {
            name: 'mobile',
            use: { ...devices['iPhone 13'] },
        },
    ],

    // Run dev server before starting tests
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
});
