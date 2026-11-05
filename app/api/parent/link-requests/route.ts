// Öğrenci tarafı: kendisine gelen veli takip isteklerini listeler ve onaylar/reddeder.
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, supabaseAdmin } from '@/lib/auth-middleware'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error
  const { data } = await supabaseAdmin.from('parent_link_requests').select('id,parent_id,created_at').eq('child_id', auth.user.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(10)
  const rows = data || []
  const identities = rows.length ? await getIdentitiesBySupabaseIds(rows.map(r => r.parent_id as string)) : {}
  return NextResponse.json({ requests: rows.map(r => ({ id: r.id, parentName: identities[r.parent_id as string]?.full_name || 'Veli', createdAt: r.created_at })) })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error
  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const action = body?.action === 'approve' ? 'approve' : body?.action === 'reject' ? 'reject' : ''
  if (!/^[0-9a-f-]{36}$/i.test(id) || !action) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  const { data: request } = await supabaseAdmin.from('parent_link_requests').select('id,parent_id,child_id,status').eq('id', id).eq('child_id', auth.user.id).maybeSingle()
  if (!request || request.status !== 'pending') return NextResponse.json({ error: 'İstek bulunamadı.' }, { status: 404 })
  if (action === 'approve') {
    const { data: existing } = await supabaseAdmin.from('parent_children').select('id').eq('parent_id', request.parent_id).eq('child_id', request.child_id).maybeSingle()
    if (!existing) {
      const { error } = await supabaseAdmin.from('parent_children').insert({ parent_id: request.parent_id, child_id: request.child_id })
      if (error) return NextResponse.json({ error: 'Bağlantı kaydedilemedi.' }, { status: 500 })
    }
  }
  await supabaseAdmin.from('parent_link_requests').update({ status: action === 'approve' ? 'approved' : 'rejected', decided_at: new Date().toISOString() }).eq('id', id)
  if (action === 'approve') {
    await supabaseAdmin.from('notifications').insert({ user_id: request.parent_id, type: 'system', read: false, title: '✅ Takip isteğin onaylandı', body: 'Öğrenci isteğini onayladı; artık gelişimini takip edebilirsin.', data: { href: '/parent' } })
  }
  return NextResponse.json({ ok: true })
}
