// app/api/parent/reports/route.ts
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

  const { data: links } = await supabaseAdmin
    .from('parent_children').select('child_id, nickname').eq('parent_id', user.id)

  if (!links?.length) {
    return NextResponse.json({ imports: [], selectedImportId: null, students: [], subjectColumns: [] })
  }

  const childIds = links.map((l: any) => l.child_id)
  const nicknameMap = new Map(links.map((l: any) => [l.child_id, l.nickname]))

  // Bu velinin çocuklarına ait notların geldiği içe aktarımlar (kurum ya da
  // öğretmen kaynaklı olabilir — veli için kaynağı ayırt etmeye gerek yok).
  const { data: gradeRows } = await supabaseAdmin
    .from('student_grades').select('import_id').in('student_id', childIds)
  const importIds = [...new Set((gradeRows ?? []).map((g: any) => g.import_id))]

  let imports: { id: string; label: string; created_at: string }[] = []
  if (importIds.length) {
    const { data } = await supabaseAdmin
      .from('grade_imports').select('id, label, created_at')
      .in('id', importIds).order('created_at', { ascending: false })
    imports = data ?? []
  }

  const requestedImportId = req.nextUrl.searchParams.get('importId')
  const importId = requestedImportId || imports[0]?.id || null

  const identities = await getIdentitiesBySupabaseIds(childIds)
  const { data: profiles } = await supabaseAdmin.from('profiles').select('id, class_number, grade').in('id', childIds)
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  const roster: ReportStudentBase[] = childIds.map((cid: string) => ({
    id: cid,
    fullName: nicknameMap.get(cid) || identities[cid]?.full_name || 'İsimsiz',
    schoolNo: profileMap.get(cid)?.class_number ?? null,
    grade: profileMap.get(cid)?.grade ?? null,
  }))

  const mode = req.nextUrl.searchParams.get('mode')
  if (mode === 'sectional') {
    const { students, subjects } = await buildSectionalReport(roster, importId)
    return NextResponse.json({ imports, selectedImportId: importId, students, subjects })
  }

  const { students, subjectColumns } = await attachGradesAndStats(roster, importId)
  return NextResponse.json({ imports, selectedImportId: importId, students, subjectColumns })
}
