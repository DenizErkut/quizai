export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string
          gender: string | null
          grade: string
          school: string | null
          phone: string | null
          class_number: string | null
          language: string
          plan: string
          is_admin: boolean
          monthly_test_count: number
          daily_test_count: number | null
          daily_test_date: string | null
          onboarding_completed: boolean
          avatar_url: string | null
          referral_code: string | null
          referred_by: string | null
          teacher_approved: boolean
          push_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          gender?: string | null
          grade: string
          school?: string | null
          phone?: string | null
          class_number?: string | null
          language?: string
          plan?: string
          is_admin?: boolean
          monthly_test_count?: number
          daily_test_count?: number | null
          daily_test_date?: string | null
          onboarding_completed?: boolean
          avatar_url?: string | null
          referral_code?: string | null
          referred_by?: string | null
          teacher_approved?: boolean
          push_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          gender?: string | null
          grade?: string
          school?: string | null
          phone?: string | null
          class_number?: string | null
          language?: string
          plan?: string
          is_admin?: boolean
          monthly_test_count?: number
          daily_test_count?: number | null
          daily_test_date?: string | null
          onboarding_completed?: boolean
          avatar_url?: string | null
          referral_code?: string | null
          referred_by?: string | null
          teacher_approved?: boolean
          push_enabled?: boolean
          updated_at?: string
        }
      }
      quiz_sessions: {
        Row: {
          id: string
          user_id: string
          topic: string
          grade: string
          language: string
          question_count: number
          questions: Json
          answers: Json
          score: number
          pct: number
          completed: boolean
          is_daily: boolean
          question_type: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          topic: string
          grade?: string
          language?: string
          question_count?: number
          questions?: Json
          answers?: Json
          score?: number
          pct?: number
          completed?: boolean
          is_daily?: boolean
          question_type?: string
          created_at?: string
        }
        Update: {
          topic?: string
          grade?: string
          language?: string
          question_count?: number
          questions?: Json
          answers?: Json
          score?: number
          pct?: number
          completed?: boolean
          is_daily?: boolean
          question_type?: string
        }
      }
      daily_challenges: {
        Row: {
          id: string
          user_id: string
          date: string
          topic: string
          grade: string
          completed: boolean
          question_type: string | null
          questions: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          topic: string
          grade?: string
          completed?: boolean
          question_type?: string | null
          questions?: Json | null
          created_at?: string
        }
        Update: {
          completed?: boolean
          questions?: Json | null
        }
      }
      streaks: {
        Row: {
          id: string
          user_id: string
          current_streak: number
          longest_streak: number
          total_points: number
          last_activity_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          current_streak?: number
          longest_streak?: number
          total_points?: number
          last_activity_date?: string | null
        }
        Update: {
          current_streak?: number
          longest_streak?: number
          total_points?: number
          last_activity_date?: string | null
        }
      }
      weak_topics: {
        Row: {
          id: string
          user_id: string
          topic: string
          subject: string
          wrong_count: number
          total_count: number
          last_seen_at: string
        }
        Insert: {
          id?: string
          user_id: string
          topic: string
          subject?: string
          wrong_count?: number
          total_count?: number
          last_seen_at?: string
        }
        Update: {
          wrong_count?: number
          total_count?: number
          last_seen_at?: string
        }
      }
      api_rate_limits: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          count: number
          window_date: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          count?: number
          window_date?: string
          created_at?: string
        }
        Update: {
          count?: number
        }
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          title: string
          body: string
          type: string
          read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          body: string
          type?: string
          read?: boolean
          created_at?: string
        }
        Update: {
          read?: boolean
        }
      }
      teachers: {
        Row: {
          id: string
          user_id: string
          school: string | null
          subject: string | null
          approved: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          school?: string | null
          subject?: string | null
          approved?: boolean
        }
        Update: {
          school?: string | null
          subject?: string | null
          approved?: boolean
        }
      }
      parent_children: {
        Row: {
          id: string
          parent_id: string
          child_id: string
          created_at: string
        }
        Insert: {
          id?: string
          parent_id: string
          child_id: string
        }
        Update: Record<string, never>
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          plan: string
          status: string
          starts_at: string
          ends_at: string | null
          iyzico_token: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          plan: string
          status?: string
          starts_at?: string
          ends_at?: string | null
          iyzico_token?: string | null
        }
        Update: {
          plan?: string
          status?: string
          ends_at?: string | null
          iyzico_token?: string | null
        }
      }
      referrals: {
        Row: {
          id: string
          referrer_id: string
          referred_id: string
          rewarded: boolean
          created_at: string
        }
        Insert: {
          id?: string
          referrer_id: string
          referred_id: string
          rewarded?: boolean
        }
        Update: {
          rewarded?: boolean
        }
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          keys: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          keys: Json
        }
        Update: Record<string, never>
      }
      meb_resources: {
        Row: {
          id: string
          title: string
          grade: string
          subject: string
          unit: string
          level: string
          source_type: string | null
          file_url: string | null
          raw_text: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          grade: string
          subject: string
          unit: string
          level: string
          source_type?: string | null
          file_url?: string | null
          raw_text?: string | null
        }
        Update: {
          title?: string
          grade?: string
          subject?: string
          unit?: string
          level?: string
        }
      }
      exam_resources: {
        Row: {
          id: string
          title: string
          exam_type: string
          year: number
          subject: string | null
          answer_key: string | null
          file_url: string | null
          raw_text: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          exam_type: string
          year: number
          subject?: string | null
          answer_key?: string | null
          file_url?: string | null
          raw_text?: string | null
        }
        Update: {
          title?: string
          answer_key?: string | null
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      get_dashboard_stats: {
        Args: { p_user_id: string }
        Returns: Json
      }
    }
    Enums: Record<string, never>
  }
}

// Kısayol tipleri
export type Profile = Database['public']['Tables']['profiles']['Row']
export type QuizSession = Database['public']['Tables']['quiz_sessions']['Row']
export type DailyChallenge = Database['public']['Tables']['daily_challenges']['Row']
export type Streak = Database['public']['Tables']['streaks']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']
export type Teacher = Database['public']['Tables']['teachers']['Row']
export type MebResource = Database['public']['Tables']['meb_resources']['Row']
export type ExamResource = Database['public']['Tables']['exam_resources']['Row']
