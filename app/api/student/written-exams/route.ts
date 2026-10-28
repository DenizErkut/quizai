// Öğrenci: "Yazılıya Hazırlanıyorum". Yöneticinin yüklediği yayınlanmış setleri listeler; soruları sırayla açar.
// Her soru için mevcut Açık Uçlu (AUS) oturumu oluşturulur; cevap /api/grade-open-ended ile rubriğe göre puanlanır.
// Rubrik ve cevap anahtarı öğrenciye puanlamadan önce gönderilmez.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getAuthedUser } from '@/lib/report-context'
import { filterRowsByUserScope } from '@/lib/location/resource-scope'
import { gradeNumberOf, summarizeResults } from '@/lib/written-exam'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

type SetRow = { id: string; title: string; grade_number: number; subject: string; term: number; exam_number: number; total_points: number; country: string; state: string | null; city: string | null }
type Profile = { grade: string | null; country: string | null; state: string | null; city: string | null }

async function loadProfile(userId: string): Promise<Profile> {
  const { data } = await db.from('profiles').select('grade,country,state,city').eq('id', userId).maybeSingle()
  return (data as Profile | null) || { grade: null, country: null, state: null, city: null }
}

// Öğrencinin sınıfına ve konumuna uyan, yayınlanmış set.
async function accessibleSet(setId: string, profile: Profile): Promise<SetRow | null> {
  const { data } = await db.from('written_exam_sets')
    .select('id,title,grade_number,subject,term,exam_number,total_points,country,state,city').eq('id', setId).eq('status', 'published').maybeSingle()
  const set = data as SetRow | null
  if (!set) return null
  if (set.grade_number !== gradeNumberOf(profile.grade)) return null
  return filterRowsByUserScope([set], profile, row => row)[0] || null
}

type SessionRow = { id: string; total_earned: number | null; graded_at: string | null; criteria_results: unknown; overall_feedback: string | null; student_answer: string | null }

