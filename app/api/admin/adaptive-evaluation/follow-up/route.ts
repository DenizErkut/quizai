import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { studentId?: string }
  if (!body.studentId) return NextResponse.json({ error: 'Öğrenci gerekli.' }, { status: 400 })
  const [{ data: mastery }, { data: sessions }, { data: evaluation }] = await Promise.all([
    db.from('student_mastery').select('mastery_score,retention_score').eq('student_id', body.studentId).order('last_mastery_update', { ascending: false }).limit(20),
    db.from('quiz_sessions').select('pct').eq('user_id', body.studentId).eq('completed', true).order('created_at', { ascending: false }).limit(20),
    db.from('adaptive_learning_evaluations').select('id,observation_started_at').eq('student_id', body.studentId).is('observation_ended_at', null).maybeSingle(),
  ])
  if (!evaluation) return NextResponse.json({ error: 'Açık pilot değerlendirmesi bulunamadı.' }, { status: 404 })
  const average = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null
  const { data, error } = await db.from('adaptive_learning_evaluations').update({ followup_mastery: average((mastery ?? []).map(row => Number(row.mastery_score)).filter(Number.isFinite)), followup_retention: average((mastery ?? []).map(row => Number(row.retention_score)).filter(Number.isFinite)), followup_pct: average((sessions ?? []).map(row => Number(row.pct)).filter(Number.isFinite)), observation_ended_at: new Date().toISOString() }).eq('id', evaluation.id).is('observation_ended_at', null).select('id,student_id,cohort,followup_mastery,followup_retention,followup_pct,observation_ended_at').single()
  if (error) return NextResponse.json({ error: 'Follow-up kaydedilemedi.' }, { status: 500 })
  return NextResponse.json({ evaluation: data })
}
