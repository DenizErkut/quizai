import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PayTR'ın merchant_ok_url yönlendirmesi güvenilir bir onay DEĞİL (bkz.
// app/api/paytr/callback/route.ts'teki yorum) — asıl aktivasyon asenkron
// bildirimle oluyor. Bu yüzden checkout sayfası kullanıcıyı "işleniyor"
// ekranında tutup bu uç noktayı kısa aralıklarla polluyor, callback
// subscriptions satırını 'active' yapana kadar.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const oid = searchParams.get('oid')
  if (!oid) return NextResponse.json({ error: 'oid gerekli.' }, { status: 400 })

  // user_id filtresi: bir kullanıcı sadece kendi ödemesinin durumunu sorgulayabilsin.
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('status')
    .eq('stripe_subscription_id', oid)
    .eq('user_id', user.id)
    .eq('provider', 'paytr')
    .maybeSingle()

  if (!sub) return NextResponse.json({ status: 'not_found' })
  return NextResponse.json({ status: sub.status })
}
