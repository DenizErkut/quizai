// app/api/admin/update-institution/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { validateLocationDetails } from '@/lib/location/validate'
import { isKnownCountry } from '@/lib/location/data'

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
  const { institution_id, name, email, newPassword, discount, active, seller_id } = body
  if (!institution_id) return NextResponse.json({ error: 'Kurum ID eksik.' }, { status: 400 })

  // Konum yalnızca gönderildiyse güncellenir (aktif/pasif geçişi gibi çağrılar konuma dokunmaz).
  let location: { country: string; state: string; city: string } | undefined
  if (body.country !== undefined || body.state !== undefined || body.city !== undefined) {
    const checked = validateLocationDetails({ country: body.country, state: body.state, city: body.city })
    if (checked.ok === false || !isKnownCountry(checked.value.country)) {
      return NextResponse.json({ error: 'Ülke, eyalet/il ve şehir/ilçe zorunlu.' }, { status: 400 })
    }
    location = { country: checked.value.country, state: checked.value.state, city: checked.value.city }
  }

  // Kurumu güncelle
  const { error: instErr } = await supabaseAdmin.from('institutions').update({
    name: name?.trim(),
    admin_email: email?.trim(),
    discount_rate: parseFloat(discount) || 0,
    seller_id: seller_id || null,
    active,
    ...(location ?? {}),
  }).eq('id', institution_id)
  if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 })

  // Şifre değişikliği — auth user'ı bul
  if (newPassword && newPassword.length >= 6) {
    const { data: instUser } = await supabaseAdmin
      .from('institution_users').select('user_id').eq('institution_id', institution_id).eq('role', 'admin').maybeSingle()
    if (instUser?.user_id) {
      const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(instUser.user_id, { password: newPassword })
      if (pwErr) return NextResponse.json({ error: `Şifre güncellenemedi: ${pwErr.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
