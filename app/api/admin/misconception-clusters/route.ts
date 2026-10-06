import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { generateClusterProposals } from '@/lib/misconception-cluster-run'

export const runtime = 'nodejs'
export const maxDuration = 60

const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
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
  try { return NextResponse.json(await generateClusterProposals(adminDb, GROUPS_PER_RUN)) }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : 'Öneri üretilemedi.' }, { status: 500 }) }
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
