// app/api/admin/curriculum/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
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

// GET — tüm müfredatı listele
export async function GET() {
  const [{ data }, { data: objectives }] = await Promise.all([
    adminDb.from('curriculum')
    .select('*').order('level').order('grade').order('sort_order')
    , adminDb.from('learning_objective_catalog').select('grade,subject,topic,unit')
      .eq('is_active', true).limit(10000),
  ])
  const key = (value: unknown) => typeof value === 'string' ? value.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim() : ''
  const gradeKey = (value: unknown) => key(value).replace(/ sınıf/g, '').replace(/\. sınıf/g, '').replace(/[^0-9]/g, '')
  const curriculum = (data || []).map(item => {
    if (Array.isArray(item.topics) && item.topics.length) return item
    const matches = (objectives || []).filter(objective => gradeKey(objective.grade) === gradeKey(item.grade) && key(objective.subject) === key(item.subject))
    const topics = [...new Set(matches.flatMap(objective => [objective.topic, objective.unit].filter((value): value is string => Boolean(value))))]
    return topics.length ? { ...item, topics } : item
  })
  return NextResponse.json({ curriculum })
}

// POST — yeni ders ekle
export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  if (body?.action === 'backfill-topics') {
    const [{ data: rows, error: rowsError }, { data: objectives, error: objectivesError }] = await Promise.all([
      adminDb.from('curriculum').select('id,grade,subject,topics'),
      adminDb.from('learning_objective_catalog').select('grade,subject,topic,unit')
        .eq('is_active', true).limit(10000),
    ])
    if (rowsError || objectivesError) return NextResponse.json({ error: rowsError?.message || objectivesError?.message }, { status: 500 })
    const key = (value: unknown) => typeof value === 'string' ? value.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim() : ''
    const gradeKey = (value: unknown) => key(value).replace(/ sınıf/g, '').replace(/\. sınıf/g, '').replace(/[^0-9]/g, '')
    let updated = 0
    for (const row of rows || []) {
      const derived = [...new Set((objectives || []).filter(objective => gradeKey(objective.grade) === gradeKey(row.grade) && key(objective.subject) === key(row.subject))
        .flatMap(objective => [objective.topic, objective.unit].filter((value): value is string => Boolean(value))))]
      const existing = Array.isArray(row.topics) ? row.topics.filter((value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())) : []
      const topics = [...new Set([...existing, ...derived])]
      if (topics.length && topics.length !== existing.length) {
        const { error } = await adminDb.from('curriculum').update({ topics }).eq('id', row.id)
        if (error) return NextResponse.json({ error: error.message, updated }, { status: 500 })
        updated++
      }
    }
    return NextResponse.json({ ok: true, updated })
  }
  const { level, grade, subject, topics } = body
  if (!level || !grade || !subject) {
    return NextResponse.json({ error: 'level, grade, subject zorunlu' }, { status: 400 })
  }

  // Sort order — o grade'deki son sıradan 1 fazla
  const { data: last } = await adminDb.from('curriculum')
    .select('sort_order').eq('level', level).eq('grade', grade)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await adminDb.from('curriculum').insert({
    level, grade, subject, topics: topics || [], sort_order: (last?.sort_order || 0) + 1
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// PATCH — güncelle (is_active toggle veya topics güncelle)
export async function PATCH(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, is_active, topics, subject, sort_order } = await req.json()
  const update: Record<string, unknown> = {}
  if (is_active !== undefined) update.is_active = is_active
  if (topics !== undefined) update.topics = topics
  if (subject !== undefined) update.subject = subject
  if (sort_order !== undefined) update.sort_order = sort_order

  const { error } = await adminDb.from('curriculum').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — sil
export async function DELETE(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, confirmed } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID gerekli' }, { status: 400 })

  // "Önce gör, sonra sil" kontrol listesi (bkz. pratium-bekleyen-isler-
  // uygulama-plani.md Madde 5) — curriculum satırları (konu listesi)
  // zaten ekranda tam görünür durumda olduğu için ayrı bir önizleme
  // endpoint'i gerekmiyor, ama açık bir onay adımı yine de zorunlu.
  if (!confirmed) {
    return NextResponse.json({ error: 'Silme onayı gerekli (confirmed:true olmadan silme çalışmaz).' }, { status: 400 })
  }

  const { error } = await adminDb.from('curriculum').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
