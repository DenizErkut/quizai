// Öğretmenin yalnızca KENDİ sınıflarına ve o sınıflardaki öğrencilere erişmesini sağlayan ortak doğrulamalar.
// Servis rolüyle çalışan API'ler RLS'e güvenemez; istemciden gelen classroomId/studentId her zaman buradan geçmelidir.

// Minimal Supabase istemci arayüzü (testte sahte nesneyle değiştirilebilir).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export async function teacherOwnsClassroom(db: Db, teacherId: string, classroomId: string | null | undefined): Promise<boolean> {
  if (!classroomId || typeof classroomId !== 'string') return false
  const { data } = await db.from('classrooms').select('id').eq('id', classroomId).eq('teacher_id', teacherId).maybeSingle()
  return Boolean(data)
}

/** Öğrenci, öğretmenin sınıflarından birinde (classroomId verilirse yalnızca o sınıfta) kayıtlı mı? */
export async function studentInTeacherClassrooms(db: Db, teacherId: string, studentId: string, classroomId?: string | null): Promise<boolean> {
  if (!studentId || typeof studentId !== 'string') return false
  if (classroomId) {
    if (!(await teacherOwnsClassroom(db, teacherId, classroomId))) return false
    const { data } = await db.from('classroom_students').select('student_id').eq('classroom_id', classroomId).eq('student_id', studentId).maybeSingle()
    return Boolean(data)
  }
  const { data: owned } = await db.from('classrooms').select('id').eq('teacher_id', teacherId)
  const ids = ((owned ?? []) as { id: string }[]).map(row => row.id)
  if (!ids.length) return false
  const { data } = await db.from('classroom_students').select('student_id').in('classroom_id', ids).eq('student_id', studentId).limit(1)
  return Array.isArray(data) ? data.length > 0 : Boolean(data)
}