async function attemptState(attemptId: string) {
  const { data: attempt } = await db.from('written_exam_attempts').select('id,user_id,set_id,status,total_earned,total_possible').eq('id', attemptId).maybeSingle()
  if (!attempt) return null
  const [{ data: questions }, { data: items }] = await Promise.all([
    db.from('written_exam_questions').select('id,position,title,max_points').eq('set_id', attempt.set_id).order('position'),
    db.from('written_exam_attempt_items').select('question_id,session_id').eq('attempt_id', attemptId),
  ])
  const sessionIds = (items || []).map(item => item.session_id)
  const { data: sessions } = sessionIds.length
    ? await db.from('open_ended_sessions').select('id,total_earned,graded_at,criteria_results,overall_feedback,student_answer').in('id', sessionIds)
    : { data: [] as SessionRow[] }
  const sessionById = new Map((sessions as SessionRow[] | null || []).map(session => [session.id, session]))
  const sessionByQuestion = new Map((items || []).map(item => [item.question_id, sessionById.get(item.session_id)]))
  const rows = (questions || []).map(question => {
    const session = sessionByQuestion.get(question.id)
    const graded = !!session?.graded_at
    return { questionId: question.id, position: question.position, title: question.title, maxPoints: question.max_points, graded, earned: graded ? (session?.total_earned ?? 0) : null,
      criteriaResults: graded ? session?.criteria_results : undefined, overallFeedback: graded ? session?.overall_feedback : undefined, studentAnswer: graded ? session?.student_answer : undefined }
  })
  return { attempt, rows, summary: summarizeResults(rows.map(row => ({ questionId: row.questionId, maxPoints: row.maxPoints, earned: row.earned }))) }
}

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const profile = await loadProfile(user.id)
  const attemptId = req.nextUrl.searchParams.get('attemptId')
  if (attemptId) {
    const state = await attemptState(attemptId)
    if (!state || state.attempt.user_id !== user.id) return NextResponse.json({ error: 'Deneme bulunamadı.' }, { status: 404 })
    return NextResponse.json({ attempt: { id: state.attempt.id, setId: state.attempt.set_id, status: state.attempt.status }, questions: state.rows, summary: state.summary })
  }
  const gradeNumber = gradeNumberOf(profile.grade)
  if (!gradeNumber) return NextResponse.json({ sets: [], needsGrade: true })
  const { data } = await db.from('written_exam_sets')
    .select('id,title,grade_number,subject,term,exam_number,total_points,country,state,city').eq('status', 'published').eq('grade_number', gradeNumber)
    .order('subject').order('term').order('exam_number')
  const sets = filterRowsByUserScope((data || []) as SetRow[], profile, row => row)
  const ids = sets.map(set => set.id)
  const counts = new Map<string, number>()
  const latest = new Map<string, { id: string; status: string; total_earned: number | null; total_possible: number | null }>()
  if (ids.length) {
    const [{ data: questionRows }, { data: attempts }] = await Promise.all([
      db.from('written_exam_questions').select('set_id').in('set_id', ids),
      db.from('written_exam_attempts').select('id,set_id,status,total_earned,total_possible').eq('user_id', user.id).in('set_id', ids).order('started_at', { ascending: false }),
    ])
    for (const row of questionRows || []) counts.set(row.set_id, (counts.get(row.set_id) || 0) + 1)
    for (const attempt of attempts || []) if (!latest.has(attempt.set_id)) latest.set(attempt.set_id, attempt)
  }
  return NextResponse.json({ sets: sets.map(set => ({ id: set.id, title: set.title, subject: set.subject, term: set.term, examNumber: set.exam_number,
    totalPoints: set.total_points, questionCount: counts.get(set.id) || 0, attempt: latest.get(set.id) || null })) })
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const body = await req.json().catch(() => null) as { action?: string; setId?: string; attemptId?: string; questionId?: string; restart?: boolean } | null
  if (!body?.action) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  const profile = await loadProfile(user.id)

  if (body.action === 'start') {
    if (!body.setId) return NextResponse.json({ error: 'setId gerekli.' }, { status: 400 })
    const set = await accessibleSet(body.setId, profile)
    if (!set) return NextResponse.json({ error: 'Bu yazılı sana açık değil.' }, { status: 404 })
    const { data: open } = await db.from('written_exam_attempts').select('id,status').eq('user_id', user.id).eq('set_id', set.id).order('started_at', { ascending: false }).limit(1).maybeSingle()
    let attemptId = open && (open.status === 'in_progress' || !body.restart) ? open.id : null
    if (!attemptId) {
      const { data: created, error } = await db.from('written_exam_attempts').insert({ user_id: user.id, set_id: set.id, total_possible: set.total_points }).select('id').single()
      if (error || !created) return NextResponse.json({ error: 'Deneme başlatılamadı.' }, { status: 500 })
      attemptId = created.id
    }
    const state = await attemptState(attemptId!)
    if (!state) return NextResponse.json({ error: 'Deneme okunamadı.' }, { status: 500 })
    return NextResponse.json({ attempt: { id: attemptId, status: state.attempt.status, title: set.title }, questions: state.rows, summary: state.summary })
  }

  if (!body.attemptId) return NextResponse.json({ error: 'attemptId gerekli.' }, { status: 400 })
  const state = await attemptState(body.attemptId)
  if (!state || state.attempt.user_id !== user.id) return NextResponse.json({ error: 'Deneme bulunamadı.' }, { status: 404 })

  if (body.action === 'open') {
    if (state.attempt.status !== 'in_progress') return NextResponse.json({ error: 'Bu deneme tamamlandı.' }, { status: 409 })
    if (!body.questionId) return NextResponse.json({ error: 'questionId gerekli.' }, { status: 400 })
    const { data: question } = await db.from('written_exam_questions').select('id,set_id,position,title,objective_code,scenario,question,max_points,rubric').eq('id', body.questionId).eq('set_id', state.attempt.set_id).maybeSingle()
    if (!question) return NextResponse.json({ error: 'Soru bulunamadı.' }, { status: 404 })
    const done = state.rows.find(row => row.questionId === question.id)
    if (done?.graded) return NextResponse.json({ error: 'Bu soru zaten cevaplandı.', result: done }, { status: 409 })
    const { data: existing } = await db.from('written_exam_attempt_items').select('session_id').eq('attempt_id', body.attemptId).eq('question_id', question.id).maybeSingle()
    let sessionId = existing?.session_id as string | undefined
    if (!sessionId) {
      const { data: set } = await db.from('written_exam_sets').select('subject,title').eq('id', question.set_id).maybeSingle()
      const { data: session, error } = await db.from('open_ended_sessions').insert({
        user_id: user.id, grade: profile.grade, subject: set?.subject || '', topic: question.title || set?.title || '',
        scenario: question.scenario || '', question: question.question, rubric: question.rubric, total_possible: question.max_points,
      }).select('id').single()
      if (error || !session) return NextResponse.json({ error: 'Soru açılamadı.' }, { status: 500 })
      const { error: linkError } = await db.from('written_exam_attempt_items').insert({ attempt_id: body.attemptId, question_id: question.id, session_id: session.id })
      if (linkError) return NextResponse.json({ error: 'Soru açılamadı.' }, { status: 500 })
      sessionId = session.id
    }
    return NextResponse.json({ sessionId, position: question.position, title: question.title, objectiveCode: question.objective_code, scenario: question.scenario, question: question.question, maxPoints: question.max_points })
  }

  if (body.action === 'finish') {
    const summary = state.summary
    await db.from('written_exam_attempts').update({ status: 'completed', total_earned: summary.totalEarned, total_possible: summary.totalPossible, completed_at: new Date().toISOString() }).eq('id', body.attemptId)
    return NextResponse.json({ questions: state.rows, summary })
  }
  return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 })
}
