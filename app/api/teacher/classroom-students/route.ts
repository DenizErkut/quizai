// app/api/teacher/classroom-students/route.ts
// Öğretmenin, okuldan ayrılan/yanlış eklenen bir öğrenciyi kendi sınıf(lar)ından çıkarması.
// Yalnızca öğretmenin KENDİ sınıfları etkilenir; öğrencinin hesabı, test geçmişi ve
// tamamlanmış ödev kayıtları silinmez.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  const { data: teacher } = await db.from('teachers').select('id, approved').eq('user_id', user.id).maybeSingle()
  if (!teacher?.approved) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const studentId = typeof body?.studentId === 'string' ? body.studentId : ''
  const classroomId = typeof body?.classroomId === 'string' ? body.classroomId : ''
  if (!UUID.test(studentId) || (classroomId && !UUID.test(classroomId))) {
    return NextResponse.json({ error: 'Geçersiz öğrenci veya sınıf.' }, { status: 400 })
  }

  let query = db.from('classrooms').select('id').eq('teacher_id', teacher.id)
  if (classroomId) query = query.eq('id', classroomId)
  const { data: classrooms, error: classError } = await query
  if (classError) return NextResponse.json({ error: 'Sınıflar alınamadı.' }, { status: 500 })
  if (!classrooms?.length) return NextResponse.json({ error: 'Sınıf bulunamadı.' }, { status: 404 })

  const { data: removed, error } = await db.from('classroom_students').delete()
    .eq('student_id', studentId).in('classroom_id', classrooms.map((c: { id: string }) => c.id))
    .select('classroom_id')
  if (error) {
    console.error('[teacher/classroom-students] delete failed:', error.message)
    return NextResponse.json({ error: 'Öğrenci sınıftan çıkarılamadı.' }, { status: 500 })
  }
  if (!removed?.length) return NextResponse.json({ error: 'Öğrenci bu sınıflarda kayıtlı değil.' }, { status: 404 })
  return NextResponse.json({ ok: true, removedFrom: removed.length })
}
