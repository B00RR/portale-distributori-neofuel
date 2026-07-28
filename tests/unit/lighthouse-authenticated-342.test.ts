import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ADMIN_TABS } from '../../js/admin/router.js';
import { OPERATOR_VIEWS } from '../../js/operator/router.js';
import lighthouseAuth, {
  AUTHENTICATED_JOURNEYS,
  PRODUCTION_PROJECT_REF,
  STUB_SUPABASE_ANON_KEY,
  STUB_SUPABASE_URL,
  classifyLighthouseRequest,
  getMockProfile,
  getMockSession,
  isValidLhciAuthHeader,
  validateLighthouseSafety
} from '../../scripts/lighthouse-auth.js';

const root = process.cwd();
const readRepoFile = (path: string): string => readFileSync(join(root, path), 'utf8');

describe('Lighthouse Authenticated Journeys & CI Configuration (#342)', () => {
  describe('Safety Guards & Fail-Closed Logic', () => {
    it('throws when E2E_SUPABASE_MODE is set to live', () => {
      expect(() =>
        validateLighthouseSafety({
          E2E_SUPABASE_MODE: 'live'
        })
      ).toThrow(/E2E_SUPABASE_MODE=live is strictly forbidden/);
    });

    it('throws when VITE_SUPABASE_URL contains the production project ref', () => {
      expect(() =>
        validateLighthouseSafety({
          VITE_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`
        })
      ).toThrow(
        new RegExp(`Production Supabase project ref \\(${PRODUCTION_PROJECT_REF}\\) detected`)
      );
    });

    it('throws when SUPABASE_URL contains the production project ref', () => {
      expect(() =>
        validateLighthouseSafety({
          SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`
        })
      ).toThrow(
        new RegExp(`Production Supabase project ref \\(${PRODUCTION_PROJECT_REF}\\) detected`)
      );
    });

    it('throws when LHCI_ALLOW_LIVE is true', () => {
      expect(() =>
        validateLighthouseSafety({
          LHCI_ALLOW_LIVE: 'true'
        })
      ).toThrow(/Live backend mode is strictly forbidden/);
    });

    it('passes safety checks when running with stub isolated configuration', () => {
      expect(() =>
        validateLighthouseSafety({
          VITE_SUPABASE_URL: 'https://stub-project.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'stub-anon-key-for-tests'
        })
      ).not.toThrow();
    });
  });

  describe('Strict Authorization Header Validation', () => {
    it('accepts exact synthetic Bearer token', () => {
      expect(isValidLhciAuthHeader('Bearer lhci-stub-access-token')).toBe(true);
    });

    it('accepts synthetic Bearer token with case-insensitive scheme and normalized whitespace', () => {
      expect(isValidLhciAuthHeader('bearer lhci-stub-access-token')).toBe(true);
      expect(isValidLhciAuthHeader('   Bearer    lhci-stub-access-token   ')).toBe(true);
    });

    it('strictly rejects arbitrary or unauthorized Bearer tokens (fail-closed)', () => {
      expect(isValidLhciAuthHeader('Bearer arbitrary-token')).toBe(false);
      expect(isValidLhciAuthHeader('Bearer eyJhbGciOiJIUzI1Ni...')).toBe(false);
    });

    it('rejects empty, missing, or malformed auth headers', () => {
      expect(isValidLhciAuthHeader('')).toBe(false);
      expect(isValidLhciAuthHeader(undefined)).toBe(false);
      expect(isValidLhciAuthHeader('Bearer')).toBe(false);
      expect(isValidLhciAuthHeader('lhci-stub-access-token')).toBe(false);
    });
  });

  describe('Hermetic Request Classification & Isolation Guards', () => {
    const allowedHost = 'stub-project.supabase.co';

    it('allows local web application assets and data/blob URLs', () => {
      expect(classifyLighthouseRequest('http://localhost:8080/index.html', allowedHost)).toBe(
        'ALLOW_LOCAL'
      );
      expect(classifyLighthouseRequest('http://localhost:8080/assets/main.js', allowedHost)).toBe(
        'ALLOW_LOCAL'
      );
      expect(classifyLighthouseRequest('http://127.0.0.1:8080/styles.css', allowedHost)).toBe(
        'ALLOW_LOCAL'
      );
      expect(classifyLighthouseRequest('data:image/png;base64,123', allowedHost)).toBe(
        'ALLOW_LOCAL'
      );
    });

    it('classifies auth, REST, and Storage endpoints for expected stub host', () => {
      expect(
        classifyLighthouseRequest('https://stub-project.supabase.co/auth/v1/token', allowedHost)
      ).toBe('MOCK_AUTH_TOKEN');
      expect(
        classifyLighthouseRequest('https://stub-project.supabase.co/auth/v1/user', allowedHost)
      ).toBe('MOCK_AUTH_USER');
      expect(
        classifyLighthouseRequest('https://stub-project.supabase.co/auth/v1/logout', allowedHost)
      ).toBe('MOCK_AUTH_LOGOUT');
      expect(
        classifyLighthouseRequest('https://stub-project.supabase.co/rest/v1/users', allowedHost)
      ).toBe('MOCK_REST_USERS');
      expect(
        classifyLighthouseRequest(
          'https://stub-project.supabase.co/rest/v1/user_stations',
          allowedHost
        )
      ).toBe('MOCK_REST_STATIONS');
      expect(
        classifyLighthouseRequest(
          'https://stub-project.supabase.co/rest/v1/rpc/test_fn',
          allowedHost
        )
      ).toBe('MOCK_REST_RPC');
      expect(
        classifyLighthouseRequest(
          'https://stub-project.supabase.co/storage/v1/object/public/system/rules.json',
          allowedHost
        )
      ).toBe('MOCK_STORAGE');
    });

    it('blocks Realtime and WebSocket requests fail-closed', () => {
      expect(
        classifyLighthouseRequest(
          'wss://stub-project.supabase.co/realtime/v1/websocket',
          allowedHost
        )
      ).toBe('BLOCK_REALTIME');
      expect(
        classifyLighthouseRequest(
          'https://stub-project.supabase.co/realtime/v1/channel',
          allowedHost
        )
      ).toBe('BLOCK_REALTIME');
    });

    it('blocks unauthorized or external Supabase hosts fail-closed', () => {
      expect(
        classifyLighthouseRequest(
          `https://${PRODUCTION_PROJECT_REF}.supabase.co/rest/v1/users`,
          allowedHost
        )
      ).toBe('BLOCK_UNAUTHORIZED_HOST');
      expect(
        classifyLighthouseRequest(
          'https://unauthorized-project.supabase.co/rest/v1/users',
          allowedHost
        )
      ).toBe('BLOCK_UNAUTHORIZED_HOST');
      expect(classifyLighthouseRequest('https://api.external-service.com/data', allowedHost)).toBe(
        'BLOCK_UNAUTHORIZED_HOST'
      );
    });
  });

  describe('Journey Allowlist Coverage', () => {
    it('includes all required journey areas from issue #342 (login, dashboard, shifts, vouchers, invoices/export, operator)', () => {
      expect(AUTHENTICATED_JOURNEYS).toContain('/');
      expect(AUTHENTICATED_JOURNEYS).toContain('/#admin/dashboard');
      expect(AUTHENTICATED_JOURNEYS).toContain('/#admin/shifts');
      expect(AUTHENTICATED_JOURNEYS).toContain('/#admin/vouchers');
      expect(AUTHENTICATED_JOURNEYS).toContain('/#admin/invoices');
      expect(AUTHENTICATED_JOURNEYS).toContain('/#operator/apertura');
    });

    it('validates that all #admin/ and #operator/ hash routes correspond to existing router definitions', () => {
      for (const journey of AUTHENTICATED_JOURNEYS) {
        if (journey === '/') continue;

        if (journey.startsWith('/#admin/')) {
          const tab = journey.replace('/#admin/', '');
          expect(ADMIN_TABS).toContain(tab);
        } else if (journey.startsWith('/#operator/')) {
          const view = journey.replace('/#operator/', '');
          expect(OPERATOR_VIEWS).toContain(view);
        } else {
          throw new Error(`Unexpected journey route format: ${journey}`);
        }
      }
    });
  });

  describe('Synthetic Hermetic Fixtures (No Secrets or PII)', () => {
    it('provides deterministic mock session without real credentials or secrets', () => {
      const adminSession = getMockSession('admin');
      const operatorSession = getMockSession('operator');

      expect(adminSession.access_token).toBe('lhci-stub-access-token');
      expect(adminSession.user.email).toBe('lhci-admin@neofuel.local');

      expect(operatorSession.access_token).toBe('lhci-stub-access-token');
      expect(operatorSession.user.email).toBe('lhci-operator@neofuel.local');

      const jsonString = JSON.stringify({ adminSession, operatorSession });
      expect(jsonString).not.toContain(PRODUCTION_PROJECT_REF);
      expect(jsonString).not.toContain('password');
      expect(jsonString).not.toContain('secret');
    });

    it('provides server-authoritative mock user profiles matching DB contract', () => {
      const adminProfile = getMockProfile('admin');
      const operatorProfile = getMockProfile('operator');

      expect(adminProfile.user_id).toBe(1);
      expect(adminProfile.role).toBe('admin');
      expect(adminProfile.is_active).toBe(true);
      expect(adminProfile.user_stations[0]?.station_id).toBe(1);

      expect(operatorProfile.user_id).toBe(2);
      expect(operatorProfile.role).toBe('operator');
      expect(operatorProfile.is_active).toBe(true);
      expect(operatorProfile.user_stations[0]?.station_id).toBe(1);
    });
  });

  describe('Repository Configuration Integration', () => {
    it('wires scripts/lighthouse-auth.cjs in lighthouserc.json as puppeteerScript and exports a function via CommonJS require', () => {
      const lighthouserc = JSON.parse(readRepoFile('config/lighthouse/lighthouserc.json'));
      expect(lighthouserc.ci.collect.puppeteerScript).toBe('./scripts/lighthouse-auth.cjs');
      expect(lighthouserc.ci.collect.staticDistDir).toBe('./dist');
      expect(lighthouserc.ci.collect.url).toBeDefined();
      expect(lighthouserc.ci.collect.url.length).toBeGreaterThanOrEqual(6);

      expect(existsSync(join(root, 'scripts/lighthouse-auth.js'))).toBe(true);
      expect(existsSync(join(root, 'scripts/lighthouse-auth.cjs'))).toBe(true);

      const require = createRequire(import.meta.url);
      const cjsAdapter = require('../../scripts/lighthouse-auth.cjs');
      expect(typeof cjsAdapter).toBe('function');
    });

    it('uses non-sensitive stub credentials in workflow and avoids secrets or live mode', () => {
      const workflow = readRepoFile('.github/workflows/lighthouse.yml');

      expect(workflow).not.toContain('secrets.SUPABASE_URL');
      expect(workflow).not.toContain('secrets.SUPABASE_KEY');
      expect(workflow).not.toContain(PRODUCTION_PROJECT_REF);
      expect(workflow).not.toContain('E2E_SUPABASE_MODE=live');

      expect(workflow).toContain(`VITE_SUPABASE_URL: ${STUB_SUPABASE_URL}`);
      expect(workflow).toContain(`VITE_SUPABASE_ANON_KEY: ${STUB_SUPABASE_ANON_KEY}`);

      const budget = JSON.parse(readRepoFile('config/lighthouse/lighthouse-budget.json'));
      expect(workflow).toContain('budgetPath: ./config/lighthouse/lighthouse-budget.json');
      expect(workflow).toContain('configPath: ./config/lighthouse/lighthouserc.json');
      expect(workflow).toContain('treosh/lighthouse-ci-action@v12');

      // Assert budget thresholds are untouched
      expect(budget[0].resourceSizes).toContainEqual({ resourceType: 'script', budget: 550 });
    });
  });

  describe('Idempotent Page Interception & Reused Page Safety', () => {
    it('removes previous request listeners when invoked multiple times on the same page', async () => {
      class MockPage extends EventEmitter {
        setRequestInterception = async () => {};
        target = () => ({
          createCDPSession: async () => ({
            send: async () => {}
          })
        });
        goto = async () => {};
        evaluate = async () => {};
      }

      const mockPage = new MockPage();
      const mockBrowser = {
        pages: async () => [mockPage]
      };

      // First call: admin journey
      await lighthouseAuth(mockBrowser, { url: 'http://localhost:8080/#admin/dashboard' });
      expect(mockPage.listenerCount('request')).toBe(1);

      // Second call on the SAME page: operator journey
      await lighthouseAuth(mockBrowser, { url: 'http://localhost:8080/#operator/apertura' });
      expect(mockPage.listenerCount('request')).toBe(1);

      // Verify that emitting a request uses the second journey role (operator) and does not call respond twice
      let respondCalls = 0;
      let responseBody: Record<string, unknown> | null = null;

      const envUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || STUB_SUPABASE_URL;
      const host = new URL(envUrl).host;

      const mockRequest = {
        url: () => `https://${host}/rest/v1/users`,
        headers: () => ({ authorization: 'Bearer lhci-stub-access-token' }),
        respond: async (res: { body: string }) => {
          respondCalls++;
          responseBody = JSON.parse(res.body) as Record<string, unknown>;
        },
        continue: async () => {},
        abort: async () => {}
      };

      mockPage.emit('request', mockRequest);

      expect(respondCalls).toBe(1);
      expect(responseBody).toBeDefined();
      expect(responseBody.role).toBe('operator');
      expect(responseBody.email).toBe('lhci-operator@neofuel.local');
    });
  });
});
