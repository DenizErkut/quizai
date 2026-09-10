import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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
  const cohorts = ['adaptive', 'standard'].map(cohort => { const rows = (data ?? []).filter(row => row.cohort === cohort); const avg = (key: string) => { const values = rows.map(row => Number(row[key as keyof typeof row])).filter(Number.isFinite); return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null }; return { cohort, sample: rows.length, mastery_gain: avg('followup_mastery') !== null && avg('baseline_mastery') !== null ? Math.round((avg('followup_mastery')! - avg('baseline_mastery')!) * 100) / 100 : null, retention_gain: avg('followup_retention') !== null && avg('baseline_retention') !== null ? Math.round((avg('followup_retention')! - avg('baseline_retention')!) * 100) / 100 : null, pct_gain: avg('followup_pct') !== null && avg('baseline_pct') !== null ? Math.round((avg('followup_pct')! - avg('baseline_pct')!) * 100) / 100 : null } })
  return NextResponse.json({ sample_version: 'adaptive-learning-v3-pilot', cohorts, minimum_interpretation_sample: 30 })
}
