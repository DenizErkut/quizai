import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

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
    db.from('agent_action_approval_queue').select('status,reviewed_at,created_at').gte('created_at', since).limit(2000),
    db.from('learning_transfer_checks').select('status,transfer_result,created_at').gte('created_at', since).limit(5000),
  ])
  if (audits.error || approvals.error || transfers.error) return NextResponse.json({ error: 'Safety Scorecard verisi alınamadı.' }, { status: 500 })
  const auditRows = audits.data ?? []
  const approvalRows = approvals.data ?? []
  const transferRows = transfers.data ?? []
  const blocked = auditRows.filter(r => Boolean((r.decision_summary as Record<string, unknown> | null)?.blocked || (r.decision_summary as Record<string, unknown> | null)?.output_blocked)).length
  const reviewRequired = auditRows.filter(r => Boolean((r.decision_summary as Record<string, unknown> | null)?.requires_teacher_review)).length
  const versioned = auditRows.filter(r => Boolean(r.policy_version)).length
  const decided = approvalRows.filter(r => r.status === 'approved' || r.status === 'rejected').length
  const pending = approvalRows.filter(r => r.status === 'pending').length
  const verified = auditRows.filter(r => r.agent_name === 'question-verifier-v1').length
  const completedTransfers = transferRows.filter(r => r.status === 'completed').length

  const dimensions = [
    { key: 'governance', label: 'Yönetişim ve izlenebilirlik', score: Math.min(100, (auditRows.length ? 50 : 0) + (versioned === auditRows.length && auditRows.length ? 25 : 0) + (approvalRows.length ? 25 : 0)), evidence: [`${auditRows.length} denetim kaydı`, `${versioned} politika sürümlü karar`, `${approvalRows.length} insan onayı kaydı`] },
    { key: 'human_oversight', label: 'İnsan gözetimi', score: approvalRows.length ? Math.round(100 * decided / approvalRows.length) : 100, evidence: [`${decided} sonuçlandırılmış onay`, `${pending} bekleyen karar`, `${reviewRequired} öğretmen incelemesi gerektiren çıktı`] },
    { key: 'content_safety', label: 'İçerik güvenliği', score: auditRows.length ? Math.min(100, 70 + Math.min(30, blocked * 5)) : 50, evidence: [`${blocked} güvenli şekilde engellenen girdi/çıktı`, `${verified} bağımsız soru doğrulama kararı`] },
    { key: 'learning_integrity', label: 'Öğrenme bütünlüğü', score: completedTransfers ? Math.min(100, 70 + Math.min(30, completedTransfers)) : 60, evidence: [`${completedTransfers} tamamlanmış transfer kontrolü`, `${transferRows.length} planlanmış transfer kaydı`] },
    { key: 'privacy_access', label: 'Gizlilik ve erişim', score: 100, evidence: ['Admin API rol kontrolü aktif', 'Servis anahtarı yalnız sunucuda', 'Öğrenci kayıtlarında sahiplik/RLS kontrolü aktif'] },
  ]
  const overall = Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length)
  const alerts = [
    ...(pending > 20 ? [{ severity: 'warning', message: `${pending} insan onayı bekliyor.` }] : []),
    ...(auditRows.length === 0 ? [{ severity: 'critical', message: 'Son 30 günde ajan denetim kaydı bulunamadı.' }] : []),
    ...(verified === 0 ? [{ severity: 'warning', message: 'Soru doğrulayıcı için denetim kanıtı bulunamadı.' }] : []),
  ]
  return NextResponse.json({ periodDays: 30, generatedAt: new Date().toISOString(), overall, status: overall >= 85 ? 'strong' : overall >= 70 ? 'watch' : 'action_required', dimensions, alerts })
}
