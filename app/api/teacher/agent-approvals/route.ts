import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { authorizedReviewTeacher } from '@/lib/intervention-review'
import { loadCyclesMetrics } from '@/lib/load-verified-learning-metrics'
import { ACTION_UUID, TEACHER_ACTION_LINK_POLICY, actionFollowup, canLinkActionCycle,
  proposalObjectiveId, type ActionProposal, type ActionCycle } from '@/lib/teacher-action-workbench'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const columns = 'id,teacher_id,student_id,classroom_id,agent_name,policy_version,proposed_action,title,rationale,evidence,status,created_at,reviewed_at,review_note'
export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

async function context(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return null
  const { data: teacher, error: teacherError } = await db.from('teachers').select('id,approved').eq('user_id', user.id).maybeSingle()
  if (teacherError) throw teacherError
  return teacher?.approved ? { user, teacher } : null
}

async function scopedProposal(id: string, userId: string, teacherId: string) {
  const { data, error } = await db.from('agent_action_approval_queue').select(columns).eq('id', id).eq('teacher_id', teacherId).maybeSingle()
  if (error) throw error
  if (!data?.classroom_id || await authorizedReviewTeacher(db, userId, data.classroom_id, data.student_id) !== teacherId) return null
  return data as ActionProposal
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await context(req)
    if (!ctx) return json({ error: 'Yetkisiz.' }, 403)
    const status = req.nextUrl.searchParams.get('status') || 'pending'
    if (!['pending', 'approved', 'rejected', 'all'].includes(status)) return json({ error: 'Geçersiz durum.' }, 400)
    const { data: classes, error: classError } = await db.from('classrooms').select('id').eq('teacher_id', ctx.teacher.id)
    if (classError) throw classError
    if (!classes?.length) return json({ items: [], hasMore: false })
    // Stale proposals must not expose former classroom members.
    const { data: members, error: memberError } = await db.from('classroom_students').select('classroom_id,student_id').in('classroom_id', classes.map(c => c.id))
    if (memberError) throw memberError
    const scope = new Set((members || []).map(m => `${m.classroom_id}:${m.student_id}`))
    let query = db.from('agent_action_approval_queue').select(columns).eq('teacher_id', ctx.teacher.id)
      .in('classroom_id', classes.map(c => c.id)).order('created_at', { ascending: false }).order('id', { ascending: false })
    if (status !== 'all') query = query.eq('status', status)
    const { data, error } = await query.limit(101)
    if (error) throw error
    const items = (data || []).filter(row => scope.has(`${row.classroom_id}:${row.student_id}`)).slice(0, 100) as ActionProposal[]
    const { data: links, error: linkError } = items.length ? await db.from('agent_decision_audit')
      .select('id,input_summary,created_at').eq('actor_id', ctx.user.id).eq('agent_name', TEACHER_ACTION_LINK_POLICY)
      .eq('policy_version', TEACHER_ACTION_LINK_POLICY).in('input_summary->>approval_id', items.map(i => i.id))
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(501) : { data: [], error: null }
    if (linkError || links?.length === 501) throw new Error('Takip kayıtları alınamadı.')
    const cycleIds = [...new Set((links || []).map(link => link.input_summary?.cycle_id).filter(id => typeof id === 'string' && ACTION_UUID.test(id)))] as string[]
    const { data: cycles, error: cycleError } = cycleIds.length ? await db.from('verified_learning_cycles')
      .select('id,teacher_id,student_id,classroom_id,learning_objective_id,created_at,status').eq('teacher_id', ctx.teacher.id).in('id', cycleIds)
      : { data: [], error: null }
    if (cycleError) throw cycleError
    const linkedCycles = new Map<string, ActionCycle>()
    for (const item of items) {
      const link = links?.find(l => l.input_summary?.approval_id === item.id
        && l.input_summary?.student_id === item.student_id && l.input_summary?.classroom_id === item.classroom_id)
      const cycle = cycles?.find(c => c.id === link?.input_summary?.cycle_id) as ActionCycle | undefined
      if (cycle && canLinkActionCycle(item, cycle, ctx.teacher.id)) linkedCycles.set(item.id, cycle)
    }
    const uniqueCycles = [...new Map([...linkedCycles.values()].map(c => [c.id, c])).values()]
    const metrics = await loadCyclesMetrics(db, uniqueCycles)
    const byCycle = new Map(uniqueCycles.map((cycle, index) => [cycle.id, metrics[index]]))
    const results = items.map(item => {
      const cycle = linkedCycles.get(item.id)
      const followup = cycle ? actionFollowup(cycle, byCycle.get(cycle.id)!) : null
      const publicItem = { ...item }
      delete publicItem.teacher_id
      return { ...publicItem, objectiveId: proposalObjectiveId(item), followup }
    })
    return json({ items: results, hasMore: (data || []).length > 100 })
  } catch { return json({ error: 'Öneriler ve takip kayıtları alınamadı.' }, 503) }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await context(req)
    if (!ctx) return json({ error: 'Yetkisiz.' }, 403)
    const body = await req.json().catch(() => null)
    const note = typeof body?.note === 'string' ? body.note.trim() : ''
    if (!ACTION_UUID.test(body?.id || '') || !['approved', 'rejected'].includes(body?.status) || note.length < 10 || note.length > 500)
      return json({ error: 'Geçerli karar ve 10–500 karakterlik öğretmen gerekçesi gerekli.' }, 400)
    const item = await scopedProposal(body.id, ctx.user.id, ctx.teacher.id)
    if (!item) return json({ error: 'Bu öneri için yetki yok.' }, 403)
    const { data, error } = await db.from('agent_action_approval_queue').update({
      status: body.status, reviewed_by: ctx.user.id, review_note: note, reviewed_at: new Date().toISOString(),
    }).eq('id', item.id).eq('teacher_id', ctx.teacher.id).eq('status', 'pending').select('id,status').maybeSingle()
    if (error) throw error
    if (!data) return json({ error: 'Kayıt daha önce işlendi; listeyi yenileyin.' }, 409)
    return json({ item: data, decisionOnly: true, executionStatus: 'not_executed' })
  } catch { return json({ error: 'Karar kaydedilemedi.' }, 503) }
}

