import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/auth-middleware'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const body = await req.json().catch(() => null)
  const id = typeof body?.userId === 'string' ? body.userId : ''
  if (body?.action !== 'bulk-premium' && !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Geçerli kullanıcı kimliği gerekli.' }, { status: 400 })
  }
  let query
  if (body?.action === 'reset-test-count') {
    query = supabaseAdmin.from('profiles').update({ monthly_test_count: 0 }).eq('id', id).select('id')
  } else if (body?.action === 'set-admin' && typeof body.isAdmin === 'boolean') {
    if (id === auth.user.id) return NextResponse.json({ error: 'Kendi yönetici yetkinizi bu işlemle değiştiremezsiniz.' }, { status: 409 })
    query = supabaseAdmin.from('profiles').update({ is_admin: body.isAdmin }).eq('id', id).select('id')
  } else if (body?.action === 'bulk-premium' && Number.isInteger(body.months) && body.months >= 1 && body.months <= 24) {
    query = supabaseAdmin.from('profiles').update({ plan: 'premium', plan_expires_at: new Date(Date.now() + body.months * 30 * 86400000).toISOString(), monthly_test_count: 0 }).eq('plan', 'free').select('id')
  } else return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 })
  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'İşlem kaydedilemedi.' }, { status: 500 })
  if (!data?.length && body.action !== 'bulk-premium') return NextResponse.json({ error: 'Kullanıcı bulunamadı.' }, { status: 404 })
  return NextResponse.json({ success: true, updated: data?.length ?? 0 })
}
