import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** Read-only progress agent. It summarizes evidence; it never recalculates or mutates mastery. */
export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [{ data: sessions }, { data: mastery }] = await Promise.all([
    db.from('quiz_sessions').select('pct, topic, created_at').eq('user_id', user.id).eq('completed', true).gte('created_at', since).order('created_at', { ascending: false }).limit(100),
    db.from('student_mastery').select('topic, mastery_score, retention_score').eq('student_id', user.id).order('mastery_score', { ascending: true }).limit(20),
  ])
  const rows = sessions ?? []
  const average = rows.length ? Math.round(rows.reduce((sum: number, row: { pct: number }) => sum + row.pct, 0) / rows.length) : null
  const topics = (mastery ?? []).slice(0, 5).map((row: { topic: string; mastery_score: number; retention_score: number | null }) => ({ topic: row.topic, mastery: row.mastery_score, retention: row.retention_score }))
  const summary = { period_days: 30, completed_tests: rows.length, average_pct: average, latest_topic: rows[0]?.topic ?? null, lowest_mastery_topics: topics }
  await db.from('agent_decision_audit').insert({ actor_id: user.id, agent_name: 'progress-summary-v1', policy_version: 'read-only-summary-v1', input_summary: { period_days: 30, session_count: rows.length }, decision_summary: { average_pct: average, topic_count: topics.length } })
  return NextResponse.json({ summary, agent: 'progress-summary-v1', mode: 'read_only' })
}
