import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const MINIMUM_SAMPLE = 30
const BALANCE_TOLERANCE = 0.25

// 23 Eylül 2026 — Pratium uyum raporu Tema 2 / yapılacaklar listesi madde 4:
// "hangi müdahale hangi öğrenci profilinde işe yarıyor" sorusuna cevap
// aramak için, ikili (adaptive/standard) kohort karşılaştırmasının aynısı
// artık öğrenci-profili SEGMENTLERİ (baseline mastery katmanı, öğrenme
// hızı, güncel eğilim) içinde de ayrı ayrı hesaplanabiliyor. Segment
// alanları atama anında donduruldu (bkz. assign/route.ts ve migration
// 20260923110000) — pilotun kendisinin canlı profili değiştirmesinden
// kaynaklanan "tedavi sonrası bölümleme" hatasından kaçınmak için.
// Bu fonksiyon aynı istatistiksel mantığı (ortalama, gölge/kohort farkı,
// efekt büyüklüğü, %95 güven aralığı, yorumlanabilirlik eşiği) hem tüm
// örneklem hem de her segment alt kümesi için tekrar kullanılabilir kılar.
function computeCohortReport(rows: any[]) {
  const cohorts = ['adaptive', 'standard'].map(cohort => {
    const assigned = rows.filter(row => row.cohort === cohort)
    const completedRows = assigned.filter(row => row.day7_measured_at && row.day7_mastery != null)
    const day1 = assigned.filter(row => row.day1_measured_at)
    const avgFrom = (source: any[], key: string) => { const values = source.map(row => Number(row[key])).filter(Number.isFinite); return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null }
    const gain = (followup: string, baseline: string) => avgFrom(completedRows, followup) !== null && avgFrom(completedRows, baseline) !== null ? Math.round((avgFrom(completedRows, followup)! - avgFrom(completedRows, baseline)!) * 100) / 100 : null
    return { cohort, assigned_sample: assigned.length, day1_sample: day1.length, completed_sample: completedRows.length, mastery_gain: gain('day7_mastery', 'baseline_mastery'), retention_gain: gain('day7_retention', 'baseline_retention'), pct_gain: gain('day7_pct', 'baseline_pct'), day1_retention: avgFrom(day1, 'day1_retention'), day7_retention: avgFrom(completedRows, 'day7_retention'), completion_rate: avgFrom(completedRows, 'day7_completion_rate'), avg_duration_seconds: avgFrom(completedRows, 'day7_avg_duration_seconds'), avg_test_count: avgFrom(completedRows, 'day7_test_count') }
  })
  const counts = cohorts.map(row => row.completed_sample)
  const balanced = Math.min(...counts) > 0 && Math.max(...counts) / Math.min(...counts) <= BALANCE_TOLERANCE + 1
  const interpretable = cohorts.every(row => row.completed_sample >= MINIMUM_SAMPLE) && balanced
  const completed = rows.filter(row => row.day7_measured_at)

  const outcomeStatistics = [
    ['mastery', 'baseline_mastery', 'day7_mastery'],
    ['retention', 'baseline_retention', 'day7_retention'],
    ['test_pct', 'baseline_pct', 'day7_pct'],
  ].map(([metric, baseline, followup]) => {
    const gains = (cohort: string) => completed.filter(row => row.cohort === cohort && row[followup] != null && row[baseline] != null).map(row => Number(row[followup]) - Number(row[baseline])).filter(Number.isFinite)
    const adaptive = gains('adaptive'); const standard = gains('standard')
    const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
    const variance = (values: number[]) => values.length > 1 ? values.reduce((sum, value) => sum + (value - mean(values)) ** 2, 0) / (values.length - 1) : 0
    const difference = mean(adaptive) - mean(standard)
    const standardError = Math.sqrt(variance(adaptive) / Math.max(adaptive.length, 1) + variance(standard) / Math.max(standard.length, 1))
    const pooledSd = Math.sqrt(((adaptive.length - 1) * variance(adaptive) + (standard.length - 1) * variance(standard)) / Math.max(adaptive.length + standard.length - 2, 1))
    return { metric, difference: Math.round(difference * 100) / 100, effect_size: pooledSd > 0 ? Math.round(difference / pooledSd * 100) / 100 : null, confidence_interval_95: [Math.round((difference - 1.96 * standardError) * 100) / 100, Math.round((difference + 1.96 * standardError) * 100) / 100], classification: !interpretable ? 'insufficient_data' : difference > 0 ? 'adaptive_positive' : difference < 0 ? 'standard_positive' : 'neutral' }
  })

  const directMetric = (metric: string, key: string, lowerIsBetter = false) => {
    const values = (cohort: string) => completed.filter(row => row.cohort === cohort && row[key] != null).map(row => Number(row[key])).filter(Number.isFinite)
    const adaptive = values('adaptive'); const standard = values('standard')
    const mean = (items: number[]) => items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : 0
    const variance = (items: number[]) => items.length > 1 ? items.reduce((sum, value) => sum + (value - mean(items)) ** 2, 0) / (items.length - 1) : 0
    const difference = mean(adaptive) - mean(standard)
    const standardError = Math.sqrt(variance(adaptive) / Math.max(adaptive.length, 1) + variance(standard) / Math.max(standard.length, 1))
    const favorable = lowerIsBetter ? difference < 0 : difference > 0
    return { metric, difference: Math.round(difference * 100) / 100, adaptive_mean: Math.round(mean(adaptive) * 100) / 100, standard_mean: Math.round(mean(standard) * 100) / 100, confidence_interval_95: [Math.round((difference - 1.96 * standardError) * 100) / 100, Math.round((difference + 1.96 * standardError) * 100) / 100], classification: !interpretable ? 'insufficient_data' : favorable ? 'adaptive_positive' : difference === 0 ? 'neutral' : 'standard_positive' }
  }

  const statistics = [...outcomeStatistics, directMetric('completion_rate', 'day7_completion_rate'), directMetric('duration_seconds', 'day7_avg_duration_seconds', true), directMetric('test_count', 'day7_test_count')]
  const primary = statistics.filter(row => ['mastery', 'retention', 'test_pct'].includes(row.metric))
  const statisticallyPositive = interpretable && primary.every(row => row.classification === 'adaptive_positive' && row.confidence_interval_95[0] > 0)

  return {
    cohorts, statistics, balanced, interpretable,
    claim_status: statisticallyPositive ? 'supported_by_pilot' : interpretable ? 'not_demonstrated' : 'insufficient_data',
    claim_message: statisticallyPositive ? 'Pilot verileri adaptive grubun ana sonuçlarda daha iyi olduğunu destekliyor.' : interpretable ? 'Yeterli örneklem oluştu ancak adaptive yaklaşımın üstünlüğü henüz gösterilemedi.' : 'AI daha iyi öğretiyor iddiası için henüz yeterli ve dengeli veri yok.',
    interpretation_status: interpretable ? 'ready' : 'insufficient_or_unbalanced_sample',
  }
}

