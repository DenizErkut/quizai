// lib/supabase/client.ts
// Singleton Supabase client — tüm client component'larında kullan

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ---------------------------------------------------------------
// lib/supabase/hooks.ts
// Kullanışlı React hook'ları
// ---------------------------------------------------------------

// useProfile — mevcut kullanıcının profilini çeker
//
// import { useProfile } from '@/lib/supabase/hooks'
//
// export default function Page() {
//   const { profile, loading } = useProfile()
//   if (loading) return <Spinner />
//   return <div>Merhaba {profile?.name}</div>
// }

export async function getProfile(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return data
}

export async function getTopicSuggestions(
  supabase: ReturnType<typeof createClient>,
  grade: string
) {
  const level = grade.startsWith('ilk') ? 'ilkokul'
    : grade.startsWith('orta') ? 'ortaokul'
    : grade.startsWith('lise') ? 'lise'
    : 'üniversite'

  const { data } = await supabase
    .from('topic_suggestions')
    .select('topic, subject')
    .eq('level', level)
    .eq('active', true)

  return data ?? []
}

export async function getUserSessions(
  supabase: ReturnType<typeof createClient>,
  limit = 10
) {
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
  supabase: ReturnType<typeof createClient>,
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
