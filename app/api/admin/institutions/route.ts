// app/api/admin/institutions/route.ts
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
  const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const { data: institutions } = await supabaseAdmin
    .from('institutions').select('*').order('created_at', { ascending: false })

  // Her kurum için öğrenci sayısı
  const counts: Record<string, number> = {}
  if (institutions?.length) {
    const { data: instUsers } = await supabaseAdmin
      .from('institution_users').select('institution_id').eq('role', 'student')
    ;(instUsers || []).forEach((u: any) => {
      counts[u.institution_id] = (counts[u.institution_id] || 0) + 1
    })
  }

  return NextResponse.json({ institutions: institutions || [], counts })
}
