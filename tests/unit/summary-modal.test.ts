/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockCheckOpeningStatus } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn()
  },
  mockCheckOpeningStatus: vi.fn()
}));

vi.mock('../../js/core/api.js', () => ({
  supabase: mockSupabase,
  Json: {}
}));

vi.mock('../../js/operator/opening.js', () => ({
  checkOpeningStatus: mockCheckOpeningStatus
}));

import { showShiftSummary } from '../../js/operator/summary.js';

describe('showShiftSummary modal rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="operator-content">Menu Content</div>';
  });

  it('3. showShiftSummary() opens modal and uses #modal-body, without overwriting #operator-content', async () => {
    mockCheckOpeningStatus.mockResolvedValue({ id: 100, status: 'open', opening_data: null });

    const createQueryMock = () => {
      const mockQuery: any = {
        select: vi.fn().mockImplementation(() => mockQuery),
        eq: vi.fn().mockImplementation(() => mockQuery),
        then: (resolve: any) => resolve({ data: [], error: null })
      };
      return mockQuery;
    };

    mockSupabase.from.mockImplementation(() => createQueryMock());

    await showShiftSummary(1, 10);

    const modalBody = document.getElementById('modal-body');
    expect(modalBody).not.toBeNull();

    const operatorContent = document.getElementById('operator-content');
    expect(operatorContent?.innerHTML).toBe('Menu Content');
  });
});
