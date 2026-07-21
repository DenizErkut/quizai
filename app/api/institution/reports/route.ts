// app/api/institution/reports/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'
import { attachGradesAndStats, buildSectionalReport, ReportStudentBase } from '@/lib/student-reports'

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
    .from('institution_users').select('institution_id')
    .eq('user_id', user.id).eq('role', 'admin').maybeSingle()
  if (!instUser) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const { data: importsData } = await supabaseAdmin
    .from('grade_imports').select('id, label, created_at')
    .eq('institution_id', instUser.institution_id)
    .order('created_at', { ascending: false })
  const imports = importsData ?? []

  const requestedImportId = req.nextUrl.searchParams.get('importId')
  const importId = requestedImportId || imports[0]?.id || null

  const { data: members } = await supabaseAdmin
    .from('institution_users').select('user_id')
    .eq('institution_id', instUser.institution_id).eq('role', 'student')

  if (!members?.length) {
    return NextResponse.json({ imports, selectedImportId: importId, students: [], subjectColumns: [] })
  }

  const userIds = members.map((m: any) => m.user_id)
  const identities = await getIdentitiesBySupabaseIds(userIds)
  const { data: profiles } = await supabaseAdmin.from('profiles').select('id, class_number, grade').in('id', userIds)
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  const roster: ReportStudentBase[] = userIds.map((uid: string) => ({
    id: uid,
    fullName: identities[uid]?.full_name ?? 'İsimsiz',
    schoolNo: profileMap.get(uid)?.class_number ?? null,
    grade: profileMap.get(uid)?.grade ?? null,
  }))

  const mode = req.nextUrl.searchParams.get('mode')
  if (mode === 'sectional') {
    const { students, subjects } = await buildSectionalReport(roster, importId)
    return NextResponse.json({ imports, selectedImportId: importId, students, subjects })
  }

  const { students, subjectColumns } = await attachGradesAndStats(roster, importId)
  return NextResponse.json({ imports, selectedImportId: importId, students, subjectColumns })
}
