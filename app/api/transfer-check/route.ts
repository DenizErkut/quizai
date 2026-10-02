import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { gradeTransferChoice, usableTransferQuestion } from '@/lib/transfer-check-scoring'
import { questionBankKey } from '@/lib/question-bank'
import { randomInt } from 'node:crypto'

export const runtime = 'nodejs'

async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const authDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: { user } } = await authDb.auth.getUser(authHeader.slice(7))
  return user ?? null
}

/** Returns due transfer checks without exposing the answer to the client. */
export async function GET(req: NextRequest) {
  const user = await authenticate(req)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const [{ count: eventCount }, { data, error }] = await Promise.all([
    db.from('learning_events').select('id', { count: 'exact', head: true }).eq('student_id', user.id),
    db.from('learning_transfer_checks')
      .select('id,subject,grade,topic,learning_objective_id,learning_objective_code,due_after_event_count,status,prompt_context,created_at')
      .eq('student_id', user.id).in('status', ['pending', 'served'])
      .order('created_at', { ascending: true }).limit(20),
  ])
  if (error) return NextResponse.json({ error: 'Transfer kontrolleri alınamadı.' }, { status: 500 })
  const due = (data ?? []).filter(check => check.status === 'served' || Number(check.due_after_event_count) <= Number(eventCount ?? 0))
    .map(check => ({
      id: check.id, subject: check.subject, grade: check.grade, topic: check.topic,
      learningObjectiveCode: check.learning_objective_code, status: check.status,
      ...(check.status === 'served' ? { question: check.prompt_context?.question, options: check.prompt_context?.options } : {}),
    }))
  return NextResponse.json({ eventCount: eventCount ?? 0, due })
}

