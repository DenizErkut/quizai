// app/api/institution/create-student/route.ts
//
// Kurum admini, kendi kurumuna bağlı bir öğrenci için doğrudan hesap
// oluşturur (öğrencinin kendi kendine kayıt olmasını beklemeden). Bu,
// kurum kodu ile self-servis kaydın ALTERNATİFİ, aynı zamanda çalışan
// bir yoludur — okulun kendi öğrenci listesinden toplu/tek tek kayıt
// açmak isteyen kurumlar için.
//
// service role ile supabase.auth.admin.createUser() kullanılır (admin
// panelindeki oturumu ETKİLEMEZ — bu client-side signUp()'tan farklı
// olarak SUNUCU tarafında, admin'in kendi session'ından bağımsız çalışır).
// email_confirm: true ile oluşturulur çünkü kurum zaten bu kişinin
// gerçekliğini biliyor/onaylıyor — ayrıca bir e-posta onayına gerek yok.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createIdentity, updateIdentity } from '@/lib/identity/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generatePassword(): string {
  // Karışıklık yaratabilecek karakterler (0/O, 1/l/I) çıkarıldı — kurum
  // bunu öğrenciye kağıt üzerinde de verebilir.
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pass = ''
  for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)]
  return pass
}

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

  // Bu kullanıcı gerçekten bir kurumun admini mi? (check-admin route'uyla
  // aynı desen — service role ile institution_users'tan doğrula)
  const { data: instUser } = await supabaseAdmin
    .from('institution_users')
    .select('institution_id, institutions(id, name, active)')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()

  if (!instUser) return NextResponse.json({ error: 'Bu işlem için kurum admini olmanız gerekir.' }, { status: 403 })
  const institution = (instUser as any).institutions
  if (!institution?.active) return NextResponse.json({ error: 'Kurumunuz aktif değil.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })

  const { fullName, email, age, grade, classNumber, parentEmail, phone } = body
  if (!fullName?.trim()) return NextResponse.json({ error: 'Ad soyad zorunludur.' }, { status: 400 })
  if (!email?.trim()) return NextResponse.json({ error: 'E-posta zorunludur.' }, { status: 400 })
  if (!grade) return NextResponse.json({ error: 'Sınıf zorunludur.' }, { status: 400 })

  const password = generatePassword()

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true, // kurum zaten bu kişiyi biliyor — ayrı onay gerekmiyor
    user_metadata: { pending_role: 'student' },
  })

  if (createErr || !created?.user) {
    const msg = createErr?.message?.includes('already been registered') || createErr?.message?.includes('already registered')
      ? 'Bu e-posta adresiyle zaten bir hesap var.'
      : (createErr?.message || 'Hesap oluşturulamadı.')
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const newUserId = created.user.id

  try {
    await createIdentity({
      supabaseUserId: newUserId,
      fullName: fullName.trim(),
      email: email.trim(),
      age: age ? parseInt(age) : undefined,
      role: 'student',
      parentEmail: parentEmail?.trim() || undefined,
      institutionName: institution.name,
    })

    if (phone?.trim()) {
      await updateIdentity(newUserId, { phone: phone.trim() } as any)
    }

    await supabaseAdmin.from('profiles').upsert({
      id: newUserId,
      grade,
      school: institution.name,
      class_number: classNumber?.trim() || null,
      language: 'Türkçe',
      role: 'student',
    })

    await supabaseAdmin.from('institution_users').insert({
      institution_id: institution.id,
      user_id: newUserId,
      role: 'student',
    })
  } catch (e: any) {
    // Kimlik/profil oluşturma başarısız olursa yarım kalmış auth kullanıcısını
    // temizle — yoksa "e-posta zaten kayıtlı ama hesap kullanılamaz" durumu olur.
    console.error('[create-student] kimlik/profil hatasi, auth kullanicisi geri aliniyor:', e)
    await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {})
    return NextResponse.json({ error: 'Hesap oluşturuldu ama kayıt tamamlanamadı. Lütfen tekrar deneyin.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, email: email.trim(), password })
}
