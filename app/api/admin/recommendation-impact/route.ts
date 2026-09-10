import { NextResponse } from 'next/server'
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

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [summaryResult, recentResult, shadowResult] = await Promise.all([
    adminDb.from('learning_graph_recommendation_impact_summary').select('*')
      .order('sample_size', { ascending: false }),
    adminDb.from('recommendation_impact_measurements')
      .select('id,subject,topic,action_type,graph_used,graph_relation_version,baseline_mastery,post_mastery,mastery_delta,event_score_pct,event_count,applied_at,evaluated_at,measurement_version')
      .order('applied_at', { ascending: false }).limit(50),
    adminDb.from('agent_decision_audit').select('decision_summary,created_at').eq('agent_name','recommendation-shadow-v1').gte('created_at',new Date(Date.now()-30*86_400_000).toISOString()).order('created_at',{ascending:false}).limit(5000),
  ])
  const error = summaryResult.error || recentResult.error || shadowResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const shadow=(shadowResult.data??[]).map(row=>row.decision_summary as {top_agreement?:boolean;top5_overlap?:number|null});const validOverlap=shadow.map(row=>Number(row.top5_overlap)).filter(Number.isFinite)
  return NextResponse.json({ summary: summaryResult.data || [], recent: recentResult.data || [], shadow:{sample_size:shadow.length,top_agreement_count:shadow.filter(row=>row.top_agreement===true).length,top_agreement_rate:shadow.length?Math.round(shadow.filter(row=>row.top_agreement===true).length/shadow.length*100):null,avg_top5_overlap_pct:validOverlap.length?Math.round(validOverlap.reduce((sum,value)=>sum+value,0)/validOverlap.length*100):null,interpretable:shadow.length>=100} })
}
