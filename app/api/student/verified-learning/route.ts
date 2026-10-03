import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { sameLearningScope } from '@/lib/learning-evidence-scope'
import { recordQuizLearningEvents } from '@/lib/learning-events'
import { eligibleVerifiedItem, publicVerifiedQuestions, scoreVerifiedAnswers, type VerifiedBankRow, type VerifiedStage, type VerifiedItemSets } from '@/lib/verified-learning-cycle'

export const runtime = 'nodejs'
export const maxDuration = 60
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DAY_MS = 24 * 60 * 60 * 1000
type Attempt = { id: string; cycle_id: string; stage: VerifiedStage; status: string; questions: Array<Record<string, unknown>>; quiz_session_id: string | null; started_at: string; completed_at: string | null; score_pct: number | null }

async function student(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: { user } } = await auth.auth.getUser(token)
  return user || null
}

async function stageGate(cycle: { id: string; student_id: string; teacher_id: string; classroom_id: string; learning_objective_id: string }, stage: VerifiedStage, attempts: Attempt[]) {
  const baseline = attempts.find(attempt => attempt.stage === 'baseline')
  const post = attempts.find(attempt => attempt.stage === 'post')
  if (stage === 'baseline') return null
  if (!baseline?.completed_at || !baseline.quiz_session_id) return 'Ön test tamamlanmalı.'
  const now = Date.now()
  if (now - Date.parse(baseline.completed_at) > 90 * DAY_MS) return 'Ön test 90 günü geçti; yeni ölçüm döngüsü gerekli.'
  if (stage === 'post') {
    if (now - Date.parse(baseline.completed_at) < DAY_MS) return 'Son test için en az 24 saat geçmeli.'
    const { data: practice } = await db.from('coach_guided_practice_attempts').select('quiz_session_id')
      .eq('cycle_id', cycle.id).eq('student_id', cycle.student_id).eq('status', 'completed').maybeSingle()
    if (!practice?.quiz_session_id) return 'Son testten önce Prof. Prati ile rehberli çalışma tamamlanmalı.'
    return null
  }
  if (!post?.completed_at || !post.quiz_session_id) return 'Son test tamamlanmalı.'
  if (now - Date.parse(post.completed_at) < DAY_MS) return 'Aktarım kontrolü için son testten sonra en az 24 saat geçmeli.'
  const { data: reviewed } = await db.from('learning_gain_measurements').select('id')
    .eq('teacher_id', cycle.teacher_id).eq('classroom_id', cycle.classroom_id).eq('student_id', cycle.student_id)
    .eq('learning_objective_id', cycle.learning_objective_id)
    .eq('pre_session_id', baseline.quiz_session_id).eq('post_session_id', post.quiz_session_id).limit(1)
  if (!reviewed?.length) return 'Ön ve son test çifti öğretmen tarafından incelenmeli.'
  return null
}

async function cycleData(cycleId: string, studentId: string) {
  const { data: cycle } = await db.from('verified_learning_cycles')
    .select('id,teacher_id,classroom_id,student_id,learning_objective_id,item_sets,status').eq('id', cycleId).eq('student_id', studentId).maybeSingle()
  if (!cycle) return null
  const [{ data: objective }, { data: attempts }] = await Promise.all([
    db.from('learning_objective_catalog').select('id,objective_code,title,subject,grade,topic,is_active,verification_status')
      .eq('id', cycle.learning_objective_id).maybeSingle(),
    db.from('verified_learning_attempts').select('id,cycle_id,stage,status,questions,quiz_session_id,started_at,completed_at,score_pct')
      .eq('cycle_id', cycle.id).eq('student_id', studentId),
  ])
  return { cycle, objective, attempts: (attempts || []) as Attempt[] }
}

