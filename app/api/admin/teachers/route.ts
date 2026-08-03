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
  const marker = '/teacher-documents/'
  async function toSignedUrl(rawUrl: string): Promise<string | null> {
    const idx = rawUrl.indexOf(marker)
    if (idx === -1) return null
    const path = rawUrl.slice(idx + marker.length)
    const { data: signed } = await supabaseAdmin.storage
      .from('teacher-documents')
      .createSignedUrl(path, 300)
    return signed?.signedUrl || null
  }

  const withDocs = await Promise.all(withIdentity.map(async (t: any) => {
    // Çoklu belge (document_urls) varsa hepsini imzalı URL'e çevir.
    if (Array.isArray(t.document_urls) && t.document_urls.length > 0) {
      const signedUrls = (await Promise.all(t.document_urls.map(toSignedUrl))).filter(Boolean)
      return { ...t, document_url: signedUrls[0] || null, document_urls: signedUrls }
    }
    // Geriye dönük uyumluluk: eski kayıtlarda sadece tekil document_url var
    if (!t.document_url) return t
    const signed = await toSignedUrl(t.document_url)
    return { ...t, document_url: signed, document_urls: signed ? [signed] : null }
  }))

  return NextResponse.json({ teachers: withDocs })
}
