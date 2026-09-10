import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })

  const query = (req.nextUrl.searchParams.get('q') || '').trim().toLocaleLowerCase('tr-TR')
  if (query.length < 2) return NextResponse.json({ users: [] })
  const { data: profiles, error } = await db.from('profiles').select('id,grade').limit(1000)
  if (error) return NextResponse.json({ error: 'Kullanıcılar alınamadı.' }, { status: 500 })
  const identities = await getIdentitiesBySupabaseIds((profiles ?? []).map(row => row.id))
  const users = (profiles ?? []).map(row => ({ id: row.id, grade: row.grade, name: identities[row.id]?.full_name || 'İsimsiz', email: identities[row.id]?.email || '' }))
    .filter(item => `${item.name} ${item.email} ${item.id}`.toLocaleLowerCase('tr-TR').includes(query)).slice(0, 20)
  return NextResponse.json({ users })
}
