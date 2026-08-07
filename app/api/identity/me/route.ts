// app/api/identity/me/route.ts
// SADECE oturum sahibinin KENDİ kimlik kaydını döner (ad, yaş, telefon, veli
// e-postası vb.). /api/identity/resolve'dan bilinçli olarak AYRI tutulur:
// o endpoint çoklu kullanıcı id'si kabul eder (sınıf listesi, sıralama gibi
// başka kullanıcıların bilgisini çözmek için) ve bu yüzden sadece herkese
// açık sayılabilecek alanları (full_name, role) döner — yaş gibi hassas bir
// alanı oraya eklemek, id parametresi yoluyla BAŞKA kullanıcıların yaşının da
// sızdırılabilmesi anlamına gelirdi (K-12 platformda reşit olmayan öğrenciler
// dahil). Bu endpoint id PARAMETRESİ ALMAZ — token'daki kullanıcıdan başka
// hiç kimsenin kaydına asla erişemez.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentityBySupabaseId } from '@/lib/identity/client'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
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
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  try {
    const identity = await getIdentityBySupabaseId(user.id)
    if (!identity) return NextResponse.json({ identity: null })
    return NextResponse.json({
      identity: {
        full_name: identity.full_name,
        age: identity.age,
        phone: identity.phone,
        parent_email: identity.parent_email,
        institution_name: identity.institution_name,
      },
    })
  } catch (e: any) {
    console.error('[identity/me] error:', e.message)
    return NextResponse.json({ error: 'Kimlik alınamadı.' }, { status: 500 })
  }
}
