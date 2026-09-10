import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function authenticatedUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await db.auth.getUser(token)
  return error ? null : data.user
}

export async function GET(req: NextRequest) {
  const user = await authenticatedUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data, error } = await db.rpc('get_student_recommendations_priority_v2', {
    p_student_id: user.id, p_time_budget_minutes: null, p_next_exam_at: null,
  })

  if (error) return NextResponse.json({ error: 'Öneriler alınamadı.' }, { status: 500 })
  const ranked = (data ?? []) as { id:string }[]
  const { data: baseline } = await db.from('student_recommendations').select('id').eq('student_id', user.id).in('status', ['active','accepted','deferred']).gt('valid_until', new Date().toISOString()).order('priority_score', { ascending:false }).order('generated_at', { ascending:false }).limit(10)
  const baselineIds=(baseline??[]).map(row=>row.id);const rankedIds=ranked.map(row=>row.id);const topAgreement=Boolean(baselineIds[0]&&baselineIds[0]===rankedIds[0]);const overlap=baselineIds.length&&rankedIds.length?rankedIds.slice(0,5).filter(id=>baselineIds.slice(0,5).includes(id)).length/Math.min(5,baselineIds.length,rankedIds.length):null
  await db.from('agent_decision_audit').insert({actor_id:user.id,agent_name:'recommendation-shadow-v1',policy_version:'baseline-v1-vs-priority-v2',input_summary:{baseline_count:baselineIds.length,v2_count:rankedIds.length},decision_summary:{top_agreement:topAgreement,top5_overlap:overlap,baseline_top_id:baselineIds[0]??null,v2_top_id:rankedIds[0]??null}})
  return NextResponse.json({ recommendations: ranked.slice(0, 5), ranking_version: 'recommendation-priority-v2' })
}

export async function POST(req: NextRequest) {
  const user = await authenticatedUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const action = body?.action
  if (!body?.recommendationId || !['accept', 'defer', 'dismiss', 'complete', 'resume'].includes(action)) {
    return NextResponse.json({ error: 'Geçersiz öneri işlemi.' }, { status: 400 })
  }

  const deferredUntil = action === 'defer'
    ? new Date(Date.now() + Math.min(Math.max(Number(body.deferDays) || 1, 1), 30) * 86_400_000).toISOString()
    : null
  const { data, error } = await db.rpc('transition_student_recommendation_v2', {
    p_recommendation_id: body.recommendationId,
    p_student_id: user.id,
    p_action: action,
    p_reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null,
    p_deferred_until: deferredUntil,
  })

  if (error) {
    const known = error.message.includes('recommendation_not_found') ? 404 : 409
    return NextResponse.json({ error: known === 404 ? 'Öneri bulunamadı.' : 'Bu işlem artık uygulanamıyor.' }, { status: known })
  }
  return NextResponse.json({ recommendation: Array.isArray(data) ? data[0] : data })
}
