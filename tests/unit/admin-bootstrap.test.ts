import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── hoisted mocks ───────────────────────────────────────────────────────
const { mockStore, mockLogger, mockClearSession, mockOpenConfirmModal, mockSafeSupabaseQuery } =
  vi.hoisted(() => ({
    mockStore: {
      getUser: vi.fn(),
      getFilter: vi.fn().mockReturnValue(null),
      setStationFilter: vi.fn(),
      getStations: vi.fn().mockReturnValue([]),
      setStations: vi.fn()
    },
    mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    mockClearSession: vi.fn(),
    mockOpenConfirmModal: vi.fn(),
    mockSafeSupabaseQuery: vi.fn()
  }));

vi.mock('../../js/shared/state.js', () => ({ store: mockStore }));
vi.mock('../../js/core/logger.js', () => ({ logger: mockLogger }));
vi.mock('../../js/core/auth.js', () => ({ clearSession: mockClearSession }));
vi.mock('../../js/ui/ui.js', () => ({
  openConfirmModal: mockOpenConfirmModal,
  showLoadingMessage: vi.fn(),
  showErrorMessage: vi.fn()
}));
vi.mock('../../js/core/api.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    }))
  },
  safeSupabaseQuery: mockSafeSupabaseQuery
}));
// dashboard-config is imported by admin.ts; stub it to avoid side-effects
vi.mock('../../js/admin/dashboard-config.js', () => ({
  showDashboardConfigPanel: vi.fn()
}));

import { showAdminArea } from '../../js/admin.js';
import { isAdminTab } from '../../js/admin/router.js';

describe('Admin bootstrap — legacy analytics hash fallback (#444)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="main-content"></div>';
    window.location.hash = '';

    mockStore.getUser.mockReturnValue({
      id: 'user-1',
      user_id: '1',
      email: 'admin@test.com',
      role: 'admin',
      full_name: 'Admin User'
    });
    mockStore.getFilter.mockReturnValue(null);
    mockStore.getStations.mockReturnValue([]);
    mockSafeSupabaseQuery.mockResolvedValue({ data: [], error: null });
  });

  it('isAdminTab rejects analytics', () => {
    expect(isAdminTab('analytics')).toBe(false);
  });

  it('falls back to dashboard when hash is #/admin/analytics', async () => {
    // Simulate legacy deep-link
    window.location.hash = '#/admin/analytics';

    await showAdminArea();

    // The old analytics hash must be normalised to dashboard
    expect(window.location.hash).toBe('#/admin/dashboard');
  });

  it('normalises hash to #/admin/dashboard for any unknown view', async () => {
    window.location.hash = '#/admin/nonexistent';

    await showAdminArea();

    expect(window.location.hash).toBe('#/admin/dashboard');
  });
});
