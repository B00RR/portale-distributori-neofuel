/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showOperatorMenu } from '../../js/operator';
import { router } from '../../js/operator/router';
import { store } from '../../js/shared/state';
import * as layout from '../../js/operator/layout';

// Mock dependencies
vi.mock('../../js/operator/router', () => ({
    router: {
        navigateTo: vi.fn(),
        init: vi.fn()
    }
}));

vi.mock('../../js/shared/state', () => ({
    store: {
        getUser: vi.fn(() => ({ id: 'user123', station_id: 1, role: 'operator' })),
        setUser: vi.fn()
    }
}));

vi.mock('../../js/operator/layout', () => ({
    renderOperatorShell: vi.fn(),
    updateTurnoButton: vi.fn(),
    updateStationBadge: vi.fn() // Add this if it's called
}));

// Mock the dynamic import of opening.js
vi.mock('../../js/operator/opening.js', () => ({
    checkOpeningStatus: vi.fn()
}));

describe('Operator Menu Initialization', () => {
    let checkOpeningStatusMock: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Setup DOM
        document.body.innerHTML = '<div id="main-content"></div>';

        // Get the mocked function
        const openingModule = await import('../../js/operator/opening.js');
        checkOpeningStatusMock = openingModule.checkOpeningStatus;
    });

    it('should NOT auto-navigate to "apertura" when no shift is active', async () => {
        // Arrange
        checkOpeningStatusMock.mockResolvedValue(null); // No active shift

        // Act
        await showOperatorMenu('user123', 1);

        // Assert
        expect(layout.renderOperatorShell).toHaveBeenCalled();
        expect(router.navigateTo).not.toHaveBeenCalledWith('apertura');
    });

    it('should NOT navigate to "apertura" if a shift IS active', async () => {
        // Arrange
        checkOpeningStatusMock.mockResolvedValue({ id: 123, status: 'open' }); // Active shift

        // Act
        await showOperatorMenu('user123', 1);

        // Assert
        expect(layout.renderOperatorShell).toHaveBeenCalled();
        expect(router.navigateTo).not.toHaveBeenCalledWith('apertura');
        // It might navigate to nothing (stay on dashboard) or 'chiusura' depending on implementation
        // Current implementation: does nothing if open (logs only)
    });
});
