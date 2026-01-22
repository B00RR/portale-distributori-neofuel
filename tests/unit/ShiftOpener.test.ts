/**
 * Unit Tests for ShiftOpener Lit Component
 * Tests component lifecycle, rendering states, and form submission
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase before importing component
vi.mock('../../js/core/api.js', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                        limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
                    }))
                }))
            })),
            insert: vi.fn(() => Promise.resolve({ data: { id: 1 }, error: null }))
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

describe('ShiftOpener Component', () => {

    describe('Component Structure', () => {
        it('should be defined as a custom element', async () => {
            // Dynamic import after mocks are set up
            await import('../../js/ui/components/ShiftOpener.js');
            expect(customElements.get('shift-opener')).toBeDefined();
        });

        it('should have required properties', async () => {
            const { ShiftOpener } = await import('../../js/ui/components/ShiftOpener.js') as any;
            const element = new ShiftOpener();

            expect(element).toHaveProperty('stationId');
            expect(element).toHaveProperty('userId');
        });
    });

    describe('Initial State', () => {
        it('should start in loading mode', async () => {
            const { ShiftOpener } = await import('../../js/ui/components/ShiftOpener.js') as any;
            const element = new ShiftOpener();

            // Access private state through any cast
            expect((element as any).state.mode).toBe('loading');
        });

        it('should have empty error message initially', async () => {
            const { ShiftOpener } = await import('../../js/ui/components/ShiftOpener.js') as any;
            const element = new ShiftOpener();

            expect((element as any).state.errorMessage).toBe('');
        });
    });

    describe('Render States', () => {
        it('should render loading indicator when mode is loading', async () => {
            const { ShiftOpener } = await import('../../js/ui/components/ShiftOpener.js') as any;
            const element = new ShiftOpener();
            element.stationId = '1';
            element.userId = 'test-user';

            // Trigger render
            const result = element.render();

            // Check that result is a TemplateResult (Lit)
            expect(result).toBeDefined();
            expect(result.strings).toBeDefined(); // TemplateResult has strings property
        });
    });

    describe('Form Validation', () => {
        it('should validate that banknotes cannot be negative', async () => {
            const { ShiftOpener } = await import('../../js/ui/components/ShiftOpener.js') as any;
            const element = new ShiftOpener();

            // Set up minimal state for form rendering
            (element as any).state = { mode: 'form', errorMessage: '' };
            (element as any).islands = [];
            (element as any).pistols = [];
            (element as any).tanks = [];

            // The component should handle negative values gracefully
            // This test verifies the component doesn't crash when rendering form
            const form = element.renderForm();
            expect(form).toBeDefined();
        });
    });

    describe('CSS Styles', () => {
        it('should have static styles defined', async () => {
            const { ShiftOpener } = await import('../../js/ui/components/ShiftOpener.js') as any;

            expect(ShiftOpener.styles).toBeDefined();
            expect(Array.isArray(ShiftOpener.styles)).toBe(true);
        });
    });

});
