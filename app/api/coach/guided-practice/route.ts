import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { randomInt } from 'node:crypto'
import { questionBankKey } from '@/lib/question-bank'
import { recordQuizLearningEvents } from '@/lib/learning-events'
import { eligibleVerifiedItem, type VerifiedBankRow, type VerifiedItemSets } from '@/lib/verified-learning-cycle'

export const runtime = 'nodejs'
export const maxDuration = 60
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REFLECTION_HINT = 'Önce sorunun tam olarak ne istediğini belirle. Verilen bilgileri tek tek işaretle; seçenekleri bu bilgilerle karşılaştır. Sonucu tahmin etmek yerine kendi gerekçeni kur.'

async function student(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: { user } } = await auth.auth.getUser(token)
  return user || null
}

async function loadCycle(cycleId: string, studentId: string) {
  const { data: cycle } = await db.from('verified_learning_cycles')
    .select('id,student_id,learning_objective_id,item_sets,status').eq('id', cycleId).eq('student_id', studentId).maybeSingle()
  if (!cycle) return null
  const [{ data: objective }, { data: stages }, { data: practice }] = await Promise.all([
    db.from('learning_objective_catalog').select('id,title,subject,grade,topic,is_active,verification_status')
      .eq('id', cycle.learning_objective_id).maybeSingle(),
    db.from('verified_learning_attempts').select('stage,status,completed_at').eq('cycle_id', cycle.id).eq('student_id', studentId),
    db.from('coach_guided_practice_attempts').select('id,cycle_id,student_id,question,status,first_choice,retry_choice,hint_count,student_explanation,quiz_session_id,completed_at')
      .eq('cycle_id', cycle.id).eq('student_id', studentId).maybeSingle(),
  ])
  return { cycle, objective, stages: stages || [], practice }
}

function safePractice(row: { id: string; status: string; question: Record<string, unknown>; first_choice: number | null; retry_choice: number | null; hint_count: number; completed_at: string | null }) {
  return { id: row.id, status: row.status, question: row.question.q, options: row.question.opts,
    firstChoice: row.first_choice, retryChoice: row.retry_choice, hintCount: row.hint_count,
    completedAt: row.completed_at,
    ...(row.status === 'completed' ? { correctIndex: row.question.ans, explanation: row.question.exp || null } : {}),
  }
}

export async function GET(req: NextRequest) {
  const user = await student(req)
  if (!user) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 })
  const cycleId = req.nextUrl.searchParams.get('cycleId') || ''
  if (!UUID.test(cycleId)) return NextResponse.json({ error: 'Ölçüm döngüsü geçersiz.' }, { status: 400 })
  const detail = await loadCycle(cycleId, user.id)
  if (!detail) return NextResponse.json({ error: 'Ölçüm döngüsü bulunamadı.' }, { status: 404 })
  return NextResponse.json({ practice: detail.practice ? safePractice(detail.practice) : null,
    objective: detail.objective ? { title: detail.objective.title, subject: detail.objective.subject } : null })
}

