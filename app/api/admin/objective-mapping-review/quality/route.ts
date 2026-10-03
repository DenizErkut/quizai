import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { callOpenAI } from '@/lib/openai'
import { verifyQuestionWithMistral } from '@/lib/mistral-quality'
import { evaluateQuestionStructure } from '@/lib/ai-gateway/quality-engine'
import { evaluateQuestionConsistency } from '@/lib/question-consistency'
import { hasRealVisualAsset, questionBankKey, questionFingerprint } from '@/lib/question-bank'
import type { Question } from '@/lib/quiz-constants'
import { hasAutomatedObjectiveApproval } from '@/lib/objective-mapping-verification'

export const runtime = 'nodejs'
export const maxDuration = 90

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const policyVersion = 'historical-bank-quality-v1'
const minimumScore = 80
const reusableFields = new Set(['q', 'opts', 'ans', 'exp', 'explanation', 'type', 'blank', 'referenceAnswer', 'pairs', 'items', 'correctOrder', 'statements', 'tableData', 'tableAnswers', 'distractorMisconceptions', 'difficulty', 'subject', 'qtype', 'svg', 'visualQuestionText', 'visualContextQuality', 'chartData', 'hasVisual', 'visualKind', 'learningObjectiveId', 'learningObjectiveCode', 'curriculumVersionId', 'learningObjectiveRevisionId', 'objectiveVerified', 'objectiveMappingStatus', 'objectiveMappingVersion'])
type StoredQuestion = Question & Record<string, unknown>

async function adminId() {
  const jar = await cookies()
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get: name => jar.get(name)?.value },
  })
  const { data: { user } } = await client.auth.getUser()
  if (!user) return null
  const { data } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return data?.is_admin ? user.id : null
}

function blockedReason(question: StoredQuestion): string | null {
  if (evaluateQuestionStructure(question).verdict !== 'accept') return 'Soru veya cevap yapısı geçersiz.'
  if (evaluateQuestionConsistency(question).verdict !== 'accept') return 'Sorunun verileri cevap için yetersiz.'
  if (question.sourceBased || question.passage) return 'Kaynak metne bağımlı soru bağımsız kullanılamaz.'
  if (question.hasVisual && !hasRealVisualAsset(question)) return 'Görsel işaretli sorunun gerçek görseli yok.'
  if (hasRealVisualAsset(question)) return 'Görsel sorular ayrıca görsel doğrulaması gerektirir.'
  if (Array.isArray(question.opts)) {
    const options = question.opts.map(value => questionBankKey(value))
    if (options.some(value => !value) || new Set(options).size !== options.length) return 'Boş veya yinelenen seçenek var.'
  }
  if (!question.learningObjectiveId || (String(question.objectiveMappingStatus) !== 'human_approved' && !hasAutomatedObjectiveApproval(question))) return 'Kazanım eşleştirmesi onaylanmamış.'
  return null
}

function reviewPrompt(question: StoredQuestion, objective: { objective_code: string; title: string }, grade: string, subject: string) {
  return `Bağımsız bir Türkçe eğitim sorusu kalite denetçisisin. Aşağıdaki soruyu DEĞİŞTİRME. Sınıf/ders: ${grade} / ${subject}. Onaylı kazanım: ${objective.objective_code} — ${objective.title}.\n\nSoru ve cevap verisi: ${JSON.stringify({ type: question.type, q: question.q, opts: question.opts, ans: question.ans, exp: question.exp || question.explanation, blank: question.blank })}\n\nDoğru cevabın kesinliği, tek doğru seçenek, çeldiricilerin niteliği, açıklamanın cevapla tutarlılığı, dil/yaş uygunluğu ve kazanımı doğrudan ölçmesi açısından değerlendir. Yalnızca geçerli JSON döndür: {"score":0-100,"ok":true/false,"objectiveMatches":true/false,"reason":"kısa gerekçe"}. Şüphede kalırsan ok:false ve düşük puan ver.`
}

