import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export type RankingPeriod = 'streak' | 'week';

export interface RankingItem {
  pos: number;
  nickname: string;
  current_streak: number;
  week_checkins: number;
}

interface RankingState {
  ranking: RankingItem[];
  myRank: RankingItem | null;
  period: RankingPeriod;
  loading: boolean;
  hasMore: boolean;
  
  // Actions
  setPeriod: (period: RankingPeriod) => void;
  loadRanking: (refresh?: boolean) => Promise<void>;
  setNickname: (nickname: string) => Promise<{ error: string | null }>;
}

const PAGE_SIZE = 50;

export const useRankingStore = create<RankingState>((set, get) => ({
  ranking: [],
  myRank: null,
  period: 'streak',
  loading: false,
  hasMore: true,

  setPeriod: (period) => {
    set({ period, ranking: [], hasMore: true, myRank: null });
    get().loadRanking(true);
  },

  loadRanking: async (refresh = false) => {
    const { ranking, period, loading, hasMore } = get();
    
    if (loading || (!hasMore && !refresh)) return;

    set({ loading: true });
    
    try {
      const offset = refresh ? 0 : ranking.length;
      
      // Carrega ranking global paginado
      const { data, error } = await supabase.rpc('get_global_ranking', { 
        p_period: period,
        p_limit: PAGE_SIZE,
        p_offset: offset
      });
      
      if (error) throw error;

      // Carrega rank do usuário logado separadamente (sempre a posição real dele)
      const { data: myRankData } = await supabase.rpc('get_my_rank', {
        p_period: period
      });

      set({ 
        ranking: refresh ? (data || []) : [...ranking, ...(data || [])],
        myRank: myRankData && myRankData.length > 0 ? myRankData[0] : null,
        hasMore: data && data.length === PAGE_SIZE
      });
    } catch (error) {
      console.error('Error loading ranking:', error);
    } finally {
      set({ loading: false });
    }
  },

  setNickname: async (nickname) => {
    set({ loading: true });
    try {
      const { error } = await supabase.rpc('set_nickname', { p_nickname: nickname });
      if (error) {
        if (error.message.includes('apelido já está em uso')) {
          return { error: 'Este apelido já está em uso' };
        }
        return { error: error.message };
      }
      return { error: null };
    } catch (error: any) {
      return { error: error.message || 'Erro ao definir apelido' };
    } finally {
      set({ loading: false });
    }
  }
}));
