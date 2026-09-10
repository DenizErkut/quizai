import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [usageResult, sessionResult, eventResult] = await Promise.all([
    db.from('ai_usage_logs').select('duration_ms,user_id,quiz_session_id,cost_usd,created_at').gte('created_at', since).limit(10000),
    db.from('quiz_sessions').select('id,question_count,completed,created_at').gte('created_at', since).limit(10000),
    db.from('learning_events').select('source_id,created_at').gte('created_at', since).limit(30000),
  ])
  const errors = [usageResult.error, sessionResult.error, eventResult.error].filter(Boolean)
  if (errors.length) return NextResponse.json({ error: 'Pipeline ölçümleri alınamadı.' }, { status: 500 })

  const usage = usageResult.data ?? []
  const sessions = sessionResult.data ?? []
  const events = eventResult.data ?? []
  const durations = usage.map(row => Number(row.duration_ms)).filter(Number.isFinite).sort((a, b) => a - b)
  const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : null
  const completed = sessions.filter(row => row.completed)
  const eventSources = new Set(events.map(row => row.source_id))
  const covered = completed.filter(row => eventSources.has(row.id)).length
  const coverage = completed.length ? covered / completed.length : null
  const missingContext = usage.filter(row => !row.user_id && !row.quiz_session_id).length
  const alerts = [
    p95 !== null && p95 > 30000 ? { code: 'AI_LATENCY_P95', severity: 'high', message: `AI p95 gecikmesi ${Math.round(p95 / 1000)} sn.` } : null,
    coverage !== null && coverage < 0.95 ? { code: 'LEARNING_EVENT_COVERAGE', severity: 'high', message: `Learning Event kapsaması %${Math.round(coverage * 100)}.` } : null,
    usage.length > 0 && missingContext / usage.length > 0.05 ? { code: 'AI_CONTEXT_GAP', severity: 'medium', message: `AI kayıtlarının %${Math.round(missingContext / usage.length * 100)} bölümünde kullanıcı/oturum bağlamı yok.` } : null,
  ].filter(Boolean)

  return NextResponse.json({ period_hours: 24, generated_at: new Date().toISOString(), ai: { calls: usage.length, p95_duration_ms: p95, cost_usd: usage.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0), missing_context: missingContext }, learning: { completed_sessions: completed.length, covered_sessions: covered, event_count: events.length, coverage_rate: coverage }, alerts })
}

