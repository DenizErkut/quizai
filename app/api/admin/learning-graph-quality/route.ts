import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { analyzeLearningGraph } from '@/lib/learning-graph-quality'

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

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [nodesResult, edgesResult, objectivesResult] = await Promise.all([
    adminDb.from('learning_graph_nodes').select('id,node_type,label,subject,grade,is_active'),
    adminDb.from('learning_graph_edges').select('id,source_node_id,target_node_id,edge_type,is_verified'),
    adminDb.from('learning_objective_catalog').select('id,objective_code,graph_node_id,topic_node_id,subject,grade,is_active'),
  ])
  const error = nodesResult.error || edgesResult.error || objectivesResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(analyzeLearningGraph(nodesResult.data || [], edgesResult.data || [], objectivesResult.data || []))
}
