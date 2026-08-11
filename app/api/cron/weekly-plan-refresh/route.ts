// app/api/cron/weekly-plan-refresh/route.ts
// Vercel Cron — haftalık çalışır (bkz. vercel.json). Faz 4'ün (Student
// Agent) "kendiliğinden güncellenen plan" maddesi: önceki halde
// study_plans SADECE öğrenci elle "Yeni Plan Oluştur" butonuna basınca
// üretiliyordu. Bu cron iki şeyi otonom olarak yapar:
//   1) Hiç planı olmayan ama en az bir quiz çözmüş öğrenciler için İLK
//      planı kendiliğinden oluşturur (öğrencinin bunu düşünüp istemesine
//      gerek kalmadan proaktif bir "agent" davranışı).
//   2) Mevcut planının süresi (valid_until, 28 gün) dolmuş öğrenciler için
//      YENİ bir plan üretir — güncel mastery verisine göre hedefler de
//      otomatik olarak yeniden değerlendirilir (bkz. lib/study-plan-
//      generator.ts, computeAutonomousGoals).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'
import { generateStudyPlan } from '@/lib/study-plan-generator'

export const maxDuration = 120
export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  // Aday havuzu: en az 1 tamamlanmış quiz'i olan kullanıcılar (plansız bir
  // hesaba plan önermek anlamsız — henüz veri yok demektir).
  const { data: activeSessions } = await supabaseAdmin
    .from('quiz_sessions')
    .select('user_id')
    .eq('completed', true)

  const candidateIds = [...new Set((activeSessions ?? []).map((r: any) => r.user_id))]
  if (!candidateIds.length) {
    return NextResponse.json({ ok: true, checked: 0, generated: 0, skipped: 0, failed: 0 })
  }

  const { data: existingPlans } = await supabaseAdmin
    .from('study_plans')
    .select('user_id, valid_until, generated_at')
    .in('user_id', candidateIds)
    .order('generated_at', { ascending: false })

  // Her kullanıcının EN GÜNCEL planını tut (query zaten generated_at DESC
  // sıralı geldiği için ilk görülen satır en yenisi)
  const latestPlanByUser = new Map<string, { valid_until: string | null }>()
  for (const p of existingPlans ?? []) {
    if (!latestPlanByUser.has(p.user_id)) latestPlanByUser.set(p.user_id, p)
  }

  const now = Date.now()
  const toRegenerate = candidateIds.filter(uid => {
    const existing = latestPlanByUser.get(uid)
    if (!existing) return true // hiç planı yok -> otonom olarak ilk planı oluştur
    if (!existing.valid_until) return false // beklenmeyen veri, dokunma
    return new Date(existing.valid_until).getTime() < now // süresi dolmuş -> yenile
  })

  if (!toRegenerate.length) {
    return NextResponse.json({ ok: true, checked: candidateIds.length, generated: 0, skipped: candidateIds.length, failed: 0 })
  }

  const { data: profiles } = await supabaseAdmin
    .from('profiles').select('id, grade, language').in('id', toRegenerate)
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))
  const identities = await getIdentitiesBySupabaseIds(toRegenerate)

  let generated = 0, failed = 0
  for (const uid of toRegenerate) {
    try {
      const prof = profileMap.get(uid)
      const identity = (identities as any)[uid]
      const plan = await generateStudyPlan(supabaseAdmin, uid, {
        grade: prof?.grade,
        language: prof?.language,
        displayName: identity?.full_name,
      })
      if (!plan) { failed++; continue }

      await supabaseAdmin.from('study_plans').insert({
        user_id: uid,
        plan,
        valid_until: new Date(now + 28 * 24 * 60 * 60 * 1000).toISOString(),
      })
      await supabaseAdmin.from('notifications').insert({
        user_id: uid,
        type: 'plan_refresh',
        title: '📅 Yeni çalışma planın hazır!',
        body: 'Performansına göre güncellenen 4 haftalık planını incelemek için tıkla.',
        read: false,
        data: { href: '/plan' },
      })
      generated++
    } catch (e: any) {
      console.error('[weekly-plan-refresh] user hatasi:', uid, e.message)
      failed++
    }
  }

  return NextResponse.json({
    ok: true,
    checked: candidateIds.length,
    generated,
    skipped: candidateIds.length - toRegenerate.length,
    failed,
  })
}
