// app/api/student/open-ended-assignments/route.ts
// Öğrencinin dahil olduğu sınıflara atanmış açık uçlu ödevleri listeler,
// hangilerinin zaten tamamlandığını (graded_at dolu bir open_ended_sessions
// kaydı var mı) işaretler.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: memberships } = await supabase
    .from('classroom_students')
    .select('classroom_id')
    .eq('student_id', user.id)

  const classroomIds = (memberships ?? []).map((m: any) => m.classroom_id)
  if (classroomIds.length === 0) return NextResponse.json({ assignments: [] })

  const { data: assignments } = await supabase
    .from('open_ended_assignments')
    .select('id, title, grade, subject, topic, due_date, created_at, classrooms(name)')
    .in('classroom_id', classroomIds)
    .order('created_at', { ascending: false })

  if (!assignments?.length) return NextResponse.json({ assignments: [] })

  const { data: sessions } = await supabase
    .from('open_ended_sessions')
    .select('assignment_id, total_earned, total_possible, graded_at')
    .eq('user_id', user.id)
    .not('assignment_id', 'is', null)

  const doneMap = new Map((sessions ?? []).map((s: any) => [s.assignment_id, s]))

  const result = assignments.map((a: any) => {
    const done = doneMap.get(a.id)
    return {
      ...a,
      completed: !!done?.graded_at,
      earned: done?.total_earned ?? null,
      possible: done?.total_possible ?? null,
    }
  })

  return NextResponse.json({ assignments: result })
}
