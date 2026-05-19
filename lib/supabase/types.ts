// lib/supabase/types.ts
// QuizAI — Supabase tablo tipleri
// Bu dosyayı güncel tutmak için: npx supabase gen types typescript --linked > lib/supabase/types.ts

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
          age: number | null
          gender: 'erkek' | 'kız' | 'belirtmek istemiyorum' | null
          grade: string
          school: string | null
          language: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          age?: number | null
          gender?: 'erkek' | 'kız' | 'belirtmek istemiyorum' | null
          grade: string
          school?: string | null
          language?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          age?: number | null
          gender?: 'erkek' | 'kız' | 'belirtmek istemiyorum' | null
          grade?: string
          school?: string | null
          language?: string
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
          score: number
          pct: number          // generated column
          answers: QuizAnswer[]
          questions: QuizQuestion[]
          completed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          topic: string
          grade: string
          language?: string
          question_count?: number
          score?: number
          answers?: QuizAnswer[]
          questions?: QuizQuestion[]
          completed?: boolean
          created_at?: string
        }
        Update: {
          score?: number
          answers?: QuizAnswer[]
          completed?: boolean
        }
      }

      topic_suggestions: {
        Row: {
          id: number
          level: 'ilkokul' | 'ortaokul' | 'lise' | 'üniversite'
          topic: string
          subject: string | null
          active: boolean
        }
        Insert: {
          level: 'ilkokul' | 'ortaokul' | 'lise' | 'üniversite'
          topic: string
          subject?: string | null
          active?: boolean
        }
        Update: {
          active?: boolean
        }
      }
    }

    Views: {
      leaderboard: {
        Row: {
          user_id: string
          name: string
          grade: string
          total_sessions: number
          avg_pct: number
          total_questions: number
          total_correct: number
        }
      }
    }
  }
}

// ---------------------------------------------------------------
// Domain tipleri
// ---------------------------------------------------------------
export interface QuizQuestion {
  q: string        // soru metni
  opts: string[]   // 4 şık
  ans: number      // doğru şık index (0-3)
  exp: string      // açıklama
}

export interface QuizAnswer {
  questionIndex: number
  userAns: number   // kullanıcının seçtiği index
  correct: boolean
}

// Supabase client için yardımcı tip
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Profile = Tables<'profiles'>
export type QuizSession = Tables<'quiz_sessions'>
export type TopicSuggestion = Tables<'topic_suggestions'>
