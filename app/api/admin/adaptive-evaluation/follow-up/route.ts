import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// 15 Eylül 2026 — Deniz'in Rani Erkut hesabında bulduğu gerçek hata: bu route
// önceden observation_started_at'tan SONRAKİ veriyi hiç filtrelemiyordu —
// sadece "en son 20 mastery satırı" / "en son 20 tamamlanmış test" çekiyordu
// (assign route'undaki baseline sorgusuyla BİREBİR AYNI mantık). Follow-up,
// atamadan hemen sonra (hatta 31 saniye sonra, Rani'nin vakasında) tetiklenince
// bu sorgular BASELINE'IN KENDİSİYLE AYNI satırları döndürdü — gerçek bir
// önce/sonra karşılaştırması değil, aynı anlık görüntünün iki kez kaydı oldu.
// İki düzeltme:
//  1) MINIMUM_OBSERVATION_HOURS: atamadan bu yana yeterli süre geçmeden
//     follow-up çağrısı reddediliyor (yanlışlıkla/erken tetiklemeyi engeller).
//  2) Mastery/test sorguları artık SADECE observation_started_at'tan SONRAKİ
//     satırları sayıyor (.gt(...)) — follow-up artık gerçekten YENİ aktiviteyi
//     ölçüyor, eski/durağan (baseline'da zaten sayılmış) veriyi tekrar
//     yakalamıyor. Bu dönemde hiç yeni veri yoksa sonuç dürüstçe null kalır
//     (mevcut "insufficient_data" durumuyla tutarlı) — uydurma bir sayı
//     üretilmez.
const DAY1_HOURS = 24
const DAY7_HOURS = 24 * 7

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null
}

function sessionMetrics(sessions: any[]) {
  const completed = sessions.filter(row => row.completed)
  const durations = completed.map(row => Array.isArray(row.answers)
    ? row.answers.reduce((sum: number, answer: any) => sum + Math.max(0, Number(answer?.timeMs || 0)), 0) / 1000
    : 0).filter((seconds: number) => seconds > 0)
  return {
    pct: average(completed.map(row => Number(row.pct)).filter(Number.isFinite)),
    testCount: completed.length,
    completionRate: sessions.length ? Math.round(completed.length / sessions.length * 100000) / 100000 : null,
    avgDurationSeconds: average(durations),
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { studentId?: string }
  if (!body.studentId) return NextResponse.json({ error: 'Öğrenci gerekli.' }, { status: 400 })

  const { data: evaluation } = await db.from('adaptive_learning_evaluations').select('id,observation_started_at,day1_measured_at,day7_measured_at').eq('student_id', body.studentId).eq('sample_version', 'adaptive-learning-v3-pilot').maybeSingle()
  if (!evaluation) return NextResponse.json({ error: 'Açık pilot değerlendirmesi bulunamadı.' }, { status: 404 })

  const hoursElapsed = (Date.now() - new Date(evaluation.observation_started_at).getTime()) / (1000 * 60 * 60)
  if (hoursElapsed < DAY1_HOURS) {
    return NextResponse.json({ error: `24 saatlik kontrol için henüz erken (${hoursElapsed.toFixed(1)} saat).` }, { status: 400 })
  }
  const isDay7 = hoursElapsed >= DAY7_HOURS
  if (isDay7 && evaluation.day7_measured_at) return NextResponse.json({ error: '7 günlük ölçüm zaten tamamlandı.' }, { status: 409 })
  if (!isDay7 && evaluation.day1_measured_at) return NextResponse.json({ error: '24 saatlik ölçüm zaten tamamlandı.' }, { status: 409 })

  const [{ data: mastery }, { data: sessions }] = await Promise.all([
    db.from('student_mastery').select('mastery_score,retention_score').eq('student_id', body.studentId).gt('last_mastery_update', evaluation.observation_started_at).order('last_mastery_update', { ascending: false }).limit(20),
    db.from('quiz_sessions').select('pct,completed,answers,created_at').eq('user_id', body.studentId).gt('created_at', evaluation.observation_started_at).order('created_at', { ascending: false }).limit(100),
  ])
  const masteryValue = average((mastery ?? []).map(row => Number(row.mastery_score)).filter(Number.isFinite))
  const retentionValue = average((mastery ?? []).map(row => Number(row.retention_score)).filter(Number.isFinite))
  const metrics = sessionMetrics(sessions ?? [])
  const now = new Date().toISOString()
  if (!isDay7 && metrics.testCount < 1) return NextResponse.json({ error: '24 saatlik ölçüm için en az 1 tamamlanmış test gerekli.' }, { status: 400 })
  if (isDay7 && metrics.testCount < 3) return NextResponse.json({ error: `7 günlük ölçüm için en az 3 tamamlanmış test gerekli (mevcut: ${metrics.testCount}).` }, { status: 400 })
  const update = isDay7 ? {
    day7_mastery: masteryValue, day7_retention: retentionValue, day7_pct: metrics.pct,
    day7_test_count: metrics.testCount, day7_completion_rate: metrics.completionRate,
    day7_avg_duration_seconds: metrics.avgDurationSeconds, day7_measured_at: now,
    followup_mastery: masteryValue, followup_retention: retentionValue, followup_pct: metrics.pct, observation_ended_at: now,
  } : {
    day1_mastery: masteryValue, day1_retention: retentionValue, day1_pct: metrics.pct,
    day1_test_count: metrics.testCount, day1_completion_rate: metrics.completionRate,
    day1_avg_duration_seconds: metrics.avgDurationSeconds, day1_measured_at: now,
  }
  const { data, error } = await db.from('adaptive_learning_evaluations').update(update).eq('id', evaluation.id).select('*').single()
  if (error) return NextResponse.json({ error: 'Follow-up kaydedilemedi.' }, { status: 500 })
  return NextResponse.json({ evaluation: data, checkpoint: isDay7 ? 'day7' : 'day1' })
}
