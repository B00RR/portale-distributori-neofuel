import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: '../e2e',

    // Test timeout
    timeout: 30 * 1000,
    expect: {
        timeout: 10000
    },

    // Run tests in parallel
    fullyParallel: true,

    workers: process.env.CI ? 1 : undefined,

    // Fail fast on CI
    forbidOnly: !!process.env.CI,

    // Retry on CI (1 retry: i test sono ermetici/deterministici)
    retries: process.env.CI ? 1 : 0,

    // Reporters
    reporter: [
        ['html'],
        ['list']
    ],

    use: {
        // Base URL
        baseURL: 'http://localhost:4173',

        // Collect trace on failure
        trace: 'on-first-retry',

        // Screenshot on failure
        screenshot: 'only-on-failure',

        // Video on failure
        video: 'retain-on-failure',

        // Block service workers to ensure network mocks work
        serviceWorkers: 'block',
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
            timeout: 60 * 1000,
        },
    ],

    // Run dev server before starting tests.
    // Le credenziali Supabase sono fittizie: la suite E2E mocka la rete, quindi
    // l'app deve solo avviarsi (non servono secret reali in CI).
    webServer: {
        command: 'npm run build && npm run preview',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        env: {
            VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://stub.supabase.co',
            VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'stub-anon-key-for-tests',
        },
    },
});
