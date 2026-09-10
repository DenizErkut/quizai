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

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data, error } = await db.from('agent_decision_audit').select('agent_name, policy_version, decision_summary, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(1000)
  if (error) return NextResponse.json({ error: 'Kalite verisi alınamadı.' }, { status: 500 })
  const rows = data ?? []
  const byAgent: Record<string, { calls: number; emptyDecisions: number; policyVersions: string[] }> = {}
  for (const row of rows) {
    const item = byAgent[row.agent_name] ?? { calls: 0, emptyDecisions: 0, policyVersions: [] }
    item.calls += 1
    if (Number((row.decision_summary as { selected_count?: unknown })?.selected_count ?? 0) === 0) item.emptyDecisions += 1
    if (!item.policyVersions.includes(row.policy_version)) item.policyVersions.push(row.policy_version)
    byAgent[row.agent_name] = item
  }
  const alert_thresholds = { empty_decision_rate: 0.5, max_calls: 1000 }
  const alerts = Object.entries(byAgent)
    .filter(([, item]) => item.calls > 0 && item.emptyDecisions / item.calls >= alert_thresholds.empty_decision_rate)
    .map(([agent_name, item]) => ({ agent_name, type: 'empty_decision_rate', rate: item.emptyDecisions / item.calls, severity: 'high' }))
  if (rows.length >= alert_thresholds.max_calls) alerts.push({ agent_name: 'all', type: 'volume', rate: rows.length, severity: 'medium' })
  return NextResponse.json({ period_days: 7, total_calls: rows.length, agents: byAgent, alerts, alert_thresholds })
}
