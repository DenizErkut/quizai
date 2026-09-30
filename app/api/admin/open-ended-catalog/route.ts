import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getAuthedUser } from '@/lib/report-context'
import { loadOpenEndedCatalog, normalizeCatalogTopics, OPEN_ENDED_GRADE_KEYS, type OpenEndedGradeKey } from '@/lib/open-ended-practice-catalog'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireAdmin(req: NextRequest) {
  const user = await getAuthedUser(req)
  if (!user) return { error: NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 }) }
  const { data, error } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (error || !data?.is_admin) return { error: NextResponse.json({ error: 'Yönetici yetkisi gerekli.' }, { status: 403 }) }
  return { user }
}

function validGrade(value: unknown): value is OpenEndedGradeKey {
  return typeof value === 'string' && OPEN_ENDED_GRADE_KEYS.some(key => key === value)
}

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req)
  if (access.error) return access.error
  const grade = req.nextUrl.searchParams.get('grade')
  if (!validGrade(grade)) return NextResponse.json({ error: 'Geçerli sınıf seçin.' }, { status: 400 })
  try {
    return NextResponse.json({ grade, subjects: await loadOpenEndedCatalog(db, grade) })
  } catch {
    return NextResponse.json({ error: 'Açık uçlu konu kataloğu okunamadı. Veritabanı geçişini kontrol edin.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const access = await requireAdmin(req)
  if (access.error) return access.error
  const body = await req.json().catch(() => null) as { grade?: unknown; subject?: unknown; topics?: unknown; isActive?: unknown } | null
  if (!body || !validGrade(body.grade) || typeof body.subject !== 'string' || !body.subject.trim() ||
    body.subject.trim().length > 120 || typeof body.isActive !== 'boolean') {
    return NextResponse.json({ error: 'Sınıf, ders ve görünürlük bilgisi gerekli.' }, { status: 400 })
  }
  const topics = normalizeCatalogTopics(body.topics)
  if (!topics) return NextResponse.json({ error: 'En fazla 100 farklı konu girin; her konu 1–160 karakter olmalı.' }, { status: 400 })
  const subject = body.subject.trim()
  const { data: currentRows, error: currentError } = await db.from('open_ended_practice_catalog')
    .select('id,subject').eq('grade_key', body.grade)
  if (currentError) return NextResponse.json({ error: 'Katalog okunamadı.' }, { status: 500 })
  const existing = currentRows?.find(row => row.subject.toLocaleLowerCase('tr') === subject.toLocaleLowerCase('tr'))
  const payload = { grade_key: body.grade, subject: existing?.subject ?? subject, topics, is_active: body.isActive, updated_at: new Date().toISOString() }
  const query = existing
    ? db.from('open_ended_practice_catalog').update(payload).eq('id', existing.id)
    : db.from('open_ended_practice_catalog').insert(payload)
  const { error } = await query
  if (error) return NextResponse.json({ error: 'Kayıt yapılamadı.' }, { status: 500 })
  return NextResponse.json({ subjects: await loadOpenEndedCatalog(db, body.grade) })
}
