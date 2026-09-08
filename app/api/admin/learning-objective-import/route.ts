import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: profile } = await adminDb
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return profile?.is_admin ? user : null
}

export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const batchId = req.nextUrl.searchParams.get('batchId')
  if (batchId) {
    const [batchResult, itemsResult, targetsResult] = await Promise.all([
      adminDb.from('learning_objective_import_batches').select('*').eq('id', batchId).maybeSingle(),
      adminDb.from('learning_objective_import_items')
        .select('id,batch_id,row_number,objective_code,title,level,grade,subject,unit,topic,source_reference,validation_status,validation_errors,review_status,review_notes,selected_topic_node_id,objective_id,reviewed_at,published_at')
        .eq('batch_id', batchId).order('row_number'),
      adminDb.from('learning_objective_publish_targets')
        .select('topic_node_id,topic,grade,level,unit_node_id,unit,subject_node_id,subject')
        .order('subject').order('grade').order('unit').order('topic'),
    ])
    const error = batchResult.error || itemsResult.error || targetsResult.error
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!batchResult.data) return NextResponse.json({ error: 'Parti bulunamadı.' }, { status: 404 })
    return NextResponse.json({ batch: batchResult.data, items: itemsResult.data || [], targets: targetsResult.data || [] })
  }

  const [batchesResult, versionsResult] = await Promise.all([
    adminDb.from('learning_objective_import_batches')
      .select('id,source_type,source_reference,status,total_count,valid_count,invalid_count,curriculum_version_id,created_at')
      .order('created_at', { ascending: false }).limit(20),
    adminDb.from('curriculum_versions')
      .select('id,code,title,status,academic_year_start,academic_year_end')
      .in('status', ['draft', 'active']).order('academic_year_start', { ascending: false }),
  ])
  const error = batchesResult.error || versionsResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ batches: batchesResult.data || [], curriculumVersions: versionsResult.data || [] })
}

export async function PATCH(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const itemId = typeof body?.itemId === 'string' ? body.itemId : ''
  const action = body?.action
  if (!itemId || !['approve', 'reject', 'reopen', 'publish'].includes(action)) {
    return NextResponse.json({ error: 'itemId ve geçerli action gerekli.' }, { status: 400 })
  }
  const { data, error } = await adminDb.rpc('review_learning_objective_import_item', {
    p_item_id: itemId,
    p_action: action,
    p_reviewer_id: user.id,
    p_topic_node_id: typeof body?.topicNodeId === 'string' && body.topicNodeId ? body.topicNodeId : null,
    p_title: typeof body?.title === 'string' ? body.title : null,
    p_notes: typeof body?.notes === 'string' ? body.notes : null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, result: data })
}

export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const sourceType = body?.sourceType
  const sourceReference = typeof body?.sourceReference === 'string' ? body.sourceReference.trim() : ''
  const curriculumVersionId = typeof body?.curriculumVersionId === 'string' ? body.curriculumVersionId : ''
  const rows = body?.rows
  if (!['meb', 'manual', 'import'].includes(sourceType) || sourceReference.length < 3 || !curriculumVersionId || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'Müfredat sürümü, geçerli kaynak türü, kaynak referansı ve JSON satırları gerekli.' }, { status: 400 })
  }
  if (rows.length < 1 || rows.length > 500) {
    return NextResponse.json({ error: 'Bir parti 1–500 kazanım içermelidir.' }, { status: 400 })
  }

  const { data, error } = await adminDb.rpc('stage_learning_objective_import_v2', {
    p_source_type: sourceType,
    p_source_reference: sourceReference,
    p_created_by: user.id,
    p_curriculum_version_id: curriculumVersionId,
    p_rows: rows,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, result: data })
}
