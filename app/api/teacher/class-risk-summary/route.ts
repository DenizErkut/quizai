// app/api/teacher/class-risk-summary/route.ts
// Faz 6 (Teacher Agent) — sınıf bazlı risk gruplama (🔴🟡🟢) + AI-üretimli
// sınıf analizi/önerisi. Query param: classroomId (verilmezse öğretmenin
// TÜM öğrencileri tek bir havuzda değerlendirilir).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'
import { computeClassRiskSummary } from '@/lib/class-risk'
import { generateClassInsight } from '@/lib/teacher-class-insight'

export const maxDuration = 30

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

  const classroomId = req.nextUrl.searchParams.get('classroomId')

  const { data: classrooms } = await supabaseAdmin
    .from('classrooms').select('id, name').eq('teacher_id', teacher.id)
  if (!classrooms?.length) {
    return NextResponse.json({ className: null, summary: { totalStudents: 0, counts: { riskli: 0, gelistirilmeli: 0, yeterli: 0 }, students: [], topConcernTopics: [] }, insight: 'Henüz bir sınıfınız yok.' })
  }

  const targetClassrooms = classroomId ? classrooms.filter((c: any) => c.id === classroomId) : classrooms
  if (classroomId && !targetClassrooms.length) {
    return NextResponse.json({ error: 'Sınıf bulunamadı.' }, { status: 404 })
  }

  const className = classroomId
    ? targetClassrooms[0]?.name
    : `Tüm Sınıflar (${classrooms.length})`

  const { data: members } = await supabaseAdmin
    .from('classroom_students')
    .select('student_id')
    .in('classroom_id', targetClassrooms.map((c: any) => c.id))

  const studentIds = [...new Set((members ?? []).map((m: any) => m.student_id))]
  const identities = await getIdentitiesBySupabaseIds(studentIds)
  const studentNames: Record<string, string> = {}
  for (const [id, identity] of Object.entries(identities)) {
    studentNames[id] = (identity as any)?.full_name || 'Öğrenci'
  }

  const summary = await computeClassRiskSummary(supabaseAdmin, studentIds, studentNames)
  const insight = await generateClassInsight(className || 'Sınıf', summary)

  return NextResponse.json({ className, summary, insight })
}