export async function GET(req: NextRequest) {
  const user = await student(req)
  if (!user) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 })
  const { data: cycles, error } = await db.from('verified_learning_cycles')
    .select('id,teacher_id,classroom_id,student_id,learning_objective_id,status,created_at')
    .eq('student_id', user.id).in('status', ['active', 'completed']).order('created_at', { ascending: false }).limit(20)
  if (error) return NextResponse.json({ error: 'Ölçüm döngüleri alınamadı.' }, { status: 500 })
  const rows = await Promise.all((cycles || []).map(async cycle => {
    const detail = await cycleData(cycle.id, user.id)
    if (!detail) return null
    const { objective, attempts } = detail
    const nextStage: VerifiedStage | null = !attempts.some(attempt => attempt.stage === 'baseline' && attempt.status === 'completed') ? 'baseline'
      : !attempts.some(attempt => attempt.stage === 'post' && attempt.status === 'completed') ? 'post'
      : !attempts.some(attempt => attempt.stage === 'transfer' && attempt.status === 'completed') ? 'transfer' : null
    const gate = nextStage ? await stageGate(cycle, nextStage, attempts) : null
    const started = attempts.find(attempt => attempt.stage === nextStage && attempt.status === 'started')
    return { id: cycle.id, status: cycle.status, createdAt: cycle.created_at,
      objective: objective ? { code: objective.objective_code, title: objective.title, subject: objective.subject } : null,
      nextStage, gate, startedAttempt: started ? { id: started.id, questions: publicVerifiedQuestions(started.questions) } : null,
      attempts: attempts.map(attempt => ({ stage: attempt.stage, status: attempt.status, scorePct: attempt.score_pct, completedAt: attempt.completed_at })),
    }
  }))
  return NextResponse.json({ cycles: rows.filter(Boolean) })
}

