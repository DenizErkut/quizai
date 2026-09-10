import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  const body = await req.json().catch(() => null) as { sessionId?: unknown; questionIndex?: unknown; userAns?: unknown; correct?: unknown; timeMs?: unknown; hintUsed?: unknown } | null
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  const questionIndex = Number(body?.questionIndex)
  if (!sessionId || !Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex > 999) return NextResponse.json({ error: 'Geçersiz cevap.' }, { status: 400 })

  const { data: session } = await db.from('quiz_sessions').select('questions').eq('id', sessionId).eq('user_id', user.id).maybeSingle()
  const question = Array.isArray(session?.questions) ? (session.questions[questionIndex] as Record<string, unknown> | undefined) : undefined
  if (!question) return NextResponse.json({ error: 'Soru bulunamadı.' }, { status: 404 })
  const answer = Number(body?.userAns)
  const expected = Number(question.ans)
  const type = String(question.type || 'multiple_choice')
  // For index-based types derive correctness on the server; the client flag is
  // never trusted for mastery evidence. Other complex types still use the
  // normalized score produced by the completion path.
  const derivedCorrect = ['multiple_choice', 'true_false', 'fill_blank', 'short_answer'].includes(type) && Number.isInteger(answer) && Number.isInteger(expected)
    ? answer === expected
    : body?.correct === true
  const result = body?.userAns === -1 ? 'skipped' : derivedCorrect ? 'correct' : 'incorrect'
  const score = result === 'correct' ? 1 : 0
  const timeMs = Number(body?.timeMs)
  const { data, error } = await db.rpc('record_adaptive_answer_event_v1', { p_student_id: user.id, p_session_id: sessionId, p_question_index: questionIndex, p_result: result, p_score: score, p_response_time_ms: Number.isFinite(timeMs) ? Math.min(3_600_000, Math.max(0, Math.round(timeMs))) : null, p_hint_used: body?.hintUsed === true })
  if (error) return NextResponse.json({ error: 'Cevap öğrenme kaydına alınamadı.' }, { status: 503 })
  return NextResponse.json({ success: true, projection: Array.isArray(data) ? data[0] : data })
}
