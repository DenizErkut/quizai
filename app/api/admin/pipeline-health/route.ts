import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const dbProbeStarted = Date.now()
  const [usageResult, sessionResult, eventResult, bankEventResult, dbProbe] = await Promise.all([
    db.from('ai_usage_logs').select('duration_ms,user_id,quiz_session_id,cost_usd,created_at,operation,provider,model').gte('created_at', since).limit(30000),
    db.from('quiz_sessions').select('id,user_id,topic,question_count,completed,created_at,gen_engine').gte('created_at', since).limit(30000),
    db.from('learning_events').select('source_id,created_at').gte('created_at', since).limit(30000),
    db.from('question_bank_events').select('topic_key,requested_count,bank_count,ai_count,outcome,created_at').gte('created_at', since).limit(30000),
    db.from('profiles').select('id', { count: 'exact', head: true }),
  ])
  const errors = [usageResult.error, sessionResult.error, eventResult.error, bankEventResult.error].filter(Boolean)
  if (errors.length) return NextResponse.json({ error: 'Pipeline ölçümleri alınamadı.' }, { status: 500 })

  const usage = usageResult.data ?? []
  const sessions = sessionResult.data ?? []
  const events = eventResult.data ?? []
  const bankEvents = bankEventResult.data ?? []
  const dbProbeMs = Date.now() - dbProbeStarted
  const durations = usage.map(row => Number(row.duration_ms)).filter(Number.isFinite).sort((a, b) => a - b)
  const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : null
  const completed = sessions.filter(row => row.completed)
  const eventSources = new Set(events.map(row => row.source_id))
  const covered = completed.filter(row => eventSources.has(row.id)).length
  const coverage = completed.length ? covered / completed.length : null
  const missingContext = usage.filter(row => !row.user_id && !row.quiz_session_id).length
  const sessionById = new Map(sessions.map(row => [row.id, row]))
  const linkedUsage = usage.filter(row => row.quiz_session_id && sessionById.has(row.quiz_session_id))
  const totalCost = linkedUsage.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0)
  const platformCost = usage.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0)
  const activeStudents = new Set(sessions.map(row => row.user_id).filter(Boolean)).size
  const topicCosts = new Map<string, { cost: number; calls: number; tests: Set<string> }>()
  for (const row of linkedUsage) {
    const session = row.quiz_session_id ? sessionById.get(row.quiz_session_id) : null
    const topic = session?.topic || 'Bağlamsız'
    const item = topicCosts.get(topic) || { cost: 0, calls: 0, tests: new Set<string>() }
    item.cost += Number(row.cost_usd || 0); item.calls += 1
    if (row.quiz_session_id) item.tests.add(row.quiz_session_id)
    topicCosts.set(topic, item)
  }
  const costByTopic = [...topicCosts.entries()].map(([topic, item]) => ({ topic, cost_usd: item.cost, calls: item.calls, tests: item.tests.size, cost_per_test_usd: item.tests.size ? item.cost / item.tests.size : null })).sort((a, b) => b.cost_usd - a.cost_usd).slice(0, 20)
  // Faz F (Pratium Koç) — costByTopic sadece bir quiz_session'a
  // bağlanabilen çağrıları görüyor; koç mesajları (coach-chat,
  // coach-chat-opening, coach-proactive-nudge) hiçbir zaman bir
  // quiz_session_id taşımadığından orada tamamen görünmezdi (sadece
  // toplam platformCost'a karışıyordu). operation bazında ayrı bir kırılım,
  // koçun toplam AI maliyetindeki payını ilk kez görünür kılıyor.
  const opCosts = new Map<string, { cost: number; calls: number }>()
  for (const row of usage) {
    const op = row.operation || 'bilinmiyor'
    const item = opCosts.get(op) || { cost: 0, calls: 0 }
    item.cost += Number(row.cost_usd || 0); item.calls += 1
    opCosts.set(op, item)
  }
  const costByOperation = [...opCosts.entries()].map(([operation, item]) => ({ operation, cost_usd: item.cost, calls: item.calls, cost_per_call_usd: item.calls ? item.cost / item.calls : null })).sort((a, b) => b.cost_usd - a.cost_usd)
  const coachOps = costByOperation.filter(row => row.operation.startsWith('coach-'))
  const coachCost = coachOps.reduce((sum, row) => sum + row.cost_usd, 0)
  const coachCalls = coachOps.reduce((sum, row) => sum + row.calls, 0)
  const bankRequested = bankEvents.reduce((sum, row) => sum + Number(row.requested_count || 0), 0)
  const bankServed = bankEvents.reduce((sum, row) => sum + Number(row.bank_count || 0), 0)
  const alerts = [
    p95 !== null && p95 > 30000 ? { code: 'AI_LATENCY_P95', severity: 'high', message: `AI p95 gecikmesi ${Math.round(p95 / 1000)} sn.` } : null,
    coverage !== null && coverage < 0.95 ? { code: 'LEARNING_EVENT_COVERAGE', severity: 'high', message: `Learning Event kapsaması %${Math.round(coverage * 100)}.` } : null,
    usage.length > 0 && missingContext / usage.length > 0.05 ? { code: 'AI_CONTEXT_GAP', severity: 'medium', message: `AI kayıtlarının %${Math.round(missingContext / usage.length * 100)} bölümünde kullanıcı/oturum bağlamı yok.` } : null,
    dbProbe.error ? { code: 'DB_CONNECTION_ERROR', severity: 'high', message: 'Supabase bağlantı sağlık kontrolü başarısız.' } : null,
    dbProbeMs > 2000 ? { code: 'DB_CONNECTION_LATENCY', severity: 'high', message: `Supabase sağlık sorgusu ${Math.round(dbProbeMs)} ms sürdü.` } : null,
  ].filter(Boolean)

  return NextResponse.json({ period_hours: 720, generated_at: new Date().toISOString(), ai: { calls: linkedUsage.length, p95_duration_ms: p95, cost_usd: totalCost, platform_cost_usd: platformCost, missing_context: missingContext, cost_per_test_usd: sessions.length ? totalCost / sessions.length : null, cost_per_student_usd: activeStudents ? totalCost / activeStudents : null, projected_cost_per_1000_tests_usd: sessions.length ? totalCost / sessions.length * 1000 : null, by_topic: costByTopic, by_operation: costByOperation.slice(0, 15), coach: { cost_usd: coachCost, calls: coachCalls, share_of_platform: platformCost > 0 ? coachCost / platformCost : null } }, database: { probe_ms: dbProbeMs, healthy: !dbProbe.error }, question_bank: { observed_requests: bankEvents.length, full_hits: bankEvents.filter(row => row.outcome === 'full').length, partial_hits: bankEvents.filter(row => row.outcome === 'partial').length, misses: bankEvents.filter(row => row.outcome === 'miss').length, served_questions: bankServed, requested_questions: bankRequested, question_hit_rate: bankRequested ? bankServed / bankRequested : null }, learning: { completed_sessions: completed.length, covered_sessions: covered, event_count: events.length, coverage_rate: coverage }, alerts })
}

