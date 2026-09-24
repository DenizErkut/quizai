import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export const dynamic = 'force-dynamic'

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

type TeacherRecord = { user_id: string; school: string | null } | null
type ClassroomRecord = {
  id: string
  name: string
  grade: string | null
  subject: string | null
  description: string | null
  created_at: string
  teacher_id: string
  teachers: TeacherRecord | Exclude<TeacherRecord, null>[]
}
type MembershipRecord = { classroom_id: string; joined_at: string; classrooms: ClassroomRecord | ClassroomRecord[] | null }
type RosterRecord = {
  classroom_id: string
  student_id: string
  joined_at: string
  profiles: { grade: string | null; plan: string | null } | { grade: string | null; plan: string | null }[] | null
}
type RosterStudent = { id: string; joined_at: string; grade: string; plan: string }

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return jsonNoStore({ error: 'Yetkisiz.' }, 401)

  const { data: { user }, error: authError } = await db.auth.getUser(token)
  if (authError || !user) return jsonNoStore({ error: 'Oturum geçersiz.' }, 401)

  const { data: memberships, error } = await db
    .from('classroom_students')
    .select('classroom_id, joined_at, classrooms(id, name, grade, subject, description, created_at, teacher_id, teachers(user_id, school))')
    .eq('student_id', user.id)
    .order('joined_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[classrooms/membership] membership lookup failed:', error.message)
    return jsonNoStore({ error: 'Sınıf bilgileri alınamadı.' }, 500)
  }

  const membershipRows = (memberships ?? []) as MembershipRecord[]
  const classes = membershipRows.flatMap((membership) => {
    const related = Array.isArray(membership.classrooms) ? membership.classrooms[0] : membership.classrooms
    if (!related) return []
    const teacher = Array.isArray(related.teachers) ? related.teachers[0] ?? null : related.teachers
    return [{ ...related, teachers: teacher, joined_at: membership.joined_at }]
  })

  if (req.nextUrl.searchParams.get('includeRoster') !== '1' || classes.length === 0) {
    return jsonNoStore({ classes })
  }

  const classIds = classes.map((classroom) => classroom.id)
  const { data: roster, error: rosterError } = await db
    .from('classroom_students')
    .select('classroom_id, student_id, joined_at, profiles(grade, plan)')
    .in('classroom_id', classIds)
    .order('joined_at', { ascending: true })
    .limit(5000)

  if (rosterError) {
    console.error('[classrooms/membership] roster lookup failed:', rosterError.message)
    return jsonNoStore({ error: 'Sınıf listesi alınamadı.' }, 500)
  }

  const byClass = new Map<string, RosterStudent[]>()
  for (const row of (roster ?? []) as RosterRecord[]) {
    const students = byClass.get(row.classroom_id) ?? []
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    students.push({
      id: row.student_id,
      joined_at: row.joined_at,
      grade: profile?.grade ?? '—',
      plan: profile?.plan ?? 'free',
    })
    byClass.set(row.classroom_id, students)
  }

  return jsonNoStore({
    classes: classes.map((classroom) => {
      const students = byClass.get(classroom.id) ?? []
      return { ...classroom, student_count: students.length, students }
    }),
  })
}
