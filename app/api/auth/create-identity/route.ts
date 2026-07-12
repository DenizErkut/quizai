// app/api/auth/create-identity/route.ts
// Kayıt (supabase.auth.signUp) sonrası, oturum açmış kullanıcı için TR-PG'de
// kimlik kaydı + KVKK rıza kayıtları oluşturur. Kimlik verisi (ad-soyad, yaş,
// veli e-postası) yalnızca TR-PG'de yaşar; Supabase Auth sadece oturum içindir.
//
// Güvenlik: yalnızca Bearer token ile doğrulanan kullanıcı, KENDİ kimliğini
// oluşturabilir (userId istemciden alınmaz, token'dan gelir).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createIdentity, getIdentityBySupabaseId, recordConsent } from '@/lib/identity/client'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
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

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  }

  const {
    fullName, age, role,
    parentEmail, institutionName,
    kvkkAydinlatma, kvkkAcikRiza, veliOnayi,
  } = body || {}

  if (!fullName || !role) {
    return NextResponse.json({ error: 'Eksik parametre.' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  const numericAge = age != null && age !== '' ? parseInt(String(age)) : undefined

  try {
    // İdempotent: kimlik zaten varsa yeniden oluşturma
    let identity = await getIdentityBySupabaseId(user.id)
    if (!identity) {
      identity = await createIdentity({
        supabaseUserId: user.id,
        fullName,
        email: user.email || '',
        age: numericAge,
        role,
        parentEmail: numericAge != null && numericAge < 18 ? parentEmail : undefined,
        institutionName,
      })

      // KVKK rıza kayıtları — kimlikle birlikte TR-PG'de (ispat yükümlülüğü)
      if (kvkkAydinlatma !== undefined) {
        await recordConsent({ identityId: identity.id, consentType: 'aydinlatma', version: 'v1.0', granted: !!kvkkAydinlatma, ipAddress: ip })
      }
      if (kvkkAcikRiza !== undefined) {
        await recordConsent({ identityId: identity.id, consentType: 'acik_riza_analiz', version: 'v1.0', granted: !!kvkkAcikRiza, ipAddress: ip })
      }
      if (numericAge != null && numericAge < 18 && veliOnayi !== undefined) {
        await recordConsent({ identityId: identity.id, consentType: 'veli_onayi', version: 'v1.0', granted: !!veliOnayi, ipAddress: ip })
      }
    }

    return NextResponse.json({ success: true, identityId: identity.id })
  } catch (e: any) {
    console.error('[auth/create-identity] error:', e.message)
    return NextResponse.json({ error: 'Kimlik oluşturulamadı: ' + e.message }, { status: 500 })
  }
}
