import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100 : null
}

async function measure(evaluation: any, checkpoint: 'day1' | 'day7') {
  const [{ data: mastery }, { data: sessions }] = await Promise.all([
    db.from('student_mastery').select('mastery_score,retention_score').eq('student_id', evaluation.student_id).gt('last_mastery_update', evaluation.observation_started_at).limit(100),
    // questions: misconception_catalog crossing için (bkz. measure()'ın altındaki
    // day7 bloğu) — aynı sorgudan hem pct/süre metriklerini hem de bu pencerede
    // misconception_review-odaklı bir soru gösterilip gösterilmediğini çıkarıyoruz.
    db.from('quiz_sessions').select('pct,completed,answers,questions').eq('user_id', evaluation.student_id).gt('created_at', evaluation.observation_started_at).limit(250),
  ])
  const completed = (sessions ?? []).filter(row => row.completed)
  if (checkpoint === 'day1' && completed.length < 1) return { skipped: 'not_enough_tests' }
  if (checkpoint === 'day7' && completed.length < 3) return { skipped: 'not_enough_tests' }
  const durations = completed.map(row => Array.isArray(row.answers) ? row.answers.reduce((sum: number, answer: any) => sum + Math.max(0, Number(answer?.timeMs || 0)), 0) / 1000 : 0).filter(seconds => seconds > 0)
  const values = {
    mastery: average((mastery ?? []).map(row => Number(row.mastery_score)).filter(Number.isFinite)),
    retention: average((mastery ?? []).map(row => Number(row.retention_score)).filter(Number.isFinite)),
    pct: average(completed.map(row => Number(row.pct)).filter(Number.isFinite)),
    test_count: completed.length,
    completion_rate: (sessions ?? []).length ? Math.round(completed.length / (sessions ?? []).length * 100000) / 100000 : null,
    avg_duration_seconds: average(durations),
    measured_at: new Date().toISOString(),
  }
  const update: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) update[`${checkpoint}_${key}`] = value
  if (checkpoint === 'day7') {
    Object.assign(update, { followup_mastery: values.mastery, followup_retention: values.retention, followup_pct: values.pct, observation_ended_at: values.measured_at })
    // 23 Eylül 2026 — yapılacaklar listesi madde 4 (kalan kısım): misconception_catalog
    // crossing. baseline_misconception_ids (atama anında dondurulmuş) boşsa bu
    // öğrencide karşılaştırılacak bir yanılgı yok — alanlar NULL kalır (0 değil,
    // çünkü 0/0 oranı "uygulanamaz" demektir, "hiç çözülmedi" değil).
    const baselineIds = Array.isArray(evaluation.baseline_misconception_ids) ? evaluation.baseline_misconception_ids : []
    if (baselineIds.length > 0) {
      const { data: resolvedRows } = await db.from('student_misconceptions').select('status').eq('student_id', evaluation.student_id).in('misconception_id', baselineIds).eq('status', 'resolved')
      update.day7_misconceptions_resolved = (resolvedRows ?? []).length
    }
    update.day7_misconception_interventions = completed.filter(row => Array.isArray(row.questions) && row.questions.some((q: any) => q?.adaptiveFocus === 'misconception')).length
  }
  const { error } = await db.from('adaptive_learning_evaluations').update(update).eq('id', evaluation.id)
  return error ? { error: error.message } : { measured: true }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: evaluations, error } = await db.from('adaptive_learning_evaluations').select('id,student_id,observation_started_at,day1_measured_at,day7_measured_at,baseline_misconception_ids').eq('sample_version', 'adaptive-learning-v3-pilot').is('day7_measured_at', null).order('observation_started_at').limit(250)
  if (error) return NextResponse.json({ error: 'Pilot ölçümleri alınamadı.' }, { status: 500 })
  const summary = { day1: 0, day7: 0, skipped: 0, failed: 0 }
  for (const evaluation of evaluations ?? []) {
    const ageHours = (Date.now() - new Date(evaluation.observation_started_at).getTime()) / 3600000
    const checkpoint = ageHours >= 168 ? 'day7' : ageHours >= 24 && !evaluation.day1_measured_at ? 'day1' : null
    if (!checkpoint) continue
    const result = await measure(evaluation, checkpoint)
    if ('measured' in result) summary[checkpoint] += 1
    else if ('skipped' in result) summary.skipped += 1
    else summary.failed += 1
  }
  return NextResponse.json({ ok: true, ...summary })
}
