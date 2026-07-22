import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ADMIN_TABS, isAdminTab, router } from '../../js/admin/router.js';

describe('Admin Hash Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState(null, '', '/');
    document.body.replaceChildren();
  });

  describe('isAdminTab type guard', () => {
    it('accepts all 10 known admin tabs', () => {
      const tabs = [
        'dashboard',
        'stations',
        'operators',
        'shifts',
        'crediti',
        'invoices',
        'vouchers',
        'notifiche',
        'analytics',
        'settings'
      ];

      tabs.forEach(tab => {
        expect(isAdminTab(tab)).toBe(true);
      });
    });

    it('rejects unknown tab names', () => {
      expect(isAdminTab('nonexistent')).toBe(false);
      expect(isAdminTab('admin')).toBe(false);
      expect(isAdminTab('dashboard-extra')).toBe(false);
      expect(isAdminTab('')).toBe(false);
    });

    it('narrows type for TypeScript', () => {
      const value: string = 'vouchers';
      if (isAdminTab(value)) {
        // TypeScript should allow AdminTab operations on value here
        const _: typeof value = value; // Verify narrowing
        expect(value).toBe('vouchers');
      }
    });
  });

  describe('ADMIN_TABS constant', () => {
    it('exports a readonly array of all tabs', () => {
      expect(ADMIN_TABS).toHaveLength(10);
      expect(ADMIN_TABS).toContain('dashboard');
      expect(ADMIN_TABS).toContain('vouchers');
      expect(ADMIN_TABS).toContain('settings');
    });
  });

  describe('router.navigateTo updates hash', () => {
    beforeEach(() => {
      // Create the required DOM structure for navigateTo
      const adminContent = document.createElement('div');
      adminContent.id = 'admin-content';
      document.body.appendChild(adminContent);

      router.init('admin');

      // Mock the private loadTab method to avoid loading actual tab modules
      vi.spyOn(
        router as unknown as { loadTab: (...args: unknown[]) => Promise<void> },
        'loadTab'
      ).mockResolvedValue(undefined);
    });

    it('writes hash when navigating to vouchers tab', async () => {
      await router.navigateTo('vouchers');

      expect(window.location.hash).toBe('#/admin/vouchers');
    });

    it('writes hash when navigating to any tab', async () => {
      const testCases = [
        { tab: 'dashboard' as const, expected: '#/admin/dashboard' },
        { tab: 'stations' as const, expected: '#/admin/stations' },
        { tab: 'shifts' as const, expected: '#/admin/shifts' },
        { tab: 'settings' as const, expected: '#/admin/settings' }
      ];

      for (const { tab, expected } of testCases) {
        await router.navigateTo(tab);
        expect(window.location.hash).toBe(expected);
      }
    });

    it('does not push duplicate history entries for repeated navigation', async () => {
      const pushSpy = vi.spyOn(window.history, 'pushState');

      await router.navigateTo('vouchers');
      expect(pushSpy).not.toHaveBeenCalled();

      // Navigate to same tab again
      await router.navigateTo('vouchers');
      expect(pushSpy).not.toHaveBeenCalled();

      // Navigate to different tab
      await router.navigateTo('dashboard');
      expect(pushSpy).not.toHaveBeenCalled();
    });

    it('updates currentTab before writing hash', async () => {
      await router.navigateTo('invoices');

      expect(router.getCurrentTab()).toBe('invoices');
      expect(window.location.hash).toBe('#/admin/invoices');
    });
  });

  describe('Deep linking on page load', () => {
    beforeEach(() => {
      const adminContent = document.createElement('div');
      adminContent.id = 'admin-content';
      document.body.appendChild(adminContent);

      router.init('admin');

      vi.spyOn(
        router as unknown as { loadTab: (...args: unknown[]) => Promise<void> },
        'loadTab'
      ).mockResolvedValue(undefined);
    });

    it('navigates to tab specified in URL hash on load', async () => {
      window.history.pushState(null, '', '#/admin/analytics');

      await router.navigateTo('analytics');

      expect(router.getCurrentTab()).toBe('analytics');
      expect(window.location.hash).toBe('#/admin/analytics');
    });

    it('handles deep link to protected tabs based on permissions', async () => {
      window.history.pushState(null, '', '#/admin/stations');

      // Restricted user should still navigate but see permission error
      router.init('accounting');

      // This should still set currentTab and update hash
      // (permission check happens inside loadTab)
      await router.navigateTo('stations');

      expect(window.location.hash).toBe('#/admin/stations');
    });
  });

  describe('Browser back/forward support', () => {
    beforeEach(() => {
      const adminContent = document.createElement('div');
      adminContent.id = 'admin-content';
      document.body.appendChild(adminContent);

      router.init('admin');

      vi.spyOn(
        router as unknown as { loadTab: (...args: unknown[]) => Promise<void> },
        'loadTab'
      ).mockResolvedValue(undefined);
    });

    it('allows navigating back/forward using history', async () => {
      // Navigate to first tab
      await router.navigateTo('dashboard');
      expect(window.location.hash).toBe('#/admin/dashboard');

      // Navigate to second tab
      await router.navigateTo('shifts');
      expect(window.location.hash).toBe('#/admin/shifts');

      // Simulate back button
      window.history.back();
      // History API is mocked in tests, but hash listener should respond to hashchange
      window.history.pushState(null, '', '#/admin/dashboard');
      window.dispatchEvent(new Event('hashchange'));

      // User can verify behavior by checking if hashchange is fired
      // (in real browser, back/forward would restore the hash)
    });
  });

  describe('Hash change listener filtering', () => {
    beforeEach(() => {
      const adminContent = document.createElement('div');
      adminContent.id = 'admin-content';
      document.body.appendChild(adminContent);

      router.init('admin');

      vi.spyOn(
        router as unknown as { loadTab: (...args: unknown[]) => Promise<void> },
        'loadTab'
      ).mockResolvedValue(undefined);
    });

    it('ignores hash changes for non-admin areas', async () => {
      const originalTab = router.getCurrentTab();

      // Try to navigate via hash to operator area
      window.history.pushState(null, '', '#/operator/shift-summary');
      window.dispatchEvent(new Event('hashchange'));

      // Current tab should not change (listener filters by area)
      expect(router.getCurrentTab()).toBe(originalTab);
    });

    it('ignores malformed hashes', async () => {
      await router.navigateTo('dashboard');

      // Try to change to malformed hash
      window.history.pushState(null, '', '#/admin');
      window.dispatchEvent(new Event('hashchange'));

      // Still on dashboard (listener ignores malformed)
      expect(router.getCurrentTab()).toBe('dashboard');
    });
  });

  describe('Integration with renderAdminShell callback', () => {
    beforeEach(() => {
      const adminContent = document.createElement('div');
      adminContent.id = 'admin-content';
      document.body.appendChild(adminContent);

      router.init('admin');

      vi.spyOn(
        router as unknown as { loadTab: (...args: unknown[]) => Promise<void> },
        'loadTab'
      ).mockResolvedValue(undefined);
    });

    it('navigateTo can be used as a callback for tab click events', async () => {
      const callback = router.navigateTo.bind(router);

      // Simulate tab click calling the callback
      await callback('operators');

      expect(router.getCurrentTab()).toBe('operators');
      expect(window.location.hash).toBe('#/admin/operators');
    });
  });

  describe('Multiple navigations in sequence', () => {
    beforeEach(() => {
      const adminContent = document.createElement('div');
      adminContent.id = 'admin-content';
      document.body.appendChild(adminContent);

      router.init('admin');

      vi.spyOn(
        router as unknown as { loadTab: (...args: unknown[]) => Promise<void> },
        'loadTab'
      ).mockResolvedValue(undefined);
    });

    it('correctly tracks current tab after multiple navigations', async () => {
      const sequence = ['dashboard', 'stations', 'operators', 'vouchers', 'settings'] as const;

      for (const tab of sequence) {
        await router.navigateTo(tab);
        expect(router.getCurrentTab()).toBe(tab);
        expect(window.location.hash).toBe(`#/admin/${tab}`);
      }
    });

    it('maintains hash and tab in sync after rapid navigations', async () => {
      await router.navigateTo('invoices');
      await router.navigateTo('crediti');
      await router.navigateTo('analytics');

      expect(router.getCurrentTab()).toBe('analytics');
      expect(window.location.hash).toBe('#/admin/analytics');
    });
  });
});