export async function POST(req: NextRequest) {
  const user = await student(req)
  if (!user) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 })
  const body = await req.json().catch(() => null) as { cycleId?: string; action?: string; choice?: number; explanation?: string } | null
  if (!body || !UUID.test(body.cycleId || '') || !['start', 'first', 'hint', 'retry', 'explain'].includes(body.action || '')) {
    return NextResponse.json({ error: 'Geçersiz rehberli çalışma işlemi.' }, { status: 400 })
  }
  const detail = await loadCycle(body.cycleId!, user.id)
  if (!detail?.objective || detail.cycle.status !== 'active' || !detail.objective.is_active || detail.objective.verification_status !== 'verified') {
    return NextResponse.json({ error: 'Etkin pilot veya doğrulanmış kazanım bulunamadı.' }, { status: 404 })
  }
  const baselineDone = detail.stages.some(stage => stage.stage === 'baseline' && stage.status === 'completed')
  const postStarted = detail.stages.some(stage => stage.stage === 'post')
  if (!baselineDone || postStarted) return NextResponse.json({ error: 'Rehberli çalışma ön testten sonra ve son testten önce yapılır.' }, { status: 422 })

  if (body.action === 'start') {
    if (detail.practice) return NextResponse.json({ practice: safePractice(detail.practice) })
    const sets = detail.cycle.item_sets as VerifiedItemSets
    const reserved = new Set([...(sets.baseline || []), ...(sets.post || []), ...(sets.transfer || [])])
    const { data: bank, error } = await db.from('question_bank').select('id,question,grade_key,subject_key')
      .eq('review_status', 'approved').eq('report_count', 0)
      .eq('question->>learningObjectiveId', detail.objective.id).limit(100)
    if (error) return NextResponse.json({ error: 'Çalışma soruları alınamadı.' }, { status: 500 })
    const reservedTexts = new Set(((bank || []) as VerifiedBankRow[]).filter(row => reserved.has(row.id))
      .map(row => String(row.question.q).normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()))
    const candidates = ((bank || []) as VerifiedBankRow[]).filter(row => !reserved.has(row.id)
      && !reservedTexts.has(String(row.question.q).normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim())
      && questionBankKey(row.grade_key) === questionBankKey(detail.objective!.grade)
      && questionBankKey(row.subject_key) === questionBankKey(detail.objective!.subject)
      && eligibleVerifiedItem(row, detail.objective!.id))
    if (!candidates.length) return NextResponse.json({ error: 'Ölçüm sorularından ayrı kalite onaylı çalışma sorusu kalmadı.' }, { status: 409 })
    const selected = candidates[randomInt(candidates.length)]
    const { data: inserted, error: insertError } = await db.from('coach_guided_practice_attempts').insert({
      cycle_id: detail.cycle.id, student_id: user.id,
      question: { ...selected.question, bankQuestionId: selected.id, subject: detail.objective.subject, coachedPractice: true },
    }).select('id,cycle_id,student_id,question,status,first_choice,retry_choice,hint_count,completed_at').maybeSingle()
    if (insertError || !inserted) return NextResponse.json({ error: insertError?.code === '23505' ? 'Çalışma başka bir oturumda açıldı; sayfayı yenileyin.' : 'Çalışma başlatılamadı.' }, { status: insertError?.code === '23505' ? 409 : 500 })
    return NextResponse.json({ practice: safePractice(inserted) }, { status: 201 })
  }

  const practice = detail.practice
  if (!practice) return NextResponse.json({ error: 'Önce rehberli çalışmayı başlatın.' }, { status: 404 })
  const optionCount = Array.isArray(practice.question.opts) ? practice.question.opts.length : 0
  if (body.action === 'first' || body.action === 'retry') {
    if (!Number.isInteger(body.choice) || body.choice! < 0 || body.choice! >= optionCount) return NextResponse.json({ error: 'Bir yanıt seçin.' }, { status: 400 })
    const from = body.action === 'first' ? 'awaiting_first' : 'awaiting_retry'
    const to = body.action === 'first' ? 'awaiting_hint' : 'awaiting_explanation'
    const { data: updated } = await db.from('coach_guided_practice_attempts').update({ status: to,
      ...(body.action === 'first' ? { first_choice: body.choice } : { retry_choice: body.choice }),
    }).eq('id', practice.id).eq('student_id', user.id).eq('status', from).select('id').maybeSingle()
    if (!updated) return NextResponse.json({ error: 'Bu adım zaten tamamlandı; sayfayı yenileyin.' }, { status: 409 })
    return NextResponse.json({ next: to })
  }
  if (body.action === 'hint') {
    const { data: updated } = await db.from('coach_guided_practice_attempts').update({ status: 'awaiting_retry', hint_count: 1 })
      .eq('id', practice.id).eq('student_id', user.id).eq('status', 'awaiting_hint').select('id').maybeSingle()
    if (!updated) return NextResponse.json({ error: 'İpucu aşaması artık uygun değil.' }, { status: 409 })
    return NextResponse.json({ hint: REFLECTION_HINT })
  }

  const explanation = String(body.explanation || '').trim()
  if (explanation.length < 10 || explanation.length > 1000) return NextResponse.json({ error: 'Düşünme adımlarını en az 10, en fazla 1000 karakterle açıkla.' }, { status: 400 })
  if (practice.status === 'awaiting_explanation') {
    const { data: claimed } = await db.from('coach_guided_practice_attempts').update({ status: 'processing', student_explanation: explanation })
      .eq('id', practice.id).eq('student_id', user.id).eq('status', 'awaiting_explanation').select('id').maybeSingle()
    if (!claimed) return NextResponse.json({ error: 'Çalışma başka bir istekte işleniyor.' }, { status: 409 })
  } else if (practice.status !== 'processing' || practice.student_explanation !== explanation) {
    return NextResponse.json({ error: 'Açıklama aşaması uygun değil veya ilk açıklama değiştirildi.' }, { status: 409 })
  }
  const correct = practice.retry_choice === practice.question.ans
  const answers = [{ userAns: practice.retry_choice, correct, hintUsed: true }]
  const { data: existingSession } = await db.from('quiz_sessions').select('id').eq('id', practice.id).eq('user_id', user.id).maybeSingle()
  if (!existingSession) {
    const { error: insertError } = await db.from('quiz_sessions').insert({
      id: practice.id, user_id: user.id, topic: detail.objective.topic || detail.objective.title,
      grade: detail.objective.grade, language: 'Türkçe', question_count: 1,
      questions: [practice.question], answers, score: correct ? 1 : 0, partial_score: correct ? 1 : 0,
      partial_pct: correct ? 100 : 0, completed: true, question_type: 'multiple_choice',
      gen_engine: 'coach-guided-practice-v1', objective_mapping_version: 'coach-guided-practice-v1',
      objective_candidate_count: 1, objective_mapped_count: 1,
    })
    if (insertError && insertError.code !== '23505') return NextResponse.json({ error: 'Çalışma sonucu kaydedilemedi; aynı açıklamayla tekrar deneyin.' }, { status: 503 })
  }
  await recordQuizLearningEvents(db, user.id, practice.id)
  const { count } = await db.from('learning_events').select('id', { count: 'exact', head: true })
    .eq('student_id', user.id).eq('source_type', 'quiz_session').eq('source_id', practice.id).eq('learning_objective_id', detail.objective.id)
  if (Number(count) !== 1) return NextResponse.json({ error: 'Öğrenme olayı tamamlanmadı; aynı açıklamayla tekrar deneyin.' }, { status: 503 })
  const { data: completed, error: completeError } = await db.from('coach_guided_practice_attempts').update({ status: 'completed', completed_at: new Date().toISOString(), quiz_session_id: practice.id })
    .eq('id', practice.id).eq('student_id', user.id).eq('status', 'processing').select('id').maybeSingle()
  if (completeError || !completed) return NextResponse.json({ error: 'Çalışma kesinleştirilemedi; aynı açıklamayla tekrar deneyin.' }, { status: 503 })
  return NextResponse.json({ correct, correctIndex: practice.question.ans, explanation: practice.question.exp || null,
    note: 'İpucuyla yapılan çalışma, yardımsız son test veya doğrulanmış kazanım yerine geçmez.' })
}
