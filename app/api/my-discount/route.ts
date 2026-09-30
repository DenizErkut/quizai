// app/api/my-discount/route.ts
// Oturum sahibinin, kayıt olurken bağlandığı satıcının (varsa) o anki
// indirim oranını döner. /api/resolve-seller-code'dan farklı olarak id
// parametresi almaz — sadece kendi profili üzerinden çözer, bu yüzden
// sellers tablosundaki diğer alanları (komisyon, iletişim bilgisi vb.)
// sızdırma riski yoktur; yalnızca tek bir sayı döner.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { resolveAutomaticDiscount } from '@/lib/automatic-discount'

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

  try {
    const discount = await resolveAutomaticDiscount(supabaseAdmin, user.id)
    return NextResponse.json({ discount_rate: discount.discountRate, source: discount.source, label: discount.label, institution_name: discount.institutionName })
  } catch (error) {
    console.error('[my-discount] İndirim alınamadı:', error)
    return NextResponse.json({ error: 'İndirim bilgisi alınamadı.' }, { status: 500 })
  }
}
