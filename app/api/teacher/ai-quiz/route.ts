import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import {
  QUIZ_INTERVAL_DAYS, QUIZ_MAX_LEVEL, isQuizDue, nextLevel, pickRound, presentRound, scoreRound,
  type QuizLevel, type RoundQuestion,
} from '@/lib/teacher-ai-quiz-bank'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export const dynamic = 'force-dynamic'

async function approvedTeacher(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data: teacher } = await db.from('teachers').select('id, approved, created_at').eq('user_id', user.id).maybeSingle()
  return teacher?.approved ? { user, teacher } : null
}

async function state(userId: string, teacherCreatedAt: string | null) {
  const { data: rounds } = await db.from('teacher_ai_quiz_rounds')
    .select('id, round_no, level, questions, score, passed, created_at, submitted_at').eq('user_id', userId).order('round_no', { ascending: true })
  const all = rounds ?? []
  const submitted = all.filter(round => round.submitted_at)
  const open = all.find(round => !round.submitted_at) ?? null
  const last = submitted[submitted.length - 1] ?? null
  const level = (last ? nextLevel(last.level as QuizLevel, Boolean(last.passed)) : 1) as QuizLevel
  const lastEvent = last?.submitted_at ?? teacherCreatedAt
  const now = new Date()
  const due = Boolean(open) || isQuizDue(lastEvent, now)
  const nextDueAt = !due && lastEvent ? new Date(new Date(lastEvent).getTime() + QUIZ_INTERVAL_DAYS * 86_400_000).toISOString() : null
  return { all, submitted, open, last, level, due, nextDueAt }
}

// Status for the shortcut button / page. A due test also creates one in-app reminder per cycle.
export async function GET(req: NextRequest) {
  const auth = await approvedTeacher(req)
  if (!auth) return NextResponse.json({ error: 'Yalnızca onaylı öğretmenler erişebilir.' }, { status: 403 })
  const s = await state(auth.user.id, auth.teacher.created_at)
  if (s.due) {
    const since = new Date(Date.now() - QUIZ_INTERVAL_DAYS * 86_400_000).toISOString()
    const { data: recent } = await db.from('notifications').select('id').eq('user_id', auth.user.id).eq('type', 'teacher_ai_quiz_due').gte('created_at', since).limit(1)
    if (!recent?.length) {
      await db.from('notifications').insert({
        user_id: auth.user.id, type: 'teacher_ai_quiz_due', title: '🎓 Yeni AI bilgi testin hazır',
        body: `Seviye ${s.level}/${QUIZ_MAX_LEVEL}. Dört kısa soru; her başarıdan sonra sorular zorlaşır.`, action_url: '/teacher/ai-training',
      })
    }
  }
  return NextResponse.json({
    due: s.due, nextDueAt: s.nextDueAt, level: s.level, maxLevel: QUIZ_MAX_LEVEL, intervalDays: QUIZ_INTERVAL_DAYS,
    roundsTaken: s.submitted.length, lastScore: s.last?.score ?? null, lastPassed: s.last?.passed ?? null,
    history: s.submitted.slice(-5).map(round => ({ roundNo: round.round_no, level: round.level, score: round.score, passed: round.passed, submittedAt: round.submitted_at })),
    open: s.open ? { roundId: s.open.id, roundNo: s.open.round_no, level: s.open.level, questions: presentRound(s.open.questions as RoundQuestion[]) } : null,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await approvedTeacher(req)
  if (!auth) return NextResponse.json({ error: 'Yalnızca onaylı öğretmenler erişebilir.' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const s = await state(auth.user.id, auth.teacher.created_at)

  if (body?.action === 'start') {
    if (s.open) return NextResponse.json({ roundId: s.open.id, roundNo: s.open.round_no, level: s.open.level, questions: presentRound(s.open.questions as RoundQuestion[]) })
    if (!s.due) return NextResponse.json({ error: `Bir sonraki test ${s.nextDueAt ? new Date(s.nextDueAt).toLocaleDateString('tr-TR') : 'yakında'} tarihinde açılır.` }, { status: 409 })
    const seen = s.all.flatMap(round => (round.questions as RoundQuestion[]).map(question => question.id))
    const questions = pickRound(s.level, seen)
    const { data: created, error } = await db.from('teacher_ai_quiz_rounds')
      .insert({ user_id: auth.user.id, round_no: s.all.length + 1, level: s.level, questions }).select('id, round_no, level').single()
    if (error || !created) return NextResponse.json({ error: 'Test başlatılamadı, tekrar deneyin.' }, { status: 500 })
    return NextResponse.json({ roundId: created.id, roundNo: created.round_no, level: created.level, questions: presentRound(questions) }, { status: 201 })
  }

  if (body?.action === 'submit') {
    if (!s.open || s.open.id !== body.roundId) return NextResponse.json({ error: 'Açık bir test bulunamadı.' }, { status: 404 })
    const scored = scoreRound(s.open.questions as RoundQuestion[], body.answers)
    if (!scored) return NextResponse.json({ error: 'Dört sorunun da yanıtını seçin.' }, { status: 400 })
    const { error } = await db.from('teacher_ai_quiz_rounds')
      .update({ answers: body.answers, score: scored.score, passed: scored.passed, submitted_at: new Date().toISOString() })
      .eq('id', s.open.id).is('submitted_at', null)
    if (error) return NextResponse.json({ error: 'Sonuç kaydedilemedi.' }, { status: 500 })
    const upcoming = nextLevel(s.open.level as QuizLevel, scored.passed)
    return NextResponse.json({
      score: scored.score, passed: scored.passed, results: scored.results, level: s.open.level, nextLevel: upcoming,
      leveledUp: upcoming > s.open.level, nextDueAt: new Date(Date.now() + QUIZ_INTERVAL_DAYS * 86_400_000).toISOString(),
    })
  }
  return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 })
}
