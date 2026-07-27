/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Hoist mock setup
const { mockSupabase, mockToast, realtimeChannels } = vi.hoisted(() => {
  const realtimeChannels = new Map<string, Record<string, unknown>>();

  const createQueryBuilder = (returnData: unknown = { data: null, error: null }) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn().mockReturnValue(builder);
    builder.eq = vi.fn().mockReturnValue(builder);
    builder.maybeSingle = vi.fn().mockImplementation(() => Promise.resolve(returnData));
    builder.single = vi.fn().mockImplementation(() => Promise.resolve(returnData));
    return builder;
  };

  return {
    realtimeChannels,
    mockToast: { show: vi.fn() },
    mockSupabase: {
      auth: {
        signInWithPassword: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null }),
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
    }
  };
});

// 2. Mock external dependencies
const mockQuarantineUserActions = vi.fn().mockResolvedValue(1);
const mockSetOfflineQueueUserAliases = vi.fn();

vi.mock('../../js/core/api.js', () => ({ supabase: mockSupabase }));
vi.mock('../../js/ui/ui.js', () => ({
  showFullScreenLoader: vi.fn(),
  hideFullScreenLoader: vi.fn(),
  setButtonLoading: vi.fn(),
  showPromptModal: vi.fn()
}));
vi.mock('../../js/ui/toast.js', () => ({ Toast: mockToast }));
vi.mock('../../js/utils/rate-limiter.js', () => ({
  isRateLimited: vi.fn().mockReturnValue(false),
  resetRateLimit: vi.fn(),
  getRemainingAttempts: vi.fn().mockReturnValue(5)
}));
vi.mock('../../js/core/schemas.js', () => ({
  LoginSchema: {},
  safeParse: vi.fn((_schema, data) => ({ success: true, data }))
}));
vi.mock('../../js/core/offline-queue.js', () => ({
  quarantineUserActions: mockQuarantineUserActions,
  setOfflineQueueUserAliases: mockSetOfflineQueueUserAliases
}));

describe('Auth-Profile Coherence (#306)', () => {
  let authModule: typeof import('../../js/core/auth.js');
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    realtimeChannels.clear();

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    authModule = await import('../../js/core/auth.js');
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('loadSession() returns null when profile has is_active = false', async () => {
    // Arrange
    const mockSession = {
      user: {
        id: 'user-uuid-inactive-1',
        email: 'inactive@neofuel.local'
      }
    };
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null
    });

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn().mockReturnValue(builder);
    builder.eq = vi.fn().mockReturnValue(builder);
    builder.maybeSingle = vi.fn().mockResolvedValue({
      data: {
        user_id: 101,
        email: 'inactive@neofuel.local',
        full_name: 'Inactive User',
        role: 'operator',
        is_active: false,
        user_stations: []
      },
      error: null
    });
    mockSupabase.from.mockReturnValue(builder as unknown as ReturnType<typeof mockSupabase.from>);

    // Act
    const sessionUser = await authModule.loadSession();

    // Assert
    expect(sessionUser).toBeNull();
    expect(authModule.loggedUser).toBeNull();
    expect(mockQuarantineUserActions).toHaveBeenCalledWith(['user-uuid-inactive-1', '101']);
    expect(mockToast.show).toHaveBeenCalledWith(
      'Account disattivato. Contatta un amministratore.',
      'error',
      7000
    );
  });

  it('setLoggedUser() reinstalls the same identity without incrementing generation or re-subscribing channel', () => {
    // Arrange
    const userA: import('../../js/core/auth.js').LoggedUserData = {
      id: 'user-uuid-aaa-1',
      user_id: 1,
      email: 'usera@neofuel.local',
      full_name: 'User A',
      role: 'operator',
      user_stations: []
    };

    // Act - First installation
    authModule.setLoggedUser(userA);

    const initialChannelCount = mockSupabase.channel.mock.calls.length;
    const initialRemoveChannelCount = mockSupabase.removeChannel.mock.calls.length;

    expect(authModule.loggedUser).toEqual(userA);
    expect(initialChannelCount).toBe(1);
    expect(mockSupabase.channel).toHaveBeenCalledWith('user_status_user-uuid-aaa-1');

    // Act - Reinstalling exact same identity
    authModule.setLoggedUser(userA);

    // Assert - Monitoring channel should NOT be recreated
    expect(mockSupabase.channel.mock.calls.length).toBe(initialChannelCount);
    expect(mockSupabase.removeChannel.mock.calls.length).toBe(initialRemoveChannelCount);
    expect(authModule.loggedUser).toEqual(userA);
  });

  it('account switch increments generation and cleans up previous user monitoring channel', () => {
    // Arrange
    const userA: import('../../js/core/auth.js').LoggedUserData = {
      id: 'user-uuid-aaa-1',
      user_id: 1,
      email: 'usera@neofuel.local',
      full_name: 'User A',
      role: 'operator',
      user_stations: []
    };

    const userB: import('../../js/core/auth.js').LoggedUserData = {
      id: 'user-uuid-bbb-2',
      user_id: 2,
      email: 'userb@neofuel.local',
      full_name: 'User B',
      role: 'admin',
      user_stations: []
    };

    // Act 1: Install User A
    authModule.setLoggedUser(userA);
    expect(authModule.loggedUser?.id).toBe('user-uuid-aaa-1');
    expect(mockSupabase.channel).toHaveBeenCalledWith('user_status_user-uuid-aaa-1');

    // Act 2: Switch to User B
    authModule.setLoggedUser(userB);

    // Assert: User A channel cleaned up and User B channel monitored
    expect(mockSupabase.removeChannel).toHaveBeenCalled();
    expect(mockSupabase.channel).toHaveBeenCalledWith('user_status_user-uuid-bbb-2');
    expect(authModule.loggedUser?.id).toBe('user-uuid-bbb-2');
  });
});
