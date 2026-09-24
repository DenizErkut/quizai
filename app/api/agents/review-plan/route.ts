import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { requireAgentCapability, requireOwnStudentScope, writeAgentDecisionAudit } from '@/lib/agent-security-policy'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** Returns expert-approved corrective content only; it never generates or publishes content. */
export async function GET(req: NextRequest) {
  const agent = 'review-plan-v1' as const
  requireAgentCapability(agent, 'read_approved_content')
  requireAgentCapability(agent, 'return_user_facing_output')
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  requireOwnStudentScope(agent, user.id, user.id)

  const { data: weak, error: weakError } = await db.from('weak_topics').select('topic, wrong_count').eq('user_id', user.id).order('wrong_count', { ascending: false }).limit(5)
  if (weakError) return NextResponse.json({ error: 'Tekrar planı alınamadı.' }, { status: 500 })
  if (!weak?.length) {
    try {
      await writeAgentDecisionAudit(db, { actor_id: user.id, agent_name: agent, policy_version: 'approved-content-only-v2', input_summary: { weak_topic_count: 0 }, decision_summary: { selected_count: 0 } })
    } catch {
      return NextResponse.json({ error: 'Karar güvenlik kaydına yazılamadığı için plan gösterilmedi.' }, { status: 503 })
    }
    return NextResponse.json({ plan: [], agent, mode: 'approved_content_only' })
  }
  const topics = weak.map((row: { topic: string }) => row.topic)
  const { data: catalog, error: catalogError } = await db.from('misconception_catalog').select('id, subject, topic, label').eq('verification_status', 'verified').in('topic', topics).limit(20)
  if (catalogError) return NextResponse.json({ error: 'Onaylı tekrar içeriği alınamadı.' }, { status: 500 })
  const ids = (catalog ?? []).map((item: { id: string }) => item.id)
  const { data: contents, error: contentsError } = ids.length
    ? await db.from('misconception_micro_contents').select('id, misconception_id, short_explanation, correction_strategy, worked_example, check_question, content_version').in('misconception_id', ids).eq('language', 'tr').eq('status', 'approved')
    : { data: [], error: null }
  if (contentsError) return NextResponse.json({ error: 'Onaylı tekrar içeriği alınamadı.' }, { status: 500 })
  const plan = (contents ?? []).map((content: Record<string, unknown>) => {
    const item = (catalog ?? []).find((candidate: { id: string }) => candidate.id === content.misconception_id) as { subject?: string; topic?: string; label?: string } | undefined
    return { content_id: content.id, subject: item?.subject, topic: item?.topic, misconception: item?.label, content_version: content.content_version, short_explanation: content.short_explanation, correction_strategy: content.correction_strategy, worked_example: content.worked_example, check_question: content.check_question }
  }).slice(0, 5)
  try {
    await writeAgentDecisionAudit(db, { actor_id: user.id, agent_name: agent, policy_version: 'approved-content-only-v2', input_summary: { weak_topic_count: weak.length }, decision_summary: { selected_count: plan.length, topics: plan.map((item: { topic?: unknown }) => item.topic).filter(Boolean) } })
  } catch {
    return NextResponse.json({ error: 'Karar güvenlik kaydına yazılamadığı için plan gösterilmedi.' }, { status: 503 })
  }
  return NextResponse.json({ plan, agent: 'review-plan-v1', mode: 'approved_content_only' })
}
