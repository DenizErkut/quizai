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
  const body = await req.json().catch(() => ({})) as { studentId?: string; cohort?: string }
  if (!body.studentId || !['auto', 'adaptive', 'standard'].includes(body.cohort || '')) return NextResponse.json({ error: 'Öğrenci ve kohort seçimi gerekli.' }, { status: 400 })
  let assignedCohort = body.cohort
  if (assignedCohort === 'auto') {
    const [{ count: adaptiveCount }, { count: standardCount }] = await Promise.all([
      db.from('adaptive_learning_evaluations').select('id', { count: 'exact', head: true }).eq('cohort', 'adaptive').eq('sample_version', 'adaptive-learning-v3-pilot'),
      db.from('adaptive_learning_evaluations').select('id', { count: 'exact', head: true }).eq('cohort', 'standard').eq('sample_version', 'adaptive-learning-v3-pilot'),
    ])
    assignedCohort = (adaptiveCount ?? 0) < (standardCount ?? 0) ? 'adaptive' : (standardCount ?? 0) < (adaptiveCount ?? 0) ? 'standard' : body.studentId.charCodeAt(body.studentId.length - 1) % 2 === 0 ? 'adaptive' : 'standard'
  }
  const [{ data: mastery }, { data: sessions }, { data: learningProfile }] = await Promise.all([
    db.from('student_mastery').select('mastery_score,retention_score').eq('student_id', body.studentId).order('last_mastery_update', { ascending: false }).limit(20),
    db.from('quiz_sessions').select('pct').eq('user_id', body.studentId).eq('completed', true).order('created_at', { ascending: false }).limit(20),
    // Segmentli kohort karşılaştırması için (bkz. 20260923110000_adaptive_
    // evaluation_baseline_segments.sql) — CANLI profil değil, tam bu anki
    // anlık görüntü donduruluyor; pilot ilerledikçe bu satır bir daha
    // güncellenmeyecek.
    db.from('student_learning_profiles').select('learning_pace,recent_trend').eq('student_id', body.studentId).maybeSingle(),
  ])
  const average = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null
  const baselineMastery = average((mastery ?? []).map(row => Number(row.mastery_score)).filter(Number.isFinite))
  // student_learning_profiles'ın kendi refresh_student_learning_profile()
  // fonksiyonundaki weak (<50) / strong (>=75) eşikleriyle birebir aynı.
  const baselineMasteryTier = baselineMastery === null ? 'unknown' : baselineMastery >= 75 ? 'high' : baselineMastery >= 50 ? 'medium' : 'low'
  const { data, error } = await db.from('adaptive_learning_evaluations').insert({
    student_id: body.studentId,
    cohort: assignedCohort,
    baseline_mastery: baselineMastery,
    baseline_retention: average((mastery ?? []).map(row => Number(row.retention_score)).filter(Number.isFinite)),
    baseline_pct: average((sessions ?? []).map(row => Number(row.pct)).filter(Number.isFinite)),
    baseline_mastery_tier: baselineMasteryTier,
    baseline_learning_pace: learningProfile?.learning_pace || 'unknown',
    baseline_recent_trend: learningProfile?.recent_trend || 'stable',
  }).select('id,student_id,cohort,baseline_mastery,baseline_retention,baseline_pct,baseline_mastery_tier,baseline_learning_pace,baseline_recent_trend').single()
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'Öğrenci bu pilot sürümüne zaten atanmış.' : 'Kohort ataması yapılamadı.' }, { status: error.code === '23505' ? 409 : 500 })
  return NextResponse.json({ evaluation: data })
}
