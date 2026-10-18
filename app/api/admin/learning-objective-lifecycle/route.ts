import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fetchAllRows } from '@/lib/paginate'

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

const PAGE_SIZE = 50
type CatalogMeta = { id: string; grade: string; subject: string; is_active: boolean; lifecycle_status: string }
const gradeNumber = (value: string) => value.match(/\d+/)?.[0] || ''
const escapeLike = (value: string) => value.replace(/[\\%_,()*]/g, ' ').trim()

export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const params = req.nextUrl.searchParams
  const grade = gradeNumber(params.get('grade') || '')
  const subject = (params.get('subject') || '').trim()
  const search = escapeLike((params.get('q') || '').slice(0, 100))
  const page = Math.max(1, Number(params.get('page') || 1))
  const from = (page - 1) * PAGE_SIZE

  // Katalog 3.800+ kazanım içerir; liste sunucu tarafında filtrelenip sayfalanır (PostgREST 1000 satır sınırı).
  let objectivesQuery = adminDb.from('learning_objective_catalog')
    .select('id,objective_code,title,subject,grade,topic,lifecycle_status,is_active,curriculum_version_id,current_revision_id,replaced_by_objective_id,updated_at', { count: 'exact' })
  if (grade) objectivesQuery = objectivesQuery.ilike('grade', `${grade}. s*`)
  if (subject) objectivesQuery = objectivesQuery.eq('subject', subject)
  if (search) objectivesQuery = objectivesQuery.or(`objective_code.ilike.*${search}*,title.ilike.*${search}*,topic.ilike.*${search}*`)

  let objectivesResult, versionsResult, catalogMeta, targets, drafts
  try {
    [objectivesResult, versionsResult, catalogMeta, targets, drafts] = await Promise.all([
      objectivesQuery.order('subject').order('grade').order('objective_code').range(from, from + PAGE_SIZE - 1),
      adminDb.from('curriculum_versions').select('id,code,title,status,academic_year_start,academic_year_end,effective_from,effective_to')
        .order('academic_year_start', { ascending: false }),
      fetchAllRows<CatalogMeta>((a, b) =>
        adminDb.from('learning_objective_catalog').select('id,grade,subject,is_active,lifecycle_status').order('id').range(a, b)),
      fetchAllRows<Record<string, unknown>>((a, b) => adminDb.from('learning_objective_publish_targets')
        .select('topic_node_id,topic,grade,level,unit,subject').order('topic_node_id').range(a, b)),
      fetchAllRows<{ objective_id: string; curriculum_version_id: string }>((a, b) => adminDb.from('learning_objective_revisions')
        .select('objective_id,curriculum_version_id,revision_status').eq('revision_status', 'draft').order('objective_id').range(a, b)),
    ])
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Katalog okunamadı.' }, { status: 500 })
  }
  const failure = objectivesResult.error || versionsResult.error
  if (failure) return NextResponse.json({ error: failure.message }, { status: 500 })

  const byGrade = new Map<string, Set<string>>()
  const activeIds: string[] = []
  for (const row of catalogMeta) {
    const number = gradeNumber(row.grade)
    if (number) { if (!byGrade.has(number)) byGrade.set(number, new Set()); byGrade.get(number)!.add(row.subject) }
    if (row.is_active && row.lifecycle_status === 'active') activeIds.push(row.id)
  }
  const filters = [...byGrade.keys()].sort((x, y) => Number(x) - Number(y))
    .map(g => ({ grade: g, subjects: [...byGrade.get(g)!].sort((x, y) => x.localeCompare(y, 'tr')) }))
  const preparedByVersion = new Map<string, Set<string>>()
  for (const row of drafts) {
    if (!preparedByVersion.has(row.curriculum_version_id)) preparedByVersion.set(row.curriculum_version_id, new Set())
    preparedByVersion.get(row.curriculum_version_id)!.add(row.objective_id)
  }
  const missingByVersion: Record<string, number> = {}
  for (const version of (versionsResult.data || []) as Array<{ id: string }>) {
    const prepared = preparedByVersion.get(version.id) || new Set<string>()
    missingByVersion[version.id] = activeIds.filter(id => !prepared.has(id)).length
  }
  return NextResponse.json({
    objectives: objectivesResult.data || [], total: objectivesResult.count || 0, page, pageSize: PAGE_SIZE,
    versions: versionsResult.data || [], targets, filters, missingByVersion,
    catalogTotal: catalogMeta.length,
  })
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

  const [objectiveResult, targetResult] = await Promise.all([
    adminDb.from('learning_objective_catalog').select('subject,grade').eq('id', body.objectiveId).maybeSingle(),
    adminDb.from('learning_objective_publish_targets').select('subject,grade').eq('topic_node_id', body.topicNodeId).maybeSingle(),
  ])
  if (objectiveResult.error || targetResult.error || !objectiveResult.data || !targetResult.data) {
    return NextResponse.json({ error: 'Kazanım veya doğrulanmış konu zinciri bulunamadı.' }, { status: 400 })
  }
  const normalize = (value: string) => value.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()
  if (normalize(objectiveResult.data.subject) !== normalize(targetResult.data.subject)
      || normalize(objectiveResult.data.grade) !== normalize(targetResult.data.grade)) {
    return NextResponse.json({ error: 'Kazanım yalnızca aynı ders ve sınıftaki doğrulanmış konu zincirine bağlanabilir.' }, { status: 400 })
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
