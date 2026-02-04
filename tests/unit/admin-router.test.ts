import { describe, it, expect } from 'vitest';

import { router } from '../../js/admin/router.js';

describe('Admin Router Module', () => {
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
});