export async function POST(req: NextRequest) {
  const user = await student(req)
  if (!user) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 })
  const body = await req.json().catch(() => null) as { action?: string; cycleId?: string; stage?: VerifiedStage; attemptId?: string; choices?: unknown } | null
  if (!body || !['start', 'submit'].includes(body.action || '')) return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 })

  if (body.action === 'start') {
    if (!UUID.test(body.cycleId || '') || !['baseline', 'post', 'transfer'].includes(body.stage || '')) return NextResponse.json({ error: 'Ölçüm aşaması geçersiz.' }, { status: 400 })
    const detail = await cycleData(body.cycleId!, user.id)
    if (!detail || detail.cycle.status !== 'active' || !detail.objective?.is_active || detail.objective.verification_status !== 'verified') {
      return NextResponse.json({ error: 'Etkin ve doğrulanmış ölçüm döngüsü bulunamadı.' }, { status: 404 })
    }
    const stage = body.stage!
    const existing = detail.attempts.find(attempt => attempt.stage === stage)
    if (existing?.status === 'started') return NextResponse.json({ attemptId: existing.id, questions: publicVerifiedQuestions(existing.questions) })
    if (existing) return NextResponse.json({ error: 'Bu aşama zaten tamamlandı veya işleniyor.' }, { status: 409 })
    const gate = await stageGate(detail.cycle, stage, detail.attempts)
    if (gate) return NextResponse.json({ error: gate }, { status: 422 })
    const ids = (detail.cycle.item_sets as VerifiedItemSets)?.[stage]
    if (!Array.isArray(ids) || ids.length !== 5 || ids.some(id => !UUID.test(id))) return NextResponse.json({ error: 'Ölçüm soru seti geçersiz.' }, { status: 500 })
    const { data: bank, error: bankError } = await db.from('question_bank').select('id,question,grade_key,subject_key')
      .in('id', ids).eq('review_status', 'approved').eq('report_count', 0)
    if (bankError || bank?.length !== 5) return NextResponse.json({ error: 'Bir soru kalite onayını kaybetmiş; öğretmenin seti yenilemesi gerekiyor.' }, { status: 409 })
    const ordered = ids.map(id => (bank as VerifiedBankRow[]).find(row => row.id === id)!)
    if (ordered.some(row => !eligibleVerifiedItem(row, detail.objective!.id)
      || !sameLearningScope({ grade:row.grade_key,subject:row.subject_key },detail.objective!))) {
      return NextResponse.json({ error: 'Soru veya kazanım kanıtı artık geçerli değil.' }, { status: 409 })
    }
    const questions = ordered.map(row => ({ ...row.question, bankQuestionId: row.id, subject: detail.objective!.subject, verifiedLearningStage: stage }))
    const { data: attempt, error } = await db.from('verified_learning_attempts').insert({
      cycle_id: detail.cycle.id, student_id: user.id, stage, questions,
    }).select('id').maybeSingle()
    if (error || !attempt) return NextResponse.json({ error: error?.code === '23505' ? 'Bu aşama başka bir oturumda açıldı; sayfayı yenileyin.' : 'Ölçüm başlatılamadı.' }, { status: error?.code === '23505' ? 409 : 500 })
    return NextResponse.json({ attemptId: attempt.id, questions: publicVerifiedQuestions(questions) }, { status: 201 })
  }

  if (!UUID.test(body.attemptId || '')) return NextResponse.json({ error: 'Deneme kimliği geçersiz.' }, { status: 400 })
  const { data: attempt, error: attemptError } = await db.from('verified_learning_attempts')
    .select('id,cycle_id,student_id,stage,status,questions,quiz_session_id,completed_at')
    .eq('id', body.attemptId!).eq('student_id', user.id).maybeSingle()
  if (attemptError || !attempt) return NextResponse.json({ error: 'Deneme bulunamadı.' }, { status: 404 })
  if (attempt.status === 'completed') return NextResponse.json({ error: 'Bu deneme zaten tamamlandı.' }, { status: 409 })
  const detail = await cycleData(attempt.cycle_id, user.id)
  if (!detail?.objective) return NextResponse.json({ error: 'Ölçüm döngüsü bulunamadı.' }, { status: 404 })
  const questions = attempt.questions as Array<Record<string, unknown>>
  const scored = scoreVerifiedAnswers(questions, body.choices)
  if (!scored) return NextResponse.json({ error: 'Yanıt sayısı veya seçimi geçersiz.' }, { status: 400 })
  if (attempt.status === 'started') {
    const { data: claimed } = await db.from('verified_learning_attempts').update({ status: 'processing' })
      .eq('id', attempt.id).eq('student_id', user.id).eq('status', 'started').select('id').maybeSingle()
    if (!claimed) return NextResponse.json({ error: 'Deneme başka bir istekte işleniyor.' }, { status: 409 })
  }
  const { data: existingSession } = await db.from('quiz_sessions').select('id,answers').eq('id', attempt.id).eq('user_id', user.id).maybeSingle()
  if (existingSession && (!Array.isArray(existingSession.answers) || existingSession.answers.length !== scored.answers.length ||
    existingSession.answers.some((answer: { userAns?: unknown; correct?: unknown }, index: number) =>
      answer.userAns !== scored.answers[index].userAns || answer.correct !== scored.answers[index].correct))) {
    return NextResponse.json({ error: 'İlk gönderilen yanıtlar kesinleştiriliyor; farklı yanıtla tekrar gönderilemez.' }, { status: 409 })
  }
  if (!existingSession) {
    const { error: insertError } = await db.from('quiz_sessions').insert({
      id: attempt.id, user_id: user.id, topic: detail.objective.topic || detail.objective.title,
      grade: detail.objective.grade, language: 'Türkçe', question_count: questions.length,
      questions, answers: scored.answers, score: scored.score, partial_score: scored.score, partial_pct: scored.scorePct,
      completed: true, question_type: 'multiple_choice', gen_engine: 'verified-learning-v1',
      objective_mapping_version: 'verified-learning-v1', objective_candidate_count: 1, objective_mapped_count: questions.length,
    })
    if (insertError && insertError.code !== '23505') return NextResponse.json({ error: 'Test sonucu kaydedilemedi; aynı denemeyi yeniden gönderin.' }, { status: 500 })
  }
  const projection = await recordQuizLearningEvents(db, user.id, attempt.id)
  const { count: evidenceCount } = await db.from('learning_events').select('id', { count: 'exact', head: true })
    .eq('student_id', user.id).eq('source_type', 'quiz_session').eq('source_id', attempt.id)
    .eq('learning_objective_id', detail.objective.id)
  if (!projection && Number(evidenceCount) !== questions.length) {
    return NextResponse.json({ error: 'Test kaydedildi ancak öğrenme kanıtı tamamlanmadı; aynı denemeyi yeniden gönderin.' }, { status: 503 })
  }
  if (Number(evidenceCount) !== questions.length) {
    return NextResponse.json({ error: 'Öğrenme kanıtı eksik; sonuç henüz kesinleştirilemedi.' }, { status: 503 })
  }
  const completedAt = new Date().toISOString()
  const { data: completedAttempt, error: completeError } = await db.from('verified_learning_attempts').update({
    status: 'completed', answers: scored.answers, score_pct: scored.scorePct, quiz_session_id: attempt.id, completed_at: completedAt,
  }).eq('id', attempt.id).eq('student_id', user.id).eq('status', 'processing').select('id').maybeSingle()
  if (completeError || !completedAttempt) return NextResponse.json({ error: 'Deneme kesinleştirilemedi; aynı denemeyi yeniden gönderin.' }, { status: 503 })
  if (attempt.stage === 'transfer') await db.from('verified_learning_cycles').update({ status: 'completed', updated_at: completedAt }).eq('id', attempt.cycle_id).eq('student_id', user.id)
  return NextResponse.json({ scorePct: scored.scorePct, correctCount: scored.score, total: questions.length,
    interpretation: 'Bu test sonucu, öğretmen incelemesi ve aktarım karşılaştırması olmadan doğrulanmış öğrenme kazanımı değildir.' })
}
