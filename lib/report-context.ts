// lib/report-context.ts
// Kurum/Öğretmen/Veli rapor route'larının hepsinde tekrar eden "bu kullanıcı
// kim, hangi öğrencileri görebilir" mantığının tek yeri.

import { createClient } from '@supabase/supabase-js'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'
import { ReportStudentBase } from '@/lib/student-reports'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function getAuthedUser(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  return user
}

export interface InstitutionContext {
  institutionId: string
  roster: ReportStudentBase[]
}

export async function buildInstitutionContext(userId: string): Promise<InstitutionContext | null> {
  const { data: instUser } = await supabaseAdmin
    .from('institution_users').select('institution_id')
    .eq('user_id', userId).eq('role', 'admin').maybeSingle()
  if (!instUser) return null

  const { data: members } = await supabaseAdmin
    .from('institution_users').select('user_id')
    .eq('institution_id', instUser.institution_id).eq('role', 'student')

  if (!members?.length) return { institutionId: instUser.institution_id, roster: [] }

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

  return { institutionId: instUser.institution_id, roster }
}

export interface TeacherContext {
  teacherId: string
  roster: ReportStudentBase[]
  classrooms: { id: string; name: string }[]
}

export async function buildTeacherContext(userId: string, classroomId?: string | null): Promise<TeacherContext | null> {
  const { data: teacher } = await supabaseAdmin
    .from('teachers').select('id, approved').eq('user_id', userId).maybeSingle()
  if (!teacher?.approved) return null

  const { data: classrooms } = await supabaseAdmin
    .from('classrooms').select('id, name').eq('teacher_id', teacher.id)

  if (!classrooms?.length) return { teacherId: teacher.id, roster: [], classrooms: [] }

  const classroomMap = new Map(classrooms.map((c: any) => [c.id, c.name]))
  const classroomIds = classroomId ? [classroomId] : classrooms.map((c: any) => c.id)

  const { data: members } = await supabaseAdmin
    .from('classroom_students').select('student_id, classroom_id')
    .in('classroom_id', classroomIds)

  if (!members?.length) return { teacherId: teacher.id, roster: [], classrooms }

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

  return { teacherId: teacher.id, roster, classrooms }
}

export interface ParentContext {
  roster: ReportStudentBase[]
}

export async function buildParentContext(userId: string): Promise<ParentContext> {
  const { data: links } = await supabaseAdmin
    .from('parent_children').select('child_id, nickname').eq('parent_id', userId)
  if (!links?.length) return { roster: [] }

  const childIds = links.map((l: any) => l.child_id)
  const nicknameMap = new Map(links.map((l: any) => [l.child_id, l.nickname]))
  const identities = await getIdentitiesBySupabaseIds(childIds)
  const { data: profiles } = await supabaseAdmin.from('profiles').select('id, class_number, grade').in('id', childIds)
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  const roster: ReportStudentBase[] = childIds.map((cid: string) => ({
    id: cid,
    fullName: nicknameMap.get(cid) || identities[cid]?.full_name || 'İsimsiz',
    schoolNo: profileMap.get(cid)?.class_number ?? null,
    grade: profileMap.get(cid)?.grade ?? null,
  }))

  return { roster }
}
