import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function getApprovedTeacher(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return { error: NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 }) }

  const { data: { user }, error: authError } = await db.auth.getUser(token)
  if (authError || !user) return { error: NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 }) }

  const { data: teacher, error: teacherError } = await db
    .from('teachers').select('id, approved').eq('user_id', user.id).maybeSingle()
  if (teacherError) return { error: NextResponse.json({ error: 'Öğretmen hesabı doğrulanamadı.' }, { status: 500 }) }
  if (!teacher?.approved) return { error: NextResponse.json({ error: 'Bu işlem onaylı öğretmen hesabı gerektirir.' }, { status: 403 }) }

  return { user, teacher }
}

export async function GET(req: NextRequest) {
  const auth = await getApprovedTeacher(req)
  if ('error' in auth) return auth.error

  const { data: memberships, error: membershipError } = await db
    .from('institution_users')
    .select('institution_id, joined_at')
    .eq('user_id', auth.user.id)
    .eq('role', 'teacher')
    .order('joined_at', { ascending: true })

  if (membershipError) return NextResponse.json({ error: 'Kurum bağlantıları alınamadı.' }, { status: 500 })
  const institutionIds = [...new Set((memberships ?? []).map(row => row.institution_id))]
  if (!institutionIds.length) return NextResponse.json({ institutions: [] }, { headers: { 'Cache-Control': 'private, no-store' } })

  const { data: institutions, error: institutionError } = await db
    .from('institutions').select('id, name, active').in('id', institutionIds)
  if (institutionError) return NextResponse.json({ error: 'Kurum bilgileri alınamadı.' }, { status: 500 })

  const joinedAt = new Map((memberships ?? []).map(row => [row.institution_id, row.joined_at]))
  return NextResponse.json({
    institutions: (institutions ?? []).map(institution => ({
      id: institution.id,
      name: institution.name,
      active: institution.active !== false,
      joined_at: joinedAt.get(institution.id) ?? null,
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await getApprovedTeacher(req)
  if ('error' in auth) return auth.error

  const limit = await checkRateLimit(auth.user.id, { endpoint: 'teacher-institution-join', limit: 10 })
  if (!limit.allowed) return rateLimitExceeded(limit)

  const body = await req.json().catch(() => null)
  if (!body || typeof body.institution_code !== 'string') {
    return NextResponse.json({ error: '8 karakterli kurum kodunu girin.' }, { status: 400 })
  }
  const institutionCode = body.institution_code.trim().toUpperCase()
  if (!/^[A-Z2-9]{8}$/.test(institutionCode)) {
    return NextResponse.json({ error: 'Kurum kodu 8 harf veya rakamdan oluşmalı.' }, { status: 400 })
  }

  const { data: institution, error: institutionError } = await db
    .from('institutions').select('id, name').eq('code', institutionCode).eq('active', true).maybeSingle()
  if (institutionError) return NextResponse.json({ error: 'Kurum kodu kontrol edilemedi.' }, { status: 500 })
  if (!institution) return NextResponse.json({ error: 'Aktif bir kurumla eşleşen kod bulunamadı.' }, { status: 404 })

  const { data: existing, error: existingError } = await db
    .from('institution_users').select('role')
    .eq('institution_id', institution.id).eq('user_id', auth.user.id).maybeSingle()
  if (existingError) return NextResponse.json({ error: 'Kurum üyeliği kontrol edilemedi.' }, { status: 500 })

  if (existing?.role === 'teacher') {
    return NextResponse.json({ success: true, already_member: true, institution_name: institution.name })
  }
  if (existing) {
    const roleLabel = existing.role === 'admin' ? 'yönetici' : 'öğrenci'
    return NextResponse.json({
      error: `Bu kurumda hesabınız zaten ${roleLabel} rolünde. Rolünüz değiştirilmedi; destek için kurum yöneticinizle görüşün.`,
    }, { status: 409 })
  }

  // Each institution gets its own row. The unique institution/user pair prevents
  // duplicate membership in one institution while allowing membership elsewhere.
  const { error: insertError } = await db.from('institution_users').insert({
    institution_id: institution.id,
    user_id: auth.user.id,
    role: 'teacher',
  })

  if (insertError?.code === '23505') {
    const { data: racedMembership } = await db.from('institution_users').select('role')
      .eq('institution_id', institution.id).eq('user_id', auth.user.id).maybeSingle()
    if (racedMembership?.role === 'teacher') {
      return NextResponse.json({ success: true, already_member: true, institution_name: institution.name })
    }
    return NextResponse.json({ error: 'Bu kurumdaki mevcut rolünüz değiştirilemedi.' }, { status: 409 })
  }
  if (insertError) {
    console.error('[teacher/institutions] membership insert failed:', insertError.message)
    return NextResponse.json({ error: 'Öğretmen kurum bağlantısı kaydedilemedi.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, already_member: false, institution_name: institution.name }, { status: 201 })
}
