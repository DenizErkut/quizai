// app/api/admin/create-institution/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateUniqueInstitutionCode } from '@/lib/institution-code'
import { createIdentity } from '@/lib/identity/client'

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
  if (!profile?.is_admin) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const body = await req.json()
  const { name, email, password, discount } = body
  let { code } = body

  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: 'Kurum adı, e-posta ve şifre zorunlu.' }, { status: 400 })
  }

  if (code?.trim()) {
    // Admin kendi kodunu girdi — biçim ve benzersizlik kontrolü yap
    code = code.trim().toUpperCase()
    if (code.length !== 8) {
      return NextResponse.json({ error: 'Kurum kodu 8 karakter olmali.' }, { status: 400 })
    }
    const { data: existing } = await supabaseAdmin
      .from('institutions').select('id').eq('code', code).maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'Bu kurum kodu zaten kullanımda.' }, { status: 400 })
    }
  } else {
    // Kod boş bırakıldı — otomatik üret. Kurum, istediği zaman kendi panelinden
    // (Profil sekmesi → "Yeni Kod Oluştur") bu kodu değiştirebilir.
    const generated = await generateUniqueInstitutionCode(supabaseAdmin, 8)
    if (!generated) {
      return NextResponse.json({ error: 'Kurum kodu otomatik üretilemedi, lütfen tekrar deneyin.' }, { status: 500 })
    }
    code = generated
  }

  // 1. Auth kullanıcısı oluştur — Supabase Admin API
  const adminApiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`
  const createUserRes = await fetch(adminApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body: JSON.stringify({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { name: name.trim(), role: 'institution_admin' },
    }),
  })

  const createUserData = await createUserRes.json()
  const newUserId = createUserData?.id

  if (!newUserId) {
    return NextResponse.json({
      error: `Kullanici olusturulamadi: ${createUserData?.msg || createUserData?.message || JSON.stringify(createUserData)}`
    }, { status: 400 })
  }

  // 2. Kurum tablosuna ekle
  const { data: inst, error: instErr } = await supabaseAdmin
    .from('institutions')
    .insert({
      name: name.trim(),
      code, // zaten yukarıda normalize edildi (elle girilmiş ya da otomatik üretilmiş)
      admin_email: email.trim(),
      discount_rate: parseFloat(discount) || 0,
      active: true,
    })
    .select()
    .single()

  if (instErr) {
    return NextResponse.json({ error: `Kurum kaydi hatası: ${instErr.message}` }, { status: 500 })
  }

  // 3. Kimlik (ad) TR-PG'de oluşturulur — profiles'a ASLA name yazılmaz.
  //    (Bu route daha önce doğrudan profiles.name'e yazıyordu; bu yüzden
  //    admin panelinde bu kurum yöneticileri "İsimsiz" görünüyordu — admin
  //    paneli ismi sadece TR-PG'den okuyor.)
  await createIdentity({
    supabaseUserId: newUserId,
    fullName: name.trim(),
    email: email.trim(),
    role: 'institution_admin',
  }).catch((e) => console.error('[create-institution] createIdentity error:', e?.message))

  // 4. Profil oluştur (kimlik alanı hariç — role/language platform verisi)
  await supabaseAdmin.from('profiles').upsert({
    id: newUserId,
    role: 'institution_admin',
    language: 'Türkçe',
  })

  // 5. institution_users'a admin olarak ekle
  const { error: iuErr } = await supabaseAdmin.from('institution_users').insert({
    institution_id: inst.id,
    user_id: newUserId,
    role: 'admin',
  })

  if (iuErr) {
    return NextResponse.json({ error: `Kullanici-kurum iliskisi kurulamadi: ${iuErr.message}` }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    institution: inst,
    user_id: newUserId,
    message: `"${name}" kurumu olusturuldu. Kod: ${code}`,
  })
}
