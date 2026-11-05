// Öğretmen: bir açık uçlu ödev grubunun (batch) sınıf sonuçları — öğrenci × soru puanları ve ayrıntı (yanıt, ölçüt puanları).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: teacher } = await db.from('teachers').select('id, approved').eq('user_id', user.id).maybeSingle()
  if (!teacher?.approved) return NextResponse.json({ error: 'Onaylı öğretmen hesabı gerekir.' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })

  // id bir batch_id ya da tek ödevin kimliği olabilir.
  const { data: byBatch } = await db.from('open_ended_assignments').select('id,classroom_id,teacher_id,question,rubric,batch_index,title').eq('batch_id', id).order('batch_index')
  const assignments = byBatch?.length ? byBatch : ((await db.from('open_ended_assignments').select('id,classroom_id,teacher_id,question,rubric,batch_index,title').eq('id', id)).data || [])
  if (!assignments.length || assignments.some(a => a.teacher_id !== teacher.id)) return NextResponse.json({ error: 'Bu ödevler size ait değil.' }, { status: 403 })
  const classroomId = assignments[0].classroom_id
  const { data: members } = await db.from('classroom_students').select('student_id').eq('classroom_id', classroomId)
  const studentIds = (members || []).map(m => m.student_id as string)
  const { data: sessions } = studentIds.length
    ? await db.from('open_ended_sessions').select('id,user_id,assignment_id,total_earned,total_possible,graded_at,student_answer,criteria_results,overall_feedback,source,created_at')
        .in('assignment_id', assignments.map(a => a.id)).in('user_id', studentIds).not('graded_at', 'is', null).order('graded_at', { ascending: false })
    : { data: [] }
  return NextResponse.json({
    classroomId,
    assignments: assignments.map(a => ({ id: a.id, question: a.question, rubric: a.rubric })),
    sessions: sessions || [],
  })
}
