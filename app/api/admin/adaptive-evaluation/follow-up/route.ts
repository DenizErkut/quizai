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
const MINIMUM_OBSERVATION_HOURS = 24

export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { studentId?: string }
  if (!body.studentId) return NextResponse.json({ error: 'Öğrenci gerekli.' }, { status: 400 })

  const { data: evaluation } = await db.from('adaptive_learning_evaluations').select('id,observation_started_at').eq('student_id', body.studentId).is('observation_ended_at', null).maybeSingle()
  if (!evaluation) return NextResponse.json({ error: 'Açık pilot değerlendirmesi bulunamadı.' }, { status: 404 })

  const hoursElapsed = (Date.now() - new Date(evaluation.observation_started_at).getTime()) / (1000 * 60 * 60)
  if (hoursElapsed < MINIMUM_OBSERVATION_HOURS) {
    return NextResponse.json({ error: `Follow-up için en az ${MINIMUM_OBSERVATION_HOURS} saat gözlem süresi gerekli (şimdiye kadar geçen: ${hoursElapsed.toFixed(1)} saat). Erken tetiklemek baseline ile aynı veriyi tekrar yakalar.` }, { status: 400 })
  }

  const [{ data: mastery }, { data: sessions }] = await Promise.all([
    db.from('student_mastery').select('mastery_score,retention_score').eq('student_id', body.studentId).gt('last_mastery_update', evaluation.observation_started_at).order('last_mastery_update', { ascending: false }).limit(20),
    db.from('quiz_sessions').select('pct').eq('user_id', body.studentId).eq('completed', true).gt('created_at', evaluation.observation_started_at).order('created_at', { ascending: false }).limit(20),
  ])
  const average = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null
  const { data, error } = await db.from('adaptive_learning_evaluations').update({ followup_mastery: average((mastery ?? []).map(row => Number(row.mastery_score)).filter(Number.isFinite)), followup_retention: average((mastery ?? []).map(row => Number(row.retention_score)).filter(Number.isFinite)), followup_pct: average((sessions ?? []).map(row => Number(row.pct)).filter(Number.isFinite)), observation_ended_at: new Date().toISOString() }).eq('id', evaluation.id).is('observation_ended_at', null).select('id,student_id,cohort,followup_mastery,followup_retention,followup_pct,observation_ended_at').single()
  if (error) return NextResponse.json({ error: 'Follow-up kaydedilemedi.' }, { status: 500 })
  return NextResponse.json({ evaluation: data })
}
