import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: profile } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return profile?.is_admin ? user : null
}

export async function GET() {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [objectivesResult, versionsResult, targetsResult] = await Promise.all([
    adminDb.from('learning_objective_catalog')
      .select('id,objective_code,title,subject,grade,topic,lifecycle_status,is_active,curriculum_version_id,current_revision_id,replaced_by_objective_id,updated_at')
      .order('subject').order('grade').order('objective_code').limit(500),
    adminDb.from('curriculum_versions').select('id,code,title,status,academic_year_start,academic_year_end,effective_from,effective_to')
      .order('academic_year_start', { ascending: false }),
    adminDb.from('learning_objective_publish_targets')
      .select('topic_node_id,topic,grade,level,unit,subject').order('subject').order('grade').order('unit').order('topic'),
  ])
  const error = objectivesResult.error || versionsResult.error || targetsResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ objectives: objectivesResult.data || [], versions: versionsResult.data || [], targets: targetsResult.data || [] })
}

export async function PATCH(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (typeof body?.objectiveId !== 'string' || !['retire', 'supersede', 'reactivate'].includes(body?.action)
      || typeof body?.reason !== 'string' || body.reason.trim().length < 3) {
    return NextResponse.json({ error: 'Kazanım, geçerli işlem ve en az 3 karakterlik gerekçe gerekli.' }, { status: 400 })
  }
  const { data, error } = await adminDb.rpc('transition_learning_objective_lifecycle_v1', {
    p_objective_id: body.objectiveId, p_action: body.action, p_actor_id: user.id,
    p_reason: body.reason.trim(),
    p_replacement_objective_id: typeof body.replacementObjectiveId === 'string' && body.replacementObjectiveId
      ? body.replacementObjectiveId : null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, result: data })
}

export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (typeof body?.objectiveId !== 'string' || typeof body?.curriculumVersionId !== 'string'
      || typeof body?.title !== 'string' || body.title.trim().length < 3
      || typeof body?.topicNodeId !== 'string' || typeof body?.reason !== 'string' || body.reason.trim().length < 3) {
    return NextResponse.json({ error: 'Sürüm, başlık, yayın hedefi ve gerekçe gerekli.' }, { status: 400 })
  }
  const { data, error } = await adminDb.rpc('create_learning_objective_revision_v1', {
    p_objective_id: body.objectiveId, p_curriculum_version_id: body.curriculumVersionId,
    p_reviewer_id: user.id, p_title: body.title.trim(), p_topic_node_id: body.topicNodeId,
    p_source_reference: typeof body.sourceReference === 'string' ? body.sourceReference : null,
    p_reason: body.reason.trim(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, result: data })
}
