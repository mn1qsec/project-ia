export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          username: string | null
          avatar_url: string | null
          current_streak: number
          longest_streak: number
          created_at: string
        }
        Insert: {
          id: string
          email?: string | null
          username?: string | null
          avatar_url?: string | null
          current_streak?: number
          longest_streak?: number
        }
        Update: {
          email?: string | null
          username?: string | null
          avatar_url?: string | null
          current_streak?: number
          longest_streak?: number
        }
      }
      goals: {
        Row: {
          id: string
          user_id: string
          title: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          is_active?: boolean
        }
        Update: {
          title?: string
          is_active?: boolean
        }
      }
      goal_completions: {
        Row: {
          id: string
          user_id: string
          goal_id: string
          date: string
        }
        Insert: {
          id?: string
          user_id: string
          goal_id: string
          date?: string
        }
        Update: {
          date?: string
        }
      }
      daily_checkins: {
        Row: {
          id: string
          user_id: string
          date: string
        }
        Insert: {
          id?: string
          user_id: string
          date?: string
        }
        Update: {
          date?: string
        }
      }
      groups: {
        Row: {
          id: string
          name: string
          invite_code: string
          owner_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          invite_code: string
          owner_id?: string | null
        }
        Update: {
          name?: string
        }
      }
      group_members: {
        Row: {
          group_id: string
          user_id: string
          joined_at: string
        }
        Insert: {
          group_id: string
          user_id: string
        }
        Update: never
      }
    }
    Functions: {
      complete_goal: {
        Args: { p_goal_id: string }
        Returns: void
      }
      do_checkin: {
        Args: Record<string, never>
        Returns: void
      }
      get_streak: {
        Args: Record<string, never>
        Returns: { current_streak: number; longest_streak: number }[]
      }
      set_nickname: {
        Args: { p_nickname: string }
        Returns: void
      }
      get_global_ranking: {
        Args: { p_period: string; p_limit?: number; p_offset?: number }
        Returns: {
          pos: number
          nickname: string
          current_streak: number
          week_checkins: number
        }[]
      }
      get_my_rank: {
        Args: { p_period: string }
        Returns: {
          pos: number
          nickname: string
          current_streak: number
          week_checkins: number
        }[]
      }
    }
  }
}
