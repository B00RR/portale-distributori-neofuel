/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Hoist mock interactions
const { mockSupabase, mockUI, mockToast, mockUtils, mockSchemas, mockRateLimiter } = vi.hoisted(
  () => {
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
  }
);

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
    document.body.className = '';
    document.body.innerHTML = `
            <div id="login-container">
                <form id="login-form">
                    <input id="username" value="testuser" />
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
      vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    }
    if (window.location.replace) {
      vi.spyOn(window.location, 'replace').mockImplementation(() => {});
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
          email: 'testuser@neofuel.local',
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
          email: 'testuser@neofuel.local',
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

  it('authenticates with the deterministic alias before loading the trusted profile', async () => {
    const events: string[] = [];
    const profileQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          user_id: 7,
          role: 'operator',
          email: 'testuser@neofuel.local',
          full_name: 'Test Operator'
        },
        error: null
      })
    };
    mockSupabase.auth.signInWithPassword.mockImplementation(async () => {
      events.push('auth');
      return {
        data: {
          user: {
            id: 'test-id',
            email: 'testuser@neofuel.local',
            user_metadata: {}
          }
        },
        error: null
      };
    });
    mockSupabase.from.mockImplementation(() => {
      events.push('profile');
      return profileQuery;
    });

    const form = document.getElementById('login-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => expect(mockRateLimiter.resetRateLimit).toHaveBeenCalled());

    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'testuser@neofuel.local',
      password: 'password123'
    });
    expect(events).toEqual(['auth', 'profile']);
    expect(profileQuery.eq).toHaveBeenCalledWith('created_by_auth', 'test-id');
    expect(mockUI.showFullScreenLoader).toHaveBeenCalled();
    expect(mockRateLimiter.resetRateLimit).toHaveBeenCalledWith('login:testuser');
  });

  it('does not load a profile while authentication is still pending', async () => {
    let resolveAuth:
      | ((value: {
          data: {
            user: { id: string; email: string; user_metadata: Record<string, never> };
          };
          error: null;
        }) => void)
      | undefined;
    mockSupabase.auth.signInWithPassword.mockReturnValue(
      new Promise(resolve => {
        resolveAuth = resolve;
      })
    );

    const form = document.getElementById('login-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    await Promise.resolve();

    expect(mockSupabase.from).not.toHaveBeenCalled();

    resolveAuth?.({
      data: {
        user: {
          id: 'test-id',
          email: 'testuser@neofuel.local',
          user_metadata: {}
        }
      },
      error: null
    });

    await vi.waitFor(() => expect(mockSupabase.from).toHaveBeenCalledWith('users'));
  });

  it('does not call Supabase auth when required fields are empty (#62)', async () => {
    const usernameInput = document.getElementById('username') as HTMLInputElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    usernameInput.required = true;
    usernameInput.value = '';
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
    const confirmPasswordToggle = document.getElementById(
      'toggle-confirm-password'
    ) as HTMLButtonElement;

    expect(newPasswordToggle.getAttribute('aria-label')).toBe('Mostra password');
    expect(confirmPasswordToggle.getAttribute('aria-label')).toBe('Mostra password');
  });

  it.each([
    ['unknown username', 'User not found'],
    ['wrong password', 'Invalid login credentials']
  ])('uses an indistinguishable message for %s', async (_case, authMessage) => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: authMessage }
    });

    const form = document.getElementById('login-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));

    await new Promise(r => setTimeout(r, 50)); // Allow microtasks to drain

    const errorDiv = document.getElementById('login-error');
    expect(errorDiv?.textContent).toBe('Username o password errati.');
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('does not fall back to the database when Supabase Auth throws', async () => {
    mockSupabase.auth.signInWithPassword.mockRejectedValue(new Error('Auth service unavailable'));

    const form = document.getElementById('login-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      expect(document.getElementById('login-error')?.textContent).toBe(
        'Username o password errati.'
      );
    });

    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('rejects login when the trusted DB profile is missing despite admin user metadata', async () => {
    const onLoginSuccess = vi.fn();
    authModule.setOnLoginSuccess(onLoginSuccess);
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: 'test-id',
          email: 'testuser@neofuel.local',
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

    const form = document.getElementById('login-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));

    await new Promise(r => setTimeout(r, 50));

    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledOnce();
    expect(mockSupabase.from).toHaveBeenCalledWith('users');
    expect(authModule.loggedUser).toBeNull();
    expect(onLoginSuccess).not.toHaveBeenCalled();
    expect(mockSupabase.auth.signOut).toHaveBeenCalledOnce();
    expect(document.getElementById('login-error')?.textContent).toContain(
      'Profilo utente non disponibile'
    );
  });

  it('signs out fail-closed when the trusted profile query throws after authentication', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockRejectedValue(new Error('profile transport failed'))
    });

    const form = document.getElementById('login-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => expect(mockSupabase.auth.signOut).toHaveBeenCalledOnce());

    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledOnce();
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    expect(authModule.loggedUser).toBeNull();
    expect(document.getElementById('login-error')?.textContent).toBe('Username o password errati.');
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
    expect(onLoginSuccess).toHaveBeenCalledWith(expect.objectContaining({ role: 'operator' }));
    expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('accepts a trusted full_admin profile and applies the backoffice layout', async () => {
    const onLoginSuccess = vi.fn();
    authModule.setOnLoginSuccess(onLoginSuccess);
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          user_id: 7,
          role: 'full_admin',
          email: 'test@example.com',
          full_name: 'Full Admin'
        },
        error: null
      })
    });

    const form = document.getElementById('login-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledWith(expect.objectContaining({ role: 'full_admin' }));
    });

    expect(authModule.loggedUser?.role).toBe('full_admin');
    expect(document.body.classList.contains('admin-layout')).toBe(true);
    expect(document.body.classList.contains('desktop-layout')).toBe(true);
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
