import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockUI, mockUIComponents } = vi.hoisted(() => ({
    mockSupabase: {
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn()
        }))
    },
    mockUI: {
        openModal: vi.fn(),
        closeModal: vi.fn()
    },
    mockUIComponents: {
        createWarningMessage: vi.fn((title, subtitle, message) =>
            `<div class="warning">${title}: ${subtitle} - ${message}</div>`)
    }
}));

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/operator/ui-components.js', () => mockUIComponents);
vi.mock('../../js/ui/components/ShiftOpener.js', () => ({}));

import { updateOpeningStatus, checkOpeningStatus, showAperturaForm } from '../../js/operator/opening.js';

describe('Operator Opening Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="opening-status"></div><div id="modal-body"></div>';
    });

    describe('updateOpeningStatus', () => {
        it('should update badge to open status when shift exists', async () => {
            const selectChain = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                        id: 1,
                        opened_at: '2024-01-01T10:00:00Z',
                        users: { full_name: 'Test Operator' }
                    },
                    error: null
                })
            };
            mockSupabase.from.mockReturnValue(selectChain);

            await updateOpeningStatus('ST-123');

            const badge = document.getElementById('opening-status');
            expect(badge?.textContent).toBe('Aperto');
            expect(badge?.className).toContain('status-open');
        });

        it('should update badge to closed when no shift', async () => {
            const selectChain = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            };
            mockSupabase.from.mockReturnValue(selectChain);

            await updateOpeningStatus('ST-123');

            const badge = document.getElementById('opening-status');
            expect(badge?.textContent).toBe('Chiuso');
            expect(badge?.className).toContain('status-closed');
        });

        it('should handle partial closure status', async () => {
            const selectChain = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                        id: 1,
                        opened_at: '2024-01-01T10:00:00Z',
                        closing_data: { closure_stage: 'partial' },
                        users: { full_name: 'Test Operator' }
                    },
                    error: null
                })
            };
            mockSupabase.from.mockReturnValue(selectChain);

            await updateOpeningStatus('ST-123');

            const badge = document.getElementById('opening-status');
            expect(badge?.textContent).toBe('Parziale');
            expect(badge?.className).toContain('status-partial');
        });

        it('should return early if badge not found', async () => {
            document.body.innerHTML = '';
            await updateOpeningStatus('ST-123');
            expect(mockSupabase.from).not.toHaveBeenCalled();
        });
    });

    describe('checkOpeningStatus', () => {
        it('should return null when no active shift', async () => {
            const selectChain = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            };
            mockSupabase.from.mockReturnValue(selectChain);

            const result = await checkOpeningStatus('ST-123');
            expect(result).toBeNull();
        });

        it('should return shift data when active shift exists', async () => {
            const shiftData = {
                id: 1,
                opened_at: '2024-01-01T10:00:00Z',
                operator_id: 'user-123',
                status: 'open',
                users: { full_name: 'Test Operator' }
            };

            const selectChain = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: shiftData, error: null })
            };
            mockSupabase.from.mockReturnValue(selectChain);

            const result = await checkOpeningStatus('ST-123');
            expect(result).toEqual(shiftData);
        });

        it('should handle database errors gracefully', async () => {
            const selectChain = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
            };
            mockSupabase.from.mockReturnValue(selectChain);

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const result = await checkOpeningStatus('ST-123');

            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('showAperturaForm', () => {
        it('should prevent opening if shift already active', async () => {
            const selectChain = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 1, opened_at: '2024-01-01T10:00:00Z' },
                    error: null
                })
            };
            mockSupabase.from.mockReturnValue(selectChain);

            await showAperturaForm('ST-123', 'user-456');

            expect(mockUI.openModal).toHaveBeenCalledWith('Apertura Già Effettuata');
            expect(mockUIComponents.createWarningMessage).toHaveBeenCalled();
        });

        it('should render ShiftOpener component when no active shift', async () => {
            const selectChain = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            };
            mockSupabase.from.mockReturnValue(selectChain);

            await showAperturaForm('ST-123', 'user-456');

            expect(mockUI.openModal).toHaveBeenCalledWith('Apertura Turno');
            const modalBody = document.getElementById('modal-body');
            expect(modalBody?.querySelector('shift-opener')).toBeDefined();
        });

        it('should handle errors during form rendering', async () => {
            const selectChain = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockRejectedValue(new Error('DB Failure'))
            };
            mockSupabase.from.mockReturnValue(selectChain);

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            await showAperturaForm('ST-123', 'user-456');

            expect(consoleSpy).toHaveBeenCalled();
            expect(mockUI.openModal).toHaveBeenCalledWith('Errore');
            consoleSpy.mockRestore();
        });
    });
});
