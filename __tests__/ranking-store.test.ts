import { renderHook, act } from '@testing-library/react-native';
import { useRankingStore } from '../store/useRankingStore';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

describe('useRankingStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRankingStore.setState({
      ranking: [],
      myRank: null,
      period: 'streak',
      loading: false,
      hasMore: true,
    });
  });

  it('loads ranking and myRank correctly', async () => {
    const mockRanking = [
      { pos: 1, nickname: 'player1', current_streak: 10, week_checkins: 5 },
    ];
    const mockMyRank = [{ pos: 10, nickname: 'me', current_streak: 2, week_checkins: 1 }];

    (supabase.rpc as jest.Mock).mockImplementation(async (fnName) => {
      if (fnName === 'get_global_ranking') return { data: mockRanking, error: null };
      if (fnName === 'get_my_rank') return { data: mockMyRank, error: null };
      return { data: null, error: null };
    });

    const { result } = renderHook(() => useRankingStore());

    await act(async () => {
      await result.current.loadRanking(true);
    });

    expect(result.current.ranking).toEqual(mockRanking);
    expect(result.current.myRank).toEqual(mockMyRank[0]);
    // hasMore deve ser false porque retornamos menos que PAGE_SIZE (50)
    expect(result.current.hasMore).toBe(false); 
  });

  it('handles setNickname correctly', async () => {
    const { result } = renderHook(() => useRankingStore());

    // Erro de duplicado
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      error: { message: 'Este apelido já está em uso' }
    });

    let res;
    await act(async () => {
      res = await result.current.setNickname('player1');
    });

    expect(res?.error).toBe('Este apelido já está em uso');

    // Sucesso
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: null });
    
    await act(async () => {
      res = await result.current.setNickname('new_nick');
    });

    expect(res?.error).toBeNull();
  });
});
