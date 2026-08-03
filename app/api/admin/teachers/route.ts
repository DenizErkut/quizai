// app/api/admin/teachers/route.ts
// service_role ile tüm öğretmenleri çeker — RLS'yi bypass eder
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  // Admin kontrolü
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  }

  // service_role ile TÜM öğretmenleri çek (RLS bypass)
  const { data: teachers, error } = await supabaseAdmin
    .from('teachers')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Kimlik alanları (name/email/phone) artık TR-PG'de — user_id ile eşleyip ekle
  const identities = await getIdentitiesBySupabaseIds((teachers ?? []).map((t: any) => t.user_id))
  const withIdentity = (teachers ?? []).map((t: any) => {
    const id = identities[t.user_id]
    return { ...t, name: id?.full_name ?? null, email: id?.email ?? null, phone: id?.phone ?? null }
  })

  // NOT: 'teacher-documents' bucket'ı PRIVATE (kişisel belge içerdiği için
  // bilerek public değil). Kayıt sırasında getPublicUrl() ile üretilip
  // document_url'e yazılan link bucket private olduğu için AÇILMIYOR —
  // burada admin'in görüntüleyebilmesi için kısa ömürlü (5 dakika) imzalı
  // bir URL'ye çeviriyoruz. Süre dolunca link çalışmaz — admin sayfayı
  // yenileyip tekrar açmalı (bilerek: belgeler süresiz erişilebilir
  // kalmasın).
  const withDocs = await Promise.all(withIdentity.map(async (t: any) => {
    if (!t.document_url) return t
    const marker = '/teacher-documents/'
    const idx = t.document_url.indexOf(marker)
    if (idx === -1) return t
    const path = t.document_url.slice(idx + marker.length)
    const { data: signed } = await supabaseAdmin.storage
      .from('teacher-documents')
      .createSignedUrl(path, 300)
    return { ...t, document_url: signed?.signedUrl || null }
  }))

  return NextResponse.json({ teachers: withDocs })
}
