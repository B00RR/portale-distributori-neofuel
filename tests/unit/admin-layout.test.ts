import { describe, it, expect, vi } from 'vitest';

const { mockStore, mockRouter, mockOpenModal, mockClearSession, mockEscapeHtml } = vi.hoisted(() => ({
    mockStore: {
        getUser: vi.fn(() => ({ role: 'admin', email: 'test@example.com' })),
        getFilter: vi.fn(() => null),
        getStations: vi.fn(() => [])
    },
    mockRouter: {
        navigateTo: vi.fn(),
        getCurrentTab: vi.fn(() => 'dashboard')
    },
    mockOpenModal: vi.fn(),
    mockClearSession: vi.fn(),
    mockEscapeHtml: vi.fn((str) => str)
}));

vi.mock('../../js/shared/state.js', () => ({ store: mockStore }));
vi.mock('../../js/admin/router.js', () => ({ router: mockRouter }));
vi.mock('../../js/ui/ui.js', () => ({ openConfirmModal: mockOpenModal }));
vi.mock('../../js/core/auth.js', () => ({ clearSession: mockClearSession }));
vi.mock('../../js/utils/utils.js', () => ({ escapeHtml: mockEscapeHtml }));

import { getRoleLabel } from '../../js/admin/layout.js';

describe('Admin Layout Module', () => {
    it('should get role label', () => {
        const label = getRoleLabel('admin');
        expect(label).toBe('Amministratore');
    });

    it('should get operator role label', () => {
        const label = getRoleLabel('operator');
        expect(label).toBe('Operatore');
    });
});
