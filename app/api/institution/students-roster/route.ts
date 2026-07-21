// app/api/institution/students-roster/route.ts
// Not/Veri İçe Aktar sihirbazının eşleştirme adımı için: kurumun tüm
// öğrencilerini { id, schoolNo, fullName, grade } olarak döner.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: instUser } = await supabaseAdmin
    .from('institution_users')
    .select('institution_id')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()
  if (!instUser) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const { data: members } = await supabaseAdmin
    .from('institution_users')
    .select('user_id')
    .eq('institution_id', instUser.institution_id)
    .eq('role', 'student')

  if (!members?.length) {
    return NextResponse.json({ institutionId: instUser.institution_id, students: [] })
  }

  const userIds = members.map((m: any) => m.user_id)
  const identities = await getIdentitiesBySupabaseIds(userIds)

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, class_number, grade')
    .in('id', userIds)

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  const students = userIds.map((uid: string) => ({
    id: uid,
    schoolNo: profileMap.get(uid)?.class_number ?? null,
    fullName: identities[uid]?.full_name ?? 'İsimsiz',
    grade: profileMap.get(uid)?.grade ?? null,
  }))

  return NextResponse.json({ institutionId: instUser.institution_id, students })
}
