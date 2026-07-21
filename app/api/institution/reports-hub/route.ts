// app/api/institution/reports-hub/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedUser, buildInstitutionContext } from '@/lib/report-context'
import {
  buildProgressReport, buildWeakTopicsReport, buildAssignmentsReport,
  buildLiveQuizReport, buildInactivityReport, buildReadingReport,
  buildGradeComparisonReport, buildClassroomCompareReport,
} from '@/lib/reports-data'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const ctx = await buildInstitutionContext(user.id)
  if (!ctx) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const report = req.nextUrl.searchParams.get('report')
  const { roster, institutionId } = ctx

  switch (report) {
    case 'progress':
      return NextResponse.json(await buildProgressReport(roster))
    case 'weak-topics':
      return NextResponse.json(await buildWeakTopicsReport(roster))
    case 'inactivity':
      return NextResponse.json(await buildInactivityReport(roster))
    case 'reading':
      return NextResponse.json(await buildReadingReport(roster))
    case 'comparison': {
      const importId = req.nextUrl.searchParams.get('importId')
      return NextResponse.json(await buildGradeComparisonReport(roster, importId))
    }
    case 'classroom-compare':
      return NextResponse.json(await buildClassroomCompareReport(roster, 'grade'))
    case 'assignments':
    case 'live-quiz': {
      // Kuruma bağlı öğretmenlerin sınıfları üzerinden
      const { data: instTeachers } = await supabaseAdmin
        .from('institution_users').select('user_id').eq('institution_id', institutionId).eq('role', 'teacher')
      const teacherUserIds = (instTeachers ?? []).map((t: any) => t.user_id)
      let classroomIds: string[] = []
      if (teacherUserIds.length) {
        const { data: teacherRows } = await supabaseAdmin.from('teachers').select('id').in('user_id', teacherUserIds)
        const teacherIds = (teacherRows ?? []).map((t: any) => t.id)
        if (teacherIds.length) {
          const { data: classrooms } = await supabaseAdmin.from('classrooms').select('id').in('teacher_id', teacherIds)
          classroomIds = (classrooms ?? []).map((c: any) => c.id)
        }
      }
      if (report === 'assignments') return NextResponse.json(await buildAssignmentsReport(roster, classroomIds))
      return NextResponse.json(await buildLiveQuizReport(classroomIds))
    }
    default:
      return NextResponse.json({ error: 'Geçersiz rapor türü.' }, { status: 400 })
  }
}
