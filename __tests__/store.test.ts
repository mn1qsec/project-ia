import { renderHook, act } from '@testing-library/react-native';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../lib/supabase';

// Mock Supabase
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(),
  },
}));

describe('useAppStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store state before each test
    useAppStore.setState({
      session: null,
      user: null,
      profile: null,
      loading: true,
      initialized: false,
    });
  });

  it('should initialize with empty state', () => {
    const state = useAppStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.profile).toBeNull();
  });

  it('should handle signIn (setSession) successfully', async () => {
    const mockSession = {
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: 'user-123', email: 'test@test.com' },
    } as any;

    const mockProfile = { id: 'user-123', display_name: 'Test User' };

    // Setup mock for profile fetching
    const mockEq = jest.fn().mockReturnThis();
    const mockSingle = jest.fn().mockResolvedValue({ data: mockProfile, error: null });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq, single: mockSingle });
    
    (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

    const { result } = renderHook(() => useAppStore());

    await act(async () => {
      await result.current.setSession(mockSession);
    });

    expect(result.current.session).toEqual(mockSession);
    expect(result.current.user).toEqual(mockSession.user);
    expect(result.current.profile).toEqual(mockProfile);
    expect(result.current.loading).toBe(false);
    expect(result.current.initialized).toBe(true);
  });

  it('should handle signIn (setSession) with profile error gracefully', async () => {
    const mockSession = {
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: 'user-123', email: 'test@test.com' },
    } as any;

    // Setup mock for profile fetching failing
    const mockEq = jest.fn().mockReturnThis();
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq, single: mockSingle });
    
    (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

    const { result } = renderHook(() => useAppStore());

    await act(async () => {
      await result.current.setSession(mockSession);
    });

    expect(result.current.session).toEqual(mockSession);
    expect(result.current.user).toEqual(mockSession.user);
    expect(result.current.profile).toBeNull(); // Should be null due to error
    expect(result.current.loading).toBe(false);
  });

  it('should handle signOut correctly', async () => {
    const { result } = renderHook(() => useAppStore());
    
    // Initial setup with a user
    useAppStore.setState({
      session: { user: { id: 'user-123' } } as any,
      user: { id: 'user-123' } as any,
      profile: { id: 'user-123' } as any,
      loading: false,
      initialized: true,
    });

    // We mock auth.signOut successfully
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });

    await act(async () => {
      await result.current.signOut();
    });

    // signOut sets loading to true and calls supabase.auth.signOut. 
    // State clearing happens in setSession(null) triggered by onAuthStateChange in real app,
    // but we can test the explicit call to setSession(null) directly.
    expect(supabase.auth.signOut).toHaveBeenCalled();
    
    await act(async () => {
      await result.current.setSession(null);
    });

    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