/** Claims a vetted new item or grades the student's response on the server. */
export async function POST(req: NextRequest) {
  const user = await authenticate(req)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  let body: { action?: string; checkId?: string; answerIndex?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 }) }
  if (!body.checkId || !['claim', 'complete'].includes(body.action ?? '')) {
    return NextResponse.json({ error: 'Geçersiz transfer kontrolü işlemi.' }, { status: 400 })
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  if (body.action === 'claim') {
    const { data: check, error } = await db.from('learning_transfer_checks')
      .select('id,student_id,source_session_id,source_question_index,subject,grade,topic,learning_objective_id,learning_objective_code,due_after_event_count,status,prompt_context')
      .eq('id', body.checkId).eq('student_id', user.id).eq('status', 'pending').single()
    if (error || !check) return NextResponse.json({ error: 'Transfer kontrolü artık uygun değil.' }, { status: 409 })
    const { count: eventCount, error: countError } = await db.from('learning_events').select('id', { count: 'exact', head: true }).eq('student_id', user.id)
    if (countError) return NextResponse.json({ error: 'Kontrol zamanı doğrulanamadı.' }, { status: 500 })
    if (Number(check.due_after_event_count) > Number(eventCount ?? 0)) return NextResponse.json({ error: 'Kontrol henüz zamanı gelmedi.' }, { status: 409 })
    if (!check.learning_objective_id) return NextResponse.json({ error: 'Doğrulanmış kazanım bulunamadı.' }, { status: 422 })
    const { data: objective } = await db.from('learning_objective_catalog').select('id,subject,grade')
      .eq('id', check.learning_objective_id).eq('verification_status', 'verified').eq('is_active', true).maybeSingle()
    if (!objective) return NextResponse.json({ error: 'Kazanım artık aktif veya doğrulanmış değil.' }, { status: 422 })
    const { data: source } = await db.from('quiz_sessions').select('questions').eq('id', check.source_session_id).eq('user_id', user.id).maybeSingle()
    const sourceText = Array.isArray(source?.questions) ? String(source.questions[check.source_question_index]?.q || '') : ''
    if (!sourceText) return NextResponse.json({ error: 'Kaynak sorunun kanıtı bulunamadı.' }, { status: 422 })
    const { data: usedChecks } = await db.from('learning_transfer_checks').select('prompt_context')
      .eq('student_id', user.id).eq('learning_objective_id', check.learning_objective_id).in('status', ['served', 'completed']).limit(100)
    const usedBankIds = new Set((usedChecks || []).map(item => String(item.prompt_context?.bankQuestionId || '')).filter(Boolean))
    const { data: bank, error: bankError } = await db.from('question_bank')
      .select('id,question,grade_key,subject_key').eq('review_status', 'approved').eq('report_count', 0)
      .eq('question->>learningObjectiveId', check.learning_objective_id).limit(60)
    if (bankError) return NextResponse.json({ error: 'Kontrol soruları alınamadı.' }, { status: 500 })
    const sourceDifficulty = String(check.prompt_context?.sourceDifficulty || '')
    const candidates = (bank ?? []).filter(row => !usedBankIds.has(row.id) &&
      questionBankKey(row.grade_key) === questionBankKey(objective.grade) &&
      questionBankKey(row.subject_key) === questionBankKey(objective.subject) &&
      usableTransferQuestion(row.question as Record<string, unknown>, check.learning_objective_id!, sourceText, sourceDifficulty))
    const candidate = candidates.length ? candidates[randomInt(candidates.length)] : null
    if (!candidate) return NextResponse.json({ error: 'Bu kazanım için bağımsız kontrolden geçmiş farklı bir soru henüz yok.' }, { status: 409 })
    const question = candidate.question as { q: string; opts: string[]; ans: number; exp?: string }
    const promptContext = {
      sourceQuestionType: check.prompt_context?.sourceQuestionType,
      sourceDifficulty: check.prompt_context?.sourceDifficulty,
      bankQuestionId: candidate.id,
      question: question.q,
      options: question.opts,
      correctIndex: question.ans,
      explanation: typeof question.exp === 'string' ? question.exp.slice(0, 2000) : null,
    }
    const servedAt = new Date().toISOString()
    const { data: claimed, error: updateError } = await db.from('learning_transfer_checks').update({ status: 'served', served_at: servedAt, prompt_context: promptContext, updated_at: servedAt })
      .eq('id', check.id).eq('student_id', user.id).eq('status', 'pending').select('id').single()
    if (updateError || !claimed) return NextResponse.json({ error: 'Transfer kontrolü alınamadı.' }, { status: 409 })
    return NextResponse.json({ check: { id: check.id, status: 'served', learningObjectiveCode: check.learning_objective_code, question: question.q, options: question.opts } })
  }

  const { data: served, error: servedError } = await db.from('learning_transfer_checks')
    .select('id,served_at,prompt_context').eq('id', body.checkId).eq('student_id', user.id).eq('status', 'served').maybeSingle()
  if (servedError || !served) return NextResponse.json({ error: 'Yanıtlanacak kontrol bulunamadı.' }, { status: 409 })
  const context = served.prompt_context as { correctIndex?: unknown; options?: unknown; explanation?: unknown }
  if (!Array.isArray(context.options) || !Number.isInteger(context.correctIndex) ||
    (body.answerIndex !== undefined && (!Number.isInteger(body.answerIndex) || body.answerIndex < 0 || body.answerIndex >= context.options.length))) {
    return NextResponse.json({ error: 'Geçersiz yanıt veya soru kanıtı.' }, { status: 400 })
  }
  const result = gradeTransferChoice(body.answerIndex, Number(context.correctIndex))
  const responseTimeMs = Math.max(0, Date.now() - Date.parse(served.served_at))
  const { data: completed, error } = await db.from('learning_transfer_checks').update({
    status: 'completed', transfer_result: result, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    result_metadata: { usedHint: false, responseTimeMs, selectedIndex: body.answerIndex ?? null, scoring: 'server-v1' },
  }).eq('id', body.checkId).eq('student_id', user.id).eq('status', 'served').select('id,status,transfer_result,completed_at').single()
  if (error || !completed) return NextResponse.json({ error: 'Transfer sonucu kaydedilemedi.' }, { status: 409 })
  const { error: masteryError } = await db.rpc('apply_transfer_check_to_mastery_v1', { p_check_id: body.checkId })
  if (masteryError) console.error('[transfer-check] mastery signal failed:', masteryError.message)
  return NextResponse.json({ check: completed, correctIndex: context.correctIndex, explanation: context.explanation ?? null })
}