// Bir segment boyutunu (örn. baseline_mastery_tier) değerlerine göre gruplar
// ve her değer için ayrı bir cohort raporu üretir. Segment alanı NULL olan
// satırlar (migration öncesi eski kayıtlar) segmentli kırılıma girmez —
// yine de üst-seviye (segmentsiz) rapora dahil kalırlar.
function computeSegmentBreakdown(rows: any[], field: string) {
  const withSegment = rows.filter(row => row[field] != null)
  const values = [...new Set(withSegment.map(row => row[field]))].sort()
  return values.map(value => ({ segment_value: value, ...computeCohortReport(withSegment.filter(row => row[field] === value)) }))
}

// 23 Eylül 2026 — yapılacaklar listesi madde 4'ün kalan kısmı: misconception_
// catalog crossing. "Hangi öğrenci hangi misconception_review müdahalesini
// aldı, hangi yanılgı tipi çözüldü" sorusuna kohort bazında cevap (bkz.
// 20260923130000_adaptive_evaluation_misconception_crossing.sql).
//
// 23 Eylül 2026 (aynı gün, akşam) GÜNCELLEMESİ: bu fonksiyon yazıldığında
// resolveAdaptiveLearningPolicy() standard kohortu fiilen izole etmiyordu.
// O boşluk artık kapatıldı (bkz. lib/adaptive-learning.ts ve migration
// 20260923140000). Bu satırlar artık GET handler'ında isolation_enforced=false
// olan standard kayıtları hariç tutulduktan SONRAKİ "temiz" örneklemle
// çağrılıyor. intervention_rate bu yüzden artık bir "beklenen confound"
// göstergesi değil, bir SAĞLIK KONTROLÜ: izolasyonun etkin olduğu standard
// kayıtlarında hâlâ müdahale görülüyorsa, bu izolasyon mekanizmasında bir
// sorun olduğuna işaret eder.
const MISCONCEPTION_MIN_SAMPLE = 30

