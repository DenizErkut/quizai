import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data, error } = await db.from('adaptive_learning_evaluations').select('cohort,baseline_mastery,followup_mastery,baseline_retention,followup_retention,baseline_pct,followup_pct,observation_started_at,observation_ended_at,day1_mastery,day1_retention,day1_pct,day1_test_count,day1_completion_rate,day1_avg_duration_seconds,day1_measured_at,day7_mastery,day7_retention,day7_pct,day7_test_count,day7_completion_rate,day7_avg_duration_seconds,day7_measured_at').eq('sample_version', 'adaptive-learning-v3-pilot').order('created_at', { ascending: false }).limit(1000)
  if (error) return NextResponse.json({ error: 'Değerlendirme verisi alınamadı.' }, { status: 500 })
  const cohorts = ['adaptive', 'standard'].map(cohort => {
    const assigned = (data ?? []).filter(row => row.cohort === cohort)
    const rows = assigned.filter(row => row.day7_measured_at && row.day7_mastery != null)
    const day1 = assigned.filter(row => row.day1_measured_at)
    const avgFrom = (source: any[], key: string) => { const values = source.map(row => Number(row[key])).filter(Number.isFinite); return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null }
    const gain = (followup: string, baseline: string) => avgFrom(rows, followup) !== null && avgFrom(rows, baseline) !== null ? Math.round((avgFrom(rows, followup)! - avgFrom(rows, baseline)!) * 100) / 100 : null
    return { cohort, assigned_sample: assigned.length, day1_sample: day1.length, completed_sample: rows.length, mastery_gain: gain('day7_mastery', 'baseline_mastery'), retention_gain: gain('day7_retention', 'baseline_retention'), pct_gain: gain('day7_pct', 'baseline_pct'), day1_retention: avgFrom(day1, 'day1_retention'), day7_retention: avgFrom(rows, 'day7_retention'), completion_rate: avgFrom(rows, 'day7_completion_rate'), avg_duration_seconds: avgFrom(rows, 'day7_avg_duration_seconds'), avg_test_count: avgFrom(rows, 'day7_test_count') }
  })
  const minimum = 30
  const counts = cohorts.map(row => row.completed_sample)
  const balanced = Math.min(...counts) > 0 && Math.max(...counts) / Math.min(...counts) <= 1.25
  const interpretable = cohorts.every(row => row.completed_sample >= minimum) && balanced
  const completed = (data ?? []).filter(row => row.day7_measured_at)
  const outcomeStatistics = [
    ['mastery', 'baseline_mastery', 'day7_mastery'],
    ['retention', 'baseline_retention', 'day7_retention'],
    ['test_pct', 'baseline_pct', 'day7_pct'],
  ].map(([metric, baseline, followup]) => {
    const gains = (cohort: string) => completed.filter(row => row.cohort === cohort && row[followup as keyof typeof row] != null && row[baseline as keyof typeof row] != null).map(row => Number(row[followup as keyof typeof row]) - Number(row[baseline as keyof typeof row])).filter(Number.isFinite)
    const adaptive = gains('adaptive'); const standard = gains('standard')
    const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
    const variance = (values: number[]) => values.length > 1 ? values.reduce((sum, value) => sum + (value - mean(values)) ** 2, 0) / (values.length - 1) : 0
    const difference = mean(adaptive) - mean(standard)
    const standardError = Math.sqrt(variance(adaptive) / Math.max(adaptive.length, 1) + variance(standard) / Math.max(standard.length, 1))
    const pooledSd = Math.sqrt(((adaptive.length - 1) * variance(adaptive) + (standard.length - 1) * variance(standard)) / Math.max(adaptive.length + standard.length - 2, 1))
    return { metric, difference: Math.round(difference * 100) / 100, effect_size: pooledSd > 0 ? Math.round(difference / pooledSd * 100) / 100 : null, confidence_interval_95: [Math.round((difference - 1.96 * standardError) * 100) / 100, Math.round((difference + 1.96 * standardError) * 100) / 100], classification: !interpretable ? 'insufficient_data' : difference > 0 ? 'adaptive_positive' : difference < 0 ? 'standard_positive' : 'neutral' }
  })
  const directMetric = (metric: string, key: string, lowerIsBetter = false) => {
    const values = (cohort: string) => completed.filter(row => row.cohort === cohort && row[key as keyof typeof row] != null).map(row => Number(row[key as keyof typeof row])).filter(Number.isFinite)
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
  return NextResponse.json({ sample_version: 'adaptive-learning-v3-pilot', cohorts, statistics, minimum_interpretation_sample: minimum, balance_tolerance: 0.25, balanced, interpretable, claim_status: statisticallyPositive ? 'supported_by_pilot' : interpretable ? 'not_demonstrated' : 'insufficient_data', claim_message: statisticallyPositive ? 'Pilot verileri adaptive grubun ana sonuçlarda daha iyi olduğunu destekliyor.' : interpretable ? 'Yeterli örneklem oluştu ancak adaptive yaklaşımın üstünlüğü henüz gösterilemedi.' : 'AI daha iyi öğretiyor iddiası için henüz yeterli ve dengeli veri yok.', interpretation_status: interpretable ? 'ready' : 'insufficient_or_unbalanced_sample' })
}
