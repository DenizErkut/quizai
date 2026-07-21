// app/api/teacher/students-roster/route.ts
// Not/Veri İçe Aktar sihirbazının eşleştirme adımı için: öğretmenin tüm
// sınıflarındaki öğrencileri { id, schoolNo, fullName, grade, classroomName }
// olarak döner.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'

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

  const { data: classrooms } = await supabaseAdmin
    .from('classrooms').select('id, name').eq('teacher_id', teacher.id)

  if (!classrooms?.length) {
    return NextResponse.json({ teacherId: teacher.id, students: [] })
  }

  const classroomMap = new Map(classrooms.map((c: any) => [c.id, c.name]))
  const { data: members } = await supabaseAdmin
    .from('classroom_students')
    .select('student_id, classroom_id')
    .in('classroom_id', classrooms.map((c: any) => c.id))

  if (!members?.length) {
    return NextResponse.json({ teacherId: teacher.id, students: [] })
  }

  const userIds = [...new Set(members.map((m: any) => m.student_id))]
  const identities = await getIdentitiesBySupabaseIds(userIds)

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, class_number, grade')
    .in('id', userIds)
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  const students = members.map((m: any) => ({
    id: m.student_id,
    schoolNo: profileMap.get(m.student_id)?.class_number ?? null,
    fullName: identities[m.student_id]?.full_name ?? 'İsimsiz',
    grade: profileMap.get(m.student_id)?.grade ?? null,
    classroomName: classroomMap.get(m.classroom_id) ?? null,
  }))

  return NextResponse.json({ teacherId: teacher.id, students })
}
