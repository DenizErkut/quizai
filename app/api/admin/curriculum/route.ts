// app/api/admin/curriculum/route.ts
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

// GET — tüm müfredatı listele
export async function GET() {
  const { data } = await adminDb.from('curriculum')
    .select('*').order('level').order('grade').order('sort_order')
  return NextResponse.json({ curriculum: data || [] })
}

// POST — yeni ders ekle
export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { level, grade, subject, topics } = await req.json()
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
  const update: any = {}
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

  const { id } = await req.json()
  const { error } = await adminDb.from('curriculum').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
