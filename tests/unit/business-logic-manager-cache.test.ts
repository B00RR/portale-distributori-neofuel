/**
 * Contratto della cache delle business rules (#348):
 * versione, TTL, invalidazione esplicita, coalescenza delle richieste
 * concorrenti e negative-cache dei fallback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { downloadMock, uploadMock } = vi.hoisted(() => ({
    downloadMock: vi.fn(),
    uploadMock: vi.fn()
}));

vi.mock('../../js/core/api.js', () => ({
    supabase: {
        storage: {
            from: vi.fn(() => ({ download: downloadMock, upload: uploadMock }))
        }
    }
}));
vi.mock('../../js/ui/toast.js', () => ({ Toast: { show: vi.fn() } }));
vi.mock('../../js/shared/error-handler.js', () => ({ handleError: vi.fn() }));

import {
    BusinessLogicManager,
    RULES_CACHE_TTL_MS,
    RULES_FALLBACK_TTL_MS
} from '../../js/core/business-logic-manager.js';

const REMOTE_RULES = {
    cash_error_threshold: 25,
    updated_at: '2026-07-17T10:00:00.000Z'
};

function rulesBlob(rules: Record<string, unknown>): Blob {
    return new Blob([JSON.stringify(rules)], { type: 'application/json' });
}

describe('BusinessLogicManager cache contract (#348)', () => {
    beforeEach(() => {
        BusinessLogicManager.invalidateCache();
        downloadMock.mockResolvedValue({ data: rulesBlob(REMOTE_RULES), error: null });
        uploadMock.mockResolvedValue({ error: null });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('coalesces concurrent loads into a single download', async () => {
        const [a, b] = await Promise.all([
            BusinessLogicManager.loadRules(),
            BusinessLogicManager.loadRules()
        ]);

        expect(downloadMock).toHaveBeenCalledTimes(1);
        expect(a).toEqual(b);
        expect(a.cash_error_threshold).toBe(25);
    });

    it('serves cached rules within the TTL without re-downloading', async () => {
        await BusinessLogicManager.loadRules();
        await BusinessLogicManager.loadRules();

        expect(downloadMock).toHaveBeenCalledTimes(1);
    });

    it('re-downloads the rules after the TTL expires', async () => {
        vi.useFakeTimers();

        await BusinessLogicManager.loadRules();
        expect(downloadMock).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(RULES_CACHE_TTL_MS + 1);

        await BusinessLogicManager.loadRules();
        expect(downloadMock).toHaveBeenCalledTimes(2);
    });

    it('caches the fallback after a failed load instead of re-downloading on every call', async () => {
        vi.useFakeTimers();
        downloadMock.mockRejectedValue(new Error('network down'));

        const first = await BusinessLogicManager.loadRules();
        const second = await BusinessLogicManager.loadRules();

        expect(first).toBeDefined();
        expect(second).toBeDefined();
        // Fallback ripetuti non devono generare chiamate multiple (#348).
        expect(downloadMock).toHaveBeenCalledTimes(1);

        // Dopo la finestra di fallback la cache riprova davvero.
        vi.advanceTimersByTime(RULES_FALLBACK_TTL_MS + 1);
        await BusinessLogicManager.loadRules();
        expect(downloadMock).toHaveBeenCalledTimes(2);
    });

    it('keeps serving the last known good rules when a refresh fails', async () => {
        vi.useFakeTimers();

        const fresh = await BusinessLogicManager.loadRules();
        expect(fresh.cash_error_threshold).toBe(25);

        vi.advanceTimersByTime(RULES_CACHE_TTL_MS + 1);
        downloadMock.mockRejectedValue(new Error('network down'));

        const stale = await BusinessLogicManager.loadRules();
        expect(downloadMock).toHaveBeenCalledTimes(2);
        // Meglio le ultime regole valide dei default hardcoded.
        expect(stale.cash_error_threshold).toBe(25);

        // Entro la finestra di fallback non riprova a ogni chiamata.
        await BusinessLogicManager.loadRules();
        expect(downloadMock).toHaveBeenCalledTimes(2);
    });

    it('invalidateCache forces a fresh download on the next load', async () => {
        await BusinessLogicManager.loadRules();
        expect(downloadMock).toHaveBeenCalledTimes(1);

        BusinessLogicManager.invalidateCache();

        await BusinessLogicManager.loadRules();
        expect(downloadMock).toHaveBeenCalledTimes(2);
    });

    it('does not let an in-flight load overwrite an invalidation', async () => {
        let resolveDownload!: (value: { data: Blob | null; error: unknown }) => void;
        downloadMock.mockImplementation(
            () =>
                new Promise<{ data: Blob | null; error: unknown }>(resolve => {
                    resolveDownload = resolve;
                })
        );

        const pending = BusinessLogicManager.loadRules();
        BusinessLogicManager.invalidateCache();
        resolveDownload({ data: rulesBlob(REMOTE_RULES), error: null });
        await pending;

        // Il load partito prima dell'invalidazione non deve ripopolare la cache.
        downloadMock.mockResolvedValue({ data: rulesBlob(REMOTE_RULES), error: null });
        await BusinessLogicManager.loadRules();
        expect(downloadMock).toHaveBeenCalledTimes(2);
    });

    it('saveRules updates the cache write-through with the new version', async () => {
        await BusinessLogicManager.loadRules();
        expect(downloadMock).toHaveBeenCalledTimes(1);

        await BusinessLogicManager.saveRules({ cash_error_threshold: 99 });

        const rules = await BusinessLogicManager.loadRules();
        expect(rules.cash_error_threshold).toBe(99);
        // Nessun nuovo download: la copia appena salvata è la più recente.
        expect(downloadMock).toHaveBeenCalledTimes(1);

        const info = BusinessLogicManager.getCacheInfo();
        expect(info).not.toBeNull();
        expect(info?.source).toBe('remote');
        expect(info?.version).toBe(rules.updated_at);
    });

    it('exposes version and source of the cached entry', async () => {
        await BusinessLogicManager.loadRules();

        const info = BusinessLogicManager.getCacheInfo();
        expect(info?.version).toBe(REMOTE_RULES.updated_at);
        expect(info?.source).toBe('remote');

        BusinessLogicManager.invalidateCache();
        expect(BusinessLogicManager.getCacheInfo()).toBeNull();

        downloadMock.mockRejectedValue(new Error('network down'));
        await BusinessLogicManager.loadRules();
        expect(BusinessLogicManager.getCacheInfo()?.source).toBe('default');
        expect(BusinessLogicManager.getCacheInfo()?.version).toBeNull();
    });
});
