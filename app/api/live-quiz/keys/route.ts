// Öğretmen: kendi canlı sınavının doğru cevap anahtarı (öğrencilere hiçbir yolla verilmez).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const liveQuizId = req.nextUrl.searchParams.get('live_quiz_id') || ''
  if (!UUID.test(liveQuizId)) return NextResponse.json({ error: 'Geçersiz quiz.' }, { status: 400 })

  const { data: teacher } = await db.from('teachers').select('id,approved').eq('user_id', user.id).maybeSingle()
  if (!teacher?.approved) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const { data: quiz } = await db.from('live_quizzes').select('questions').eq('id', liveQuizId).eq('teacher_id', teacher.id).maybeSingle()
  if (!quiz) return NextResponse.json({ error: 'Quiz bulunamadı.' }, { status: 404 })

  const { data: keys } = await db.from('live_quiz_keys').select('question_index,ans').eq('live_quiz_id', liveQuizId).order('question_index')
  const total = Array.isArray(quiz.questions) ? quiz.questions.length : 0
  const answers: Array<number | null> = Array.from({ length: total }, (_, i) => {
    const key = (keys ?? []).find((row: { question_index: number }) => row.question_index === i) as { ans: number } | undefined
    const legacy = Array.isArray(quiz.questions) ? quiz.questions[i]?.ans : undefined
    return key ? key.ans : Number.isInteger(legacy) ? legacy : null
  })
  return NextResponse.json({ answers }, { headers: { 'Cache-Control': 'private, no-store' } })
}
