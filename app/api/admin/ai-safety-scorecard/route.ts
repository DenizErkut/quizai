import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { buildScorecard, type ApprovalRow, type AuditRow, type TransferRow } from '@/lib/safety-scorecard'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [audits, approvals, transfers] = await Promise.all([
    db.from('agent_decision_audit').select('agent_name,policy_version,decision_summary,created_at').gte('created_at', since).limit(5000),
    db.from('agent_action_approval_queue').select('status,created_at').gte('created_at', since).limit(2000),
    db.from('learning_transfer_checks').select('status,transfer_result,created_at').gte('created_at', since).limit(5000),
  ])
  if (audits.error || approvals.error || transfers.error) return NextResponse.json({ error: 'Safety Scorecard verisi alınamadı.' }, { status: 500 })
  return NextResponse.json(buildScorecard({
    periodDays: 30,
    audits: (audits.data ?? []) as AuditRow[],
    approvals: (approvals.data ?? []) as ApprovalRow[],
    transfers: (transfers.data ?? []) as TransferRow[],
  }))
}
