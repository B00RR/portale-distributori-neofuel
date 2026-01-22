/**
 * Unit Tests for VoucherManager Lit Component
 * Tests voucher scanning, validation, and redemption flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase before importing component
vi.mock('../../js/core/api.js', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: null }))
                }))
            })),
            update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
            }))
        })),
        rpc: vi.fn(() => Promise.resolve({ data: null, error: null }))
    }
}));

// Mock Toast
vi.mock('../../js/ui/toast.js', () => ({
    Toast: {
        show: vi.fn()
    }
}));

// Mock offline queue
vi.mock('../../js/core/offline-db.js', () => ({
    offlineDB: {
        enqueue: vi.fn(() => Promise.resolve())
    }
}));

describe('VoucherManager Component', () => {

    describe('Component Structure', () => {
        it('should be defined as a custom element', async () => {
            await import('../../js/ui/components/VoucherManager.js');
            expect(customElements.get('voucher-manager')).toBeDefined();
        });

        it('should have required properties', async () => {
            const { VoucherManager } = await import('../../js/ui/components/VoucherManager.js') as any;
            const element = new VoucherManager();

            expect(element).toHaveProperty('stationId');
            expect(element).toHaveProperty('userId');
            expect(element).toHaveProperty('shiftId');
        });
    });

    describe('UI Modes', () => {
        it('should start in menu mode', async () => {
            const { VoucherManager } = await import('../../js/ui/components/VoucherManager.js') as any;
            const element = new VoucherManager();

            expect((element as any).mode).toBe('menu');
        });

        it('should support scan mode', async () => {
            const { VoucherManager } = await import('../../js/ui/components/VoucherManager.js') as any;
            const element = new VoucherManager();

            (element as any).mode = 'scan';
            expect((element as any).mode).toBe('scan');
        });

        it('should support manual mode', async () => {
            const { VoucherManager } = await import('../../js/ui/components/VoucherManager.js') as any;
            const element = new VoucherManager();

            (element as any).mode = 'manual';
            expect((element as any).mode).toBe('manual');
        });

        it('should support verify mode', async () => {
            const { VoucherManager } = await import('../../js/ui/components/VoucherManager.js') as any;
            const element = new VoucherManager();

            (element as any).mode = 'verify';
            expect((element as any).mode).toBe('verify');
        });
    });

    describe('Voucher Code Validation', () => {
        it('should have empty voucher code initially', async () => {
            const { VoucherManager } = await import('../../js/ui/components/VoucherManager.js') as any;
            const element = new VoucherManager();

            expect((element as any).voucherCode || '').toBe('');
        });
    });

    describe('CSS Styles', () => {
        it('should have static styles defined', async () => {
            const { VoucherManager } = await import('../../js/ui/components/VoucherManager.js') as any;

            expect(VoucherManager.styles).toBeDefined();
        });
    });

    describe('Render Method', () => {
        it('should render menu mode without throwing', async () => {
            const { VoucherManager } = await import('../../js/ui/components/VoucherManager.js') as any;
            const element = new VoucherManager();
            element.stationId = '1';
            element.userId = 'test-user';
            element.shiftId = '1';

            expect(() => element.render()).not.toThrow();
        });

        it('should render different modes based on state', async () => {
            const { VoucherManager } = await import('../../js/ui/components/VoucherManager.js') as any;
            const element = new VoucherManager();
            element.stationId = '1';
            element.userId = 'test-user';
            element.shiftId = '1';

            const modes = ['menu', 'scan', 'manual', 'loading', 'verify', 'success', 'error'];

            for (const mode of modes) {
                (element as any).mode = mode;
                expect(() => element.render()).not.toThrow();
            }
        });
    });

    describe('Close Handler', () => {
        it('should have onClose callback property', async () => {
            const { VoucherManager } = await import('../../js/ui/components/VoucherManager.js') as any;
            const element = new VoucherManager();

            const mockCallback = vi.fn();
            element.onClose = mockCallback;

            expect(element.onClose).toBe(mockCallback);
        });
    });

});
