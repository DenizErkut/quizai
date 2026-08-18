// app/api/auth/consent-status/route.ts
//
// 18 Ağustos 2026 — Madde 7 (pratium-bekleyen-isler-uygulama-plani.md):
// versiyon karşılaştırma / yeniden-onay akışı. GET: oturum açmış kullanıcının
// hangi rıza türlerinde güncel olmayan (ya da hiç olmayan) bir onayı
// olduğunu döner. POST: kullanıcı "onaylıyorum" dediğinde, güncel versiyonla
// yeni bir consent_records satırı ekler (bkz. components/ConsentGate.tsx).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentityBySupabaseId, getConsentStatus, recordConsent, CURRENT_CONSENT_VERSIONS } from '@/lib/identity/client'

export const runtime = 'nodejs'

function authedUser(token: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any
  return supabase.auth.getUser()
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)

  const { data: { user } } = await authedUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const identity = await getIdentityBySupabaseId(user.id)
  if (!identity) return NextResponse.json({ hasIdentity: false, needsReconsent: [], status: [] })

  // veli_onayi sadece 18 yaş altı öğrenciler için geçerli bir kategori.
  const applicable = ['aydinlatma', 'acik_riza_analiz']
  if (identity.age != null && identity.age < 18) applicable.push('veli_onayi')

  const status = await getConsentStatus(identity.id, applicable)
  const needsReconsent = status.filter(s => s.needsReconsent).map(s => s.consentType)

  return NextResponse.json({ hasIdentity: true, status, needsReconsent })
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)

  const { data: { user } } = await authedUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const identity = await getIdentityBySupabaseId(user.id)
  if (!identity) return NextResponse.json({ error: 'Kimlik bulunamadı.' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const types: string[] = Array.isArray(body?.types) ? body.types.filter((t: any) => typeof t === 'string') : []
  if (types.length === 0) return NextResponse.json({ error: 'types (dizi) gerekli.' }, { status: 400 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  for (const type of types) {
    const version = CURRENT_CONSENT_VERSIONS[type] || 'v1.0'
    // NOT: veli_onayi'nın burada "granted: true" ile kaydedilmesi, önündeki
    // ekranda oturum açmış kişinin (öğrenci ya da veli, hesap paylaşımına
    // bağlı) onayladığı anlamına gelir — kayıt anındaki akışla aynı
    // sınırlamayı taşır (gerçek veli-kimlik doğrulaması bu MVP'nin kapsamı
    // dışında, bkz. pratium-bekleyen-isler-uygulama-plani.md Madde 7).
    await recordConsent({ identityId: identity.id, consentType: type, version, granted: true, ipAddress: ip })
  }

  return NextResponse.json({ success: true })
}
