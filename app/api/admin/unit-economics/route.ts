// app/api/admin/unit-economics/route.ts — Birleşik "birim ekonomisi" görünümü.
//
// 23 Eylül 2026 — haber-analizi raporunun (Tema 5 farkı) tespit ettiği
// boşluk: robotik IPO haberinin altını çizdiği "hikayeden ölçülebilir
// ticari sonuca" disiplini Pratium'da zaten var — ama üç ayrı admin
// ekranına (pipeline-health: maliyet, coach-analytics: kullanım,
// adaptive-evaluation: öğrenme sonucu) dağılmış durumda, hiçbiri tek bir
// "öğrenci başına ne harcıyoruz, ne kadar kullanılıyor, gerçekten işe
// yarıyor mu" anlatısına bağlanmıyordu.
//
// Bilinçli mimari tercih: bu route'ta istatistik/maliyet mantığını
// TEKRAR YAZMIYORUZ (kopyalamak, zaten doğrulanmış hesaplamalarda
// tutarsızlık riski yaratır) — üç mevcut route'u kendi Authorization
// başlığımızla self-fetch ediyoruz ve JSON çıktılarını birleştiriyoruz.
// `req.nextUrl.origin` ile internal self-fetch, bu kod tabanında zaten
// kanıtlanmış bir desen (bkz. app/api/generate-quiz/route.ts'in
// /api/meb-search ve /api/verify-questions'ı aynı şekilde çağırması) —
// Next.js sürümüne özgü, doğrulanmamış bir API'ye (ör. NextRequest'i
// elle inşa etmek) güvenmek yerine bu tercih edildi. Bu saf bir
// SUNUM/AGGREGASYON katmanı; bir kaynak bulunamazsa/hata verirse o
// bölüm null olarak işaretlenir, diğerleri yine de dönülür.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

type PipelinePayload = {
  ai?: {
    platform_cost_usd?: number | null
    cost_per_test_usd?: number | null
    cost_per_student_usd?: number | null
    cost_per_test_sample?: number | null
    cost_per_student_sample?: number | null
    projected_cost_per_1000_tests_usd?: number | null
    pricing?: Record<string, number | null> | null
    coach?: { share_of_platform?: number | null }
  }
}
type CoachPayload = {
  adoption?: { adoption_rate?: number | null; eligible_students?: number | null }
  engagement?: { active_users_30d?: number | null; avg_messages_per_active_user?: number | null }
  actions?: { click_through_rate?: number | null }
}
type AdaptivePayload = {
  claim_status?: string | null
  claim_message?: string | null
  interpretable?: boolean | null
  cohorts?: Array<{ cohort: string; completed_sample: number }>
  statistics?: Array<{ metric: string; difference: number; confidence_interval_95: number[]; classification: string }>
  minimum_interpretation_sample?: number | null
  isolation_note?: string | null
}

async function callInternal<T>(origin: string, path: string, authHeader: string): Promise<T | null> {
  try {
    const res = await fetch(`${origin}${path}`, { headers: { Authorization: authHeader } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'bilinmiyor'
  return `$${value.toFixed(value < 1 ? 4 : 2)}`
}

function buildNarrative(pipeline: PipelinePayload | null, coach: CoachPayload | null, adaptive: AdaptivePayload | null): string {
  const parts: string[] = []
  if (pipeline?.ai) {
    parts.push(`Son 30 günde kayıtlara geçen AI maliyeti ${formatUsd(pipeline.ai.platform_cost_usd)} — AI kullanılan test başına ${formatUsd(pipeline.ai.cost_per_test_usd)}, AI kullanan öğrenci başına ${formatUsd(pipeline.ai.cost_per_student_usd)}.`)
  }
  if (coach?.adoption) {
    const rate = coach.adoption.adoption_rate
    parts.push(rate != null
      ? `Pratium Koç'u uygun öğrencilerin %${Math.round(rate * 100)}'i en az bir kez denedi.`
      : 'Pratium Koç benimseme oranı için henüz yeterli veri yok.')
  }
  if (adaptive?.claim_status) {
    parts.push(`Adaptive-learning pilotu şu an "${adaptive.claim_status}" durumunda: ${adaptive.claim_message}`)
  }
  return parts.join(' ')
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })

  const origin = req.nextUrl.origin
  const [pipeline, coach, adaptive] = await Promise.all([
    callInternal<PipelinePayload>(origin, '/api/admin/pipeline-health', authHeader),
    callInternal<CoachPayload>(origin, '/api/admin/coach-analytics', authHeader),
    callInternal<AdaptivePayload>(origin, '/api/admin/adaptive-evaluation', authHeader),
  ])

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    narrative: buildNarrative(pipeline, coach, adaptive),
    cost: pipeline?.ai ? {
      platform_cost_usd_30d: pipeline.ai.platform_cost_usd,
      cost_per_test_usd: pipeline.ai.cost_per_test_usd,
      cost_per_student_usd: pipeline.ai.cost_per_student_usd,
      cost_per_test_sample: pipeline.ai.cost_per_test_sample ?? null,
      cost_per_student_sample: pipeline.ai.cost_per_student_sample ?? null,
      pricing: pipeline.ai.pricing ?? null,
      coach_share_of_platform: pipeline.ai.coach?.share_of_platform ?? null,
      projected_cost_per_1000_tests_usd: pipeline.ai.projected_cost_per_1000_tests_usd,
    } : null,
    usage: coach ? {
      adoption_rate: coach.adoption?.adoption_rate ?? null,
      eligible_students: coach.adoption?.eligible_students ?? null,
      active_users_30d: coach.engagement?.active_users_30d ?? null,
      avg_messages_per_active_user: coach.engagement?.avg_messages_per_active_user ?? null,
      click_through_rate: coach.actions?.click_through_rate ?? null,
    } : null,
    learning_outcome: adaptive ? {
      claim_status: adaptive.claim_status ?? null,
      claim_message: adaptive.claim_message ?? null,
      interpretable: adaptive.interpretable ?? null,
      cohort_sample_sizes: (adaptive.cohorts ?? []).map(c => ({ cohort: c.cohort, completed_sample: c.completed_sample })),
      primary_metrics: (adaptive.statistics ?? [])
        .filter(metric => ['mastery', 'retention', 'test_pct'].includes(metric.metric))
        .map(metric => ({
          metric: metric.metric,
          difference: metric.difference,
          confidence_interval_95: metric.confidence_interval_95,
          classification: metric.classification,
        })),
      minimum_interpretation_sample: adaptive.minimum_interpretation_sample ?? null,
      isolation_note: adaptive.isolation_note ?? null,
    } : null,
    financial_completeness: {
      revenue_included: false,
      note: 'Bu görünüm şu an AI maliyetini ölçer; ödeme geliri, PayTR komisyonu/iade ve brüt marj henüz birleştirilmedi.',
    },
    // Kaynak eksikse (bir alt-route hata verdiyse) şeffafça belirt —
    // sessizce eksik veriyle "tam" bir görünüm sunmuyoruz.
    missing_sources: [
      !pipeline ? 'pipeline-health' : null,
      !coach ? 'coach-analytics' : null,
      !adaptive ? 'adaptive-evaluation' : null,
    ].filter(Boolean),
  })
}
