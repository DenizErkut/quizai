import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function getInstitutionAdmin(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return { error: NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 }) }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return { error: NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 }) }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('institution_users')
    .select('institution_id')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()

  if (membershipError) {
    return { error: NextResponse.json({ error: 'Kurum yöneticiliği doğrulanamadı.' }, { status: 500 }) }
  }
  if (!membership) return { error: NextResponse.json({ error: 'Bu işlem kurum yöneticisi gerektirir.' }, { status: 403 }) }

  return { user, institutionId: membership.institution_id }
}

export async function GET(req: NextRequest) {
  const auth = await getInstitutionAdmin(req)
  if ('error' in auth) return auth.error

  const { data: members, error: membersError } = await supabaseAdmin
    .from('institution_users')
    .select('user_id, joined_at, is_active, deactivated_at')
    .eq('institution_id', auth.institutionId)
    .eq('role', 'teacher')
    .order('is_active', { ascending: false })
    .order('joined_at', { ascending: true })
    .limit(1000)

  if (membersError) return NextResponse.json({ error: 'Öğretmenler alınamadı.' }, { status: 500 })

  const userIds = (members ?? []).map(row => row.user_id)
  let identities: Awaited<ReturnType<typeof getIdentitiesBySupabaseIds>> = {}
  if (userIds.length) {
    try {
      identities = await getIdentitiesBySupabaseIds(userIds)
    } catch (error) {
      console.error('[institution/teachers] kimlikler alınamadı:', error)
      return NextResponse.json({ error: 'Öğretmen bilgileri şu anda alınamıyor.' }, { status: 503 })
    }
  }

  return NextResponse.json({
    teachers: (members ?? []).map(member => ({
      id: member.user_id,
      name: identities[member.user_id]?.full_name || 'İsimsiz öğretmen',
      joinedAt: member.joined_at,
      isActive: member.is_active,
      deactivatedAt: member.deactivated_at,
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PATCH(req: NextRequest) {
  const auth = await getInstitutionAdmin(req)
  if ('error' in auth) return auth.error

  const body = await req.json().catch(() => null)
  if (!body || typeof body.user_id !== 'string' || !UUID_PATTERN.test(body.user_id) || typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'Öğretmen ve durum bilgisi geçersiz.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await supabaseAdmin
    .from('institution_users')
    .update({
      is_active: body.is_active,
      deactivated_at: body.is_active ? null : now,
      deactivated_by: body.is_active ? null : auth.user.id,
    })
    .eq('institution_id', auth.institutionId)
    .eq('user_id', body.user_id)
    .eq('role', 'teacher')
    .select('user_id, is_active, deactivated_at')
    .maybeSingle()

  if (error) {
    console.error('[institution/teachers] durum güncellenemedi:', error.message)
    return NextResponse.json({ error: 'Öğretmen durumu güncellenemedi.' }, { status: 500 })
  }
  if (!updated) return NextResponse.json({ error: 'Bu kurumda böyle bir öğretmen bağlantısı bulunamadı.' }, { status: 404 })

  return NextResponse.json({ teacher: updated }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function DELETE(req: NextRequest) {
  const auth = await getInstitutionAdmin(req)
  if ('error' in auth) return auth.error

  const body = await req.json().catch(() => null)
  if (!body || typeof body.user_id !== 'string' || !UUID_PATTERN.test(body.user_id)) {
    return NextResponse.json({ error: 'Öğretmen bilgisi geçersiz.' }, { status: 400 })
  }

  const { data: removed, error } = await supabaseAdmin
    .from('institution_users')
    .delete()
    .eq('institution_id', auth.institutionId)
    .eq('user_id', body.user_id)
    .eq('role', 'teacher')
    .select('user_id')
    .maybeSingle()

  if (error) {
    console.error('[institution/teachers] bağlantı kaldırılamadı:', error.message)
    return NextResponse.json({ error: 'Öğretmen bağlantısı kaldırılamadı.' }, { status: 500 })
  }
  if (!removed) return NextResponse.json({ error: 'Bu kurumda böyle bir öğretmen bağlantısı bulunamadı.' }, { status: 404 })

  return NextResponse.json({ removed: true }, { headers: { 'Cache-Control': 'private, no-store' } })
}
