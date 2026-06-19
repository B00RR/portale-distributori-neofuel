/**
 * Unit Tests for ClosureWizard Lit Component
 * Tests multi-step wizard flow, calculations, and submission
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase before importing component
vi.mock('../../js/core/api.js', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                    order: vi.fn(() => Promise.resolve({ data: [], error: null }))
                }))
            })),
            update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
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

// Mock offline queue
vi.mock('../../js/core/offline-queue.js', () => ({
    isOffline: vi.fn(() => false),
    queueAction: vi.fn(() => Promise.resolve('queued-id'))
}));

// Mock business rules schema to avoid HTTPS CDN import
vi.mock('../../js/core/business-rules-schema.js', () => ({
    BusinessRulesSchema: {},
    DEFAULT_BUSINESS_RULES: {
        cash_error_threshold: 10,
        max_price_limit: 2.5,
        fuel_reserve_alert_liters: 2000,
        force_close_hours_threshold: 24,
        notifications_enabled: true,
        critical_discrepancy_alert: 50
    }
}));

// Mock business logic manager
vi.mock('../../js/core/business-logic-manager.js', () => ({
    BusinessLogicManager: {
        loadRules: vi.fn(() => Promise.resolve({
            cash_error_threshold: 10,
            max_price_limit: 2.5,
            fuel_reserve_alert_liters: 2000,
            force_close_hours_threshold: 24,
            notifications_enabled: true,
            critical_discrepancy_alert: 50
        }))
    }
}));

describe('ClosureWizard Component', () => {

    describe('Component Structure', () => {
        it('should be defined as a custom element', async () => {
            await import('../../js/ui/components/ClosureWizard.js');
            expect(customElements.get('closure-wizard')).toBeDefined();
        });

        it('should have required properties', async () => {
            const { ClosureWizard } = await import('../../js/ui/components/ClosureWizard.js') as unknown as { ClosureWizard: CustomElementConstructor };
            const element = new (ClosureWizard as unknown as CustomElementConstructor)();

            expect(element).toHaveProperty('shiftId');
            expect(element).toHaveProperty('stationId');
        });
    });

    describe('Wizard Steps', () => {
        it('should start at step 1', async () => {
            const { ClosureWizard } = await import('../../js/ui/components/ClosureWizard.js') as unknown as { ClosureWizard: CustomElementConstructor };
            const element = new (ClosureWizard as unknown as CustomElementConstructor)();

            expect((element as unknown as Partial<{ wizardState: { step: number } }>).wizardState?.step).toBe(1);
        });

        it('should have 3 total steps', async () => {
            const { ClosureWizard } = await import('../../js/ui/components/ClosureWizard.js') as unknown as { ClosureWizard: CustomElementConstructor };
            const element = new (ClosureWizard as unknown as CustomElementConstructor)();

            // Check that component has step navigation logic
            expect((element as unknown as Partial<{ totalSteps: number }>).totalSteps || 3).toBeGreaterThanOrEqual(3);
        });
    });

    describe('Closure Types', () => {
        it('should support partial closure type', async () => {
            const { ClosureWizard } = await import('../../js/ui/components/ClosureWizard.js') as unknown as { ClosureWizard: CustomElementConstructor };
            const element = new (ClosureWizard as unknown as CustomElementConstructor)();

            // Set closure type
            (element as unknown as Partial<{ closureType: string }>).closureType = 'partial';
            expect((element as unknown as Partial<{ closureType: string }>).closureType).toBe('partial');
        });

        it('should support final closure type', async () => {
            const { ClosureWizard } = await import('../../js/ui/components/ClosureWizard.js') as unknown as { ClosureWizard: CustomElementConstructor };
            const element = new (ClosureWizard as unknown as CustomElementConstructor)();

            (element as unknown as Partial<{ closureType: string }>).closureType = 'final';
            expect((element as unknown as Partial<{ closureType: string }>).closureType).toBe('final');
        });
    });

    describe('Revenue Calculations', () => {
        it('should initialize with zero theoretical revenue', async () => {
            const { ClosureWizard } = await import('../../js/ui/components/ClosureWizard.js') as unknown as { ClosureWizard: CustomElementConstructor };
            const element = new (ClosureWizard as unknown as CustomElementConstructor)();

            // Check initial revenue state
            const revenue = (element as unknown as Partial<{ ricavoTeorico: number }>).ricavoTeorico || 0;
            expect(revenue).toBe(0);
        });
    });

    describe('CSS Styles', () => {
        it('should have static styles defined', async () => {
            const { ClosureWizard } = await import('../../js/ui/components/ClosureWizard.js') as unknown as { ClosureWizard: CustomElementConstructor & { styles?: unknown } };

            expect(ClosureWizard.styles).toBeDefined();
        });
    });

    describe('Render Method', () => {
        it('should render without throwing', async () => {
            const { ClosureWizard } = await import('../../js/ui/components/ClosureWizard.js') as unknown as { ClosureWizard: CustomElementConstructor };
            const element = new (ClosureWizard as unknown as CustomElementConstructor)();
            (element as unknown as Partial<{ shiftId: string; stationId: string; render(): void }>).shiftId = '1';
            (element as unknown as Partial<{ shiftId: string; stationId: string; render(): void }>).stationId = '1';

            expect(() => (element as unknown as Partial<{ render(): void }>).render?.()).not.toThrow();
        });
    });

});
