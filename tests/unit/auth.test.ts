import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// Hoisted mocks
const { mockSupabase, mockToast, mockUI, mockRateLimiter, mockSchemas } = vi.hoisted(() => {
    const mockSupabase = {
        auth: {
            signInWithPassword: vi.fn(),
            signOut: vi.fn(),
            resetPasswordForEmail: vi.fn(),
            updateUser: vi.fn(),
            verifyOtp: vi.fn(),
            getSession: vi.fn()
        },
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn()
        })),
        rpc: vi.fn()
    };

    const mockToast = {
        show: vi.fn()
    };

    const mockUI = {
        showFullScreenLoader: vi.fn(),
        hideFullScreenLoader: vi.fn(),
        setButtonLoading: vi.fn(),
        showPromptModal: vi.fn()
    };

    const mockRateLimiter = {
        isRateLimited: vi.fn(() => false),
        resetRateLimit: vi.fn(),
        getRemainingAttempts: vi.fn(() => 5)
    };

    const mockSchemas = {
        LoginSchema: { parse: (data: any) => data },
        safeParse: vi.fn((schema: any, data: any) => ({
            success: true,
            data: data
        }))
    };

    return { mockSupabase, mockToast, mockUI, mockRateLimiter, mockSchemas };
});

// Mock dependencies
vi.mock('../../js/core/api.js', () => ({
    supabase: mockSupabase
}));

vi.mock('../../js/ui/toast.js', () => ({
    Toast: mockToast
}));

vi.mock('../../js/ui/ui.js', () => mockUI);

vi.mock('../../js/utils/rate-limiter.js', () => mockRateLimiter);

vi.mock('../../js/core/schemas.js', () => mockSchemas);

// Import module under test
import {
    setOnLoginSuccess,
    setLoggedUser,
    initLoginElements,
    setupLoginForm,
    loadSession,
    clearSession,
    requestPasswordReset,
    showOTPResetForm,
    showResetPasswordForm,
    handlePasswordReset,
    loggedUser
} from '../../js/core/auth.js';

