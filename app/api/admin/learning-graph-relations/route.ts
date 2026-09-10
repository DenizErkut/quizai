import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function isAdmin() {
  const cookieStore = await cookies()
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return false
  const { data } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return data?.is_admin === true
}

export async function GET(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 100, 1), 250)
  const { data: edges, error } = await adminDb.from('learning_graph_edges')
    .select('id,source_node_id,target_node_id,edge_type,confidence,rationale,source_type,is_verified,reviewed_by,curriculum_version_id,relation_version,valid_from,valid_to,created_at,updated_at')
    .order('updated_at', { ascending: false }).limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const nodeIds = [...new Set((edges || []).flatMap(edge => [edge.source_node_id, edge.target_node_id]))]
  const reviewerIds = [...new Set((edges || []).map(edge => edge.reviewed_by).filter(Boolean))] as string[]
  const versionIds = [...new Set((edges || []).map(edge => edge.curriculum_version_id).filter(Boolean))] as string[]
  const edgeIds = (edges || []).map(edge => edge.id)
  const [nodesResult, reviewersResult, versionsResult, historyResult] = await Promise.all([
    nodeIds.length ? adminDb.from('learning_graph_nodes').select('id,label,node_type,subject,grade').in('id', nodeIds) : Promise.resolve({ data: [], error: null }),
    reviewerIds.length ? adminDb.from('profiles').select('id,name').in('id', reviewerIds) : Promise.resolve({ data: [], error: null }),
    versionIds.length ? adminDb.from('curriculum_versions').select('id,code,title,status').in('id', versionIds) : Promise.resolve({ data: [], error: null }),
    edgeIds.length ? adminDb.from('learning_graph_edge_history').select('id,edge_id,relation_version,change_type,changed_at').in('edge_id', edgeIds).order('changed_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ])
  const relatedError = nodesResult.error || reviewersResult.error || versionsResult.error || historyResult.error
  if (relatedError) return NextResponse.json({ error: relatedError.message }, { status: 500 })
  return NextResponse.json({ edges: edges || [], nodes: nodesResult.data || [], reviewers: reviewersResult.data || [], versions: versionsResult.data || [], history: historyResult.data || [] })
}
