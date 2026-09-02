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

  const status = req.nextUrl.searchParams.get('status') || 'pending'
  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') || 50)
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50

  let candidatesQuery = adminDb.from('learning_catalog_review_queue')
    .select('dimension_key,observed_label,observed_subject,occurrence_count,student_count,sample_grades,status,mapped_node_id,last_seen_at')
    .order('occurrence_count', { ascending: false })
    .order('last_seen_at', { ascending: false })
    .limit(limit)
  if (status !== 'all') candidatesQuery = candidatesQuery.eq('status', status)

  const [candidatesResult, unitsResult] = await Promise.all([
    candidatesQuery,
    adminDb.from('learning_graph_nodes')
      .select('id,label,subject,grade,level')
      .eq('node_type', 'unit').eq('is_active', true)
      .order('subject').order('grade').order('label'),
  ])

  if (candidatesResult.error) {
    return NextResponse.json({ error: candidatesResult.error.message }, { status: 500 })
  }
  if (unitsResult.error) {
    return NextResponse.json({ error: unitsResult.error.message }, { status: 500 })
  }

  return NextResponse.json({
    candidates: candidatesResult.data || [],
    units: unitsResult.data || [],
  })
}

export async function PATCH(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const dimensionKey = typeof body?.dimensionKey === 'string' ? body.dimensionKey.trim() : ''
  const action = body?.action
  const unitNodeId = typeof body?.unitNodeId === 'string' && body.unitNodeId ? body.unitNodeId : null
  const canonicalTopic = typeof body?.canonicalTopic === 'string' ? body.canonicalTopic.trim() : null

  if (!dimensionKey || !['map', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: 'dimensionKey ve action (map|dismiss) gerekli.' }, { status: 400 })
  }
  if (action === 'map' && (!unitNodeId || !canonicalTopic)) {
    return NextResponse.json({ error: 'Eşleştirme için ünite ve kanonik konu zorunlu.' }, { status: 400 })
  }

  const { data, error } = await adminDb.rpc('review_learning_catalog_candidate', {
    p_dimension_key: dimensionKey,
    p_action: action,
    p_reviewer_id: user.id,
    p_unit_node_id: unitNodeId,
    p_canonical_topic: canonicalTopic,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true, topicNodeId: data })
}
