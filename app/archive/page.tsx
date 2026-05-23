import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ArchiveClient from './ArchiveClient'

export default async function ArchivePage() {
  const supabase = createServerComponentClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('id, topic, grade, language, question_count, score, pct, completed, created_at')
    .eq('user_id', user.id)
    .eq('completed', true)
    .order('created_at', { ascending: false })

  return <ArchiveClient sessions={sessions ?? []} />
}
