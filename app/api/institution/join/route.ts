// app/api/institution/join/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { institution_code, user_id } = await req.json()
  if (!institution_code || !user_id) {
    return NextResponse.json({ error: 'Eksik parametre.' }, { status: 400 })
  }

  // Auth kontrolü — token varsa kullan, yoksa user_id ile devam et (register akışı)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await supabaseUser.auth.getUser()
    // user_id ile token'daki uid eşleşmeli
    if (!user || user.id !== user_id) {
      return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
    }
  }

  // Kurumu bul
  const { data: inst } = await supabaseAdmin
    .from('institutions')
    .select('id, name')
    .eq('code', institution_code.toUpperCase())
    .eq('active', true)
    .maybeSingle()

  if (!inst) {
    return NextResponse.json({ error: 'Geçersiz kurum kodu.' }, { status: 404 })
  }

  // Zaten kayıtlı mı?
  const { data: existing } = await supabaseAdmin
    .from('institution_users')
    .select('id')
    .eq('institution_id', inst.id)
    .eq('user_id', user_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ success: true, already_member: true, institution_name: inst.name })
  }

  // Bir öğrenci aynı anda sadece TEK kuruma üye olabilir (DB'de de
  // one_institution_per_student unique index'iyle zorunlu kılınıyor).
  const { data: otherMembership } = await supabaseAdmin
    .from('institution_users')
    .select('institution_id, institutions(name)')
    .eq('user_id', user_id)
    .eq('role', 'student')
    .maybeSingle()

  if (otherMembership) {
    const otherName = (otherMembership.institutions as any)?.name || 'başka bir kurum'
    return NextResponse.json(
      { error: `Zaten "${otherName}" kurumuna kayıtlısınız. Önce oradan ayrılmanız gerekiyor.` },
      { status: 409 }
    )
  }

  // Service role ile insert — RLS bypass
  const { error } = await supabaseAdmin
    .from('institution_users')
    .insert({ institution_id: inst.id, user_id, role: 'student' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, institution_name: inst.name })
}
