import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUI, mockCheckOpeningStatus, mockShowAperturaForm } = vi.hoisted(() => ({
  mockUI: {
    openModal: vi.fn(),
    closeModal: vi.fn()
  },
  mockCheckOpeningStatus: vi.fn(),
  mockShowAperturaForm: vi.fn()
}));

vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/ui/components/ClosureWizard.js', () => ({}));
vi.mock('../../js/operator/opening.js', () => ({
  checkOpeningStatus: mockCheckOpeningStatus,
  showAperturaForm: mockShowAperturaForm
}));

import { startClosureWizard } from '../../js/operator/closure.js';

describe('Operator Closure Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="modal-body"></div>';
    mockCheckOpeningStatus.mockResolvedValue({ id: 1, opened_at: new Date().toISOString() });
  });

  it('should open modal for closure when active shift exists', async () => {
    await startClosureWizard('ST-1', 'USER-1');

    expect(mockUI.openModal).toHaveBeenCalled();
    const modalBody = document.getElementById('modal-body');
    expect(modalBody?.innerHTML).toContain('closure-wizard');
  });

  it('should set attributes on wizard', async () => {
    await startClosureWizard('ST-1', 'USER-1');

    const wizard = document.querySelector('closure-wizard');
    expect(wizard).not.toBeNull();
    expect(wizard?.getAttribute('stationId')).toBe('ST-1');
  });

  it('should delegate to showAperturaForm when no active shift exists', async () => {
    mockCheckOpeningStatus.mockResolvedValueOnce(null);

    await startClosureWizard('ST-1', 'USER-1');

    expect(mockShowAperturaForm).toHaveBeenCalledWith('ST-1');
  });
});