/** Link an already assigned cycle, never manufacture execution or learning outcomes. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await context(req)
    if (!ctx) return json({ error: 'Yetkisiz.' }, 403)
    const body = await req.json().catch(() => null)
    if (!ACTION_UUID.test(body?.id || '') || !ACTION_UUID.test(body?.cycleId || '')) return json({ error: 'Öneri ve döngü gerekli.' }, 400)
    const item = await scopedProposal(body.id, ctx.user.id, ctx.teacher.id)
    if (!item) return json({ error: 'Bu öneri için yetki yok.' }, 403)
    const { data: cycle, error } = await db.from('verified_learning_cycles')
      .select('id,teacher_id,student_id,classroom_id,learning_objective_id,created_at,status')
      .eq('id', body.cycleId).eq('teacher_id', ctx.teacher.id).eq('classroom_id', item.classroom_id!).eq('student_id', item.student_id).maybeSingle()
    if (error) throw error
    if (!cycle || !canLinkActionCycle(item, cycle, ctx.teacher.id)) return json({ error: 'Onay sonrası, aynı öğrenci/sınıf/kazanıma ait döngü gerekli.' }, 422)
    const { data: previous, error: previousError } = await db.from('agent_decision_audit').select('input_summary')
      .eq('actor_id', ctx.user.id).eq('agent_name', TEACHER_ACTION_LINK_POLICY).eq('policy_version', TEACHER_ACTION_LINK_POLICY)
      .eq('input_summary->>approval_id', item.id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1)
    if (previousError) throw previousError
    if (previous?.[0]?.input_summary?.cycle_id === cycle.id) return json({ saved: true, cycleId: cycle.id })
    const { error: saveError } = await db.from('agent_decision_audit').insert({
      actor_id: ctx.user.id, agent_name: TEACHER_ACTION_LINK_POLICY, policy_version: TEACHER_ACTION_LINK_POLICY,
      input_summary: { approval_id: item.id, cycle_id: cycle.id, teacher_id: ctx.teacher.id, student_id: item.student_id,
        classroom_id: item.classroom_id, objective_id: cycle.learning_objective_id },
      decision_summary: { decision: 'linked_existing_cycle', note: 'Öğretmen atanmış ölçüm döngüsünü bu önerinin takibine bağladı; nedensel etki iddiası değildir.' },
    })
    if (saveError) throw saveError
    return json({ saved: true, cycleId: cycle.id })
  } catch { return json({ error: 'Döngü bağlantısı kaydedilemedi.' }, 503) }
}
