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
  const { data, error } = await db.from('adaptive_learning_evaluations').select('cohort,baseline_mastery,followup_mastery,baseline_retention,followup_retention,baseline_pct,followup_pct,observation_started_at,observation_ended_at').order('created_at', { ascending: false }).limit(1000)
  if (error) return NextResponse.json({ error: 'Değerlendirme verisi alınamadı.' }, { status: 500 })
  const cohorts = ['adaptive', 'standard'].map(cohort => {
    const assigned = (data ?? []).filter(row => row.cohort === cohort)
    const rows = assigned.filter(row => row.observation_ended_at && row.followup_mastery != null)
    const avg = (key: string) => { const values = rows.map(row => Number(row[key as keyof typeof row])).filter(Number.isFinite); return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null }
    const gain = (followup: string, baseline: string) => avg(followup) !== null && avg(baseline) !== null ? Math.round((avg(followup)! - avg(baseline)!) * 100) / 100 : null
    return { cohort, assigned_sample: assigned.length, completed_sample: rows.length, mastery_gain: gain('followup_mastery', 'baseline_mastery'), retention_gain: gain('followup_retention', 'baseline_retention'), pct_gain: gain('followup_pct', 'baseline_pct') }
  })
  const minimum = 30
  const counts = cohorts.map(row => row.completed_sample)
  const balanced = Math.min(...counts) > 0 && Math.max(...counts) / Math.min(...counts) <= 1.25
  const interpretable = cohorts.every(row => row.completed_sample >= minimum) && balanced
  const completed = (data ?? []).filter(row => row.observation_ended_at)
  const statistics = [
    ['mastery', 'baseline_mastery', 'followup_mastery'],
    ['retention', 'baseline_retention', 'followup_retention'],
    ['test_pct', 'baseline_pct', 'followup_pct'],
  ].map(([metric, baseline, followup]) => {
    const gains = (cohort: string) => completed.filter(row => row.cohort === cohort).map(row => Number(row[followup as keyof typeof row]) - Number(row[baseline as keyof typeof row])).filter(Number.isFinite)
    const adaptive = gains('adaptive'); const standard = gains('standard')
    const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
    const variance = (values: number[]) => values.length > 1 ? values.reduce((sum, value) => sum + (value - mean(values)) ** 2, 0) / (values.length - 1) : 0
    const difference = mean(adaptive) - mean(standard)
    const standardError = Math.sqrt(variance(adaptive) / Math.max(adaptive.length, 1) + variance(standard) / Math.max(standard.length, 1))
    const pooledSd = Math.sqrt(((adaptive.length - 1) * variance(adaptive) + (standard.length - 1) * variance(standard)) / Math.max(adaptive.length + standard.length - 2, 1))
    return { metric, difference: Math.round(difference * 100) / 100, effect_size: pooledSd > 0 ? Math.round(difference / pooledSd * 100) / 100 : null, confidence_interval_95: [Math.round((difference - 1.96 * standardError) * 100) / 100, Math.round((difference + 1.96 * standardError) * 100) / 100], classification: !interpretable ? 'insufficient_data' : difference > 0 ? 'adaptive_positive' : difference < 0 ? 'standard_positive' : 'neutral' }
  })
  return NextResponse.json({ sample_version: 'adaptive-learning-v3-pilot', cohorts, statistics, minimum_interpretation_sample: minimum, balance_tolerance: 0.25, balanced, interpretable, interpretation_status: interpretable ? 'ready' : 'insufficient_or_unbalanced_sample' })
}
