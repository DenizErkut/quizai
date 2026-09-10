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

  const { data: snapshots, error: snapshotError } = await db.from('learning_risk_snapshots').select('id,student_id,subject,topic,risk_score,risk_level,observed_at').order('observed_at', { ascending: false }).limit(10000)
  if (snapshotError) return NextResponse.json({ error: 'Risk snapshot verisi alınamadı.' }, { status: 500 })
  const ids = [...new Set((snapshots ?? []).map(row => row.student_id))]
  const earliestSnapshot = snapshots?.reduce((earliest, row) => Math.min(earliest, new Date(row.observed_at).getTime()), Date.now()) ?? Date.now()
  const { data: events, error: eventError } = ids.length
    ? await db.from('learning_events').select('student_id,subject,topic,score,max_score,occurred_at').in('student_id', ids).gte('occurred_at', new Date(earliestSnapshot).toISOString()).limit(20000)
    : { data: [], error: null }
  if (eventError) return NextResponse.json({ error: 'Takip olayları alınamadı.' }, { status: 500 })

  const evaluated = (snapshots ?? []).map(snapshot => {
    const end = new Date(new Date(snapshot.observed_at).getTime() + 14 * 86_400_000)
    const followup = (events ?? []).filter(event => event.student_id === snapshot.student_id && event.subject === snapshot.subject && event.topic === snapshot.topic && new Date(event.occurred_at) > new Date(snapshot.observed_at) && new Date(event.occurred_at) <= end).sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime())[0]
    const actual = followup && Number(followup.max_score) > 0 ? Math.round(Number(followup.score) / Number(followup.max_score) * 100) : null
    return { ...snapshot, actual_score_pct: actual, outcome: actual === null ? 'pending' : actual < 70 ? 'at_risk' : 'recovered' }
  })
  const completed = evaluated.filter(row => row.outcome !== 'pending')
  const byLevel = (level: 'medium' | 'high') => {
    const rows = completed.filter(row => row.risk_level === level)
    return { level, sample_size: rows.length, hits: rows.filter(row => row.outcome === 'at_risk').length, false_positives: rows.filter(row => row.outcome === 'recovered').length, precision_pct: rows.length ? Math.round(rows.filter(row => row.outcome === 'at_risk').length / rows.length * 100) : null }
  }
  const summary = ['medium', 'high'].map(level => byLevel(level as 'medium' | 'high'))
  return NextResponse.json({ policy_version: 'predictive-learning-v1', followup_window_days: 14, snapshot_count: evaluated.length, completed_count: completed.length, pending_count: evaluated.length - completed.length, summary, recent: evaluated.slice(0, 50) })
}
