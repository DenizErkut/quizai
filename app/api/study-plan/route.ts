// app/api/study-plan/route.ts
// Öğrencinin kendi isteğiyle (manuel "Yeni Plan Oluştur" butonu) tetiklenen
// plan üretimi. Otomatik/haftalık yenileme için bkz.
// app/api/cron/weekly-plan-refresh — hesaplama ve üretim mantığı
// lib/study-plan-generator.ts üzerinden paylaşılıyor.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentityBySupabaseId } from '@/lib/identity/client'
import { generateStudyPlan } from '@/lib/study-plan-generator'

export const maxDuration = 60
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('grade,language').eq('id', user.id).single()
  const identity = await getIdentityBySupabaseId(user.id)
  const displayName = identity?.full_name ?? 'Öğrenci'

  // Sürekli öğrenme döngüsü (Faz 7): varsa BİR ÖNCEKİ planın hedef anlık
  // görüntüsünü çek -- yeni plan "geçen hafta bu konulara odaklandın,
  // sonuç şöyleydi" bağlamıyla yazılabilsin (bkz. lib/study-plan-
  // generator.ts, evaluatePreviousGoals).
  const { data: previousPlan } = await supabase
    .from('study_plans')
    .select('goals_snapshot')
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // NOT: weakTopics/avgPct/totalTests artık client'tan zorunlu değil —
  // generateStudyPlan hedefleri kendi mastery hesabından (lib/mastery.ts)
  // OTONOM olarak belirliyor (bkz. computeAutonomousGoals). Eski client
  // sürümleriyle geriye dönük uyum için body okunmaya devam ediyor ama
  // kullanılmıyor.
  await req.json().catch(() => ({}))

  const result = await generateStudyPlan(supabase, user.id, {
    grade: profile?.grade,
    language: profile?.language,
    displayName,
    previousGoals: previousPlan?.goals_snapshot || undefined,
  })

  if (!result) return NextResponse.json({ error: 'Plan olusturulamadi.' }, { status: 500 })
  return NextResponse.json({ plan: result.plan, goals: result.goals })
}
