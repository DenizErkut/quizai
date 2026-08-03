// app/api/admin/institution-students-report/route.ts
//
// Kurum bazında öğrenci raporu — ad/soyad, e-posta, telefon SUNUCU
// TARAFINDA maskelenir (client'a asla ham veri gönderilmez, sadece
// tarayıcıda görsel olarak gizlemek yeterli olmazdı — network sekmesinden
// okunabilirdi). Sadece sayı, sınıf ve kayıt tarihi ham gider.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'

// "Deniz Erkut" -> "De**** Er****" — her kelimenin ilk 2 karakteri
// görünür, geri kalanı SABİT 4 yıldızla maskelenir (gerçek uzunluk asla
// sızdırılmaz — "****" her zaman aynı görünür, ister 3 harf kalsın
// ister 10).
function maskNamePart(part: string): string {
  if (!part) return ''
  return part.slice(0, 2) + '****'
}
function maskFullName(fullName: string | null | undefined): string {
  if (!fullName) return '—'
  return fullName.trim().split(/\s+/).filter(Boolean).map(maskNamePart).join(' ')
}

// "deniz@icloud.com" -> "den****@iclo****"
function maskEmail(email: string | null | undefined): string {
  if (!email) return '—'
  const at = email.indexOf('@')
  if (at === -1) return maskNamePart(email)
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const domainMain = domain.split('.')[0] || domain
  return `${local.slice(0, 3)}****@${domainMain.slice(0, 4)}****`
}

// "05413969946" -> "+90541*******" (Türkiye numaraları +90 formatına
// normalize edilip ilk 6 karakter (+90 + ilk 2 rakam) görünür bırakılır)
function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  let cleaned = phone.replace(/[\s\-()]/g, '')
  if (cleaned.startsWith('0')) cleaned = '+90' + cleaned.slice(1)
  else if (cleaned.startsWith('90') && !cleaned.startsWith('+')) cleaned = '+' + cleaned
  else if (!cleaned.startsWith('+')) cleaned = '+90' + cleaned
  const visible = cleaned.slice(0, 6)
  const rest = cleaned.slice(6)
  return rest.length > 0 ? visible + '*'.repeat(rest.length) : visible
}

export async function GET(req: NextRequest) {
  const institutionId = req.nextUrl.searchParams.get('institution_id')
  if (!institutionId) return NextResponse.json({ error: 'institution_id gerekli.' }, { status: 400 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: links } = await adminClient
    .from('institution_users')
    .select('user_id')
    .eq('institution_id', institutionId)
    .eq('role', 'student')

  const userIds = (links ?? []).map((l: any) => l.user_id)
  if (userIds.length === 0) return NextResponse.json({ students: [] })

  const { data: profiles } = await adminClient
    .from('profiles')
    .select('id, grade, class_number, created_at')
    .in('id', userIds)

  const identities = await getIdentitiesBySupabaseIds(userIds)

  const students = (profiles ?? [])
    .map((p: any) => {
      const id = identities[p.id]
      return {
        name_masked: maskFullName(id?.full_name),
        email_masked: maskEmail(id?.email),
        phone_masked: maskPhone(id?.phone),
        grade: p.grade || null,
        class_number: p.class_number || null,
        created_at: p.created_at,
      }
    })
    .sort((a: any, b: any) => (a.grade || '').localeCompare(b.grade || ''))

  return NextResponse.json({ students })
}
