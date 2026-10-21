// app/api/institution/location/route.ts
// Kurum yöneticisi KENDİ kurumunun konumunu (ülke, eyalet/il, şehir/ilçe) tamamlar/günceller.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { validateLocationDetails } from '@/lib/location/validate'
import { isKnownCountry } from '@/lib/location/data'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  // Yalnızca kurumun yöneticisi; kurum kimliği istekten değil oturumdan gelir.
  const { data: member } = await db.from('institution_users').select('institution_id').eq('user_id', user.id).eq('role', 'admin').maybeSingle()
  if (!member) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const checked = validateLocationDetails({ country: body?.country, state: body?.state, city: body?.city })
  if (checked.ok === false || !isKnownCountry(checked.value.country)) {
    return NextResponse.json({ error: 'Geçersiz konum bilgisi.' }, { status: 400 })
  }
  const { country, state, city } = checked.value
  const { error } = await db.from('institutions').update({ country, state, city }).eq('id', member.institution_id)
  if (error) {
    console.error('[institution/location] update failed:', error.message)
    return NextResponse.json({ error: 'Konum kaydedilemedi.' }, { status: 500 })
  }
  return NextResponse.json({ success: true, country, state, city })
}
