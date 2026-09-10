import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data: rows, error } = await db.from('agent_decision_audit').select('agent_name,decision_summary').gte('created_at', since).limit(1000)
  if (error) return NextResponse.json({ error: 'Ajan kalite verisi alınamadı.' }, { status: 500 })
  const counts = new Map<string, { calls: number; empty: number }>()
  for (const row of rows ?? []) {
    const item = counts.get(row.agent_name) ?? { calls: 0, empty: 0 }
    item.calls++
    if (Number((row.decision_summary as { selected_count?: unknown })?.selected_count ?? 0) === 0) item.empty++
    counts.set(row.agent_name, item)
  }
  const alerts = [...counts.entries()].filter(([, item]) => item.calls > 0 && item.empty / item.calls >= 0.5).map(([agent, item]) => ({ agent, rate: item.empty / item.calls }))
  if (!alerts.length) return NextResponse.json({ alerted: 0, alerts: [] })
  const { data: admins } = await db.from('profiles').select('id').eq('is_admin', true).limit(100)
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0)
  const { data: existing } = await db.from('notifications').select('user_id,data').eq('type', 'system').gte('created_at', dayStart.toISOString()).limit(500)
  let sent = 0
  for (const alert of alerts) {
    for (const admin of admins ?? []) {
      const duplicate = (existing ?? []).some(row => row.user_id === admin.id && (row.data as { source?: string; agent?: string })?.source === 'agent_quality' && (row.data as { agent?: string })?.agent === alert.agent)
      if (duplicate) continue
      await db.from('notifications').insert({ user_id: admin.id, type: 'system', title: '⚠️ Ajan kalite alarmı', body: `${alert.agent} ajanında son 7 günde boş karar oranı %${Math.round(alert.rate * 100)} seviyesinde.`, read: false, data: { source: 'agent_quality', agent: alert.agent, rate: alert.rate } })
      sent++
    }
  }
  return NextResponse.json({ alerted: sent, alerts })
}
