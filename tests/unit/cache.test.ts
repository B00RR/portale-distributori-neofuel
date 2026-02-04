import { describe, it, expect, vi } from 'vitest';

vi.mock('../core/api.js', () => ({ supabase: {} }));

import { getCache, setCache, clearCache, getCacheStats } from '../../js/core/cache.js';

describe('Cache Module', () => {
    it('should set and get cache', () => {
        setCache('test-key', { data: 'value' });
        const cached = getCache('test-key');
        expect(cached).toEqual({ data: 'value' });
    });

    it('should return null for missing key', () => {
        const result = getCache('non-existent');
        expect(result).toBeNull();
    });

    it('should clearCache', () => {
        setCache('key1', 'val1');
        clearCache();
        expect(getCache('key1')).toBeNull();
    });

    it('should get cache stats', () => {
        const stats = getCacheStats();
        expect(stats).toBeDefined();
    });
});
