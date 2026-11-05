// Oturum açık cihaz, QR isteğini onaylar: sunucu o hesap için tek kullanımlık giriş belirteci üretir.
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, supabaseAdmin } from '@/lib/auth-middleware'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error
  const limit = await checkRateLimit(auth.user.id, { endpoint: 'qr-login-approve', limit: 20 })
  if (!limit.allowed) return rateLimitExceeded(limit)
  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!/^[0-9a-f-]{36}$/i.test(id) || !auth.user.email) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  const { data: row } = await supabaseAdmin.from('qr_login_requests').select('status,expires_at').eq('id', id).maybeSingle()
  if (!row || row.status !== 'pending' || new Date(row.expires_at) < new Date()) return NextResponse.json({ error: 'QR kodun süresi dolmuş. Yeni bir kod oluşturun.' }, { status: 410 })
  const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: auth.user.email })
  const tokenHash = link?.properties?.hashed_token
  if (error || !tokenHash) return NextResponse.json({ error: 'Giriş onayı oluşturulamadı.' }, { status: 500 })
  const { error: upErr } = await supabaseAdmin.from('qr_login_requests').update({ status: 'approved', user_id: auth.user.id, token_hash: tokenHash }).eq('id', id).eq('status', 'pending')
  if (upErr) return NextResponse.json({ error: 'Onaylanamadı.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
