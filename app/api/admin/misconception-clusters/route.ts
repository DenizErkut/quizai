import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { buildClusterPrompt, clusterMemberKey, groupClusterableRows, parseClusterResponse } from '@/lib/misconception-clustering'

export const runtime = 'nodejs'
export const maxDuration = 60

const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const CLUSTER_MODEL = 'claude-sonnet-4-5'
const GROUPS_PER_RUN = 6

async function adminUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: name => cookieStore.get(name)?.value } })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return data?.is_admin === true ? user.id : null
}

export async function GET() {
  if (!await adminUserId()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await adminDb.from('misconception_cluster_proposals')
    .select('id,subject,topic,canonical_label,member_ids,rationale,created_at').eq('status', 'proposed')
    .order('created_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = [...new Set((data ?? []).flatMap(row => row.member_ids as string[]))]
  const { data: labels } = ids.length
    ? await adminDb.from('misconception_catalog').select('id,label').in('id', ids) : { data: [] }
  const labelById = new Map((labels ?? []).map(row => [row.id as string, row.label as string]))
  return NextResponse.json({
    proposals: (data ?? []).map(row => ({ ...row, members: (row.member_ids as string[]).map(id => ({ id, label: labelById.get(id) ?? id })) })),
  })
}

/** Generates proposals only; nothing is merged until an expert approves (PATCH). */
export async function POST() {
  if (!await adminUserId()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY tanımlı değil.' }, { status: 500 })
  const { data: rows, error } = await adminDb.from('student_misconceptions')
    .select('student_id,misconception_id,subject,topic,evidence_count,misconception_catalog!inner(label,verification_status)')
    .neq('status', 'resolved').neq('misconception_catalog.verification_status', 'rejected').limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const flat = (rows ?? []).map(row => ({ ...row, label: (row.misconception_catalog as unknown as { label: string }).label }))
  const { data: open } = await adminDb.from('misconception_cluster_proposals').select('student_id,member_key').eq('status', 'proposed')
  const openKeys = new Set((open ?? []).map(row => `${row.student_id}|${row.member_key}`))
  // Largest groups first; groups already holding an open proposal over all of their members are skipped.
  const groups = groupClusterableRows(flat).sort((a, b) => b.items.length - a.items.length)
    .filter(group => !openKeys.has(`${group.studentId}|${clusterMemberKey(group.items.map(item => item.id))}`))
    .slice(0, GROUPS_PER_RUN)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let created = 0
  const failures: string[] = []
  for (const group of groups) {
    try {
      const msg = await anthropic.messages.create({ model: CLUSTER_MODEL, max_tokens: 2000, temperature: 0,
        messages: [{ role: 'user', content: buildClusterPrompt(group) }] })
      logAnthropicUsage('misconception-clusters', CLUSTER_MODEL, msg)
      const block = msg.content[0]
      const clusters = parseClusterResponse(block?.type === 'text' ? block.text : '', group)
      for (const cluster of clusters) {
        const { error: insertError } = await adminDb.from('misconception_cluster_proposals').insert({
          student_id: group.studentId, subject: group.subject, topic: group.topic, canonical_label: cluster.canonicalLabel,
          member_ids: cluster.memberIds, member_key: clusterMemberKey(cluster.memberIds), rationale: cluster.rationale, model: CLUSTER_MODEL,
        })
        if (insertError && insertError.code !== '23505') failures.push(insertError.message)
        else if (!insertError) created += 1
      }
    } catch (err) { failures.push(err instanceof Error ? err.message : 'LLM çağrısı başarısız') }
  }
  return NextResponse.json({ groupsAnalyzed: groups.length, proposalsCreated: created, failures })
}

export async function PATCH(req: NextRequest) {
  const reviewerId = await adminUserId()
  if (!reviewerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { id, decision, note, canonicalLabel, memberIds } = body as Record<string, unknown>
  if (typeof id !== 'string' || !['approve', 'reject'].includes(String(decision)) || typeof note !== 'string' || note.trim().length < 10) {
    return NextResponse.json({ error: 'Karar ve 10-500 karakterlik uzman gerekçesi zorunludur.' }, { status: 400 })
  }
  const reason = note.trim().slice(0, 500)
  if (decision === 'reject') {
    const { error } = await adminDb.rpc('reject_misconception_cluster', { p_proposal_id: id, p_reason: reason, p_reviewer_id: reviewerId })
    return error ? NextResponse.json({ error: error.message }, { status: 409 }) : NextResponse.json({ success: true })
  }
  if (typeof canonicalLabel !== 'string' || !Array.isArray(memberIds) || memberIds.some(member => typeof member !== 'string')) {
    return NextResponse.json({ error: 'Kanonik etiket ve üye listesi zorunludur.' }, { status: 400 })
  }
  const { data, error } = await adminDb.rpc('approve_misconception_cluster', {
    p_proposal_id: id, p_canonical_label: canonicalLabel, p_member_ids: memberIds, p_reason: reason, p_reviewer_id: reviewerId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  return NextResponse.json({ success: true, canonicalId: data })
}
