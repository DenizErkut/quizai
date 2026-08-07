// app/api/profile/update-identity/route.ts
// İstemci sayfalarının kimlik alanlarını (ad-soyad, telefon) TR-PG'de güncellemesi
// için ince sarmalayıcı. Kimlik verisi tarayıcıdan doğrudan yazılamaz; bu route
// oturumu doğrular ve lib/identity/client.updateIdentity'yi çağırır.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentityBySupabaseId, updateIdentity, createIdentity } from '@/lib/identity/client'

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

  const { fullName, age, phone, parentEmail, role } = body || {}
  const updates: Record<string, any> = {}
  if (typeof fullName === 'string' && fullName.trim()) updates.full_name = fullName.trim()
  if (age !== undefined) {
    const n = typeof age === 'number' ? age : parseInt(age, 10)
    if (Number.isInteger(n) && n >= 5 && n <= 100) updates.age = n
    else if (age === null || age === '') updates.age = null
  }
  if (phone !== undefined) updates.phone = phone || null
  if (parentEmail !== undefined) updates.parent_email = parentEmail || null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Güncellenecek alan yok.' }, { status: 400 })
  }

  try {
    // Google OAuth ile gelip kimliği henüz oluşmamış kullanıcı olabilir — yoksa oluştur
    const existing = await getIdentityBySupabaseId(user.id)
    if (!existing) {
      await createIdentity({
        supabaseUserId: user.id,
        fullName: updates.full_name || (user.email?.split('@')[0] ?? 'Kullanıcı'),
        email: user.email || '',
        age: updates.age ?? undefined,
        role: role || 'student',
      })
      const followUp: Record<string, any> = {}
      if (updates.phone !== undefined) followUp.phone = updates.phone
      if (updates.parent_email !== undefined) followUp.parent_email = updates.parent_email
      if (Object.keys(followUp).length > 0) await updateIdentity(user.id, followUp)
    } else {
      await updateIdentity(user.id, updates)
    }
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[profile/update-identity] error:', e.message)
    return NextResponse.json({ error: 'Kimlik güncellenemedi.' }, { status: 500 })
  }
}