export async function POST(req: NextRequest) {
  const reviewer = await adminId()
  if (!reviewer) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { recordId?: string; index?: number }
  if (!uuid.test(body.recordId || '') || !Number.isInteger(body.index) || body.index! < 0) return NextResponse.json({ error: 'Test sorusu kimliği geçersiz.' }, { status: 400 })

  const { data: session, error: sessionError } = await db.from('quiz_sessions').select('id,questions,grade,topic,completed').eq('id', body.recordId).maybeSingle()
  if (sessionError || !session || !session.completed || !Array.isArray(session.questions) || !session.questions[body.index!]) return NextResponse.json({ error: 'Tamamlanmış test sorusu bulunamadı.' }, { status: 404 })
  const question = session.questions[body.index!] as StoredQuestion
  if ((String(question.objectiveMappingStatus) !== 'human_approved' && !hasAutomatedObjectiveApproval(question)) || !uuid.test(String(question.learningObjectiveId || ''))) return NextResponse.json({ error: 'Önce kazanım eşleştirmesi onaylanmalı.' }, { status: 400 })

  const { data: objective, error: objectiveError } = await db.from('learning_objective_catalog')
    .select('id,objective_code,title,grade,subject').eq('id', question.learningObjectiveId).eq('is_active', true).eq('verification_status', 'verified').maybeSingle()
  if (objectiveError || !objective) return NextResponse.json({ error: 'Onaylı kazanım artık aktif değil.' }, { status: 400 })
  const subject = String(question.subject || '')
  const sessionGrade = String(session.grade).match(/\d+/)?.[0]
  const objectiveGrade = String(objective.grade).match(/\d+/)?.[0]
  if (!subject || !sessionGrade || !objectiveGrade || questionBankKey(subject) !== questionBankKey(objective.subject) || sessionGrade !== objectiveGrade) return NextResponse.json({ error: 'Sınıf veya ders kazanımla uyuşmuyor.' }, { status: 400 })

  let score = 0
  let reason = blockedReason(question)
  if (!reason) {
    const prompt = reviewPrompt(question, objective, session.grade, subject)
    const [openaiResult, mistralResult] = await Promise.all([
      callOpenAI([
        { role: 'system', content: 'Sen bağımsız ve katı bir eğitim içeriği kalite denetçisisin. Yalnızca JSON döndür.' },
        { role: 'user', content: prompt },
      ], { model: 'gpt-4.1-mini', max_tokens: 220, json: true, timeoutMs: 20000, operation: 'historical-bank-quality', userId: reviewer, quizSessionId: session.id }).then(raw => JSON.parse(raw) as Record<string, unknown>).catch(() => null),
      verifyQuestionWithMistral(`${prompt}\nYanıtında ayrıca difficultyMatches:true ve objectiveMatches:true alanlarını yalnız gerçekten doğrulandıysa kullan.`, { userId: reviewer, sessionId: session.id }),
    ])
    const openaiScore = Number(openaiResult?.score)
    score = Number.isFinite(openaiScore) ? Math.max(0, Math.min(100, Math.round(openaiScore))) : 0
    if (!openaiResult || !mistralResult) reason = 'Bağımsız kalite denetçilerinden biri kullanılamadı; soru havuz dışında kaldı.'
    else if (openaiResult.ok !== true || openaiResult.objectiveMatches !== true || mistralResult.ok !== true || mistralResult.objectiveMatches !== true) reason = String(openaiResult.reason || mistralResult.reason || 'Doğruluk veya kazanım uyumu doğrulanamadı.').slice(0, 300)
    else if (score < minimumScore) reason = `Kalite puanı ${score}/100; gereken en az ${minimumScore}/100.`
  }

  const fingerprint = questionFingerprint(question)
  const subjectKey = questionBankKey(subject)
  const gradeKey = questionBankKey(session.grade)
  const { data: freshSession, error: freshError } = await db.from('quiz_sessions').select('questions').eq('id', session.id).maybeSingle()
  const freshQuestions = freshSession?.questions as StoredQuestion[] | undefined
  const freshQuestion = freshQuestions?.[body.index!]
  if (freshError || !freshQuestion || questionFingerprint(freshQuestion) !== fingerprint || String(freshQuestion.learningObjectiveId) !== String(question.learningObjectiveId) || String(freshQuestion.objectiveMappingStatus) !== String(question.objectiveMappingStatus)) {
    return NextResponse.json({ error: 'Soru inceleme sırasında değişti. Listeyi yenileyip yeniden deneyin.' }, { status: 409 })
  }
  let bankId: string | null = null
  let outcome: 'added' | 'already_in_bank' | 'excluded' = reason ? 'excluded' : 'added'
  if (reason && !reason.startsWith('Bağımsız kalite denetçilerinden biri kullanılamadı')) {
    const { data: existing, error: lookupError } = await db.from('question_bank').select('id,review_status,report_count,subject_key,grade_key').eq('fingerprint', fingerprint).maybeSingle()
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
    if (existing?.review_status === 'approved' && existing.report_count === 0 && existing.subject_key === subjectKey && existing.grade_key === gradeKey) {
      const { error: quarantineError } = await db.from('question_bank').update({ review_status: 'candidate', awaiting_expert_review: true, quality_score: score / 100, updated_at: new Date().toISOString() }).eq('id', existing.id).eq('review_status', 'approved')
      if (quarantineError) return NextResponse.json({ error: quarantineError.message }, { status: 500 })
    }
  }
  if (!reason) {
    const { data: existing, error: existingError } = await db.from('question_bank').select('id,review_status,report_count,awaiting_expert_review,subject_key,grade_key').eq('fingerprint', fingerprint).maybeSingle()
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
    if (existing) {
      bankId = existing.id
      if (existing.subject_key !== subjectKey || existing.grade_key !== gradeKey) {
        outcome = 'excluded'; reason = 'Aynı soru metni farklı sınıf veya ders altında kayıtlı; otomatik yayınlanmadı.'
      }
      else if (existing.review_status === 'approved' && existing.report_count === 0) outcome = 'already_in_bank'
      else if (existing.review_status === 'candidate' && existing.report_count === 0 && !existing.awaiting_expert_review) {
        const { data: promoted, error: promotionError } = await db.from('question_bank').update({ review_status: 'approved', quality_score: score / 100, ai_policy_version: policyVersion, promoted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', existing.id).eq('review_status', 'candidate').eq('report_count', 0).eq('awaiting_expert_review', false).select('id').maybeSingle()
        if (promotionError || !promoted) return NextResponse.json({ error: promotionError?.message || 'Havuz adayı güncellenemedi.' }, { status: 500 })
      }
      else { outcome = 'excluded'; reason = 'Aynı soru havuzda karantinada veya reddedilmiş; otomatik yayınlanmadı.' }
    } else {
      // Only reusable question content crosses from a student session into the bank.
      const bankQuestion = Object.fromEntries(Object.entries(question).filter(([key]) => reusableFields.has(key)))
      const { data: inserted, error: insertError } = await db.from('question_bank').insert({
        fingerprint, subject_key: subjectKey, topic_key: questionBankKey(session.topic), grade_key: gradeKey, language_key: 'tr',
        question_type: String(question.type || 'multiple_choice'), difficulty: String(question.difficulty || 'normal'), question: bankQuestion,
        review_status: 'approved', quality_score: score / 100, source_session_id: session.id, source_engine: 'historical_quality_review',
        awaiting_expert_review: false, ai_policy_version: policyVersion, promoted_at: new Date().toISOString(),
      }).select('id').maybeSingle()
      if (insertError || !inserted) return NextResponse.json({ error: insertError?.message || 'Havuza ekleme başarısız.' }, { status: 500 })
      bankId = inserted.id
    }
  }

  const result = { status: outcome, score, reason: reason || 'Kalite ve kazanım kontrollerini geçti.', bankQuestionId: outcome === 'excluded' ? null : bankId, policyVersion, reviewedAt: new Date().toISOString(), reviewer }
  const updated = [...freshQuestions!]
  updated[body.index!] = {
    ...freshQuestion,
    historicalBankQuality: result,
    ...(outcome !== 'excluded' ? { qualityVerificationVersion: policyVersion } : {}),
  }
  const { error: saveError } = await db.from('quiz_sessions').update({ questions: updated }).eq('id', session.id)
  if (saveError) return NextResponse.json({ error: `Kalite sonucu test kaydına yazılamadı: ${saveError.message}`, ...result }, { status: 500 })
  return NextResponse.json(result)
}
