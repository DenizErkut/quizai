// app/api/teacher/reports-hub/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser, buildTeacherContext } from '@/lib/report-context'
import {
  buildProgressReport, buildWeakTopicsReport, buildAssignmentsReport,
  buildLiveQuizReport, buildInactivityReport, buildReadingReport,
  buildGradeComparisonReport, buildClassroomCompareReport,
} from '@/lib/reports-data'

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const classroomId = req.nextUrl.searchParams.get('classroomId')
  const ctx = await buildTeacherContext(user.id, classroomId)
  if (!ctx) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const report = req.nextUrl.searchParams.get('report')
  const { roster, classrooms } = ctx
  const classroomIds = classroomId ? [classroomId] : classrooms.map(c => c.id)

  switch (report) {
    case 'progress':
      return NextResponse.json({ ...(await buildProgressReport(roster)), classrooms })
    case 'weak-topics':
      return NextResponse.json({ ...(await buildWeakTopicsReport(roster)), classrooms })
    case 'inactivity':
      return NextResponse.json({ ...(await buildInactivityReport(roster)), classrooms })
    case 'reading':
      return NextResponse.json({ ...(await buildReadingReport(roster)), classrooms })
    case 'comparison': {
      const importId = req.nextUrl.searchParams.get('importId')
      return NextResponse.json({ ...(await buildGradeComparisonReport(roster, importId)), classrooms })
    }
    case 'classroom-compare':
      return NextResponse.json({ ...(await buildClassroomCompareReport(roster, 'classroomName')), classrooms })
    case 'assignments':
      return NextResponse.json({ ...(await buildAssignmentsReport(roster, classroomIds)), classrooms })
    case 'live-quiz':
      return NextResponse.json({ ...(await buildLiveQuizReport(classroomIds)), classrooms })
    default:
      return NextResponse.json({ error: 'Geçersiz rapor türü.' }, { status: 400 })
  }
}
