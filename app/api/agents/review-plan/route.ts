import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** Returns expert-approved corrective content only; it never generates or publishes content. */
export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  const { data: weak } = await db.from('weak_topics').select('topic, wrong_count').eq('user_id', user.id).order('wrong_count', { ascending: false }).limit(5)
  if (!weak?.length) return NextResponse.json({ plan: [], agent: 'review-plan-v1', mode: 'approved_content_only' })
  const topics = weak.map((row: { topic: string }) => row.topic)
  const { data: catalog } = await db.from('misconception_catalog').select('id, subject, topic, label').eq('verification_status', 'verified').in('topic', topics).limit(20)
  const ids = (catalog ?? []).map((item: { id: string }) => item.id)
  const { data: contents } = ids.length
    ? await db.from('misconception_micro_contents').select('id, misconception_id, short_explanation, correction_strategy, worked_example, check_question, content_version').in('misconception_id', ids).eq('language', 'tr').eq('status', 'approved')
    : { data: [] }
  const plan = (contents ?? []).map((content: Record<string, unknown>) => {
    const item = (catalog ?? []).find((candidate: { id: string }) => candidate.id === content.misconception_id) as { subject?: string; topic?: string; label?: string } | undefined
    return { content_id: content.id, subject: item?.subject, topic: item?.topic, misconception: item?.label, content_version: content.content_version, short_explanation: content.short_explanation, correction_strategy: content.correction_strategy, worked_example: content.worked_example, check_question: content.check_question }
  }).slice(0, 5)
  await db.from('agent_decision_audit').insert({ actor_id: user.id, agent_name: 'review-plan-v1', policy_version: 'approved-content-only-v1', input_summary: { weak_topic_count: weak.length }, decision_summary: { selected_count: plan.length, topics: plan.map((item: { topic?: unknown }) => item.topic).filter(Boolean) } })
  return NextResponse.json({ plan, agent: 'review-plan-v1', mode: 'approved_content_only' })
}
