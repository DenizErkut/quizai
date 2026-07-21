// app/api/parent/reports-hub/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser, buildParentContext } from '@/lib/report-context'
import {
  buildProgressReport, buildWeakTopicsReport, buildInactivityReport,
  buildReadingReport, buildGradeComparisonReport,
} from '@/lib/reports-data'

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { roster } = await buildParentContext(user.id)
  const report = req.nextUrl.searchParams.get('report')

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
    // 'assignments', 'live-quiz', 'classroom-compare' veli kapsamında anlamsız
    // (sınıf/ödev yönetimi kurum/öğretmen işi) — bilerek desteklenmiyor.
    default:
      return NextResponse.json({ error: 'Geçersiz rapor türü.' }, { status: 400 })
  }
}
