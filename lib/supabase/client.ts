import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

export async function getProfile(supabase: AnyClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return data
}

export async function getTopicSuggestions(supabase: AnyClient, grade: string) {
  const level = grade.startsWith('ilk') ? 'ilkokul'
    : grade.startsWith('orta') ? 'ortaokul'
    : grade.startsWith('lise') ? 'lise'
    : 'universite'

  const { data } = await supabase
    .from('topic_suggestions')
    .select('topic, subject')
    .eq('level', level)
    .eq('active', true)

  return data ?? []
}

export async function getUserSessions(supabase: AnyClient, limit = 10) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('quiz_sessions')
    .select('id, topic, grade, score, pct, question_count, completed, created_at')
    .eq('user_id', user.id)
    .eq('completed', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function saveQuizResult(
  supabase: AnyClient,
  sessionId: string,
  answers: { questionIndex: number; userAns: number; correct: boolean }[],
  score: number
) {
  const { error } = await supabase
    .from('quiz_sessions')
    .update({ answers, score, completed: true })
    .eq('id', sessionId)
  return !error
}
