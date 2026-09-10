import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'
import { buildLearningRiskOverview, MasteryRiskRow, StudentClass } from '@/lib/learning-risk-overview'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })

  const { data: classrooms, error: classError } = await db.from('classrooms').select('id,name').order('name').limit(500)
  if (classError) return NextResponse.json({ error: 'Sınıflar alınamadı.' }, { status: 500 })
  const classroomId = req.nextUrl.searchParams.get('classroomId')
  const targetClasses = classroomId ? (classrooms ?? []).filter(item => item.id === classroomId) : (classrooms ?? [])
  if (classroomId && !targetClasses.length) return NextResponse.json({ error: 'Sınıf bulunamadı.' }, { status: 404 })
  if (!targetClasses.length) return NextResponse.json({ classrooms: classrooms ?? [], counts: { high_students: 0, medium_students: 0, total_warnings: 0 }, warnings: [] })

  const { data: members, error: memberError } = await db.from('classroom_students').select('classroom_id,student_id').in('classroom_id', targetClasses.map(item => item.id)).limit(10000)
  if (memberError) return NextResponse.json({ error: 'Sınıf üyeleri alınamadı.' }, { status: 500 })
  const studentIds = [...new Set((members ?? []).map(item => item.student_id))]
  if (!studentIds.length) return NextResponse.json({ classrooms: classrooms ?? [], counts: { high_students: 0, medium_students: 0, total_warnings: 0 }, warnings: [] })

  const { data: mastery, error: masteryError } = await db.from('student_mastery')
    .select('student_id,subject,topic,mastery_score,confidence_score,retention_score,attempt_count,trend,last_practiced_at')
    .in('student_id', studentIds).eq('learning_objective_key', '').gte('attempt_count', 3).gte('confidence_score', 0.3).limit(10000)
  if (masteryError) return NextResponse.json({ error: 'Risk verisi alınamadı.' }, { status: 500 })

  const classById = new Map(targetClasses.map(item => [item.id, item]))
  const studentClasses = new Map<string, StudentClass[]>()
  for (const member of members ?? []) {
    const classroom = classById.get(member.classroom_id)
    if (!classroom) continue
    studentClasses.set(member.student_id, [...(studentClasses.get(member.student_id) ?? []), classroom])
  }
  const identities = await getIdentitiesBySupabaseIds(studentIds)
  const names = Object.fromEntries(studentIds.map(id => [id, identities[id]?.full_name || 'Öğrenci']))
  const overview = buildLearningRiskOverview((mastery ?? []) as MasteryRiskRow[], studentClasses, names)
  return NextResponse.json({ classrooms: classrooms ?? [], ...overview, warnings: overview.warnings.slice(0, 200), policy_version: 'predictive-learning-v1', generated_at: new Date().toISOString() })
}