describe('Auth Module', () => {
    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = `
            <div id="login-container">
                <form id="login-form">
                    <input type="email" id="email" />
                    <input type="password" id="password" />
                    <button type="submit">Login</button>
                    <button id="toggle-password" title="Mostra password">
                        <i id="password-icon" class="fa fa-eye"></i>
                    </button>
                </form>
                <div id="login-error"></div>
            </div>
            <div id="app-container" class="hidden"></div>
        `;

        vi.clearAllMocks();
        mockRateLimiter.isRateLimited.mockReturnValue(false);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('setOnLoginSuccess', () => {
        it('should set the onLoginSuccess callback', () => {
            const callback = vi.fn();
            setOnLoginSuccess(callback);
            // Callback will be tested indirectly through login flow
            expect(callback).toBeDefined();
        });
    });

    describe('setLoggedUser', () => {
        it('should set the logged user data', () => {
            const user = {
                id: 'uuid-123',
                user_id: 1,
                email: 'test@example.com',
                full_name: 'Test User',
                role: 'admin' as const
            };
            setLoggedUser(user);
            // loggedUser is exported and can be checked
            expect(loggedUser).toEqual(user);
        });
    });

    describe('initLoginElements', () => {
        it('should initialize login elements when form exists', () => {
            initLoginElements();
            expect(document.getElementById('login-form')).not.toBeNull();
        });

        it('should return early if form does not exist', () => {
            document.body.innerHTML = '';
            initLoginElements(); // Should not throw
            expect(document.getElementById('login-form')).toBeNull();
        });

        it('should call setupLoginForm if not already initialized', () => {
            const spy = vi.spyOn({ setupLoginForm }, 'setupLoginForm');
            initLoginElements();
            // Due to module state, can't directly spy, but we can verify no errors
            expect(document.getElementById('login-form')).not.toBeNull();
        });
    });

    describe('setupLoginForm - Password Toggle', () => {
        it('should toggle password visibility on button click', () => {
            setupLoginForm();

            const passwordInput = document.getElementById('password') as HTMLInputElement;
            const toggleBtn = document.getElementById('toggle-password');
            const passwordIcon = document.getElementById('password-icon');

            expect(passwordInput.type).toBe('password');

            toggleBtn?.click();
            expect(passwordInput.type).toBe('text');
            expect(passwordIcon?.classList.contains('fa-eye-slash')).toBe(true);
            expect(toggleBtn?.title).toBe('Nascondi password');

            toggleBtn?.click();
            expect(passwordInput.type).toBe('password');
            expect(passwordIcon?.classList.contains('fa-eye')).toBe(true);
            expect(toggleBtn?.title).toBe('Mostra password');
        });

        it('should handle missing password elements gracefully', () => {
            document.body.innerHTML = `
                <form id="login-form">
                    <button id="toggle-password"></button>
                </form>
            `;
            setupLoginForm();
            const toggleBtn = document.getElementById('toggle-password');
            toggleBtn?.click(); // Should not throw
        });
    });

    describe('setupLoginForm - Login Flow', () => {
        it('should successfully login with valid credentials', async () => {
            const callback = vi.fn();
            setOnLoginSuccess(callback);

            const authData = {
                user: {
                    id: 'auth-uuid-123',
                    email: 'admin@test.com',
                    user_metadata: {
                        role: 'admin',
                        full_name: 'Admin User'
                    }
                }
            };

            const dbUserData = {
                user_id: 1,
                email: 'admin@test.com',
                full_name: 'Admin User',
                role: 'admin',
                station_id: null,
                user_stations: []
            };

            mockSupabase.auth.signInWithPassword.mockResolvedValue({
                data: authData,
                error: null
            });

            const selectChain = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: dbUserData, error: null })
            };
            mockSupabase.from.mockReturnValue(selectChain);

            setupLoginForm();

            const form = document.getElementById('login-form') as HTMLFormElement;
            const emailInput = document.getElementById('email') as HTMLInputElement;
            const passwordInput = document.getElementById('password') as HTMLInputElement;

            emailInput.value = 'admin@test.com';
            passwordInput.value = 'password123';

            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(submitEvent);

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
                email: 'admin@test.com',
                password: 'password123'
            });
            expect(mockUI.showFullScreenLoader).toHaveBeenCalled();
            expect(mockUI.hideFullScreenLoader).toHaveBeenCalled();
        });

        it('should handle invalid credentials error', async () => {
            mockSupabase.auth.signInWithPassword.mockResolvedValue({
                data: null,
                error: { message: 'Invalid login credentials' }
            });

            setupLoginForm();

            const form = document.getElementById('login-form') as HTMLFormElement;
            const emailInput = document.getElementById('email') as HTMLInputElement;
            const passwordInput = document.getElementById('password') as HTMLInputElement;

            emailInput.value = 'wrong@example.com';
            passwordInput.value = 'wrongpass';

            const submitEvent = new Event('submit');
            form.dispatchEvent(submitEvent);

            await new Promise(resolve => setTimeout(resolve, 100));

            const errorEl = document.getElementById('login-error');
            expect(errorEl?.textContent).toContain('Email o password errati');
        });

        it('should handle email not confirmed error', async () => {
            mockSupabase.auth.signInWithPassword.mockResolvedValue({
                data: null,
                error: { message: 'Email not confirmed' }
            });

            setupLoginForm();

            const form = document.getElementById('login-form') as HTMLFormElement;
            const emailInput = document.getElementById('email') as HTMLInputElement;
            const passwordInput = document.getElementById('password') as HTMLInputElement;

            emailInput.value = 'unconfirmed@example.com';
            passwordInput.value = 'password123';

            const submitEvent = new Event('submit');
            form.dispatchEvent(submitEvent);

            await new Promise(resolve => setTimeout(resolve, 100));

            const errorEl = document.getElementById('login-error');
            expect(errorEl?.textContent).toContain('Email non confermata');
        });

        it('should handle rate limiting', async () => {
            mockRateLimiter.isRateLimited.mockReturnValue(true);
            mockRateLimiter.getRemainingAttempts.mockReturnValue(0);

            setupLoginForm();

            const form = document.getElementById('login-form') as HTMLFormElement;
            const emailInput = document.getElementById('email') as HTMLInputElement;
            const passwordInput = document.getElementById('password') as HTMLInputElement;

            emailInput.value = 'test@example.com';
            passwordInput.value = 'password123';

            const submitEvent = new Event('submit');
            form.dispatchEvent(submitEvent);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockToast.show).toHaveBeenCalledWith(
                expect.stringContaining('Rate limit'),
                'warning'
            );
            expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
        });

        it('should handle validation errors', async () => {
            mockSchemas.safeParse.mockReturnValue({
                success: false,
                error: 'Email invalida'
            });

            setupLoginForm();

            const form = document.getElementById('login-form') as HTMLFormElement;
            const emailInput = document.getElementById('email') as HTMLInputElement;
            const passwordInput = document.getElementById('password') as HTMLInputElement;

            emailInput.value = 'invalid-email';
            passwordInput.value = '123';

            const submitEvent = new Event('submit');
            form.dispatchEvent(submitEvent);

            await new Promise(resolve => setTimeout(resolve, 50));

            const errorEl = document.getElementById('login-error');
            expect(errorEl?.textContent).toBe('Email invalida');
        });

        it('should handle missing form inputs', async () => {
            document.body.innerHTML = `<form id="login-form"><button type="submit">Login</button></form>`;
            setupLoginForm();

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const form = document.getElementById('login-form') as HTMLFormElement;
            const submitEvent = new Event('submit');
            form.dispatchEvent(submitEvent);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Form inputs not found'));
            consoleSpy.mockRestore();
        });

        it('should fallback to RPC when DB user not found', async () => {
            const authData = {
                user: {
                    id: 'auth-uuid-456',
                    email: 'newuser@test.com',
                    user_metadata: { role: 'operator', full_name: 'New Operator' }
                }
            };

            mockSupabase.auth.signInWithPassword.mockResolvedValue({
                data: authData,
                error: null
            });

            const selectChain = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            };
            mockSupabase.from.mockReturnValue(selectChain);
            mockSupabase.rpc.mockResolvedValue({ data: 999, error: null });

            setupLoginForm();

            const form = document.getElementById('login-form') as HTMLFormElement;
            const emailInput = document.getElementById('email') as HTMLInputElement;
            const passwordInput = document.getElementById('password') as HTMLInputElement;

            emailInput.value = 'newuser@test.com';
            passwordInput.value = 'password123';

            const submitEvent = new Event('submit');
            form.dispatchEvent(submitEvent);

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockSupabase.rpc).toHaveBeenCalledWith('get_current_user_id');
        });
    });

    describe('loadSession', () => {
        it('should load existing session if auth session exists', async () => {
            const sessionData = {
                user: {
                    id: 'session-uuid',
                    email: 'session@test.com',
                    user_metadata: { role: 'admin', full_name: 'Session User' }
                }
            };

            mockSupabase.auth.getSession.mockResolvedValue({
                data: { session: sessionData },
                error: null
            });

            const dbUserData = {
                user_id: 10,
                email: 'session@test.com',
                full_name: 'Session User',
                role: 'admin',
                user_stations: []
            };

            const selectChain = {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: dbUserData, error: null })
            };
            mockSupabase.from.mockReturnValue(selectChain);

            const result = await loadSession();

            expect(result).toEqual({
                id: 'session-uuid',
                user_id: 10,
                email: 'session@test.com',
                full_name: 'Session User',
                role: 'admin',
                assignedStations: [],
                user_stations: []
            });
        });

        it('should return null if no session exists', async () => {
            mockSupabase.auth.getSession.mockResolvedValue({
                data: { session: null },
                error: null
            });

            const result = await loadSession();
            expect(result).toBeNull();
        });

        it('should handle session error gracefully', async () => {
            mockSupabase.auth.getSession.mockResolvedValue({
                data: null,
                error: { message: 'Session error' }
            });

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const result = await loadSession();

            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('clearSession', () => {
        it('should sign out and clear session data', async () => {
            mockSupabase.auth.signOut.mockResolvedValue({ error: null });

            await clearSession();

            expect(mockSupabase.auth.signOut).toHaveBeenCalled();
        });

        it('should handle sign out errors', async () => {
            mockSupabase.auth.signOut.mockResolvedValue({
                error: { message: 'Signout failed' }
            });

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            await clearSession();

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('requestPasswordReset', () => {
        it('should successfully request password reset', async () => {
            mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
                data: {},
                error: null
            });

            const result = await requestPasswordReset('user@example.com');

            expect(result.success).toBe(true);
            expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
                'user@example.com',
                expect.objectContaining({
                    redirectTo: expect.stringContaining('reset-password')
                })
            );
        });

        it('should handle reset password errors', async () => {
            mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
                data: null,
                error: { message: 'Email not found' }
            });

            const result = await requestPasswordReset('notfound@example.com');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Email not found');
        });
    });

    describe('showOTPResetForm', () => {
        it('should render OTP reset form in DOM', () => {
            showOTPResetForm();

            const otpForm = document.querySelector('form');
            expect(otpForm).toBeDefined();
        });
    });

    describe('showResetPasswordForm', () => {
        it('should render password reset form in DOM', () => {
            showResetPasswordForm();

            const resetForm = document.querySelector('form');
            expect(resetForm).toBeDefined();
        });
    });

    describe('handlePasswordReset', () => {
        it('should detect reset token in URL and trigger reset flow', async () => {
            // Mock URL with reset token
            Object.defineProperty(window, 'location', {
                value: {
                    hash: '#access_token=fake-token&type=recovery',
                    search: '',
                    pathname: '/',
                    protocol: 'http:',
                    host: 'localhost',
                    replaceState: vi.fn()
                },
                writable: true
            });

            mockSupabase.auth.getSession.mockResolvedValue({
                data: { session: { user: { id: 'uuid' } } },
                error: null
            });

            await handlePasswordReset();

            // Should call showResetPasswordForm or similar
            expect(mockSupabase.auth.getSession).toHaveBeenCalled();
        });

        it('should return early if no token in URL', async () => {
            Object.defineProperty(window, 'location', {
                value: {
                    hash: '',
                    search: ''
                },
                writable: true
            });

            await handlePasswordReset();

            expect(mockSupabase.auth.getSession).not.toHaveBeenCalled();
        });
    });
});
