import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { readAll } from '@/lib/paginate'
import { aiCostAlertConfigFromEnv, evaluateAiUsage, type AiUsageRow } from '@/lib/ai-cost-alert'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Günlük AI maliyeti / kullanıcı başına çağrı sayısı eşiği aşılırsa yöneticilere bildirim yazar (günde bir kez, aynı uyarı tekrarlanmaz).
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const now = new Date()
  const since = new Date(now.getTime() - 8 * 86_400_000).toISOString()
  const { data: rows, error } = await readAll(() => db.from('ai_usage_logs').select('id,created_at,provider,cost_usd,user_id').gte('created_at', since))
  if (error) {
    console.error('[ai-cost-alert] kullanım verisi okunamadı:', error.message)
    return NextResponse.json({ error: 'Kullanım verisi alınamadı.' }, { status: 500 })
  }
  const result = evaluateAiUsage(rows as AiUsageRow[], now, aiCostAlertConfigFromEnv())
  if (!result.alerts.length) return NextResponse.json({ alerted: 0, last24hUsd: Number(result.last24hUsd.toFixed(4)), baselineDailyUsd: Number(result.baselineDailyUsd.toFixed(4)) })

  const { data: admins } = await db.from('profiles').select('id').eq('is_admin', true).limit(100)
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0)
  const { data: existing } = await db.from('notifications').select('user_id,data').eq('type', 'system').gte('created_at', dayStart.toISOString()).limit(500)
  let sent = 0
  for (const alert of result.alerts) {
    for (const admin of admins ?? []) {
      const duplicate = (existing ?? []).some(row => row.user_id === admin.id && (row.data as { source?: string; key?: string })?.source === 'ai_cost' && (row.data as { key?: string })?.key === alert.key)
      if (duplicate) continue
      await db.from('notifications').insert({ user_id: admin.id, type: 'system', title: alert.title, body: alert.body, read: false, data: { source: 'ai_cost', key: alert.key } })
      sent++
    }
  }
  return NextResponse.json({ alerted: sent, alerts: result.alerts.map(alert => alert.key), last24hUsd: Number(result.last24hUsd.toFixed(4)) })
}
