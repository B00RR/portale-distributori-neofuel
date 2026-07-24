/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Hoist mock interactions
const {
  mockSupabase,
  mockUI,
  mockToast,
  _mockUtils,
  mockSchemas,
  mockRateLimiter,
  realtimeChannels
} = vi.hoisted(() => {
  const realtimeChannels = new Map<string, Record<string, unknown>>();

  const createQueryBuilder = (returnData: unknown = { data: null, error: null }) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn().mockReturnValue(builder);
    builder.eq = vi.fn().mockReturnValue(builder);
    builder.maybeSingle = vi.fn().mockResolvedValue(returnData);
    builder.single = vi.fn().mockResolvedValue(returnData);
    return builder;
  };

  return {
    realtimeChannels,
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
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      channel: vi.fn((name: string) => {
        const ch: Record<string, unknown> = { name };
        ch.on = vi.fn((_event: string, _opts: unknown, callback: (payload: unknown) => void) => {
          ch.onCallback = callback;
          return ch;
        });
        ch.subscribe = vi.fn().mockReturnValue(ch);
        realtimeChannels.set(name, ch);
        return ch;
      }),
      removeChannel: vi.fn().mockResolvedValue(undefined)
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
const mockQuarantineUserActions = vi.fn().mockResolvedValue(1);

const mockSetOfflineQueueUserAliases = vi.fn();

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => mockUI);
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/utils/rate-limiter.js', () => mockRateLimiter);
vi.mock('../../js/core/schemas.js', () => mockSchemas);
vi.mock('../../js/core/offline-queue.js', () => ({
  quarantineUserActions: mockQuarantineUserActions,
  setOfflineQueueUserAliases: mockSetOfflineQueueUserAliases
}));

describe('Auth Module', () => {
  let authModule: typeof import('../../js/core/auth.js');
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules(); // Restored for test isolation
    realtimeChannels.clear();
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
    mockRateLimiter.isRateLimited.mockReturnValue(false);
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

  describe('Issue #307: Authoritative is_active enforcement and Realtime monitoring', () => {
    it('rejects login when is_active is false and quarantines offline actions using UUID and numeric profile ID', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: {
            id: 'test-id-inactive',
            email: 'inactive@neofuel.local',
            user_metadata: {}
          }
        },
        error: null
      });
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            user_id: 10,
            role: 'operator',
            email: 'inactive@neofuel.local',
            full_name: 'Inactive User',
            is_active: false
          },
          error: null
        })
      });

      const form = document.getElementById('login-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit'));

      await vi.waitFor(() => {
        expect(document.getElementById('login-error')?.textContent).toBe(
          'Account disattivato. Contatta un amministratore.'
        );
      });

      expect(mockQuarantineUserActions).toHaveBeenCalledWith(['test-id-inactive', '10']);
      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
      expect(authModule.loggedUser).toBeNull();
    });

    it('setLoggedUser sets active user aliases and clearSession clears aliases even if signOut throws', async () => {
      authModule.setLoggedUser({
        id: 'uuid-123',
        user_id: 456,
        email: 'user@neofuel.local',
        full_name: 'User 123',
        role: 'operator'
      });

      expect(mockSetOfflineQueueUserAliases).toHaveBeenCalledWith(['uuid-123', '456']);

      mockSupabase.auth.signOut.mockRejectedValueOnce(new Error('signOut network error'));

      await authModule.clearSession();

      expect(mockSetOfflineQueueUserAliases).toHaveBeenLastCalledWith(null);
    });

    it('allows login when is_active is null (legacy) or true', async () => {
      // Test legacy null
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: {
            id: 'test-id-null',
            email: 'nullactive@neofuel.local',
            user_metadata: {}
          }
        },
        error: null
      });
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            user_id: 11,
            role: 'operator',
            email: 'nullactive@neofuel.local',
            full_name: 'Legacy Null User',
            is_active: null
          },
          error: null
        })
      });

      const form = document.getElementById('login-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit'));

      await vi.waitFor(() => expect(authModule.loggedUser).not.toBeNull());

      expect(authModule.loggedUser?.user_id).toBe(11);
      expect(mockQuarantineUserActions).not.toHaveBeenCalledWith('test-id-null');
    });

    it('rejects loadSession when is_active is false and quarantines offline actions', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'test-id-inactive-session',
              email: 'inactive-session@neofuel.local'
            }
          }
        },
        error: null
      });
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            user_id: 12,
            role: 'operator',
            email: 'inactive-session@neofuel.local',
            full_name: 'Inactive Session User',
            is_active: false
          },
          error: null
        })
      });

      const session = await authModule.loadSession();

      expect(session).toBeNull();
      expect(mockQuarantineUserActions).toHaveBeenCalledWith(['test-id-inactive-session', '12']);
      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith(
        'Account disattivato. Contatta un amministratore.',
        'error',
        7000
      );
    });

    it('subscribes to Realtime user status on users table for active user', () => {
      authModule.setupUserStatusMonitoring('test-user-uuid');

      expect(mockSupabase.channel).toHaveBeenCalledWith('user_status_test-user-uuid');
      const channelMock = mockSupabase.channel.mock.results[0].value;
      expect(channelMock.on).toHaveBeenCalledWith(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: 'created_by_auth=eq.test-user-uuid'
        },
        expect.any(Function)
      );
    });

    it('triggers handleUserDeactivation when Realtime receives is_active=false payload', async () => {
      let onCallback: ((payload: unknown) => void) | null = null;
      const channelMock: Record<string, unknown> = {};
      channelMock.on = vi.fn(
        (_event: string, _opts: unknown, callback: (payload: unknown) => void) => {
          onCallback = callback;
          return channelMock;
        }
      );
      channelMock.subscribe = vi.fn().mockReturnValue(channelMock);
      mockSupabase.channel.mockReturnValue(channelMock);

      authModule.setLoggedUser({
        id: 'test-user-uuid',
        user_id: 1,
        email: 'test@example.com',
        full_name: 'Test',
        role: 'operator'
      });
      authModule.setupUserStatusMonitoring('test-user-uuid');
      expect(onCallback).not.toBeNull();

      // Trigger realtime payload with is_active = false
      onCallback?.({ new: { is_active: false } });

      await vi.waitFor(() => {
        expect(mockQuarantineUserActions).toHaveBeenCalledWith(['test-user-uuid', '1']);
        expect(mockSupabase.auth.signOut).toHaveBeenCalled();
        expect(mockToast.show).toHaveBeenCalledWith(
          'Account disattivato. Contatta un amministratore.',
          'error',
          7000
        );
      });
    });

    it('cleanupUserStatusMonitoring removes channel and clears timer without error', () => {
      authModule.setupUserStatusMonitoring('test-user-uuid');
      expect(() => authModule.cleanupUserStatusMonitoring()).not.toThrow();
      expect(mockSupabase.removeChannel).toHaveBeenCalled();
    });

    it('clearSession clears storage and sets loggedUser to null even if signOut throws exception', async () => {
      authModule.setLoggedUser({
        id: 'test-user',
        user_id: 1,
        email: 'test@example.com',
        full_name: 'Test',
        role: 'operator'
      });
      localStorage.setItem('sb-test-token', 'abc');
      sessionStorage.setItem('sb-test-session', 'def');

      mockSupabase.auth.signOut.mockRejectedValueOnce(new Error('Network error on signOut'));

      authModule.setupUserStatusMonitoring('test-user');

      await authModule.clearSession();

      expect(authModule.loggedUser).toBeNull();
      expect(localStorage.getItem('sb-test-token')).toBeNull();
      expect(sessionStorage.getItem('sb-test-session')).toBeNull();
      expect(mockSupabase.removeChannel).toHaveBeenCalled();
    });

    it('handleUserDeactivation captures both Auth UUID and loggedUser.user_id aliases before clearSession', async () => {
      authModule.setLoggedUser({
        id: 'auth-uuid-999',
        user_id: 888,
        email: 'op@example.com',
        full_name: 'Op Test',
        role: 'operator'
      });

      await authModule.handleUserDeactivation('auth-uuid-999');

      expect(mockQuarantineUserActions).toHaveBeenCalledWith(['auth-uuid-999', '888']);
      expect(authModule.loggedUser).toBeNull();
    });

    it('handleUserDeactivation performs local session cleanup even if quarantine or signOut throws', async () => {
      authModule.setLoggedUser({
        id: 'auth-uuid-999',
        user_id: 888,
        email: 'op@example.com',
        full_name: 'Op Test',
        role: 'operator'
      });

      mockQuarantineUserActions.mockRejectedValueOnce(new Error('IndexedDB quarantine failed'));
      mockSupabase.auth.signOut.mockRejectedValueOnce(new Error('Network error on signOut'));

      await authModule.handleUserDeactivation('auth-uuid-999');

      expect(authModule.loggedUser).toBeNull();
      expect(document.getElementById('login-container')?.classList.contains('hidden')).toBe(false);
    });

    describe('checkUserActiveStatus fail-closed behavior and edge cases', () => {
      it('returns true when is_active is true', async () => {
        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { is_active: true },
            error: null
          })
        });

        const result = await authModule.checkUserActiveStatus('user-active');
        expect(result).toBe(true);
        expect(mockQuarantineUserActions).not.toHaveBeenCalled();
      });

      it('returns true when is_active is null (legacy NULL)', async () => {
        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { is_active: null },
            error: null
          })
        });

        const result = await authModule.checkUserActiveStatus('user-legacy');
        expect(result).toBe(true);
        expect(mockQuarantineUserActions).not.toHaveBeenCalled();
      });

      it('invalidates session and returns false when data is null and error is null', async () => {
        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null
          })
        });

        const result = await authModule.checkUserActiveStatus('user-null-data');
        expect(result).toBe(false);
        expect(mockToast.show).toHaveBeenCalledWith(
          'Profilo utente non disponibile o non autorizzato.',
          'error',
          7000
        );
      });

      it('triggers deactivation and returns false for account_inactive error or is_active=false', async () => {
        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'P0001: account_inactive', code: 'P0001' }
          })
        });

        const resInactiveErr = await authModule.checkUserActiveStatus('user-inactive-err');
        expect(resInactiveErr).toBe(false);
        expect(mockQuarantineUserActions).toHaveBeenCalledWith(['user-inactive-err']);

        vi.clearAllMocks();

        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { is_active: false },
            error: null
          })
        });

        const resInactiveData = await authModule.checkUserActiveStatus('user-inactive-data');
        expect(resInactiveData).toBe(false);
        expect(mockQuarantineUserActions).toHaveBeenCalledWith(['user-inactive-data']);
      });

      it('invalidates session and returns false for PGRST116 / profile_missing / profile_ambiguous errors', async () => {
        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: {
              message: 'JSON object requested, multiple (or no) instances found',
              code: 'PGRST116'
            }
          })
        });

        const resPgrst = await authModule.checkUserActiveStatus('user-pgrst');
        expect(resPgrst).toBe(false);
        expect(mockToast.show).toHaveBeenCalledWith(
          'Profilo utente non disponibile o non autorizzato.',
          'error',
          7000
        );
      });

      it('fails closed and invalidates session for unknown semantic business errors', async () => {
        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'P0001: custom business error', code: 'P0001' }
          })
        });

        const resUnknownErr = await authModule.checkUserActiveStatus('user-unknown-err');
        expect(resUnknownErr).toBe(false);
        expect(mockQuarantineUserActions).not.toHaveBeenCalled();
        expect(mockToast.show).toHaveBeenCalledWith(
          'Profilo utente non disponibile o non autorizzato.',
          'error',
          7000
        );
      });

      it('fails closed and invalidates session for unknown thrown exception', async () => {
        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockRejectedValue(new Error('Internal query crash'))
        });

        const resExc = await authModule.checkUserActiveStatus('user-exception');
        expect(resExc).toBe(false);
        expect(mockToast.show).toHaveBeenCalledWith(
          'Profilo utente non disponibile o non autorizzato.',
          'error',
          7000
        );
      });

      it('keeps session and returns true for offline/transport errors (navigator.onLine=false or fetch error)', async () => {
        // Test navigator.onLine = false
        const originalOnLine = navigator.onLine;
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Failed to fetch', code: 'FetchError' }
          })
        });

        const resOffline = await authModule.checkUserActiveStatus('user-offline');
        expect(resOffline).toBe(true);
        expect(mockToast.show).not.toHaveBeenCalled();

        // Restore navigator.onLine
        Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });

        // Test TypeError: Failed to fetch exception when online
        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
        });

        const resFetchExc = await authModule.checkUserActiveStatus('user-fetch-exc');
        expect(resFetchExc).toBe(true);
        expect(mockToast.show).not.toHaveBeenCalled();
      });
    });

    describe('4. loadSession transient transport error handling (LOGIC)', () => {
      it('preserves local session and returns null when loadSession profile query returns a transport error', async () => {
        mockSupabase.auth.getSession.mockResolvedValueOnce({
          data: {
            session: {
              user: {
                id: 'user-transport-1',
                email: 'user1@neofuel.local'
              }
            }
          },
          error: null
        });

        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Failed to fetch', status: 0 }
          })
        });

        const sessionResult = await authModule.loadSession();

        expect(sessionResult).toBeNull();
        expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
        expect(mockQuarantineUserActions).not.toHaveBeenCalled();
      });

      it('preserves local session and returns null when loadSession profile query throws a transport exception', async () => {
        mockSupabase.auth.getSession.mockResolvedValueOnce({
          data: {
            session: {
              user: {
                id: 'user-transport-2',
                email: 'user2@neofuel.local'
              }
            }
          },
          error: null
        });

        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
        });

        const sessionResult = await authModule.loadSession();

        expect(sessionResult).toBeNull();
        expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
        expect(mockQuarantineUserActions).not.toHaveBeenCalled();
      });
    });

    describe('5. Stale Realtime / timer callbacks after account switch & TOCTOU race guards (SECURITY/LOGIC)', () => {
      it('ignores Realtime UPDATE event from old user subscription after account switch (Blocker 3)', async () => {
        // User A logs in and sets up monitoring
        authModule.setLoggedUser({
          id: 'user-A-uuid',
          user_id: 101,
          email: 'usera@neofuel.local',
          full_name: 'User A',
          role: 'operator'
        });
        authModule.setupUserStatusMonitoring('user-A-uuid');

        const channelA = realtimeChannels.get('user_status_user-A-uuid');
        expect(channelA).toBeDefined();
        const callbackA = channelA?.onCallback as ((payload: unknown) => void) | undefined;
        expect(callbackA).toBeDefined();

        // Account switch to User B occurs (clears previous monitoring & sets new user)
        authModule.setLoggedUser({
          id: 'user-B-uuid',
          user_id: 202,
          email: 'userb@neofuel.local',
          full_name: 'User B',
          role: 'operator'
        });
        authModule.setupUserStatusMonitoring('user-B-uuid');

        const channelB = realtimeChannels.get('user_status_user-B-uuid');
        expect(channelB).toBeDefined();
        const callbackB = channelB?.onCallback as ((payload: unknown) => void) | undefined;
        expect(callbackB).toBeDefined();

        // Prove distinct callbacks were captured
        expect(callbackA).not.toBe(callbackB);

        // Invoke retained A callback after B is current
        callbackA?.({ new: { is_active: false } });
        await Promise.resolve();

        // Verify User B session is preserved and not deactivated
        expect(authModule.loggedUser?.id).toBe('user-B-uuid');
        expect(mockQuarantineUserActions).not.toHaveBeenCalledWith(
          expect.arrayContaining(['user-A-uuid'])
        );
        expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
        expect(mockToast.show).not.toHaveBeenCalled();

        // Positive control: invoke B's valid inactive callback and assert normal B deactivation works
        callbackB?.({ new: { is_active: false } });
        await vi.waitFor(() => {
          expect(mockQuarantineUserActions).toHaveBeenCalledWith(['user-B-uuid', '202']);
          expect(mockSupabase.auth.signOut).toHaveBeenCalled();
          expect(authModule.loggedUser).toBeNull();
        });
      });

      it('aborts handleUserDeactivation for A when account B is installed while quarantine is in-flight (Blocker 2)', async () => {
        let releaseQuarantine!: (count: number) => void;
        const quarantinePromise = new Promise<number>(resolve => {
          releaseQuarantine = resolve;
        });
        mockQuarantineUserActions.mockReturnValueOnce(quarantinePromise);

        // User A logged in
        authModule.setLoggedUser({
          id: 'user-A-uuid',
          user_id: 100,
          email: 'usera@neofuel.local',
          full_name: 'User A',
          role: 'operator'
        });

        // Start deactivation for A
        const deactivationPromise = authModule.handleUserDeactivation('user-A-uuid');

        // Account B installed while quarantine is in-flight
        authModule.setLoggedUser({
          id: 'user-B-uuid',
          user_id: 200,
          email: 'userb@neofuel.local',
          full_name: 'User B',
          role: 'operator'
        });

        // Release quarantine for A
        releaseQuarantine(1);
        await deactivationPromise;

        // Assert B remains logged in, B aliases/session/UI preserved, no post-await destructive effects
        expect(authModule.loggedUser?.id).toBe('user-B-uuid');
        expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
        expect(mockToast.show).not.toHaveBeenCalled();
      });

      it('aborts handleInvalidProfileSession for A when account B is installed while signOut is in-flight (Blocker 2)', async () => {
        let releaseSignOut!: (val: { error: null }) => void;
        const signOutPromise = new Promise<{ error: null }>(resolve => {
          releaseSignOut = resolve;
        });
        mockSupabase.auth.signOut.mockReturnValueOnce(signOutPromise);

        // User A logged in
        authModule.setLoggedUser({
          id: 'user-A-uuid',
          user_id: 100,
          email: 'usera@neofuel.local',
          full_name: 'User A',
          role: 'operator'
        });

        // Start invalid profile session cleanup for A
        const invalidProfilePromise = authModule.handleInvalidProfileSession(
          'Profilo utente non disponibile',
          'user-A-uuid'
        );

        // Account B installed while signOut is in-flight
        authModule.setLoggedUser({
          id: 'user-B-uuid',
          user_id: 200,
          email: 'userb@neofuel.local',
          full_name: 'User B',
          role: 'operator'
        });

        // Release signOut
        releaseSignOut({ error: null });
        await invalidProfilePromise;

        // Assert B is not cleared
        expect(authModule.loggedUser?.id).toBe('user-B-uuid');
        expect(mockToast.show).not.toHaveBeenCalled();
      });

      it('aborts handleUserDeactivation for A when quarantine REJECTS and B is installed (Blocker 2)', async () => {
        let rejectQuarantine!: (err: Error) => void;
        const quarantinePromise = new Promise<number>((_, reject) => {
          rejectQuarantine = reject;
        });
        mockQuarantineUserActions.mockReturnValueOnce(quarantinePromise);

        authModule.setLoggedUser({
          id: 'user-A-uuid',
          user_id: 100,
          email: 'usera@neofuel.local',
          full_name: 'User A',
          role: 'operator'
        });

        const deactivationPromise = authModule.handleUserDeactivation('user-A-uuid');

        // Install User B
        authModule.setLoggedUser({
          id: 'user-B-uuid',
          user_id: 200,
          email: 'userb@neofuel.local',
          full_name: 'User B',
          role: 'operator'
        });

        rejectQuarantine(new Error('IDB failure'));
        await deactivationPromise;

        expect(authModule.loggedUser?.id).toBe('user-B-uuid');
        expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
        expect(mockToast.show).not.toHaveBeenCalled();
      });

      it('quarantines both A aliases, signs out, clears A, and shows expected message on valid current-user deactivation (Blocker 2 positive control)', async () => {
        authModule.setLoggedUser({
          id: 'user-A-uuid',
          user_id: 100,
          email: 'usera@neofuel.local',
          full_name: 'User A',
          role: 'operator'
        });

        await authModule.handleUserDeactivation('user-A-uuid');

        expect(mockQuarantineUserActions).toHaveBeenCalledWith(['user-A-uuid', '100']);
        expect(mockSupabase.auth.signOut).toHaveBeenCalled();
        expect(authModule.loggedUser).toBeNull();
        expect(mockToast.show).toHaveBeenCalledWith(
          'Account disattivato. Contatta un amministratore.',
          'error',
          7000
        );
      });

      it('handles removeChannel rejection asynchronously without unhandled promise rejection or breaking cleanup', async () => {
        mockSupabase.removeChannel.mockRejectedValueOnce(
          new Error('Realtime removeChannel websocket error')
        );

        authModule.setupUserStatusMonitoring('user-remove-err');
        expect(() => authModule.cleanupUserStatusMonitoring()).not.toThrow();

        await Promise.resolve(); // drain microtasks
        expect(mockSupabase.removeChannel).toHaveBeenCalled();
      });

      it('ignores in-flight periodic check from old user that resolves after account switch', async () => {
        let resolveQuery!: (val: unknown) => void;
        const queryPromise = new Promise(resolve => {
          resolveQuery = resolve;
        });

        authModule.setLoggedUser({
          id: 'user-A-uuid',
          user_id: 101,
          email: 'usera@neofuel.local',
          full_name: 'User A',
          role: 'operator'
        });

        // Mock check query for User A to hang on promise
        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockImplementation(() => queryPromise)
        });

        // Trigger checkUserActiveStatus for User A
        const checkPromise = authModule.checkUserActiveStatus('user-A-uuid');

        // Account switch to User B happens while query is in-flight
        authModule.setLoggedUser({
          id: 'user-B-uuid',
          user_id: 202,
          email: 'userb@neofuel.local',
          full_name: 'User B',
          role: 'operator'
        });

        // Resolve in-flight query for User A returning is_active = false
        resolveQuery({ data: { is_active: false }, error: null });
        await checkPromise;

        // User B session should NOT be deactivated or cleared
        expect(authModule.loggedUser?.id).toBe('user-B-uuid');
        expect(mockQuarantineUserActions).not.toHaveBeenCalledWith(
          expect.arrayContaining(['user-A-uuid'])
        );
      });

      it('ignores in-flight periodic check from old user that REJECTS after account switch', async () => {
        let rejectQuery!: (err: unknown) => void;
        const queryPromise = new Promise((_, reject) => {
          rejectQuery = reject;
        });

        authModule.setLoggedUser({
          id: 'user-A-uuid',
          user_id: 101,
          email: 'usera@neofuel.local',
          full_name: 'User A',
          role: 'operator'
        });

        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockImplementation(() => queryPromise)
        });

        // Trigger checkUserActiveStatus for User A
        const checkPromise = authModule.checkUserActiveStatus('user-A-uuid');

        // Account switch to User B happens while query is in-flight
        authModule.setLoggedUser({
          id: 'user-B-uuid',
          user_id: 202,
          email: 'userb@neofuel.local',
          full_name: 'User B',
          role: 'operator'
        });

        // Reject in-flight query for User A
        rejectQuery(new Error('P0001: account_inactive'));
        const res = await checkPromise;

        // User B session should NOT be deactivated or cleared, and return true (ignored)
        expect(res).toBe(true);
        expect(authModule.loggedUser?.id).toBe('user-B-uuid');
        expect(mockToast.show).not.toHaveBeenCalled();
      });

      it('fails closed when account_inactive is returned or thrown while navigator.onLine=false', async () => {
        const originalOnLine = navigator.onLine;
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

        try {
          // 1. checkUserActiveStatus returned error: account_inactive while offline
          mockSupabase.from.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'P0001: account_inactive', code: 'P0001' }
            })
          });
          const res1 = await authModule.checkUserActiveStatus('user-inactive-offline-1');
          expect(res1).toBe(false);
          expect(mockQuarantineUserActions).toHaveBeenCalledWith(['user-inactive-offline-1']);

          vi.clearAllMocks();

          // 2. checkUserActiveStatus thrown error: account_inactive while offline
          mockSupabase.from.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockRejectedValue(new Error('P0001: account_inactive'))
          });
          const res2 = await authModule.checkUserActiveStatus('user-inactive-offline-2');
          expect(res2).toBe(false);
          expect(mockQuarantineUserActions).toHaveBeenCalledWith(['user-inactive-offline-2']);

          vi.clearAllMocks();

          // 3. loadSession returned error: account_inactive while offline
          mockSupabase.auth.getSession.mockResolvedValueOnce({
            data: { session: { user: { id: 'user-load-inactive-1', email: 'u1@test.com' } } },
            error: null
          });
          mockSupabase.from.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'account_inactive', code: 'P0001' }
            })
          });
          const res3 = await authModule.loadSession();
          expect(res3).toBeNull();
          expect(mockSupabase.auth.signOut).toHaveBeenCalled();

          vi.clearAllMocks();

          // 4. loadSession thrown error: account_inactive while offline
          mockSupabase.auth.getSession.mockResolvedValueOnce({
            data: { session: { user: { id: 'user-load-inactive-2', email: 'u2@test.com' } } },
            error: null
          });
          mockSupabase.from.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockRejectedValue(new Error('account_inactive'))
          });
          const res4 = await authModule.loadSession();
          expect(res4).toBeNull();
          expect(mockSupabase.auth.signOut).toHaveBeenCalled();
        } finally {
          Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
        }
      });

      it('fails closed when profile_missing, profile_ambiguous, or PGRST116 is returned or thrown while navigator.onLine=false', async () => {
        const originalOnLine = navigator.onLine;
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

        try {
          // 1. checkUserActiveStatus returned PGRST116 while offline
          mockSupabase.from.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'JSON object requested', code: 'PGRST116' }
            })
          });
          const res1 = await authModule.checkUserActiveStatus('user-pgrst-offline');
          expect(res1).toBe(false);
          expect(mockToast.show).toHaveBeenCalledWith(
            'Profilo utente non disponibile o non autorizzato.',
            'error',
            7000
          );

          vi.clearAllMocks();

          // 2. checkUserActiveStatus thrown profile_missing while offline
          mockSupabase.from.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockRejectedValue(new Error('profile_missing'))
          });
          const res2 = await authModule.checkUserActiveStatus('user-missing-offline');
          expect(res2).toBe(false);
          expect(mockToast.show).toHaveBeenCalledWith(
            'Profilo utente non disponibile o non autorizzato.',
            'error',
            7000
          );

          vi.clearAllMocks();

          // 3. checkUserActiveStatus returned profile_ambiguous while offline
          mockSupabase.from.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'profile_ambiguous', code: 'P0001' }
            })
          });
          const res3 = await authModule.checkUserActiveStatus('user-ambiguous-offline');
          expect(res3).toBe(false);
          expect(mockToast.show).toHaveBeenCalledWith(
            'Profilo utente non disponibile o non autorizzato.',
            'error',
            7000
          );

          vi.clearAllMocks();

          // 4. checkUserActiveStatus thrown profile_ambiguous while offline
          mockSupabase.from.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockRejectedValue(new Error('profile_ambiguous'))
          });
          const res4 = await authModule.checkUserActiveStatus('user-ambiguous-exc-offline');
          expect(res4).toBe(false);
          expect(mockToast.show).toHaveBeenCalledWith(
            'Profilo utente non disponibile o non autorizzato.',
            'error',
            7000
          );

          vi.clearAllMocks();

          // 5. loadSession returned profile_missing while offline
          mockSupabase.auth.getSession.mockResolvedValueOnce({
            data: { session: { user: { id: 'user-load-missing', email: 'u3@test.com' } } },
            error: null
          });
          mockSupabase.from.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'profile_missing', code: 'P0001' }
            })
          });
          const res5 = await authModule.loadSession();
          expect(res5).toBeNull();
          expect(mockSupabase.auth.signOut).toHaveBeenCalled();
        } finally {
          Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
        }
      });

      it('preserves session for true transport/offline errors (Failed to fetch) when navigator.onLine=false', async () => {
        const originalOnLine = navigator.onLine;
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

        try {
          mockSupabase.from.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Failed to fetch', code: 'FetchError' }
            })
          });
          const res1 = await authModule.checkUserActiveStatus('user-fetch-offline');
          expect(res1).toBe(true);
          expect(mockToast.show).not.toHaveBeenCalled();

          mockSupabase.auth.getSession.mockResolvedValueOnce({
            data: { session: { user: { id: 'user-load-fetch-offline', email: 'u4@test.com' } } },
            error: null
          });
          mockSupabase.from.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
          });
          const res2 = await authModule.loadSession();
          expect(res2).toBeNull();
          expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
        } finally {
          Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
        }
      });

      it('immediate Realtime event during setup after loadSession finds both Auth UUID and numeric profile ID installed', async () => {
        let realtimeCallback: ((payload: unknown) => void) | null = null;
        const channelMock: Record<string, unknown> = {};
        channelMock.on = vi.fn(
          (_event: string, _opts: unknown, callback: (payload: unknown) => void) => {
            realtimeCallback = callback;
            return channelMock;
          }
        );
        channelMock.subscribe = vi.fn().mockImplementation(() => {
          // Fire immediate event upon subscription
          if (realtimeCallback) {
            realtimeCallback({ new: { is_active: false } });
          }
          return channelMock;
        });
        mockSupabase.channel.mockReturnValue(channelMock);

        mockSupabase.auth.getSession.mockResolvedValueOnce({
          data: {
            session: {
              user: {
                id: 'auth-uuid-777',
                email: 'user777@neofuel.local'
              }
            }
          },
          error: null
        });

        mockSupabase.from.mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              user_id: 777,
              role: 'operator',
              email: 'user777@neofuel.local',
              full_name: 'User 777',
              is_active: true
            },
            error: null
          })
        });

        await authModule.loadSession();

        // Immediate event should find both Auth UUID and numeric profile ID ready and quarantine both
        expect(mockQuarantineUserActions).toHaveBeenCalledWith(['auth-uuid-777', '777']);
      });
    });
  });
});
