import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { resolveDiscountCode } from '@/lib/referral-code'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Checkout ekranındaki "Satıcı/Kurum Kodu" alanı için — kullanıcı kodu
// girip "Uygula"ya bastığında ekranda hangi indirimin uygulanacağını
// göstermek amacıyla. Asıl tahsilat sırasında app/api/paytr/checkout AYNI
// kodu KENDİSİ de tekrar çözer (client'tan gelen bir indirim oranına asla
// güvenilmez) — burası sadece önizleme.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  const body = await req.json()
  const code = String(body.code || '').trim()
  if (!code) return NextResponse.json({ valid: false, error: 'Kod girilmedi.' }, { status: 400 })

  const resolved = await resolveDiscountCode(supabaseAdmin, code)
  if (!resolved.found) {
    return NextResponse.json({ valid: false, error: 'Kod bulunamadı veya artık geçerli değil.' }, { status: 404 })
  }

  return NextResponse.json({
    valid: true,
    discount_rate: resolved.discountRate,
    label: resolved.label,
  })
}
