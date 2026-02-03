import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleError, AppError } from '../../js/shared/error-handler.js';
import { Toast } from '../../js/ui/toast.js';

// Mock Toast
vi.mock('../../js/ui/toast.js', () => ({
    Toast: {
        show: vi.fn()
    }
}));

describe('Error Handler Module', () => {

    // beforeEach(() => {
    //     vi.clearAllMocks();
    // });

    describe('AppError Class', () => {
        it('should create custom error with code', () => {
            const error = new AppError('Test error', 'TEST_CODE');

            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(AppError);
            expect(error.message).toBe('Test error');
            expect(error.code).toBe('TEST_CODE');
            expect(error.name).toBe('AppError');
        });

        it('should default to APP_ERROR code', () => {
            const error = new AppError('Error without code');

            expect(error.code).toBe('APP_ERROR');
        });

        it('should store original error', () => {
            const originalError = new Error('Original');
            const appError = new AppError('Wrapped', 'WRAPPER', originalError);

            expect(appError.originalError).toBe(originalError);
        });
    });

    describe('handleError Function', () => {
        it('should call Toast.show on error', () => {
            const mockToastShow = vi.mocked(Toast.show);

            handleError(new Error('Test error'), 'TestContext');

            expect(mockToastShow).toHaveBeenCalled();
        });

        it('should handle PGRST116 error code', () => {
            const mockToastShow = vi.mocked(Toast.show);

            const error = { code: 'PGRST116' };
            handleError(error, 'DataContext');

            expect(mockToastShow).toHaveBeenCalledWith('Dati non trovati.', 'warning');
        });

        it('should handle network errors', () => {
            const mockToastShow = vi.mocked(Toast.show);

            const networkError = { message: 'Network request failed' };
            handleError(networkError, 'APIContext');

            const call = mockToastShow.mock.calls[0];
            expect(call[0]).toContain('connessione');
        });

        it('should handle fetch errors', () => {
            const mockToastShow = vi.mocked(Toast.show);

            const fetchError = { message: 'Fetch timeout' };
            handleError(fetchError, 'APIContext');

            const call = mockToastShow.mock.calls[0];
            expect(call[0]).toContain('connessione');
        });

        it('should handle AppError instances', () => {
            const mockToastShow = vi.mocked(Toast.show);

            const appError = new AppError('Custom user message', 'CUSTOM');
            handleError(appError, 'AppContext');

            expect(mockToastShow).toHaveBeenCalledWith('Custom user message', 'error');
        });

        it('should handle generic errors', () => {
            const mockToastShow = vi.mocked(Toast.show);

            handleError(new Error('Generic error'), 'Context');

            expect(mockToastShow).toHaveBeenCalled();
        });

        it('should handle errors without context', () => {
            const mockToastShow = vi.mocked(Toast.show);

            handleError(new Error('Error'));

            expect(mockToastShow).toHaveBeenCalled();
        });

        it('should render error in target element if provided', () => {
            const mockTarget = document.createElement('div');

            handleError(new Error('Test'), 'Context', mockTarget);

            expect(mockTarget.innerHTML).toContain('error-state');
            expect(mockTarget.innerHTML).toContain('Ricarica Pagina');
        });

        it('should escape HTML in rendered error', () => {
            const mockTarget = document.createElement('div');
            const xssError = new AppError('<script>alert(1)</script>');

            handleError(xssError, 'XSS', mockTarget);

            expect(mockTarget.innerHTML).not.toContain('<script>');
            expect(mockTarget.innerHTML).toContain('&lt;script&gt;');
        });

        it('should handle null errors gracefully', () => {
            expect(() => handleError(null, 'Context')).not.toThrow();
        });

        it('should handle undefined errors gracefully', () => {
            expect(() => handleError(undefined, 'Context')).not.toThrow();
        });
    });
});
