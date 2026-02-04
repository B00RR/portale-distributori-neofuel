import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../../js/core/api.js';
import { showFullScreenLoader } from '../../js/ui/ui.js';

// Fully mocked API via module mock
// Use vi.hoisted to ensure clean mocks
const { mockAuth } = vi.hoisted(() => ({
    mockAuth: {
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn(),
        getSession: vi.fn()
    }
}));

vi.mock('../../js/core/api.js', () => ({
    supabase: {
        auth: mockAuth,
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'operator' }, error: null })
        })),
        rpc: vi.fn().mockResolvedValue({ data: null, error: null })
    }
}));

vi.mock('../../js/ui/toast.js', () => ({ Toast: { show: vi.fn() } }));
vi.mock('../../js/ui/ui.js', () => ({
    showFullScreenLoader: vi.fn(),
    hideFullScreenLoader: vi.fn(),
    setButtonLoading: vi.fn(),
    showPromptModal: vi.fn()
}));
vi.mock('../../js/utils/rate-limiter.js', () => ({
    isRateLimited: vi.fn(() => false),
    resetRateLimit: vi.fn(),
    getRemainingAttempts: vi.fn(() => 5)
}));
vi.mock('../../js/core/schemas.js', () => ({
    LoginSchema: {},
    safeParse: vi.fn((schema, data) => ({ success: true, data }))
}));

import { setupLoginForm, initLoginElements } from '../../js/core/auth.js';

describe('Auth Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Ensure mock returns promise
        mockAuth.signInWithPassword.mockResolvedValue({
            data: { user: { id: 'test', email: 'test@example.com' } },
            error: null
        });

        document.body.innerHTML = `
            <div id="login-container">
                <form id="login-form">
                    <input id="email" value="test@example.com" />
                    <input id="password" value="pass" />
                    <button type="submit">Login</button>
                    <div id="login-error"></div>
                </form>
            </div>
            <div id="app-container"></div>
        `;

        // Mock window location
        Object.defineProperty(window, 'location', {
            value: {
                protocol: 'http:',
                host: 'localhost',
                pathname: '/',
                reload: vi.fn(),
                replace: vi.fn()
            },
            writable: true
        });
        window.history.replaceState = vi.fn();

        initLoginElements();
    });

    it('should successfully login with valid credentials', async () => {
        const form = document.getElementById('login-form') as HTMLFormElement;
        form.dispatchEvent(new Event('submit'));

        await new Promise(r => setTimeout(r, 0));

        expect(mockAuth.signInWithPassword).toHaveBeenCalled();
        expect(showFullScreenLoader).toHaveBeenCalled();
    });
});
