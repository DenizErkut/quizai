// app/api/profile/location/route.ts
// Öğrencinin konumu: ülke/eyalet/şehir profiles'a (zorunlu), posta kodu ve açık adres
// (opsiyonel, kimlik verisi) TR-PG identities'e yazılır. Değerler sunucuda doğrulanır;
// kullanıcı yalnızca KENDİ kaydını değiştirebilir (kimlik token'dan gelir).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getIdentityBySupabaseId, updateIdentity } from '@/lib/identity/client'
import { validateLocationDetails } from '@/lib/location/validate'
import { isKnownCountry } from '@/lib/location/data'

export const runtime = 'nodejs'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any

async function currentUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: { user } } = await db.auth.getUser(token)
  return user ?? null
}

export async function GET(req: NextRequest) {
  const user = await currentUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('country,state,city').eq('id', user.id).maybeSingle()
  let postalCode = '', addressLine = ''
  try {
    const identity = await getIdentityBySupabaseId(user.id)
    postalCode = identity?.postal_code || ''
    addressLine = identity?.address_line || ''
  } catch (e) {
    console.warn('[profile/location] identity read skipped:', e?.message)
  }
  return NextResponse.json({
    country: profile?.country || '', state: profile?.state || '', city: profile?.city || '', postalCode, addressLine,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: NextRequest) {
  const user = await currentUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const checked = validateLocationDetails(body || {})
  if (checked.ok === false) return NextResponse.json({ error: 'Geçersiz konum bilgisi.', field: checked.field }, { status: 400 })
  const { country, state, city, postalCode, addressLine } = checked.value
  if (!isKnownCountry(country)) return NextResponse.json({ error: 'Geçersiz konum bilgisi.', field: 'country' }, { status: 400 })

  const { data: updated, error } = await db.from('profiles').update({ country, state, city }).eq('id', user.id).select('id')
  if (!error && !updated?.length) return NextResponse.json({ error: 'Profil bulunamadı.' }, { status: 404 })
  if (error) {
    console.error('[profile/location] profile update failed:', error.message)
    return NextResponse.json({ error: 'Konum kaydedilemedi.' }, { status: 500 })
  }

  // Posta kodu / açık adres kimlik verisidir (TR-PG). Sütunlar henüz yoksa ya da kimlik
  // henüz oluşmadıysa kaydı bozmadan yalnızca uyarı düşülür.
  let identitySaved = true
  try {
    const identity = await getIdentityBySupabaseId(user.id)
    if (identity) await updateIdentity(user.id, { postal_code: postalCode || null, address_line: addressLine || null })
    else identitySaved = !postalCode && !addressLine
  } catch (e) {
    identitySaved = !postalCode && !addressLine
    console.warn('[profile/location] identity write skipped:', e?.message)
  }
  return NextResponse.json({ success: true, identitySaved })
}
