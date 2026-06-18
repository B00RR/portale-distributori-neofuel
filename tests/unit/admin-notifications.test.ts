import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockBusinessLogic, mockHandleError, mockFormatNumber } = vi.hoisted(() => {
    return {
        mockSupabase: {
            from: vi.fn()
        },
        mockBusinessLogic: {
            loadRules: vi.fn().mockResolvedValue({ notifications_enabled: true, fuel_reserve_alert_liters: 1000, force_close_hours_threshold: 24 })
        },
        mockHandleError: vi.fn(),
        mockFormatNumber: vi.fn((n) => n.toLocaleString())
    };
});

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/core/business-logic-manager.js', () => ({ BusinessLogicManager: mockBusinessLogic }));
vi.mock('../../js/shared/error-handler.js', () => ({ handleError: mockHandleError }));
vi.mock('../../js/utils/utils.js', () => ({ formatNumberIt: mockFormatNumber }));

import { showNotificheAdmin } from '../../js/admin/notifications.js';

describe('Admin Notifications Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const div = document.createElement('div');
        div.id = 'notifications-container';
        document.body.innerHTML = '';
        document.body.appendChild(div);

        // Re-setup mockBusinessLogic.loadRules after clearAllMocks
        mockBusinessLogic.loadRules.mockResolvedValue({
            notifications_enabled: true,
            fuel_reserve_alert_liters: 1000,
            force_close_hours_threshold: 24
        });

        // Default mock: both queries succeed with empty data
        mockSupabase.from.mockImplementation((table) => {
            if (table === 'shifts') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn().mockResolvedValue({ data: [], error: null })
                    }))
                };
            }
            // 'tanks' (and any other table)
            return {
                select: vi.fn().mockResolvedValue({ data: [], error: null })
            };
        });
    });

    it('should display notifications', async () => {
        const container = document.getElementById('notifications-container')!;

        await showNotificheAdmin(container);

        expect(container.innerHTML).toBeTruthy();
    });

    it('should load business rules', async () => {
        const container = document.getElementById('notifications-container')!;

        await showNotificheAdmin(container);

        expect(mockBusinessLogic.loadRules).toHaveBeenCalled();
    });

    it('should display error when tanks query fails', async () => {
        const container = document.getElementById('notifications-container')!;

        const tanksResult = { data: null, error: { message: 'Database connection failed' } };
        const shiftsResult = { data: [], error: null };

        mockSupabase.from.mockImplementation((table) => {
            if (table === 'shifts') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn().mockResolvedValue(shiftsResult)
                    }))
                };
            }
            // 'tanks'
            return {
                select: vi.fn().mockResolvedValue(tanksResult)
            };
        });

        await showNotificheAdmin(container);

        // Should show error message, not empty "all clear" state
        expect(container.textContent).toContain('Errore di Caricamento');
        expect(container.textContent).toContain('serbatoi');
        expect(container.textContent).not.toContain('Tutto sotto controllo');
    });

    it('should display error when shifts query fails', async () => {
        const container = document.getElementById('notifications-container')!;

        const tanksResult = { data: [], error: null };
        const shiftsResult = { data: null, error: { message: 'Query timeout' } };

        mockSupabase.from.mockImplementation((table) => {
            if (table === 'shifts') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn().mockResolvedValue(shiftsResult)
                    }))
                };
            }
            // 'tanks'
            return {
                select: vi.fn().mockResolvedValue(tanksResult)
            };
        });

        await showNotificheAdmin(container);

        // Should show error message, not empty "all clear" state
        expect(container.textContent).toContain('Errore di Caricamento');
        expect(container.textContent).toContain('turni');
        expect(container.textContent).not.toContain('Tutto sotto controllo');
    });

    it('should display critical alert for low fuel even when there are other errors', async () => {
        const container = document.getElementById('notifications-container')!;
        const lowFuelTank = { name: 'Tank A', fuel_type: 'Diesel', liters: 500, station_id: 1, fuel_stations: { station_name: 'Station 1' } };

        const tanksResult = { data: [lowFuelTank], error: null };
        const shiftsResult = { data: null, error: { message: 'Shifts unavailable' } };

        mockSupabase.from.mockImplementation((table) => {
            if (table === 'shifts') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn().mockResolvedValue(shiftsResult)
                    }))
                };
            }
            // 'tanks'
            return {
                select: vi.fn().mockResolvedValue(tanksResult)
            };
        });

        await showNotificheAdmin(container);

        // Should show both the fuel alert and the error
        expect(container.textContent).toContain('Scorta Critica');
        expect(container.textContent).toContain('Errore di Caricamento');
    });

    it('should display critical alert for low fuel reserve', async () => {
        const container = document.getElementById('notifications-container')!;
        const lowFuelTank = { name: 'Benzina Premium', fuel_type: 'Petrol', liters: 500, station_id: 1, fuel_stations: { station_name: 'Station 1' } };

        const tanksResult = { data: [lowFuelTank], error: null };
        const shiftsResult = { data: [], error: null };

        mockSupabase.from.mockImplementation((table) => {
            if (table === 'shifts') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn().mockResolvedValue(shiftsResult)
                    }))
                };
            }
            // 'tanks'
            return {
                select: vi.fn().mockResolvedValue(tanksResult)
            };
        });

        await showNotificheAdmin(container);

        // Should show the critical fuel alert
        expect(container.textContent).toContain('Scorta Critica');
        expect(container.textContent).toContain('Benzina Premium');
        expect(container.textContent).not.toContain('Tutto sotto controllo');
    });

    it('should show "all clear" when no alerts and no errors', async () => {
        const container = document.getElementById('notifications-container')!;
        const normalFuelTank = { name: 'Tank A', fuel_type: 'Diesel', liters: 2000, station_id: 1, fuel_stations: { station_name: 'Station 1' } };

        const tanksResult = { data: [normalFuelTank], error: null };
        const shiftsResult = { data: [], error: null };

        mockSupabase.from.mockImplementation((table) => {
            if (table === 'shifts') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn().mockResolvedValue(shiftsResult)
                    }))
                };
            }
            // 'tanks'
            return {
                select: vi.fn().mockResolvedValue(tanksResult)
            };
        });

        await showNotificheAdmin(container);

        // Should show "all clear" message
        expect(container.textContent).toContain('Tutto sotto controllo');
        expect(container.textContent).not.toContain('Errore di Caricamento');
    });
});
