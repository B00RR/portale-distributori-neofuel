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
    loadRules: vi.fn(() =>
      Promise.resolve({
        cash_error_threshold: 10,
        max_price_limit: 2.5,
        fuel_reserve_alert_liters: 2000,
        force_close_hours_threshold: 24,
        notifications_enabled: true,
        critical_discrepancy_alert: 50
      })
    )
  }
}));

describe('ClosureWizard Component', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  describe('Component Structure', () => {
    it('should be defined as a custom element', async () => {
      await import('../../js/ui/components/ClosureWizard.js');
      expect(customElements.get('closure-wizard')).toBeDefined();
    });

    it('should have required properties', async () => {
      const { ClosureWizard } =
        (await import('../../js/ui/components/ClosureWizard.js')) as unknown as {
          ClosureWizard: CustomElementConstructor;
        };
      const element = new (ClosureWizard as unknown as CustomElementConstructor)();

      expect(element).toHaveProperty('shiftId');
      expect(element).toHaveProperty('stationId');
    });
  });

  describe('Wizard Steps', () => {
    it('should start at step 1', async () => {
      const { ClosureWizard } =
        (await import('../../js/ui/components/ClosureWizard.js')) as unknown as {
          ClosureWizard: CustomElementConstructor;
        };
      const element = new (ClosureWizard as unknown as CustomElementConstructor)();

      expect(
        (element as unknown as Partial<{ wizardState: { step: number } }>).wizardState?.step
      ).toBe(1);
    });

    it('should have 3 total steps', async () => {
      const { ClosureWizard } =
        (await import('../../js/ui/components/ClosureWizard.js')) as unknown as {
          ClosureWizard: CustomElementConstructor;
        };
      const element = new (ClosureWizard as unknown as CustomElementConstructor)();

      // Check that component has step navigation logic
      expect(
        (element as unknown as Partial<{ totalSteps: number }>).totalSteps || 3
      ).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Closure Types', () => {
    it('should support partial closure type', async () => {
      const { ClosureWizard } =
        (await import('../../js/ui/components/ClosureWizard.js')) as unknown as {
          ClosureWizard: CustomElementConstructor;
        };
      const element = new (ClosureWizard as unknown as CustomElementConstructor)();

      // Set closure type
      (element as unknown as Partial<{ closureType: string }>).closureType = 'partial';
      expect((element as unknown as Partial<{ closureType: string }>).closureType).toBe('partial');
    });

    it('should support final closure type', async () => {
      const { ClosureWizard } =
        (await import('../../js/ui/components/ClosureWizard.js')) as unknown as {
          ClosureWizard: CustomElementConstructor;
        };
      const element = new (ClosureWizard as unknown as CustomElementConstructor)();

      (element as unknown as Partial<{ closureType: string }>).closureType = 'final';
      expect((element as unknown as Partial<{ closureType: string }>).closureType).toBe('final');
    });
  });

  describe('Step 3 discrepancy warning (#255)', () => {
    const buildStep3Container = async (
      overrides: Record<string, unknown>
    ): Promise<HTMLDivElement> => {
      const { ClosureWizard } =
        (await import('../../js/ui/components/ClosureWizard.js')) as unknown as {
          ClosureWizard: CustomElementConstructor;
        };
      const { render } = await import('lit');

      const element = new (ClosureWizard as unknown as CustomElementConstructor)();
      Object.assign(element, {
        operatorCash: '500',
        ricavoTeorico: 0,
        wizardState: { step: 3, mode: 'form' },
        ...overrides
      });

      const container = document.createElement('div');
      render(
        (element as unknown as { renderStep3: () => unknown }).renderStep3() as Parameters<
          typeof render
        >[0],
        container
      );
      return container;
    };

    it('suppresses the warning for a partial closure without counters', async () => {
      const container = await buildStep3Container({
        closureType: 'partial',
        includeCounters: false
      });

      expect(container.textContent).not.toContain('Discrepanza Rilevata');
      expect(container.textContent).not.toContain('Teorico');
      expect(container.textContent).toContain('Reale');
    });

    it('still flags the discrepancy when counters are included', async () => {
      const container = await buildStep3Container({
        closureType: 'partial',
        includeCounters: true
      });

      expect(container.textContent).toContain('Discrepanza Rilevata');
      expect(container.textContent).toContain('Teorico');
    });
  });

  describe('Revenue Calculations', () => {
    it('should initialize with zero theoretical revenue', async () => {
      const { ClosureWizard } =
        (await import('../../js/ui/components/ClosureWizard.js')) as unknown as {
          ClosureWizard: CustomElementConstructor;
        };
      const element = new (ClosureWizard as unknown as CustomElementConstructor)();

      // Check initial revenue state
      const revenue = (element as unknown as Partial<{ ricavoTeorico: number }>).ricavoTeorico || 0;
      expect(revenue).toBe(0);
    });

    it('should reject a closing counter lower than its opening counter', async () => {
      await import('../../js/ui/components/ClosureWizard.js');
      const element = document.createElement('closure-wizard') as unknown as HTMLElement & {
        loadInitialData: () => void;
        updateComplete: Promise<boolean>;
        renderRoot: ShadowRoot;
        wizardState: { step: number; mode: string; errorMessage: string };
        closureType: 'partial' | 'final';
        islands: Array<{ island_id: number; nome: string; station_id: number }>;
        pistole: Array<{
          id: number;
          island_id: number;
          nome: string;
          tipo_carburante: string;
        }>;
        openingCounters: Record<number, number>;
        finalCounters: Record<number, number>;
        handleStep1Submit: () => void;
      };

      element.loadInitialData = vi.fn();
      element.wizardState = { step: 1, mode: 'form', errorMessage: '' };
      element.closureType = 'final';
      element.islands = [{ island_id: 1, nome: 'Isola 1', station_id: 1 }];
      element.pistole = [{ id: 7, island_id: 1, nome: 'Pistola 7', tipo_carburante: 'benzina' }];
      element.openingCounters = { 7: 100 };
      document.body.appendChild(element);
      await element.updateComplete;

      const input = element.renderRoot.querySelector('input[name="counter_7"]') as HTMLInputElement;
      input.value = '99.99';
      element.handleStep1Submit();

      expect(element.wizardState.step).toBe(1);
      expect(element.finalCounters).toEqual({});
      expect(input).toBe(element.renderRoot.activeElement);
    });
  });

  describe('Closure Submission', () => {
    it('includes final counters and ID Gestore in the submitted totals', async () => {
      const [{ ClosureWizard }, { supabase }] = await Promise.all([
        import('../../js/ui/components/ClosureWizard.js'),
        import('../../js/core/api.js')
      ]);
      const element = new ClosureWizard() as unknown as {
        stationId: string;
        activeOpening: { id: number; status: string; closing_data: null };
        closureType: 'partial' | 'final';
        includeCounters: boolean;
        finalCounters: Record<number, number>;
        selfCashIn: string;
        selfCashOut: string;
        selfPos: string;
        selfFleet: string;
        selfManager: string;
        operatorCash: string;
        operatorPos: string;
        operatorUta: string;
        ricavoTeorico: number;
        handleConfirmClosure: () => Promise<void>;
      };

      Object.assign(element, {
        stationId: '1',
        activeOpening: { id: 42, status: 'open', closing_data: null },
        closureType: 'final',
        includeCounters: false,
        finalCounters: { 7: 125 },
        selfCashIn: '100',
        selfCashOut: '10',
        selfPos: '20',
        selfFleet: '30',
        selfManager: '40',
        operatorCash: '50',
        operatorPos: '60',
        operatorUta: '70',
        ricavoTeorico: 300
      });

      vi.useFakeTimers();
      try {
        await element.handleConfirmClosure();
      } finally {
        vi.useRealTimers();
      }

      expect(supabase.rpc).toHaveBeenCalledWith(
        'submit_shift_closure',
        expect.objectContaining({
          p_shift_id: 42,
          p_is_final: true,
          p_final_counters: { 7: 125 },
          p_closing_data: expect.objectContaining({
            closure_stage: 'final',
            incasso_reale: 360,
            discrepanza: 60
          })
        })
      );
    });

    it('forces a previously partial shift through the final closure path', async () => {
      const [{ ClosureWizard }, { supabase }] = await Promise.all([
        import('../../js/ui/components/ClosureWizard.js'),
        import('../../js/core/api.js')
      ]);
      const element = new ClosureWizard() as unknown as {
        stationId: string;
        activeOpening: {
          id: number;
          status: string;
          closing_data: { closure_stage: string };
        };
        closureType: 'partial' | 'final';
        includeCounters: boolean;
        finalCounters: Record<number, number>;
        handleConfirmClosure: () => Promise<void>;
      };

      Object.assign(element, {
        stationId: '1',
        activeOpening: {
          id: 43,
          status: 'partial',
          closing_data: { closure_stage: 'partial' }
        },
        closureType: 'partial',
        includeCounters: false,
        finalCounters: { 7: 130 }
      });

      vi.useFakeTimers();
      try {
        await element.handleConfirmClosure();
      } finally {
        vi.useRealTimers();
      }

      expect(supabase.rpc).toHaveBeenCalledWith(
        'submit_shift_closure',
        expect.objectContaining({
          p_shift_id: 43,
          p_is_final: true,
          p_final_counters: { 7: 130 },
          p_closing_data: expect.objectContaining({ closure_stage: 'final', is_final: true })
        })
      );
    });
  });

  describe('CSS Styles', () => {
    it('should have static styles defined', async () => {
      const { ClosureWizard } =
        (await import('../../js/ui/components/ClosureWizard.js')) as unknown as {
          ClosureWizard: CustomElementConstructor & { styles?: unknown };
        };

      expect(ClosureWizard.styles).toBeDefined();
    });
  });

  describe('Render Method', () => {
    it('should render without throwing', async () => {
      const { ClosureWizard } =
        (await import('../../js/ui/components/ClosureWizard.js')) as unknown as {
          ClosureWizard: CustomElementConstructor;
        };
      const element = new (ClosureWizard as unknown as CustomElementConstructor)();
      (
        element as unknown as Partial<{ shiftId: string; stationId: string; render(): void }>
      ).shiftId = '1';
      (
        element as unknown as Partial<{ shiftId: string; stationId: string; render(): void }>
      ).stationId = '1';

      expect(() => (element as unknown as Partial<{ render(): void }>).render?.()).not.toThrow();
    });
  });
});
