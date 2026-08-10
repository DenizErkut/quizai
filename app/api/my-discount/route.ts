// app/api/my-discount/route.ts
// Oturum sahibinin, kayıt olurken bağlandığı satıcının (varsa) o anki
// indirim oranını döner. /api/resolve-seller-code'dan farklı olarak id
// parametresi almaz — sadece kendi profili üzerinden çözer, bu yüzden
// sellers tablosundaki diğer alanları (komisyon, iletişim bilgisi vb.)
// sızdırma riski yoktur; yalnızca tek bir sayı döner.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ discount_rate: 0 })
  }
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ discount_rate: 0 })

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('seller_id').eq('id', user.id).maybeSingle()
  if (!profile?.seller_id) return NextResponse.json({ discount_rate: 0 })

  const { data: seller } = await supabaseAdmin
    .from('sellers').select('discount_rate, active').eq('id', profile.seller_id).maybeSingle()
  if (!seller?.active) return NextResponse.json({ discount_rate: 0 })

  return NextResponse.json({ discount_rate: Number(seller.discount_rate) || 0 })
}
