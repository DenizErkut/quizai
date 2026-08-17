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

  // Zaten bu kuruma (herhangi bir rolle) bağlı mı?
  // ÖNEMLİ: institution_users'ta (institution_id, user_id) çifti üzerinde
  // TEKİL satır kısıtı var (institution_users_institution_id_user_id_key) —
  // yani bir kullanıcı aynı kuruma hem yönetici hem öğrenci olarak kayıtlı
  // OLAMAZ. Önceden buradaki kontrol satırın rolünü hiç bakmadan var olan
  // HERHANGİ bir satırı "zaten öğrencisin, başarılı" sayıyordu — bir kurum
  // yöneticisi kendi kurum koduyla "öğrenci olarak katıl" akışını
  // denediğinde arayüze sahte bir "✅ kaydoldunuz" dönüyor ama hiçbir satır
  // eklenmiyordu (zaten kısıt buna izin vermez); sayfa yenilenince
  // (profile/edit ve veli panelinin ilgili sorguları role='student'
  // filtresi kullandığı için) öğrenci kaydı bulunamıyor, arayüz sessizce
  // "kayıtlı değilsin" durumuna geri dönüyordu.
  const { data: existing } = await supabaseAdmin
    .from('institution_users')
    .select('id, role')
    .eq('institution_id', inst.id)
    .eq('user_id', user_id)
    .maybeSingle()

  if (existing) {
    if (existing.role === 'student') {
      return NextResponse.json({ success: true, already_member: true, institution_name: inst.name })
    }
    // Yönetici (veya ileride eklenebilecek başka bir rol) — aynı kuruma
    // öğrenci olarak da katılamaz, DB'deki tekil kısıt buna izin vermiyor.
    const roleLabel = existing.role === 'admin' ? 'yönetici' : existing.role
    return NextResponse.json(
      { error: `Bu kuruma zaten "${roleLabel}" olarak bağlısınız. Aynı hesapla öğrenci olarak katılamazsınız — farklı bir hesap kullanmanız gerekir.` },
      { status: 409 }
    )
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
