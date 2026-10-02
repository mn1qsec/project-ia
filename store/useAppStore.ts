import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AppState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;
  
  // Actions
  setSession: (session: Session | null) => void;
  loadSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,
  initialized: false,

  setSession: async (session) => {
    if (!session) {
      set({ session: null, user: null, profile: null, loading: false, initialized: true });
      return;
    }

    set({ session, user: session.user, loading: true });

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!error && data) {
        set({ profile: data });
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      set({ loading: false, initialized: true });
    }
  },

  loadSession: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await get().setSession(session);

      supabase.auth.onAuthStateChange((_event, newSession) => {
        get().setSession(newSession);
      });
    } catch (err) {
      console.error('Error loading session:', err);
      set({ loading: false, initialized: true });
    }
  },

  signOut: async () => {
    set({ loading: true });
    await supabase.auth.signOut();
    // setSession(null) will be called by onAuthStateChange
  },
}));
