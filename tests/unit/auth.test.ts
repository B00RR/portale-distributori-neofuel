/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Hoist mock interactions
const { mockSupabase, mockUI, mockToast, mockUtils, mockSchemas, mockRateLimiter } = vi.hoisted(() => {
    const createQueryBuilder = (returnData: any = { data: null, error: null }) => {
        const builder: any = {};
        builder.select = vi.fn().mockReturnValue(builder);
        builder.eq = vi.fn().mockReturnValue(builder);
        builder.maybeSingle = vi.fn().mockResolvedValue(returnData);
        builder.single = vi.fn().mockResolvedValue(returnData);
        return builder;
    };

    return {
        mockSupabase: {
            auth: {
                signInWithPassword: vi.fn(),
                signOut: vi.fn(),
                resetPasswordForEmail: vi.fn(),
                updateUser: vi.fn(),
                verifyOtp: vi.fn(),
                getSession: vi.fn()
            },
            from: vi.fn(() => createQueryBuilder()),
            rpc: vi.fn().mockResolvedValue({ data: null, error: null })
        },
        mockUI: {
            showFullScreenLoader: vi.fn(),
            hideFullScreenLoader: vi.fn(),
            setButtonLoading: vi.fn(),
            showPromptModal: vi.fn()
        },
        mockToast: { show: vi.fn() },
        mockUtils: {
            isRateLimited: vi.fn().mockReturnValue(false),
            resetRateLimit: vi.fn(),
            getRemainingAttempts: vi.fn().mockReturnValue(5)
        },
        mockSchemas: {
            LoginSchema: {},
            safeParse: vi.fn((schema, data) => ({ success: true, data }))
        },
        mockRateLimiter: {
            isRateLimited: vi.fn(() => false), // Default return
            resetRateLimit: vi.fn(),
            getRemainingAttempts: vi.fn(() => 5)
        }
    };
});

// 2. Mock modules
vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/utils/rate-limiter.js', () => mockRateLimiter);
vi.mock('../../js/core/schemas.js', () => mockSchemas);

