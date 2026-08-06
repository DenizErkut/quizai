// app/api/admin/create-seller/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateUniqueSellerCode } from '@/lib/seller-code'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const body = await req.json()
  const { full_name, title, email, phone, address, commission_rate } = body
  if (!full_name?.trim()) {
    return NextResponse.json({ error: 'Ad soyad zorunlu.' }, { status: 400 })
  }

  const code = await generateUniqueSellerCode(supabaseAdmin, 7)
  if (!code) {
    return NextResponse.json({ error: 'Satıcı kodu üretilemedi, tekrar dene.' }, { status: 500 })
  }

  const { data: seller, error: insErr } = await supabaseAdmin
    .from('sellers')
    .insert({
      full_name: full_name.trim(),
      title: title?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      commission_rate: parseFloat(commission_rate) || 0,
      code,
      active: true,
    })
    .select()
    .single()

  if (insErr || !seller) {
    return NextResponse.json({ error: `Satıcı kaydı hatası: ${insErr?.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, seller })
}
