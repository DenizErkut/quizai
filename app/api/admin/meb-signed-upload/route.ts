import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: p } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).single()
  return p?.is_admin ? user : null
}

// Signed upload URL üret — frontend bunu kullanarak direkt Storage'a yükler
export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const fileName = searchParams.get('file_name') || 'file.pdf'
  const level = searchParams.get('level') || 'genel'
  const subject = searchParams.get('subject') || 'genel'
  const unit = searchParams.get('unit') || 'genel'

  const normTR = (s: string) => s
    .replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
    .replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_')

  const ext = fileName.split('.').pop()
  const storagePath = `${normTR(level)}/${normTR(subject)}/${normTR(unit)}_${Date.now()}.${ext}`

  // Service role key ile signed URL üret (1 saatlik)
  const { data, error } = await adminDb.storage
    .from('meb-resources')
    .createSignedUploadUrl(storagePath)

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Signed URL üretilemedi' }, { status: 500 })
  }

  const { data: urlData } = adminDb.storage.from('meb-resources').getPublicUrl(storagePath)

  return NextResponse.json({
    signed_url: data.signedUrl,
    token: data.token,
    storage_path: storagePath,
    public_url: urlData.publicUrl,
  })
}
