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
          nickname: string | null
          show_in_ranking: boolean
          onboarded: boolean
          reminder_enabled: boolean
          reminder_time: string
          shields: number
          shields_refilled_month: string
          light_mode: boolean
          soft_mode_from: string | null
          soft_mode_until: string | null
        }
        Insert: {
          id: string
          email?: string | null
          username?: string | null
          avatar_url?: string | null
          current_streak?: number
          longest_streak?: number
          nickname?: string | null
          show_in_ranking?: boolean
          onboarded?: boolean
          reminder_enabled?: boolean
          reminder_time?: string
          shields?: number
          shields_refilled_month?: string
        }
        Update: {
          email?: string | null
          username?: string | null
          avatar_url?: string | null
          current_streak?: number
          longest_streak?: number
          nickname?: string | null
          show_in_ranking?: boolean
          onboarded?: boolean
          reminder_enabled?: boolean
          reminder_time?: string
          shields?: number
          shields_refilled_month?: string
          light_mode?: boolean
          // soft_mode_from and soft_mode_until are server-only (protected by trigger)
        }
      }
      goals: {
        Row: {
          id: string
          user_id: string
          title: string
          is_active: boolean
          days_of_week: number[]
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          is_active?: boolean
          days_of_week?: number[]
        }
        Update: {
          title?: string
          is_active?: boolean
          days_of_week?: number[]
        }
      }
      goal_versions: {
        Row: {
          id: string
          goal_id: string
          user_id: string
          days_of_week: number[]
          is_active: boolean
          valid_from: string
        }
        Insert: never
        Update: never
      }
      protected_days: {
        Row: {
          user_id: string
          day: string
          used_at: string
        }
        Insert: never
        Update: never
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
      finish_onboarding: {
        Args: { p_nickname: string, p_reminder_enabled: boolean, p_reminder_time: string }
        Returns: void
      }
      update_reminder_settings: {
        Args: { p_enabled: boolean, p_time: string }
        Returns: void
      }
      create_goal: {
        Args: { p_title: string, p_days: number[] }
        Returns: string
      }
      update_goal: {
        Args: { p_goal_id: string, p_title?: string, p_days?: number[], p_is_active?: boolean }
        Returns: void
      }
      day_status: {
        Args: { p_user_id: string, p_date: string }
        Returns: string
      }
      flame_state: {
        Args: Record<string, never>
        Returns: {
          days: number
          at_risk: boolean
          recoverable_day: string | null
          shields: number
        }[]
      }
      use_shield: {
        Args: Record<string, never>
        Returns: void
      }
      next_shield_refill_date: {
        Args: Record<string, never>
        Returns: string
      }
    }
  }
}
