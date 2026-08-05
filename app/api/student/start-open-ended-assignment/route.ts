// app/api/student/start-open-ended-assignment/route.ts
// Öğrenci atanmış bir açık uçlu ödevi açtığında çağrılır. Bu ödeve ait,
// bu öğrenciye özel bir open_ended_sessions kaydı yoksa oluşturur (varsa
// ve henüz puanlanmamışsa onu döner — sayfa yenilense bile kaldığı yerden
// devam edebilsin diye). Dönen sessionId, mevcut /api/grade-open-ended
// akışıyla DOĞRUDAN uyumludur — o route zaten sessionId üzerinden
// scenario/question/rubric'i sunucudan okuyor.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { assignment_id } = await req.json()
  if (!assignment_id) return NextResponse.json({ error: 'assignment_id gerekli.' }, { status: 400 })

  const { data: assignment } = await supabase
    .from('open_ended_assignments')
    .select('*')
    .eq('id', assignment_id)
    .maybeSingle()
  if (!assignment) return NextResponse.json({ error: 'Ödev bulunamadı.' }, { status: 404 })

  // Öğrenci gerçekten bu ödevin atandığı sınıfta mı — RLS zaten bunu
  // koruyor ama net bir hata mesajı için ayrıca kontrol ediliyor.
  const { data: membership } = await supabase
    .from('classroom_students')
    .select('classroom_id')
    .eq('classroom_id', assignment.classroom_id)
    .eq('student_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Bu ödev sana atanmamış.' }, { status: 403 })

  // Zaten (tamamlanmamış) bir denemesi var mı — varsa onu döndür
  const { data: existing } = await supabase
    .from('open_ended_sessions')
    .select('*')
    .eq('assignment_id', assignment_id)
    .eq('user_id', user.id)
    .is('graded_at', null)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      sessionId: existing.id,
      scenario: existing.scenario,
      question: existing.question,
      rubric: existing.rubric,
      totalPossible: existing.total_possible,
    })
  }

  const totalPossible = (assignment.rubric as any[]).reduce((s, r) => s + (r.maxPoints || 0), 0)

  const { data: created, error: insErr } = await supabase
    .from('open_ended_sessions')
    .insert({
      user_id: user.id,
      assignment_id,
      grade: assignment.grade,
      subject: assignment.subject,
      topic: assignment.topic,
      scenario: assignment.scenario,
      question: assignment.question,
      rubric: assignment.rubric,
      total_possible: totalPossible,
    })
    .select('id')
    .single()

  if (insErr || !created) {
    console.error('[start-open-ended-assignment]', insErr)
    return NextResponse.json({ error: 'Ödev başlatılamadı.' }, { status: 500 })
  }

  return NextResponse.json({
    sessionId: created.id,
    scenario: assignment.scenario,
    question: assignment.question,
    rubric: assignment.rubric,
    totalPossible,
  })
}
