import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { store } from '../../js/shared/state.js';
import { showChiusureTab, disposeShiftsSubscription } from '../../js/admin/shifts.js';

vi.mock('../../js/core/api.js', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn(function () { return this; }),
      subscribe: vi.fn(() => vi.fn())
    }))
  }
}));

describe('Admin shifts subscription cleanup (#347)', () => {
  let container: HTMLElement;
  let filters: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    filters = document.createElement('div');
    filters.id = 'filters-container';
    document.body.appendChild(container);
    document.body.appendChild(filters);
    vi.clearAllMocks();
    disposeShiftsSubscription();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    disposeShiftsSubscription();
  });

  it('disposes previous subscription on re-init so only the latest is active', async () => {
    const disposers = [vi.fn(), vi.fn(), vi.fn()];
    let callCount = 0;
    vi.spyOn(store, 'subscribe').mockImplementation(() => {
      return disposers[callCount++] ?? vi.fn();
    });

    await showChiusureTab(container, null);
    await showChiusureTab(container, null);
    await showChiusureTab(container, null);

    expect(disposers[0]).toHaveBeenCalledTimes(1);
    expect(disposers[1]).toHaveBeenCalledTimes(1);
    expect(disposers[2]).not.toHaveBeenCalled();
  });

  it('exports a dispose function that can be called safely', () => {
    expect(() => disposeShiftsSubscription()).not.toThrow();
  });
});
