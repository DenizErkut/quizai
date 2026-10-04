import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, supabaseAdmin } from '@/lib/auth-middleware'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error
  const { data: parent } = await supabaseAdmin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
  if (parent?.role !== 'parent') return NextResponse.json({ error: 'Veli hesabı gerekli.' }, { status: 403 })
  const limit = await checkRateLimit(auth.user.id, { endpoint: 'parent-link-child', limit: 10 })
  if (!limit.allowed) return rateLimitExceeded(limit)
  const body = await req.json().catch(() => null)
  const code = typeof body?.code === 'string' ? body.code.trim().toLowerCase() : ''
  if (!/^[a-z0-9]{4,32}$/.test(code)) return NextResponse.json({ error: 'Geçerli bir çocuk davet kodu gerekli.' }, { status: 400 })
  const { data: child } = await supabaseAdmin.from('profiles').select('id,role').eq('parent_code', code).maybeSingle()
  if (!child || child.id === auth.user.id || child.role !== 'student') return NextResponse.json({ error: 'Kod bulunamadı veya öğrenci hesabına ait değil.' }, { status: 404 })
  const { data: existing } = await supabaseAdmin.from('parent_children').select('id').eq('parent_id', auth.user.id).eq('child_id', child.id).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Bu çocuk zaten listenizde.' }, { status: 409 })
  const { error } = await supabaseAdmin.from('parent_children').insert({ parent_id: auth.user.id, child_id: child.id })
  if (error) return NextResponse.json({ error: 'Çocuk bağlantısı kaydedilemedi.' }, { status: 500 })
  return NextResponse.json({ success: true })
}
