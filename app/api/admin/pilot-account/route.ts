import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server-create-client'
import { getIdentityBySupabaseId, updateIdentity } from '@/lib/identity/client'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Geçersiz kaynak.' }, { status: 403 })
  const jar = await cookies()
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { get: name => jar.get(name)?.value } })
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yönetici oturumu gerekli.' }, { status: 401 })
  const { data: admin } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (!admin?.is_admin) return NextResponse.json({ error: 'Yönetici yetkisi gerekli.' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!UUID.test(body?.userId || '') || body?.action !== 'convert-approved-teacher') return NextResponse.json({ error: 'Onaylı öğretmen hesabını seçin.' }, { status: 400 })
  const [{ data: teacher }, { data: profile }] = await Promise.all([
    db.from('teachers').select('id,approved').eq('user_id', body.userId).maybeSingle(),
    db.from('profiles').select('role').eq('id', body.userId).maybeSingle(),
  ])
  if (!teacher?.approved || !profile || !['student', 'teacher'].includes(profile.role)) return NextResponse.json({ error: 'Hesabın mevcut onaylı öğretmen kaydı gerekli.' }, { status: 422 })
  let oldRole: 'student' | 'teacher' | 'parent' | 'institution_admin' | undefined
  let profileCommitted = false
  try {
    const identity = await getIdentityBySupabaseId(body.userId)
    if (!identity) return NextResponse.json({ error: 'Kimlik kaydı eksik; hiçbir rol değiştirilmedi.' }, { status: 422 })
    oldRole = identity.role
    await updateIdentity(body.userId, { role: 'teacher' })
    const { error } = await db.from('profiles').update({ role: 'teacher' }).eq('id', body.userId)
    if (error) {
      await updateIdentity(body.userId, { role: oldRole })
      return NextResponse.json({ error: 'Profil güncellenemedi; kimlik rolü geri alındı.' }, { status: 500 })
    }
    profileCommitted = true
    const verified = await getIdentityBySupabaseId(body.userId)
    if (verified?.role !== 'teacher') return NextResponse.json({ error: 'Kimlik rolü doğrulanamadı; yönetici incelemesi gerekli.' }, { status: 500 })
    return NextResponse.json({ success: true, message: 'Kimlik ve profil öğretmen rolüne dönüştürüldü. Öğretmen kaydı, sınıflar, yönetici yetkisi ve geçmiş testler korundu.' })
  } catch {
    if (oldRole && !profileCommitted) {
      try { await updateIdentity(body.userId, { role: oldRole }) } catch { /* Retry can reconcile both stores without deleting history. */ }
    }
    return NextResponse.json({ error: 'Kimlik sistemiyle dönüşüm tamamlanamadı. İşlemi yeniden deneyin; geçmiş kayıtlar silinmedi.' }, { status: 503 })
  }
}
