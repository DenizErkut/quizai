/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomInt, randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server-create-client'
import { isProviderConfigured } from '@/lib/ai-gateway'
import { generateWithRoutedProvider, pickQuizEngine, type ForceProvider } from '@/lib/ai-gateway/quiz-provider-router'
import { createBlindEvalPrompt, isCompleteBenchmark, parseBlindEvalAnswer, shouldUnblindResults, toBlindQuestion } from '@/lib/education-eval-runner'

export const runtime = 'nodejs'
export const maxDuration = 120

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const PROVIDERS: Array<{ key: 'openai' | 'anthropic' | 'mistral'; force: ForceProvider; label: string }> = [
  { key: 'openai', force: 'openai', label: 'A' },
  { key: 'anthropic', force: 'claude', label: 'B' },
  { key: 'mistral', force: 'mistral', label: 'C' },
]

async function getAdminUser() {
  const cookieStore = await cookies()
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get: name => cookieStore.get(name)?.value },
  })
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return profile?.is_admin ? user : null
}

async function loadRun(runId?: string) {
  let query = db.from('education_eval_runs').select('*').order('created_at', { ascending: false }).limit(1)
  if (runId) query = db.from('education_eval_runs').select('*').eq('id', runId).limit(1)
  const { data: runs, error } = await query
  if (error) throw error
  const run = runs?.[0]
  if (!run) return { run: null, results: [], summary: null }
  const [{ data: results, error: resultsError }, { data: items, error: itemsError }] = await Promise.all([
    db.from('education_eval_run_results').select('id,run_id,benchmark_item_id,blind_label,status,answer_index,is_correct,explanation,error_code,duration_ms,input_tokens,output_tokens,cost_usd,curriculum_alignment_score,pedagogy_score,age_appropriateness_score,safety_score,reviewer_notes,reviewed_at,model').eq('run_id', run.id).order('blind_label').order('benchmark_item_id'),
    db.from('education_eval_benchmark_items').select('id,ordinal,grade,subject,objective_code,objective_title,question_snapshot,answer_key').eq('benchmark_set_id', run.benchmark_set_id).eq('metric_eligible', true).order('ordinal'),
  ])
  if (resultsError || itemsError) throw resultsError || itemsError
  const resultRows = results || []
  const completed = resultRows.filter(row => row.status === 'completed')
  const reviewed = completed.filter(row => [row.curriculum_alignment_score, row.pedagogy_score, row.age_appropriateness_score, row.safety_score].every(value => Number.isInteger(value)))
  const unblinded = shouldUnblindResults(completed.length, reviewed.length)
  let providerSummary: any[] | null = null
  let visibleResults: any[] = resultRows.map(({ id, run_id, benchmark_item_id, blind_label, status, answer_index, is_correct, explanation, error_code, duration_ms, input_tokens, output_tokens, cost_usd, curriculum_alignment_score, pedagogy_score, age_appropriateness_score, safety_score, reviewer_notes, reviewed_at }) => ({
    id, run_id, benchmark_item_id, blind_label, status, answer_index, is_correct, explanation, error_code, duration_ms, input_tokens, output_tokens, cost_usd,
    curriculum_alignment_score, pedagogy_score, age_appropriateness_score, safety_score, reviewer_notes, reviewed_at,
  }))
  if (unblinded) {
    visibleResults = resultRows.map(row => ({ ...row }))
    providerSummary = PROVIDERS.map(provider => {
      const rows = completed.filter(row => row.blind_label === (run.blind_mapping as Record<string, string>)[provider.key])
      const mean = (field: string) => rows.length ? Number((rows.reduce((sum, row) => sum + Number(row[field] || 0), 0) / rows.length).toFixed(3)) : 0
      return { provider: provider.key, model: rows[0]?.model || '', n: rows.length, accuracy: mean('is_correct'),
        meanLatencyMs: mean('duration_ms'), totalCostUsd: Number(rows.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0).toFixed(6)),
        curriculumAlignment: mean('curriculum_alignment_score'), pedagogy: mean('pedagogy_score'),
        ageAppropriateness: mean('age_appropriateness_score'), safety: mean('safety_score') }
    })
  }
  const itemById = new Map((items || []).map(item => [item.id, item]))
  return { run: { id: run.id, benchmark_version: run.benchmark_version, status: run.status,
    total_items: run.total_items, completed_items: run.completed_items, created_at: run.created_at, completed_at: run.completed_at }, results: visibleResults.map(row => {
    const item = itemById.get(row.benchmark_item_id)
    return { ...row, ...(unblinded ? {} : { is_correct: undefined }), item: item ? {
      id: item.id, ordinal: item.ordinal, grade: item.grade, subject: item.subject,
      objective_code: item.objective_code, objective_title: item.objective_title,
      question_snapshot: item.question_snapshot, ...(unblinded ? { answer_key: item.answer_key } : {}),
    } : null }
  }),
    summary: providerSummary, progress: { completedOutputs: completed.length, ratedOutputs: reviewed.length,
      totalOutputs: 150, completedItems: new Set(completed.map(row => row.benchmark_item_id)).size,
      failedOutputs: resultRows.filter(row => row.status === 'error').length, blinded: !unblinded } }
}

