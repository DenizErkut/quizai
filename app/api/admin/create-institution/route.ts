// app/api/admin/create-institution/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // Admin kontrolü
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

  const { name, email, password, code, discount } = await req.json()

  // Validasyon
  if (!name?.trim() || !email?.trim() || !password || !code?.trim()) {
    return NextResponse.json({ error: 'Tüm zorunlu alanlar doldurulmalı.' }, { status: 400 })
  }
  if (code.length !== 8) {
    return NextResponse.json({ error: 'Kurum kodu 8 karakter olmalı.' }, { status: 400 })
  }

  // Kod benzersiz mi?
  const { data: existingInst } = await supabaseAdmin
    .from('institutions').select('id').eq('code', code.toUpperCase()).maybeSingle()
  if (existingInst) {
    return NextResponse.json({ error: 'Bu kurum kodu zaten kullanımda.' }, { status: 400 })
  }

  // 1. Auth hesabı oluştur (service_role ile)
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true, // Email doğrulama atla
    user_metadata: { name: name.trim(), role: 'institution_admin' },
  })

  if (authErr) {
    return NextResponse.json({ error: `Hesap oluşturulamadı: ${authErr.message}` }, { status: 400 })
  }

  const newUserId = authData.user.id

  // 2. Profil oluştur
  await supabaseAdmin.from('profiles').upsert({
    id: newUserId,
    name: name.trim(),
    role: 'institution_admin',
    language: 'Türkçe',
  })

  // 3. Kurum tablosuna ekle
  const { data: inst, error: instErr } = await supabaseAdmin.from('institutions').insert({
    name: name.trim(),
    code: code.toUpperCase(),
    admin_email: email.trim(),
    discount_rate: parseFloat(discount) || 0,
    active: true,
  }).select().single()

  if (instErr) {
    // Hesabı geri al
    await supabaseAdmin.auth.admin.deleteUser(newUserId)
    return NextResponse.json({ error: `Kurum kaydı hatası: ${instErr.message}` }, { status: 500 })
  }

  // 4. institution_users'a admin olarak ekle
  await supabaseAdmin.from('institution_users').insert({
    institution_id: inst.id,
    user_id: newUserId,
    role: 'admin',
  })

  return NextResponse.json({
    success: true,
    institution: inst,
    message: `"${name}" kurumu oluşturuldu. Kod: ${code.toUpperCase()}`,
  })
}
