// app/api/teacher/reports/route.ts
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

  const { data: teacher } = await supabaseAdmin
    .from('teachers').select('id, approved').eq('user_id', user.id).maybeSingle()
  if (!teacher?.approved) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const { data: importsData } = await supabaseAdmin
    .from('grade_imports').select('id, label, created_at')
    .eq('teacher_id', teacher.id)
    .order('created_at', { ascending: false })
  const imports = importsData ?? []

  const requestedImportId = req.nextUrl.searchParams.get('importId')
  const importId = requestedImportId || imports[0]?.id || null

  const { data: classrooms } = await supabaseAdmin
    .from('classrooms').select('id, name').eq('teacher_id', teacher.id)

  if (!classrooms?.length) {
    return NextResponse.json({ imports, selectedImportId: importId, students: [], subjectColumns: [], classrooms: [] })
  }

  const classroomMap = new Map(classrooms.map((c: any) => [c.id, c.name]))
  const requestedClassroomId = req.nextUrl.searchParams.get('classroomId')
  const classroomIds = requestedClassroomId ? [requestedClassroomId] : classrooms.map((c: any) => c.id)

  const { data: members } = await supabaseAdmin
    .from('classroom_students').select('student_id, classroom_id')
    .in('classroom_id', classroomIds)

  if (!members?.length) {
    return NextResponse.json({ imports, selectedImportId: importId, students: [], subjectColumns: [], classrooms })
  }

  const userIds = [...new Set(members.map((m: any) => m.student_id))]
  const identities = await getIdentitiesBySupabaseIds(userIds)
  const { data: profiles } = await supabaseAdmin.from('profiles').select('id, class_number, grade').in('id', userIds)
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  const roster: ReportStudentBase[] = members.map((m: any) => ({
    id: m.student_id,
    fullName: identities[m.student_id]?.full_name ?? 'İsimsiz',
    schoolNo: profileMap.get(m.student_id)?.class_number ?? null,
    grade: profileMap.get(m.student_id)?.grade ?? null,
    classroomName: classroomMap.get(m.classroom_id) ?? null,
  }))

  const mode = req.nextUrl.searchParams.get('mode')
  if (mode === 'sectional') {
    const { students, subjects } = await buildSectionalReport(roster, importId)
    return NextResponse.json({ imports, selectedImportId: importId, students, subjects, classrooms })
  }

  const { students, subjectColumns } = await attachGradesAndStats(roster, importId)
  return NextResponse.json({ imports, selectedImportId: importId, students, subjectColumns, classrooms })
}
