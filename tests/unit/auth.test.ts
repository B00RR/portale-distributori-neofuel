import { describe, it, expect, vi, beforeEach } from 'vitest';

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

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules(); // Restored for test isolation

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
            data: { user: { id: 'test-id', email: 'test@example.com' } },
            error: null
        });
        mockSupabase.from.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'operator', email: 'test@example.com' }, error: null })
        });
    });

    it('should successfully login with valid credentials', async () => {
        const form = document.getElementById('login-form') as HTMLFormElement;
        form.dispatchEvent(new Event('submit'));

        await new Promise(r => setTimeout(r, 50));

        expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalled();
        expect(mockUI.showFullScreenLoader).toHaveBeenCalled();
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
