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
          gender: string | null
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
          gender?: string | null
          grade: string
          school?: string | null
          language?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          age?: number | null
          gender?: string | null
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
          pct: number
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
          level: string
          topic: string
          subject: string | null
          active: boolean
        }
        Insert: {
          level: string
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

export interface QuizQuestion {
  q: string
  opts: string[]
  ans: number
  exp: string
}

export interface QuizAnswer {
  questionIndex: number
  userAns: number
  correct: boolean
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Profile = Tables<'profiles'>
export type QuizSession = Tables<'quiz_sessions'>
export type TopicSuggestion = Tables<'topic_suggestions'>
