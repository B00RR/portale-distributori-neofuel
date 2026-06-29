import { describe, it, expect, vi, afterEach } from 'vitest';

import { router } from '../../js/admin/router.js';

describe('Admin Router Module', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    it('should export router singleton', () => {
        expect(router).toBeDefined();
        expect(router.getCurrentTab).toBeDefined();
    });

    it('should initialize router with role', () => {
        router.init('admin');
        expect(router.getCurrentTab()).toBe('dashboard');
    });

    it('should get current tab', () => {
        const tab = router.getCurrentTab();
        expect(tab).toBeDefined();
    });

    it('should move focus to #admin-content after navigation', async () => {
        const content = document.createElement('div');
        content.id = 'admin-content';
        document.body.appendChild(content);

        const loadTabSpy = vi
            .spyOn(
                router as unknown as { loadTab: (...args: unknown[]) => Promise<void> },
                'loadTab'
            )
            .mockResolvedValue(undefined);

        router.init('admin');
        await router.navigateTo('dashboard');

        expect(loadTabSpy).toHaveBeenCalled();
        expect(content.getAttribute('tabindex')).toBe('-1');
        expect(document.activeElement).toBe(content);
    });
});
