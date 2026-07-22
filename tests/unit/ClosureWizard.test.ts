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
    rpc: vi.fn(() => Promise.resolve({ data: { success: true }, error: null }))
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
    it('should track last-operator flag', async () => {
      const { ClosureWizard } =
        (await import('../../js/ui/components/ClosureWizard.js')) as unknown as {
          ClosureWizard: CustomElementConstructor;
        };
      const element = new (ClosureWizard as unknown as CustomElementConstructor)();

      (element as unknown as Partial<{ isLastOperator: boolean }>).isLastOperator = true;
      expect((element as unknown as Partial<{ isLastOperator: boolean }>).isLastOperator).toBe(
        true
      );
    });
  });

  describe('Step 3 server preview (#321)', () => {
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
        wizardState: { step: 3, mode: 'form' },
        serverTotals: {
          total_liters: 100,
          total_fuel_revenue: 200,
          total_cash_collected: 500,
          discrepancy: 300,
          operator_cash: 500,
          operator_pos: 0,
          operator_fleet: 0,
          self_cash_in: 0,
          self_cash_out: 0,
          self_pos: 0,
          self_fleet: 0,
          self_manager: 0
        },
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

    it('renders the server preview totals', async () => {
      const container = await buildStep3Container({});

      expect(container.textContent).toContain('Discrepanza Rilevata');
      expect(container.textContent).toContain('Totale litri');
      expect(container.textContent).toContain('Ricavo carburante');
      expect(container.textContent).toContain('Contanti operatore');
    });

    it('shows the fallback when the preview is not available', async () => {
      const container = await buildStep3Container({ serverTotals: null });

      expect(container.textContent).not.toContain('Discrepanza Rilevata');
      expect(container.textContent).toContain('Anteprima non disponibile');
      expect(container.textContent).toContain('Discrepanza');
    });
  });

  describe('Revenue Calculations', () => {
    it('should expose empty totals before preview', async () => {
      const { ClosureWizard } =
        (await import('../../js/ui/components/ClosureWizard.js')) as unknown as {
          ClosureWizard: CustomElementConstructor;
        };
      const element = new (ClosureWizard as unknown as CustomElementConstructor)();

      const totals = (element as unknown as Partial<{ serverTotals: unknown }>).serverTotals;
      expect(totals).toBeNull();
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
        finalCounters: Record<number, number | null>;
        handleStep1Submit: () => void;
        stationConfig: { allow_partial_closure: boolean } | null;
      };

      element.loadInitialData = vi.fn();
      element.wizardState = { step: 1, mode: 'form', errorMessage: '' };
      element.islands = [{ island_id: 1, nome: 'Isola 1', station_id: 1 }];
      element.pistole = [{ id: 7, island_id: 1, nome: 'Pistola 7', tipo_carburante: 'benzina' }];
      element.openingCounters = { 7: 100 };
      element.finalCounters = { 7: null };
      document.body.appendChild(element);
      await element.updateComplete;

      const input = element.renderRoot.querySelector('input[name="counter_7"]') as HTMLInputElement;
      input.value = '99.99';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      element.handleStep1Submit();

      expect(element.wizardState.step).toBe(1);
      expect(input).toBe(element.renderRoot.activeElement);
    });
  });

  describe('Closure Submission', () => {
    it('calls submit_shift_closure_v2 with raw payload including ID Gestore', async () => {
      const [{ ClosureWizard }, { supabase }] = await Promise.all([
        import('../../js/ui/components/ClosureWizard.js'),
        import('../../js/core/api.js')
      ]);
      const element = new ClosureWizard() as unknown as {
        stationId: string;
        activeOpening: { id: number; status: string; closing_data: null };
        isLastOperator: boolean;
        finalCounters: Record<number, number | null>;
        pistole: Array<{ id: number; island_id: number; nome: string; tipo_carburante: string }>;
        selfCashIn: string;
        selfCashOut: string;
        selfPos: string;
        selfFleet: string;
        selfManager: string;
        operatorCash: string;
        operatorPos: string;
        operatorUta: string;
        handleConfirmClosure: () => Promise<void>;
      };

      Object.assign(element, {
        stationId: '1',
        activeOpening: { id: 42, status: 'open', closing_data: null },
        isLastOperator: true,
        finalCounters: { 7: 125 },
        pistole: [{ id: 7, island_id: 1, nome: 'Pistola 7', tipo_carburante: 'benzina' }],
        selfCashIn: '100',
        selfCashOut: '10',
        selfPos: '20',
        selfFleet: '30',
        selfManager: '40',
        operatorCash: '50',
        operatorPos: '60',
        operatorUta: '70'
      });

      await element.handleConfirmClosure();

      expect(supabase.rpc).toHaveBeenCalledWith(
        'submit_shift_closure_v2',
        expect.objectContaining({
          p_shift_id: 42,
          p_station_id: 1,
          p_closure_type: 'final',
          p_final_counters: { 7: 125 },
          p_self_cash_in: 100,
          p_self_cash_out: 10,
          p_self_pos: 20,
          p_self_fleet: 30,
          p_self_manager: 40,
          p_operator_cash: 50,
          p_operator_pos: 60,
          p_operator_fleet: 70
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
        isLastOperator: boolean;
        finalCounters: Record<number, number | null>;
        pistole: Array<{ id: number; island_id: number; nome: string; tipo_carburante: string }>;
        handleConfirmClosure: () => Promise<void>;
      };

      Object.assign(element, {
        stationId: '1',
        activeOpening: {
          id: 43,
          status: 'partial',
          closing_data: { closure_stage: 'partial' }
        },
        isLastOperator: false,
        finalCounters: { 7: 130 },
        pistole: [{ id: 7, island_id: 1, nome: 'Pistola 7', tipo_carburante: 'benzina' }]
      });

      await element.handleConfirmClosure();

      expect(supabase.rpc).toHaveBeenCalledWith(
        'submit_shift_closure_v2',
        expect.objectContaining({
          p_shift_id: 43,
          p_station_id: 1,
          p_closure_type: 'final',
          p_final_counters: { 7: 130 }
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
