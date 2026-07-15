import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase } = vi.hoisted(() => {
  const chain: any = {};
  const mockPromise = Promise.resolve({ data: [], error: null });
  Object.assign(chain, {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    not: vi.fn(() => chain),
    order: vi.fn(() => mockPromise),
    insert: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: { id: 456 }, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: vi.fn((resolve: any) => resolve({ data: [], error: null }))
  });

  return {
    mockSupabase: {
      from: vi.fn(() => chain),
      rpc: vi.fn()
    }
  };
});

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));

// Mock UI/Toast
vi.mock('../../js/ui/ui.js', () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
  showLoadingMessage: vi.fn(),
  showErrorMessage: vi.fn()
}));
vi.mock('../../js/ui/toast.js', () => ({
  Toast: {
    show: vi.fn()
  }
}));

import '../../js/ui/components/ShiftOpener.js';

describe('ShiftOpener Component - TDD tests', () => {
  let alertSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    alertSpy = window.alert;

    // Set up standard mock responses for loadInitialData
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'islands') {
        const chain: any = {};
        const promise = Promise.resolve({
          data: [{ island_id: 1, nome: 'Isola 1', station_id: 1 }],
          error: null
        });
        Object.assign(chain, {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          order: vi.fn(() => promise),
          then: vi.fn((onFulfilled) => promise.then(onFulfilled))
        });
        return chain;
      }
      if (table === 'tanks') {
        const chain: any = {};
        const promise = Promise.resolve({
          data: [
            { id: 10, name: 'Tank 1', fuel_type: 'Diesel', station_id: 1 },
            { id: 11, name: 'Tank 2', fuel_type: 'Super', station_id: 1 }
          ],
          error: null
        });
        Object.assign(chain, {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          order: vi.fn(() => promise),
          then: vi.fn((onFulfilled) => promise.then(onFulfilled))
        });
        return chain;
      }
      if (table === 'pistole') {
        const chain: any = {};
        const promise = Promise.resolve({
          data: [{ id: 20, island_id: 1, nome: 'Pistola 1', tipo_carburante: 'Diesel', numero_litri: 100 }],
          error: null
        });
        Object.assign(chain, {
          select: vi.fn(() => chain),
          in: vi.fn(() => chain),
          order: vi.fn(() => promise),
          then: vi.fn((onFulfilled) => promise.then(onFulfilled))
        });
        return chain;
      }
      if (table === 'shift_pistols') {
        const chain: any = {};
        const promise = Promise.resolve({
          data: [{ pistola_id: 20, closed_at_counter: 95 }],
          error: null
        });
        Object.assign(chain, {
          select: vi.fn(() => chain),
          in: vi.fn(() => chain),
          not: vi.fn(() => chain),
          order: vi.fn(() => promise),
          insert: vi.fn(() => Promise.resolve({ error: null })),
          then: vi.fn((onFulfilled) => promise.then(onFulfilled))
        });
        return chain;
      }
      if (table === 'tank_readings') {
        return {
          insert: vi.fn(() => Promise.resolve({ error: null }))
        };
      }
      if (table === 'shifts') {
        const chain: any = {};
        const insertChain: any = {};
        Object.assign(insertChain, {
          select: vi.fn(() => insertChain),
          single: vi.fn(() => Promise.resolve({ data: { id: 456 }, error: null }))
        });
        Object.assign(chain, {
          insert: vi.fn(() => insertChain)
        });
        return chain;
      }
      return {};
    });
  });

  const setupComponent = async (): Promise<any> => {
    document.body.innerHTML = '<shift-opener stationId="1"></shift-opener>';
    const element = document.querySelector('shift-opener') as any;
    await element.updateComplete;
    // Wait for loadInitialData
    await new Promise(resolve => setTimeout(resolve, 50));
    await element.updateComplete;
    return element;
  };

  it('should call open_shift RPC with correct arguments on submit', async () => {
    // Setup RPC success response
    mockSupabase.rpc.mockResolvedValue({
      data: { success: true, shift_id: 456 },
      error: null
    });

    const element = await setupComponent();
    expect(element.state.mode).toBe('form');

    const form = element.shadowRoot.querySelector('#apertura-form') as HTMLFormElement;
    expect(form).not.toBeNull();

    // Fill form inputs
    const cashInInput = form.querySelector('input[name="cash_in"]') as HTMLInputElement;
    if (cashInInput) cashInInput.value = '100.00';
    const cashOutInput = form.querySelector('input[name="cash_out"]') as HTMLInputElement;
    if (cashOutInput) cashOutInput.value = '10.00';
    const posAmountInput = form.querySelector('input[name="pos_amount"]') as HTMLInputElement;
    if (posAmountInput) posAmountInput.value = '50.00';
    const utaDkvInput = form.querySelector('input[name="uta_dkv_iscard"]') as HTMLInputElement;
    if (utaDkvInput) utaDkvInput.value = '20.00';
    const totalAmountInput = form.querySelector('input[name="total_amount"]') as HTMLInputElement;
    if (totalAmountInput) totalAmountInput.value = '160.00';

    const notesTextarea = form.querySelector('textarea[name="notes"]') as HTMLTextAreaElement;
    if (notesTextarea) notesTextarea.value = 'Opening notes';

    const pCounterInput = form.querySelector('input[name="p_20"]') as HTMLInputElement;
    if (pCounterInput) pCounterInput.value = '105.50';

    const tankInput = form.querySelector('input[name="tank_10"]') as HTMLInputElement;
    if (tankInput) tankInput.value = '1000';

    // Dispatch submit event
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);

    // Wait for submission
    await new Promise(resolve => setTimeout(resolve, 50));
    await element.updateComplete;

    // Assert RPC parameters match expectations
    expect(mockSupabase.rpc).toHaveBeenCalledWith('open_shift', expect.objectContaining({
      p_station_id: 1,
      p_opening_data: {
        cash_in: 100,
        cash_out: 10,
        pos_amount: 50,
        total_amount: 160,
        uta_dkv_iscard: 20,
        cash_in_minus_out: 90,
        notes: 'Opening notes'
      },
      p_pistol_counters: {
        '20': 105.5
      },
      p_tank_levels: {
        '10': 1000,
        '11': 0
      },
      p_request_id: expect.any(String)
    }));

    // Expect transition to success
    expect(element.state.mode).toBe('success');
  });

  it('should handle returned success:false from RPC', async () => {
    // Setup RPC returning success: false
    mockSupabase.rpc.mockResolvedValue({
      data: { success: false, error: 'duplicate_shift', message: 'Il turno è già aperto.' },
      error: null
    });

    const element = await setupComponent();
    const form = element.shadowRoot.querySelector('#apertura-form') as HTMLFormElement;

    // Dispatch submit event
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);

    await new Promise(resolve => setTimeout(resolve, 50));
    await element.updateComplete;

    expect(element.state.mode).toBe('form');
    expect(element.state.errorMessage).toBe('Il turno è già aperto.');
    expect(alertSpy).toHaveBeenCalledWith("Errore durante l'apertura del turno: Il turno è già aperto.");
  });

  it('should handle thrown database/Supabase error', async () => {
    // Setup RPC returning error object
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Database connection timeout' }
    });

    const element = await setupComponent();
    const form = element.shadowRoot.querySelector('#apertura-form') as HTMLFormElement;

    // Dispatch submit event
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);

    await new Promise(resolve => setTimeout(resolve, 50));
    await element.updateComplete;

    expect(element.state.mode).toBe('form');
    expect(element.state.errorMessage).toBe('Database connection timeout');
    expect(alertSpy).toHaveBeenCalledWith("Errore durante l'apertura del turno: Database connection timeout");
  });

  it('should prevent concurrent submissions and only produce one RPC call when two submit events race', async () => {
    // Setup RPC response with a slight delay to simulate a real request in flight
    let resolveRpc: any;
    const rpcPromise = new Promise(resolve => {
      resolveRpc = () => resolve({ data: { success: true, shift_id: 456 }, error: null });
    });
    mockSupabase.rpc.mockImplementation(() => rpcPromise);

    const element = await setupComponent();
    expect(element.state.mode).toBe('form');

    const form = element.shadowRoot.querySelector('#apertura-form') as HTMLFormElement;
    expect(form).not.toBeNull();

    // Dispatch two submit events immediately back-to-back
    const event1 = new Event('submit', { bubbles: true, cancelable: true });
    const event2 = new Event('submit', { bubbles: true, cancelable: true });

    form.dispatchEvent(event1);
    form.dispatchEvent(event2);

    // Complete the RPC promise
    resolveRpc();
    await rpcPromise;

    // Wait for submission logic to settle
    await new Promise(resolve => setTimeout(resolve, 50));
    await element.updateComplete;

    // Verify RPC was only called once!
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
    expect(element.state.mode).toBe('success');
  });
});
