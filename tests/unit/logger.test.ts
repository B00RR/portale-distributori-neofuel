import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../../js/core/logger.js';

describe('Logger Module', () => {

    let consoleErrorSpy: any;
    let consoleWarnSpy: any;
    let consoleInfoSpy: any;
    let consoleDebugSpy: any;

    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, 'error');
        consoleWarnSpy = vi.spyOn(console, 'warn');
        consoleInfoSpy = vi.spyOn(console, 'info');
        consoleDebugSpy = vi.spyOn(console, 'debug');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('logger.error', () => {
        it('should log error and return error ID', () => {
            const errorId = logger.error('TestContext', new Error('Test error'));

            expect(errorId).toMatch(/^ERR-[A-Z0-9]+$/);
            expect(consoleErrorSpy).toHaveBeenCalled();
        });

        it('should mask sensitive data in error messages', () => {
            const errorId = logger.error('AuthContext', new Error('Failed with password: secret123'));

            expect(consoleErrorSpy).toHaveBeenCalled();
            const loggedMessage = consoleErrorSpy.mock.calls[0][0];
            expect(loggedMessage).not.toContain('secret123');
        });

        it('should handle string errors', () => {
            const errorId = logger.error('Context', 'String error message');

            expect(errorId).toMatch(/^ERR-[A-Z0-9]+$/);
            expect(consoleErrorSpy).toHaveBeenCalled();
        });

        it('should handle object errors safely', () => {
            const errorId = logger.error('Context', { message: 'Object error payload' });

            expect(errorId).toMatch(/^ERR-[A-Z0-9]+$/);
            expect(consoleErrorSpy).toHaveBeenCalled();
            const loggedMessage = consoleErrorSpy.mock.calls[0][0];
            expect(loggedMessage).toContain('Object error payload');
        });

        it('should extract message from Supabase-like errors', () => {
            const supabaseError = { message: 'PGRST116: exactly one row expected', code: 'PGRST116' };
            const errorId = logger.error('AuthContext', supabaseError);

            expect(errorId).toMatch(/^ERR-[A-Z0-9]+$/);
            const loggedMessage = consoleErrorSpy.mock.calls[0][0];
            expect(loggedMessage).toContain('PGRST116');
            expect(loggedMessage).toContain('exactly one row expected');
        });

        it('should include error ID in log', () => {
            const errorId = logger.error('TestContext', 'Test');

            const loggedMessage = consoleErrorSpy.mock.calls[0][0];
            expect(loggedMessage).toContain(errorId);
        });
    });

    describe('logger.warn', () => {
        it('should log warnings', () => {
            logger.warn('WarnContext', 'Warning message');

            expect(consoleWarnSpy).toHaveBeenCalled();
            const loggedMessage = consoleWarnSpy.mock.calls[0][0];
            expect(loggedMessage).toContain('Warning message');
        });

        it('should mask sensitive data in warnings', () => {
            logger.warn('Context', 'User email: user@example.com');

            const loggedMessage = consoleWarnSpy.mock.calls[0][0];
            expect(loggedMessage).toContain('email');
            expect(loggedMessage).not.toContain('user@example.com');
        });
    });

    describe('logger.info', () => {
        it('should log info messages', () => {
            logger.info('InfoContext', 'Info message');

            expect(consoleInfoSpy).toHaveBeenCalled();
            const loggedMessage = consoleInfoSpy.mock.calls[0][0];
            expect(loggedMessage).toContain('Info message');
        });

        it('should include context in log', () => {
            logger.info('AppInit', 'Application started');

            const loggedMessage = consoleInfoSpy.mock.calls[0][0];
            expect(loggedMessage).toContain('AppInit');
        });
    });

    describe('logger.debug', () => {
        it('should log debug messages', () => {
            logger.debug('DebugContext', 'Debug message');

            expect(consoleDebugSpy).toHaveBeenCalled();
        });

        it('should include debug details', () => {
            logger.debug('Cache', 'Cache hit for key: user123');

            const loggedMessage = consoleDebugSpy.mock.calls[0][0];
            expect(loggedMessage).toContain('Cache');
            expect(loggedMessage).toContain('user123');
        });
    });

    describe('logger.getUserMessage', () => {
        it('should return user-friendly error message', () => {
            const message = logger.getUserMessage('ERR-ABC123');

            expect(message).toContain('ERR-ABC123');
            expect(message).toContain('errore');
        });

        it('should work with any error ID format', () => {
            const message1 = logger.getUserMessage('ERR-123');
            const message2 = logger.getUserMessage('CUSTOM-ID');

            expect(message1).toBeDefined();
            expect(message2).toBeDefined();
        });
    });

    describe('Sensitive Data Masking', () => {
        it('should mask email addresses', () => {
            logger.warn('Test', 'User email: test@example.com');

            const logged = consoleWarnSpy.mock.calls[0][0];
            expect(logged).not.toContain('test@example.com');
        });

        it('should mask passwords', () => {
            logger.error('Auth', new Error('password: mypassword123'));

            const logged = consoleErrorSpy.mock.calls[0][0];
            expect(logged).not.toContain('mypassword123');
        });

        it('should mask tokens', () => {
            logger.warn('API', 'token: abc123xyz');

            const logged = consoleWarnSpy.mock.calls[0][0];
            expect(logged).not.toContain('abc123xyz');
        });

        it('should mask API keys', () => {
            logger.error('Config', 'api_key: secret_key_12345');

            const logged = consoleErrorSpy.mock.calls[0][0];
            expect(logged).not.toContain('secret_key_12345');
        });
    });

    describe('Log Formatting', () => {
        it('should include timestamp', () => {
            logger.info('Test', 'Message');

            const logged = consoleInfoSpy.mock.calls[0][0];
            // Check for ISO timestamp pattern
            expect(logged).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });

        it('should include service name', () => {
            logger.info('Test', 'Message');

            const logged = consoleInfoSpy.mock.calls[0][0];
            expect(logged).toContain('neofuel');
        });

        it('should include context', () => {
            logger.info('MyContext', 'Message');

            const logged = consoleInfoSpy.mock.calls[0][0];
            expect(logged).toContain('MyContext');
        });
    });
});
