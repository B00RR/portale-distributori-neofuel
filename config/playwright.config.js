import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const isLiveSupabaseE2E = process.env.E2E_SUPABASE_MODE === 'live';
const STUB_SUPABASE_URL = 'https://stub.supabase.co';
const STUB_SUPABASE_ANON_KEY = 'stub-anon-key-for-tests';

function isHttpUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveSupabaseE2EEnv() {
  if (isLiveSupabaseE2E) {
    return {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY
    };
  }

  return {
    VITE_SUPABASE_URL: isHttpUrl(process.env.VITE_SUPABASE_URL)
      ? process.env.VITE_SUPABASE_URL
      : STUB_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || STUB_SUPABASE_ANON_KEY
  };
}

const supabaseE2EEnv = resolveSupabaseE2EEnv();

export default defineConfig({
  testDir: '../e2e',
  globalSetup: './playwright.global-setup.js',

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
  reporter: [['html'], ['list']],

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
    serviceWorkers: 'block'
  },

  // Configure projects for different browsers.
  // I progetti browser bloccano i service worker (i mock di rete lo richiedono)
  // e ignorano la suite PWA, coperta dal progetto dedicato 'pwa'.
  projects: [
    {
      name: 'chromium',
      testIgnore: /pwa\.spec\.js/,
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      testIgnore: /pwa\.spec\.js/,
      use: { ...devices['Desktop Firefox'] }
    },
    // Mobile viewport
    {
      name: 'mobile',
      testIgnore: /pwa\.spec\.js/,
      use: { ...devices['iPhone 13'] },
      timeout: 60 * 1000
    },
    // Suite PWA: service worker abilitati per testare manifest e registrazione.
    {
      name: 'pwa',
      testMatch: /pwa\.spec\.js/,
      use: { ...devices['Desktop Chrome'], serviceWorkers: 'allow' }
    }
  ],

  // Run dev server before starting tests.
  // Default: E2E ermetici con rete Supabase mockata e credenziali stub.
  // Opt-in live: E2E_SUPABASE_MODE=live usa le credenziali reali e il globalSetup
  // semina utenti/stazione test prima della run (#131).
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: supabaseE2EEnv
  }
});