describe('Auth Module', () => {
    let authModule: any;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules(); // Restored for test isolation
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Setup DOM
        document.body.innerHTML = `
            <div id="login-container">
                <form id="login-form">
                    <input id="email" value="test@example.com" />
                    <input id="password" value="password123" />
                    <button type="submit">Accedi</button>
                    <div id="login-error"></div>
                </form>
                <button id="toggle-password"></button>
                <i id="password-icon" class="fas fa-eye"></i>
            </div>
            <div id="app-container" style="display: none;"></div>
        `;

        // Mock Window Location methods using Spies (Safe)
        // Avoid redefining the whole window.location object which causes Teardown errors.
        if (window.location.reload) {
            vi.spyOn(window.location, 'reload').mockImplementation(() => { });
        }
        if (window.location.replace) {
            vi.spyOn(window.location, 'replace').mockImplementation(() => { });
        }
        // Fallback or explicit set if needed (optional)

        // Dynamic import to get fresh module instance

        // Dynamic import to get fresh module instance
        authModule = await import('../../js/core/auth.js');
        authModule.initLoginElements();

        // Setup default mock returns
        mockSupabase.auth.signInWithPassword.mockResolvedValue({
            data: {
                user: {
                    id: 'test-id',
                    email: 'test@example.com',
                    user_metadata: {}
                }
            },
            error: null
        });
        mockSupabase.auth.signOut.mockResolvedValue({ error: null });
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: {
                    user_id: 7,
                    role: 'operator',
                    email: 'test@example.com',
                    full_name: 'Test Operator'
                },
                error: null
            })
        });
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('should successfully login with valid credentials', async () => {
        const form = document.getElementById('login-form') as HTMLFormElement;
        form.dispatchEvent(new Event('submit'));

        await new Promise(r => setTimeout(r, 50));

        expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalled();
        expect(mockUI.showFullScreenLoader).toHaveBeenCalled();
    });

    it('does not call Supabase auth when required fields are empty (#62)', async () => {
        const emailInput = document.getElementById('email') as HTMLInputElement;
        const passwordInput = document.getElementById('password') as HTMLInputElement;
        emailInput.type = 'email';
        emailInput.required = true;
        emailInput.value = '';
        passwordInput.required = true;
        passwordInput.value = '';

        const form = document.getElementById('login-form') as HTMLFormElement;
        form.dispatchEvent(new Event('submit'));

        await new Promise(r => setTimeout(r, 50));

        // checkValidity() guard must short-circuit before any network call.
        expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    it('keeps the login password toggle aria-label synchronized with the visible state (#108)', () => {
        const toggleButton = document.getElementById('toggle-password') as HTMLButtonElement;
        const passwordInput = document.getElementById('password') as HTMLInputElement;

        passwordInput.type = 'password';
        toggleButton.setAttribute('aria-label', 'Mostra password');

        toggleButton.click();
        expect(passwordInput.type).toBe('text');
        expect(toggleButton.title).toBe('Nascondi password');
        expect(toggleButton.getAttribute('aria-label')).toBe('Nascondi password');

        toggleButton.click();
        expect(passwordInput.type).toBe('password');
        expect(toggleButton.title).toBe('Mostra password');
        expect(toggleButton.getAttribute('aria-label')).toBe('Mostra password');
    });

    it('renders reset-password toggle buttons with accessible labels (#108)', () => {
        authModule.showResetPasswordForm();

        const newPasswordToggle = document.getElementById('toggle-new-password') as HTMLButtonElement;
        const confirmPasswordToggle = document.getElementById('toggle-confirm-password') as HTMLButtonElement;

        expect(newPasswordToggle.getAttribute('aria-label')).toBe('Mostra password');
        expect(confirmPasswordToggle.getAttribute('aria-label')).toBe('Mostra password');
    });

    it('should handle invalid credentials', async () => {
        mockSupabase.auth.signInWithPassword.mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid login credentials' }
        });

        const form = document.getElementById('login-form') as HTMLFormElement;
        form.dispatchEvent(new Event('submit'));

        await new Promise(r => setTimeout(r, 50)); // Allow microtasks to drain

        const errorDiv = document.getElementById('login-error');
        expect(errorDiv?.textContent).toContain('Email o password errati');
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects login when the trusted DB profile is missing despite admin user metadata', async () => {
        const onLoginSuccess = vi.fn();
        authModule.setOnLoginSuccess(onLoginSuccess);
        mockSupabase.auth.signInWithPassword.mockResolvedValue({
            data: {
                user: {
                    id: 'test-id',
                    email: 'test@example.com',
                    user_metadata: { role: 'admin' }
                }
            },
            error: null
        });
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        });
        mockSupabase.rpc.mockResolvedValue({ data: 7, error: null });

        const form = document.getElementById('login-form') as HTMLFormElement;
        form.dispatchEvent(new Event('submit'));

        await new Promise(r => setTimeout(r, 50));

        expect(authModule.loggedUser).toBeNull();
        expect(onLoginSuccess).not.toHaveBeenCalled();
        expect(mockSupabase.auth.signOut).toHaveBeenCalledOnce();
        expect(mockSupabase.rpc).not.toHaveBeenCalled();
        expect(document.getElementById('app-container')?.style.display).toBe('none');
        expect(document.getElementById('login-error')?.textContent).toContain(
            'Profilo utente non disponibile'
        );
    });

    it('uses the trusted DB role instead of admin user metadata', async () => {
        const onLoginSuccess = vi.fn();
        authModule.setOnLoginSuccess(onLoginSuccess);
        mockSupabase.auth.signInWithPassword.mockResolvedValue({
            data: {
                user: {
                    id: 'test-id',
                    email: 'test@example.com',
                    user_metadata: { role: 'admin' }
                }
            },
            error: null
        });

        const form = document.getElementById('login-form') as HTMLFormElement;
        form.dispatchEvent(new Event('submit'));

        await new Promise(r => setTimeout(r, 50));

        expect(authModule.loggedUser?.role).toBe('operator');
        expect(onLoginSuccess).toHaveBeenCalledWith(
            expect.objectContaining({ role: 'operator' })
        );
        expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
    });

    it('rejects login when the trusted DB role is invalid', async () => {
        const onLoginSuccess = vi.fn();
        authModule.setOnLoginSuccess(onLoginSuccess);
        mockSupabase.auth.signInWithPassword.mockResolvedValue({
            data: {
                user: {
                    id: 'test-id',
                    email: 'test@example.com',
                    user_metadata: { role: 'admin' }
                }
            },
            error: null
        });
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
                data: {
                    user_id: 7,
                    role: 'owner',
                    email: 'test@example.com',
                    full_name: 'Invalid Role'
                },
                error: null
            })
        });

        const form = document.getElementById('login-form') as HTMLFormElement;
        form.dispatchEvent(new Event('submit'));

        await new Promise(r => setTimeout(r, 50));

        expect(authModule.loggedUser).toBeNull();
        expect(onLoginSuccess).not.toHaveBeenCalled();
        expect(mockSupabase.auth.signOut).toHaveBeenCalledOnce();
        expect(document.getElementById('login-error')?.textContent).toContain(
            'Ruolo utente non valido'
        );
    });

    it('fails closed when restoring a session without a trusted DB profile', async () => {
        mockSupabase.auth.getSession.mockResolvedValue({
            data: {
                session: {
                    user: {
                        id: 'test-id',
                        email: 'test@example.com',
                        user_metadata: { role: 'admin' }
                    }
                }
            },
            error: null
        });
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        });
        mockSupabase.rpc.mockResolvedValue({ data: 7, error: null });

        await expect(authModule.loadSession()).resolves.toBeNull();

        expect(mockSupabase.auth.signOut).toHaveBeenCalledOnce();
        expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('should handle rate limiting', async () => {
        mockRateLimiter.isRateLimited.mockReturnValue(true);

        const form = document.getElementById('login-form') as HTMLFormElement;
        form.dispatchEvent(new Event('submit'));

        await new Promise(r => setTimeout(r, 50)); // Allow microtasks to drain

        expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
        expect(mockToast.show).toHaveBeenCalledWith(expect.stringContaining('Rate limit'), 'warning');
    });
});
