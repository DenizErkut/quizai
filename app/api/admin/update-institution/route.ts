// app/api/admin/update-institution/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

  const { institution_id, name, email, newPassword, discount, active } = await req.json()
  if (!institution_id) return NextResponse.json({ error: 'Kurum ID eksik.' }, { status: 400 })

  // Kurumu güncelle
  const { error: instErr } = await supabaseAdmin.from('institutions').update({
    name: name?.trim(),
    admin_email: email?.trim(),
    discount_rate: parseFloat(discount) || 0,
    active,
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
