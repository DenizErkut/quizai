// app/api/institution/data/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

  // Admin kontrolü
  const { data: instUser } = await supabaseAdmin
    .from('institution_users')
    .select('institution_id')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()

  if (!instUser) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  // Kurum bilgisi
  const { data: institution } = await supabaseAdmin
    .from('institutions')
    .select('*')
    .eq('id', instUser.institution_id)
    .single()

  // Kuruma kayıtlı öğrenciler
  const { data: members } = await supabaseAdmin
    .from('institution_users')
    .select('user_id, joined_at')
    .eq('institution_id', instUser.institution_id)
    .eq('role', 'student')

  if (!members?.length) {
    return NextResponse.json({ institution, students: [] })
  }

  const userIds = members.map((m: any) => m.user_id)

  // Her öğrenci için profil + streak + test verileri
  const studentData = await Promise.all(userIds.map(async (uid: string) => {
    const [profileRes, streakRes, sessionsRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('name, grade, avatar_url').eq('id', uid).maybeSingle(),
      supabaseAdmin.from('streaks').select('current_streak').eq('user_id', uid).maybeSingle(),
      supabaseAdmin.from('quiz_sessions').select('pct, created_at').eq('user_id', uid).eq('completed', true).order('created_at', { ascending: false }).limit(30),
    ])
    const sessions = sessionsRes.data ?? []
    const avgPct = sessions.length ? Math.round(sessions.reduce((a: number, s: any) => a + s.pct, 0) / sessions.length) : null
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    const weeklyTests = sessions.filter((s: any) => new Date(s.created_at) > weekAgo).length
    return {
      id: uid,
      name: profileRes.data?.name ?? 'İsimsiz',
      grade: profileRes.data?.grade ?? '',
      avatar_url: profileRes.data?.avatar_url ?? null,
      streak: streakRes.data?.current_streak ?? 0,
      totalTests: sessions.length,
      avgPct,
      weeklyTests,
      lastActive: sessions[0]?.created_at ?? null,
    }
  }))

  return NextResponse.json({ institution, students: studentData })
}
