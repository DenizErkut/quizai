import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function adminUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: name => cookieStore.get(name)?.value } })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return data?.is_admin === true ? user.id : null
}

export async function GET(req: NextRequest) {
  if (!await adminUserId()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const status = req.nextUrl.searchParams.get('status') || 'candidate'
  if (!['candidate', 'verified', 'rejected'].includes(status)) return NextResponse.json({ error: 'Geçersiz durum.' }, { status: 400 })
  const { data, error } = await adminDb.from('misconception_catalog')
    .select('id,subject,topic,label,source_type,verification_status,evidence_count,review_note,reviewed_at,created_at')
    .eq('verification_status', status).order('evidence_count', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: canonicalItems, error: canonicalError } = await adminDb.from('misconception_catalog')
    .select('id,subject,topic,label,evidence_count').eq('verification_status', 'verified')
    .order('evidence_count', { ascending: false }).limit(300)
  if (canonicalError) return NextResponse.json({ error: canonicalError.message }, { status: 500 })
  return NextResponse.json({ items: data || [], canonicalItems: canonicalItems || [] })
}

export async function POST(req: NextRequest) {
  const reviewerId = await adminUserId()
  if (!reviewerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { aliasId, canonicalId, reason } = await req.json()
  if (typeof aliasId !== 'string' || typeof canonicalId !== 'string' || typeof reason !== 'string' || reason.trim().length < 3) {
    return NextResponse.json({ error: 'Aday, kanonik hedef ve birleştirme gerekçesi zorunludur.' }, { status: 400 })
  }
  const { error } = await adminDb.rpc('merge_misconception_alias', {
    p_alias_id: aliasId, p_canonical_id: canonicalId,
    p_reason: reason.trim().slice(0, 500), p_reviewer_id: reviewerId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const reviewerId = await adminUserId()
  if (!reviewerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, decision, note } = await req.json()
  if (typeof id !== 'string' || !['verified', 'rejected'].includes(decision)) {
    return NextResponse.json({ error: 'Geçersiz inceleme kararı.' }, { status: 400 })
  }
  const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) : null
  if (decision === 'rejected' && !cleanNote) return NextResponse.json({ error: 'Red gerekçesi zorunludur.' }, { status: 400 })

  const { error } = await adminDb.rpc('review_misconception', {
    p_misconception_id: id, p_decision: decision, p_note: cleanNote, p_reviewer_id: reviewerId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