function computeMisconceptionOutcomes(rows: any[]) {
  const eligible = rows.filter(row => Array.isArray(row.baseline_misconception_ids) && row.baseline_misconception_ids.length > 0 && row.day7_measured_at)
  const cohorts = ['adaptive', 'standard'].map(cohort => {
    const group = eligible.filter(row => row.cohort === cohort)
    const baselineTotal = group.reduce((sum, row) => sum + row.baseline_misconception_ids.length, 0)
    const resolvedTotal = group.reduce((sum, row) => sum + (row.day7_misconceptions_resolved ?? 0), 0)
    const withIntervention = group.filter(row => (row.day7_misconception_interventions ?? 0) > 0).length
    return {
      cohort,
      student_sample: group.length,
      baseline_misconception_total: baselineTotal,
      resolved_total: resolvedTotal,
      resolution_rate: baselineTotal ? Math.round(resolvedTotal / baselineTotal * 10000) / 100 : null,
      intervention_rate: group.length ? Math.round(withIntervention / group.length * 10000) / 100 : null,
    }
  })
  const interpretable = cohorts.every(row => row.student_sample >= MISCONCEPTION_MIN_SAMPLE)
  const standardRow = cohorts.find(row => row.cohort === 'standard')
  const standardLeak = (standardRow?.intervention_rate ?? 0) > 0
  return {
    cohorts,
    minimum_sample: MISCONCEPTION_MIN_SAMPLE,
    interpretable,
    excluded_row_count: rows.length - eligible.length,
    caveat: standardLeak
      ? "⚠️ İzolasyonun etkin olduğu (isolation_enforced=true) standard-kohort kayıtlarında hâlâ misconception_review müdahalesi görülüyor (intervention_rate > 0). Bu beklenmiyor — resolveAdaptiveLearningPolicy()'deki izolasyon kontrolünde bir sorun olabilir, incelenmeli."
      : null,
  }
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })

  const { data, error } = await db.from('adaptive_learning_evaluations').select('cohort,baseline_mastery,followup_mastery,baseline_retention,followup_retention,baseline_pct,followup_pct,observation_started_at,observation_ended_at,day1_mastery,day1_retention,day1_pct,day1_test_count,day1_completion_rate,day1_avg_duration_seconds,day1_measured_at,day7_mastery,day7_retention,day7_pct,day7_test_count,day7_completion_rate,day7_avg_duration_seconds,day7_measured_at,baseline_mastery_tier,baseline_recent_trend,baseline_learning_pace,baseline_misconception_ids,day7_misconceptions_resolved,day7_misconception_interventions,isolation_enforced').eq('sample_version', 'adaptive-learning-v3-pilot').order('created_at', { ascending: false }).limit(1000)
  if (error) return NextResponse.json({ error: 'Değerlendirme verisi alınamadı.' }, { status: 500 })

  const rows = data ?? []
  // 23 Eylül 2026 (akşam) — isolation_enforced=false olan standard-kohort
  // satırları (izolasyon düzeltmesinden önce, kısmen veya tamamen atanmış)
  // TÜM karşılaştırmalardan hariç tutuluyor: o dönemde bu öğrenciler
  // kişiselleştirme alabiliyordu, dolayısıyla "temiz standart kohort" değiller.
  // adaptive kayıtları bu filtreden etkilenmiyor.
  const cleanRows = rows.filter(row => row.cohort !== 'standard' || row.isolation_enforced !== false)
  const isolationExcludedCount = rows.length - cleanRows.length

  const overall = computeCohortReport(cleanRows)
  const segments = {
    baseline_mastery_tier: computeSegmentBreakdown(cleanRows, 'baseline_mastery_tier'),
    baseline_recent_trend: computeSegmentBreakdown(cleanRows, 'baseline_recent_trend'),
    baseline_learning_pace: computeSegmentBreakdown(cleanRows, 'baseline_learning_pace'),
  }
  const segmentedRowCount = cleanRows.filter(row => row.baseline_mastery_tier != null).length
  const misconceptionOutcomes = computeMisconceptionOutcomes(cleanRows)

  return NextResponse.json({
    sample_version: 'adaptive-learning-v3-pilot',
    ...overall,
    minimum_interpretation_sample: MINIMUM_SAMPLE,
    balance_tolerance: BALANCE_TOLERANCE,
    segments,
    segmented_row_count: segmentedRowCount,
    segment_note: segmentedRowCount < cleanRows.length
      ? `${cleanRows.length - segmentedRowCount} kayıt, segment alanları eklenmeden önce oluşturulduğu için segmentli kırılıma dahil değil (üst-seviye rapora dahil).`
      : null,
    misconception_outcomes: misconceptionOutcomes,
    isolation_excluded_row_count: isolationExcludedCount,
    isolation_note: isolationExcludedCount > 0
      ? `${isolationExcludedCount} standard-kohort kaydı, resolveAdaptiveLearningPolicy'nin standard kohortu fiilen izole eden düzeltmesinden (23 Eylül 2026 akşam) önce (kısmen veya tamamen) atandığı için TÜM karşılaştırmalardan hariç tutuldu — bu öğrenciler o dönemde kişiselleştirme alabiliyordu.`
      : null,
  })
}
