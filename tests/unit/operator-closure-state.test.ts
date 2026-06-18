import { describe, it, expect, vi, beforeEach } from 'vitest';

import { closureState, resetClosureState, initClosureState, setClosureStep, setClosureCounters, setCalculations } from '../../js/operator/closure-state.js';

describe('Operator Closure State Module', () => {
    beforeEach(() => {
        resetClosureState();
    });

    it('should export closureState object', () => {
        expect(closureState).toBeDefined();
        expect(closureState.step).toBe(1);
    });

    it('should reset closure state', () => {
        closureState.step = 5;
        closureState.stationId = 'ST-123';

        resetClosureState();

        expect(closureState.step).toBe(1);
        expect(closureState.stationId).toBeNull();
    });

    it('should initialize closure state with shift data', () => {
        const mockShift = {
            id: 1,
            station_id: 123,
            user_id: 'user-456',
            data_apertura: '2024-01-01T08:00:00Z'
        } as unknown as Partial<{ id: number; station_id: number; user_id: string; data_apertura: string }>;

        initClosureState('ST-123', 'user-456', mockShift);

        expect(closureState.stationId).toBe('ST-123');
        expect(closureState.userId).toBe('user-456');
        expect(closureState.activeOpening).toEqual(mockShift);
    });

    it('should set closure step', () => {
        setClosureStep(3);

        expect(closureState.step).toBe(3);
    });

    it('should set closure counters', () => {
        const counters = {
            1: 1500,
            2: 2000
        };

        setClosureCounters(counters);

        expect(closureState.closureCounters).toEqual(counters);
    });

    it('should set calculations', () => {
        const calculations = {
            totalRevenue: 5000,
            totalVolume: 3000
        };

        setCalculations(calculations);

        expect(closureState.calculations).toEqual(calculations);
    });

    it('should persist state across multiple updates', () => {
        const mockShift = { id: 1 } as unknown as Partial<{ id: number }>;

        initClosureState('ST-789', 'user-789', mockShift);
        setClosureStep(2);
        setClosureCounters({ 1: 1000 });

        expect(closureState.stationId).toBe('ST-789');
        expect(closureState.step).toBe(2);
        expect(closureState.closureCounters[1]).toBe(1000);
    });
});
