// app/api/admin/learning-graph-drafts/route.ts
//
// 18 Ağustos 2026 — Madde 3 (pratium-bekleyen-isler-uygulama-plani.md):
// learning-graph-suggest'in ürettiği AI taslaklarının admin tarafından
// listelenmesi ve onaylanması/reddedilmesi. Onay ANCAK burada, gerçek
// topic_prerequisites tablosuna satır ekler (lib/learning-graph.ts'in
// findPrerequisiteGaps() fonksiyonunun okuduğu tablo budur) — AI önerisi
// hiçbir zaman doğrudan bu tabloya yazmaz.
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
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: p } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).single()
  return p?.is_admin ? user : null
}

// GET: taslakları listele. ?status= ile filtrele (varsayılan: pending).
export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pending'

  let query = adminDb.from('topic_prerequisites_draft').select('*').order('created_at', { ascending: false })
  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ drafts: data || [] })
}

// PATCH: bir taslağı onayla (→ gerçek topic_prerequisites'e yazılır) ya
// da reddet. Onaydan önce topic/prerequisite_topic metni admin tarafından
// düzenlenmiş olabilir (editedTopic/editedPrerequisiteTopic) — bu durumda
// düzenlenmiş metin hem draft satırına hem gerçek tabloya yazılır.
export async function PATCH(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, action, editedTopic, editedPrerequisiteTopic } = await req.json()
  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id ve action (approve|reject) gerekli.' }, { status: 400 })
  }

  const { data: draft, error: fetchErr } = await adminDb
    .from('topic_prerequisites_draft').select('*').eq('id', id).single()
  if (fetchErr || !draft) return NextResponse.json({ error: 'Taslak bulunamadı.' }, { status: 404 })

  if (draft.status !== 'pending') {
    return NextResponse.json({ error: `Bu taslak zaten "${draft.status}" durumunda.` }, { status: 400 })
  }

  const finalTopic = typeof editedTopic === 'string' && editedTopic.trim() ? editedTopic.trim() : draft.topic
  const finalPrereq = typeof editedPrerequisiteTopic === 'string' && editedPrerequisiteTopic.trim()
    ? editedPrerequisiteTopic.trim() : draft.prerequisite_topic

  if (action === 'approve') {
    // Draft durumu, typed graph edge'i ve legacy uyumluluk satırı tek bir
    // veritabanı transaction'ında yayınlanır; yarım onay oluşamaz.
    const { data: edgeId, error: approveErr } = await adminDb.rpc('approve_learning_graph_draft', {
      p_draft_id: id,
      p_reviewer_id: user.id,
      p_topic: finalTopic,
      p_prerequisite_topic: finalPrereq,
    })
    if (approveErr) return NextResponse.json({ error: approveErr.message }, { status: 500 })
    return NextResponse.json({ success: true, edgeId })
  }

  const { error: updErr } = await adminDb.from('topic_prerequisites_draft').update({
    status: 'rejected',
    topic: finalTopic,
    prerequisite_topic: finalPrereq,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
