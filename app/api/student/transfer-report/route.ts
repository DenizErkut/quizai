import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/** Student-facing transfer and learning-impact report. It exposes aggregates only. */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: { user } } = await auth.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const [{ data: checks, error: checkError }, { data: events, error: eventError }] = await Promise.all([
    db.from('learning_transfer_checks').select('subject,grade,topic,learning_objective_code,transfer_result,completed_at')
      .eq('student_id', user.id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(500),
    db.from('learning_events').select('subject,topic,learning_objective_id,result,score,max_score,source_type,occurred_at')
      // Latest 1000 events only: the API caps a response at 1000 rows, so a larger limit would silently be 1000 anyway.
      .eq('student_id', user.id).neq('source_type', 'transfer_check').order('occurred_at', { ascending: false }).limit(1000),
  ])
  if (checkError || eventError) return NextResponse.json({ error: 'Transfer raporu alınamadı.' }, { status: 500 })

  type Bucket = { subject: string; grade: string | null; topic: string; objectiveCode: string | null; checks: number; independent: number; assisted: number; notTransferred: number; unanswered: number; baselineAttempts: number; baselineCorrect: number }
  const buckets = new Map<string, Bucket>()
  const get = (subject: string, topic: string, code: string | null, grade: string | null = null) => {
    const key = `${subject}::${topic}::${code ?? ''}`
    const current = buckets.get(key)
    if (current) return current
    const created = { subject, grade, topic, objectiveCode: code, checks: 0, independent: 0, assisted: 0, notTransferred: 0, unanswered: 0, baselineAttempts: 0, baselineCorrect: 0 }
    buckets.set(key, created); return created
  }
  for (const event of events ?? []) {
    const b = get(event.subject, event.topic, event.learning_objective_id)
    b.baselineAttempts++
    if (event.result === 'correct') b.baselineCorrect++
  }
  for (const check of checks ?? []) {
    const b = get(check.subject, check.topic, check.learning_objective_code, check.grade)
    b.checks++
    if (check.transfer_result === 'independent_success') b.independent++
    else if (check.transfer_result === 'assisted_success') b.assisted++
    else if (check.transfer_result === 'not_transferred') b.notTransferred++
    else b.unanswered++
  }
  const rows = [...buckets.values()].map(b => {
    const baselineRate = b.baselineAttempts ? Math.round(100 * b.baselineCorrect / b.baselineAttempts) : null
    const transferRate = b.checks ? Math.round(100 * (b.independent + b.assisted) / b.checks) : null
    const independentRate = b.checks ? Math.round(100 * b.independent / b.checks) : null
    return { ...b, baselineRate, transferRate, independentRate, impactDelta: baselineRate !== null && transferRate !== null ? transferRate - baselineRate : null }
  }).filter(b => b.checks > 0).sort((a, b) => (b.checks - a.checks) || ((b.transferRate ?? 0) - (a.transferRate ?? 0)))
  const totalChecks = rows.reduce((n, r) => n + r.checks, 0)
  const independent = rows.reduce((n, r) => n + r.independent, 0)
  const assisted = rows.reduce((n, r) => n + r.assisted, 0)
  return NextResponse.json({ generatedAt: new Date().toISOString(), summary: { checks: totalChecks, independent, assisted, transferRate: totalChecks ? Math.round(100 * (independent + assisted) / totalChecks) : null, independentRate: totalChecks ? Math.round(100 * independent / totalChecks) : null }, rows })
}