export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  try {
    const runId = req.nextUrl.searchParams.get('runId') || undefined
    const [state, { data: set }] = await Promise.all([
      loadRun(runId),
      db.from('education_eval_benchmark_sets').select('id,status,target_size').eq('code', 'meb-k12-controlled').eq('version', 1).maybeSingle(),
    ])
    const { count: eligibleCount } = set ? await db.from('education_eval_benchmark_items').select('id', { count: 'exact', head: true })
      .eq('benchmark_set_id', set.id).eq('metric_eligible', true) : { count: 0 }
    const configured = PROVIDERS.every(provider => isProviderConfigured(provider.key === 'anthropic' ? 'anthropic' : provider.key))
    return NextResponse.json({ ...state, readiness: { benchmarkStatus: set?.status || 'missing', eligibleQuestions: eligibleCount || 0,
      target: set?.target_size || 50, providersConfigured: configured } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Education Eval verisi alınamadı.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body.action !== 'string') return NextResponse.json({ error: 'İşlem bilgisi gerekli.' }, { status: 400 })

  if (body.action === 'start') {
    const missing = PROVIDERS.filter(provider => !isProviderConfigured(provider.key === 'anthropic' ? 'anthropic' : provider.key))
    if (missing.length) return NextResponse.json({ error: `Ölçüm başlatılmadı; yapılandırılmamış sağlayıcılar var: ${missing.map(item => item.key).join(', ')}.` }, { status: 409 })
    const { data: set, error: setError } = await db.from('education_eval_benchmark_sets').select('id,version,status,target_size').eq('code', 'meb-k12-controlled').eq('version', 1).maybeSingle()
    if (setError) return NextResponse.json({ error: setError.message }, { status: 500 })
    if (!set || set.status !== 'active' || set.target_size !== 50) return NextResponse.json({ error: 'Önce 50 soruluk MEB benchmark setini kilitleyip etkinleştirin.' }, { status: 409 })
    const { data: items, error: itemsError } = await db.from('education_eval_benchmark_items').select('id,question_snapshot,answer_key,metric_eligible').eq('benchmark_set_id', set.id).eq('metric_eligible', true).order('ordinal')
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
    if (!isCompleteBenchmark(items)) {
      return NextResponse.json({ error: `Ölçüm için 50 geçerli, onaylı soru gerekir. Şu an ${items?.length || 0}/50.` }, { status: 409 })
    }
    const shuffled = [...PROVIDERS]
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swap = randomInt(index + 1)
      ;[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]]
    }
    const blindMapping = Object.fromEntries(shuffled.map((provider, index) => [provider.key, ['A', 'B', 'C'][index]]))
    const { data: run, error } = await db.from('education_eval_runs').insert({ benchmark_set_id: set.id, benchmark_version: set.version,
      status: 'running', blind_mapping: blindMapping, total_items: 50, completed_items: 0, created_by: user.id }).select('id,benchmark_version,status,total_items,created_at').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ run, started: true })
  }

  if (body.action === 'process') {
    if (typeof body.runId !== 'string') return NextResponse.json({ error: 'Çalışma kimliği gerekli.' }, { status: 400 })
    const { data: run, error: runError } = await db.from('education_eval_runs').select('*').eq('id', body.runId).maybeSingle()
    if (runError) return NextResponse.json({ error: runError.message }, { status: 500 })
    if (!run || run.status !== 'running') return NextResponse.json({ error: 'Çalışma bulunamadı veya tamamlanmış.' }, { status: 409 })
    const lockToken = randomUUID()
    const now = new Date()
    const leaseExpiry = new Date(now.getTime() - 150_000).toISOString()
    let claim = db.from('education_eval_runs').update({ processing_token: lockToken, processing_started_at: now.toISOString() }).eq('id', run.id).eq('status', 'running')
    if (run.processing_token) {
      if (!run.processing_started_at || new Date(run.processing_started_at).getTime() > now.getTime() - 150_000) {
        return NextResponse.json({ error: 'Bu çalışmanın başka bir adımı sürüyor. Biraz sonra tekrar deneyin.' }, { status: 409 })
      }
      claim = claim.eq('processing_token', run.processing_token).lt('processing_started_at', leaseExpiry)
    } else {
      claim = claim.is('processing_token', null)
    }
    const { data: claimed, error: claimError } = await claim.select('id').maybeSingle()
    if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })
    if (!claimed) return NextResponse.json({ error: 'Çalışma adımı eşzamanlı olarak başlatılmış; yinelenen model çağrısı önlendi.' }, { status: 409 })
    try {
    const { data: items, error: itemsError } = await db.from('education_eval_benchmark_items').select('id,ordinal,grade,subject,objective_code,objective_title,question_snapshot,answer_key').eq('benchmark_set_id', run.benchmark_set_id).eq('metric_eligible', true).order('ordinal')
    if (itemsError || items?.length !== 50) return NextResponse.json({ error: itemsError?.message || 'Kilitli benchmark bütünlüğü doğrulanamadı.' }, { status: 409 })
    const { data: existing, error: existingError } = await db.from('education_eval_run_results').select('benchmark_item_id,provider_key,status').eq('run_id', run.id)
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
    const next = items.find(item => PROVIDERS.some(provider => !existing?.some(row => row.benchmark_item_id === item.id && row.provider_key === provider.key && row.status === 'completed')))
    if (!next) {
      await db.from('education_eval_runs').update({ status: 'completed', completed_items: 50, completed_at: new Date().toISOString() }).eq('id', run.id)
      return NextResponse.json({ done: true, ...(await loadRun(run.id)) })
    }
    const question = toBlindQuestion(next.question_snapshot)!
    const { systemPrompt, userPrompt } = createBlindEvalPrompt({ grade: next.grade, subject: next.subject,
      objectiveCode: next.objective_code, objectiveTitle: next.objective_title, question })
    const requested = PROVIDERS.filter(provider => !existing?.some(row => row.benchmark_item_id === next.id && row.provider_key === provider.key && row.status === 'completed'))
    const attempts = await Promise.all(requested.map(async provider => {
      const started = Date.now()
      const requestId = randomUUID()
      const blindLabel = (run.blind_mapping as Record<string, string>)[provider.key]
      try {
        if (!isProviderConfigured(provider.key === 'anthropic' ? 'anthropic' : provider.key)) throw new Error('PROVIDER_NOT_CONFIGURED')
        const decision = pickQuizEngine({ bucketKey: `education-eval:${run.id}:${next.id}:${provider.key}`, forceProvider: provider.force })
        const response = await generateWithRoutedProvider(decision, { systemPrompt, userPrompt, maxTokens: 600,
          operationTag: 'education-eval-blind', userId: user.id, requestId,
          providerCallTimeoutMs: 90000, claudeCallDeadlineMs: 90000,
          routingMeta: { educationEvalRunId: run.id, benchmarkItemId: next.id, blindLabel } })
        const answer = parseBlindEvalAnswer(response.text, question.opts)
        if (!answer) throw new Error('INVALID_MODEL_OUTPUT')
        const { data: usage } = await db.from('ai_usage_logs').select('input_tokens,output_tokens,cost_usd')
          .eq('request_id', requestId).order('created_at', { ascending: false }).limit(1).maybeSingle()
        const row = { run_id: run.id, benchmark_item_id: next.id, provider_key: provider.key, blind_label: blindLabel,
          model: decision.engine === 'gpt-4.1-mini' ? 'gpt-4.1-mini' : decision.engine === 'mistral' ? (process.env.MISTRAL_PRIMARY_MODEL || 'mistral-large-latest') : decision.engine === 'claude-haiku' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-5',
          status: 'completed', answer_index: answer.answerIndex, is_correct: answer.answerIndex === Number(next.answer_key.answerIndex),
          explanation: answer.explanation, error_code: null, duration_ms: response.durationMs, input_tokens: usage?.input_tokens || 0,
          output_tokens: usage?.output_tokens || 0, cost_usd: usage?.cost_usd || 0 }
        const { error } = await db.from('education_eval_run_results').upsert(row, { onConflict: 'run_id,benchmark_item_id,provider_key' })
        if (error) throw error
        return { provider: provider.key, status: 'completed' }
      } catch (error) {
        const code = error instanceof Error && ['PROVIDER_NOT_CONFIGURED', 'INVALID_MODEL_OUTPUT'].includes(error.message)
          ? error.message : 'MODEL_CALL_FAILED'
        await db.from('education_eval_run_results').upsert({ run_id: run.id, benchmark_item_id: next.id, provider_key: provider.key,
          blind_label: blindLabel, model: provider.key, status: 'error', error_code: code, duration_ms: Date.now() - started },
          { onConflict: 'run_id,benchmark_item_id,provider_key' })
        return { provider: provider.key, status: 'error', error: code }
      }
    }))
    const { data: allResults } = await db.from('education_eval_run_results').select('benchmark_item_id,provider_key,status').eq('run_id', run.id)
    const successfulResults = (allResults || []).filter(row => row.status === 'completed')
    const completedItems = new Set(successfulResults.map(row => row.benchmark_item_id)).size
    const done = successfulResults.length === 150
    await db.from('education_eval_runs').update({ completed_items: completedItems, ...(done ? { status: 'completed', completed_at: new Date().toISOString() } : {}) }).eq('id', run.id)
    const hadErrors = attempts.some(attempt => attempt.status === 'error')
    return NextResponse.json({ done, hadErrors, currentOrdinal: next.ordinal,
      attempts: attempts.map(({ status }) => ({ status })), completedItems,
      completedOutputs: successfulResults.length, failedOutputs: (allResults || []).filter(row => row.status === 'error').length,
      ...(done ? await loadRun(run.id) : {}) })
    } finally {
      await db.from('education_eval_runs').update({ processing_token: null, processing_started_at: null })
        .eq('id', run.id).eq('processing_token', lockToken)
    }
  }

  if (body.action === 'review') {
    if (typeof body.resultId !== 'string' || typeof body.runId !== 'string') return NextResponse.json({ error: 'Sonuç kimliği gerekli.' }, { status: 400 })
    const fields = ['curriculum_alignment_score', 'pedagogy_score', 'age_appropriateness_score', 'safety_score'] as const
    if (!fields.every(field => Number.isInteger(body[field]) && body[field] >= 1 && body[field] <= 5)) return NextResponse.json({ error: 'Dört değerlendirme puanının her biri 1–5 arasında olmalı.' }, { status: 400 })
    const { error } = await db.from('education_eval_run_results').update({ ...Object.fromEntries(fields.map(field => [field, body[field]])),
      reviewer_notes: typeof body.reviewerNotes === 'string' ? body.reviewerNotes.slice(0, 1000) : '', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', body.resultId).eq('run_id', body.runId).eq('status', 'completed')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(await loadRun(body.runId))
  }
  return NextResponse.json({ error: 'Desteklenmeyen işlem.' }, { status: 400 })
}
