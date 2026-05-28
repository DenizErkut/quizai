// app/api/admin/create-institution/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  }

  const body = await req.json()
  const { name, email, password, code, discount } = body

  if (!name?.trim() || !email?.trim() || !password || !code?.trim()) {
    return NextResponse.json({ error: 'Tum zorunlu alanlar doldurulmali.' }, { status: 400 })
  }
  if (code.length !== 8) {
    return NextResponse.json({ error: 'Kurum kodu 8 karakter olmali.' }, { status: 400 })
  }

  // Kod benzersiz mi?
  const { data: existing } = await supabaseAdmin
    .from('institutions').select('id').eq('code', code.toUpperCase()).maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'Bu kurum kodu zaten kullanımda.' }, { status: 400 })
  }

  // 1. Kurum tablosuna ekle (önce, sonra user oluştur)
  const { data: inst, error: instErr } = await supabaseAdmin
    .from('institutions')
    .insert({
      name: name.trim(),
      code: code.toUpperCase(),
      admin_email: email.trim(),
      discount_rate: parseFloat(discount) || 0,
      active: true,
    })
    .select()
    .single()

  if (instErr) {
    return NextResponse.json({ error: `Kurum kaydı hatası: ${instErr.message}` }, { status: 500 })
  }

  // 2. Auth kullanıcısı oluştur — service_role ile signUp (email confirm atla)
  const signUpRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body: JSON.stringify({
      email: email.trim(),
      password,
      data: { name: name.trim(), role: 'institution_admin' },
    }),
  })

  const signUpData = await signUpRes.json()

  if (!signUpData.id && !signUpData.user?.id) {
    // Auth user oluşturulamadı ama kurum kaydedildi — kurumu sil
    await supabaseAdmin.from('institutions').delete().eq('id', inst.id)
    return NextResponse.json({
      error: `Kullanici hesabi olusturulamadi: ${signUpData.msg || signUpData.error_description || JSON.stringify(signUpData)}`
    }, { status: 400 })
  }

  const newUserId = signUpData.id || signUpData.user?.id

  // 3. Profil oluştur
  await supabaseAdmin.from('profiles').upsert({
    id: newUserId,
    name: name.trim(),
    role: 'institution_admin',
    language: 'Türkçe',
  })

  // 4. institution_users'a admin olarak ekle
  await supabaseAdmin.from('institution_users').insert({
    institution_id: inst.id,
    user_id: newUserId,
    role: 'admin',
  })

  return NextResponse.json({
    success: true,
    institution: inst,
    message: `"${name}" kurumu olusturuldu. Kod: ${code.toUpperCase()}`,
  })
}
