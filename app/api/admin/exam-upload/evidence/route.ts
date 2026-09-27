import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server-create-client'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'publication-evidence'
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_FILES = 10

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: profile } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

function extensionFor(file: File) {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

async function signedEvidence(paths: string[]) {
  if (!paths.length) return []
  const { data, error } = await adminDb.storage.from(BUCKET).createSignedUrls(paths, 600)
  if (error) throw error
  return (data || []).map((item, index) => ({ path: paths[index], url: item.signedUrl }))
}

export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await req.formData()
  const resourceId = String(form.get('resource_id') || '')
  const files = form.getAll('files').filter((item): item is File => item instanceof File && item.size > 0)
  if (!resourceId || !files.length) return NextResponse.json({ error: 'Kitapçık ve en az bir görsel gerekli.' }, { status: 400 })
  if (files.some(file => !ALLOWED_TYPES.has(file.type) || file.size > MAX_FILE_SIZE)) {
    return NextResponse.json({ error: 'Kanıtlar JPG, PNG veya WEBP olmalı ve dosya başına 5 MB’ı aşmamalıdır.' }, { status: 400 })
  }

  const { data: resource } = await adminDb.from('exam_resources')
    .select('id,purpose,source_type,publication_evidence_paths').eq('id', resourceId).single()
  if (!resource) return NextResponse.json({ error: 'Kitapçık bulunamadı.' }, { status: 404 })
  if (resource.purpose !== 'instant_test' || resource.source_type !== 'teacher') {
    return NextResponse.json({ error: 'Yayın izni kanıtı yalnızca öğretmen imzalı soru kitapçıklarına eklenebilir.' }, { status: 400 })
  }
  const currentPaths = Array.isArray(resource.publication_evidence_paths) ? resource.publication_evidence_paths : []
  if (currentPaths.length + files.length > MAX_FILES) {
    return NextResponse.json({ error: `Bir kitapçığa en fazla ${MAX_FILES} kanıt görseli eklenebilir.` }, { status: 400 })
  }

  const uploadedPaths: string[] = []
  try {
    for (const file of files) {
      const path = `${resourceId}/${randomUUID()}.${extensionFor(file)}`
      const { error } = await adminDb.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      })
      if (error) throw error
      uploadedPaths.push(path)
    }
    const paths = [...currentPaths, ...uploadedPaths]
    const { error } = await adminDb.from('exam_resources').update({ publication_evidence_paths: paths }).eq('id', resourceId)
    if (error) throw error
    return NextResponse.json({ success: true, evidence: await signedEvidence(paths) })
  } catch (error) {
    if (uploadedPaths.length) await adminDb.storage.from(BUCKET).remove(uploadedPaths)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Kanıt yüklenemedi.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const resourceId = typeof body?.resource_id === 'string' ? body.resource_id : ''
  const path = typeof body?.path === 'string' ? body.path : ''
  if (!resourceId || !path.startsWith(`${resourceId}/`)) return NextResponse.json({ error: 'Geçersiz kanıt.' }, { status: 400 })

  const { data: resource } = await adminDb.from('exam_resources').select('publication_evidence_paths').eq('id', resourceId).single()
  const paths = Array.isArray(resource?.publication_evidence_paths) ? resource.publication_evidence_paths : []
  if (!paths.includes(path)) return NextResponse.json({ error: 'Kanıt bulunamadı.' }, { status: 404 })
  const remaining = paths.filter((item: string) => item !== path)
  const { error: updateError } = await adminDb.from('exam_resources').update({ publication_evidence_paths: remaining }).eq('id', resourceId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  const { error: storageError } = await adminDb.storage.from(BUCKET).remove([path])
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
