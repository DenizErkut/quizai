import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })

  const { data: evaluations, error } = await db.from('adaptive_learning_evaluations').select('id,student_id,cohort,observation_started_at,observation_ended_at').eq('sample_version', 'adaptive-learning-v3-pilot').order('observation_started_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: 'Pilot katılımcıları alınamadı.' }, { status: 500 })
  const ids = (evaluations ?? []).map(row => row.student_id)
  const identities = await getIdentitiesBySupabaseIds(ids)
  const earliest = (evaluations ?? []).reduce((min, row) => row.observation_started_at < min ? row.observation_started_at : min, new Date().toISOString())
  const { data: sessions } = ids.length ? await db.from('quiz_sessions').select('user_id,created_at').in('user_id', ids).eq('completed', true).gte('created_at', earliest) : { data: [] }
  const participants = (evaluations ?? []).map(row => {
    const tests = (sessions ?? []).filter(session => session.user_id === row.student_id && session.created_at >= row.observation_started_at).length
    const observationDays = Math.floor((Date.now() - new Date(row.observation_started_at).getTime()) / 86_400_000)
    return { id: row.id, student_id: row.student_id, name: identities[row.student_id]?.full_name || 'İsimsiz', email: identities[row.student_id]?.email || '', cohort: row.cohort, observation_days: observationDays, pilot_tests: tests, completed: Boolean(row.observation_ended_at), follow_up_ready: !row.observation_ended_at && observationDays >= 7 && tests >= 3 }
  })
  return NextResponse.json({ participants, eligibility: { minimum_days: 7, minimum_tests: 3 } })
}
