/**
 * Test per js/shared/error-handler.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleError } from '../../js/shared/error-handler.js';
import { Toast } from '../../js/ui/toast.js';

// Mock Toast
vi.mock('../../js/ui/toast.js', () => ({
    Toast: {
        show: vi.fn()
    }
}));

describe('handleError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    it('should log error to console', () => {
        const error = new Error('Test error');
        handleError(error, 'testContext');

        expect(console.error).toHaveBeenCalledWith('[testContext] Error:', error);
    });

    it('should show Toast with error message', () => {
        const error = new Error('Database connection failed');
        handleError(error, 'saveData');

        expect(Toast.show).toHaveBeenCalled();
        const [message, type] = Toast.show.mock.calls[0];
        expect(message).toContain('errore');
        expect(type).toBe('error');
    });

    it('should handle Supabase errors with specific messages', () => {
        const supabaseError = {
            message: 'permission denied',
            code: '42501',
            hint: 'Check RLS policies'
        };

        handleError(supabaseError, 'queryData');

        expect(Toast.show).toHaveBeenCalled();
        const [message] = Toast.show.mock.calls[0];
        expect(message).toBeTruthy();
    });

    it('should render error in target element if provided', () => {
        const mockElement = {
            innerHTML: ''
        };

        const error = new Error('Render test');
        handleError(error, 'renderTest', mockElement);

        expect(mockElement.innerHTML).toContain('error-state');
        expect(mockElement.innerHTML).toContain('fa-exclamation-circle');
    });

    it('should handle non-Error objects', () => {
        const stringError = 'String error message';
        handleError(stringError, 'testContext');

        expect(Toast.show).toHaveBeenCalled();
    });

    it('should handle network errors', () => {
        const networkError = new TypeError('Failed to fetch');
        handleError(networkError, 'apiCall');

        expect(Toast.show).toHaveBeenCalled();
        const [message] = Toast.show.mock.calls[0];
        expect(message).toContain('rete');
    });
});
