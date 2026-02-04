import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true
});

import { ClosureState, saveClosureState, loadClosureState, clearClosureState, mergePistolData } from '../../js/operator/closure-state.js';

describe('Operator Closure State Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should save closure state to localStorage', () => {
        const state: ClosureState = {
            shiftId: 'shift-123',
            pistols: [
                { id: 1, finalCounter: 1000, initialCounter: 500 }
            ],
            cashDeclared: 500.50,
            timestamp: new Date().toISOString()
        };

        saveClosureState(state);

        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
            'closure_state',
            expect.stringContaining('shift-123')
        );
    });

    it('should load closure state from localStorage', () => {
        const savedState = {
            shiftId: 'shift-456',
            pistols: [],
            cashDeclared: 0,
            timestamp: new Date().toISOString()
        };

        mockLocalStorage.getItem.mockReturnValue(JSON.stringify(savedState));

        const loaded = loadClosureState();

        expect(loaded).toEqual(savedState);
        expect(mockLocalStorage.getItem).toHaveBeenCalledWith('closure_state');
    });

    it('should return null if no state exists', () => {
        mockLocalStorage.getItem.mockReturnValue(null);

        const loaded = loadClosureState();

        expect(loaded).toBeNull();
    });

    it('should clear closure state', () => {
        clearClosureState();

        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('closure_state');
    });

    it('should persist state across refresh', () => {
        const initialState: ClosureState = {
            shiftId: 'shift-789',
            pistols: [{ id: 1, finalCounter: 2000, initialCounter: 1000 }],
            cashDeclared: 1500.75,
            timestamp: new Date().toISOString()
        };

        saveClosureState(initialState);

        // Simulate page refresh
        mockLocalStorage.getItem.mockReturnValue(
            mockLocalStorage.setItem.mock.calls[0][1]
        );

        const reloaded = loadClosureState();

        expect(reloaded?.shiftId).toBe('shift-789');
        expect(reloaded?.cashDeclared).toBe(1500.75);
    });

    it('should merge pistol data correctly', () => {
        const existing = [
            { id: 1, finalCounter: 1000, initialCounter: 500 }
        ];

        const newData = [
            { id: 1, finalCounter: 1500, initialCounter: 500 },
            { id: 2, finalCounter: 800, initialCounter: 400 }
        ];

        const merged = mergePistolData(existing, newData);

        expect(merged).toHaveLength(2);
        expect(merged.find(p => p.id === 1)?.finalCounter).toBe(1500);
    });

    it('should handle decimal precision for cash amounts', () => {
        const state: ClosureState = {
            shiftId: 'shift-decimal',
            pistols: [],
            cashDeclared: 123.456, // 3 decimals
            timestamp: new Date().toISOString()
        };

        saveClosureState(state);

        mockLocalStorage.getItem.mockReturnValue(
            mockLocalStorage.setItem.mock.calls[0][1]
        );

        const loaded = loadClosureState();

        // Should maintain decimal precision
        expect(loaded?.cashDeclared).toBeCloseTo(123.456, 3);
    });
});
