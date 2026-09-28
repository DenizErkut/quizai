/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { questionBankKey } from '@/lib/question-bank'
import { educationEvalGradeKey, isEducationEvalObjectiveInScope } from '@/lib/education-eval-grade'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get: name => cookieStore.get(name)?.value },
  })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return profile?.is_admin ? user : null
}

function validQuestion(question: any) {
  return question && typeof question.q === 'string' && question.q.trim().length >= 8
    && Array.isArray(question.opts) && question.opts.length >= 2
    && Number.isInteger(question.ans) && question.ans >= 0 && question.ans < question.opts.length
}

export async function GET() {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const [{ data: benchmark }, { data: items, error: itemError }, { data: resources, error: resourceError },
    { data: aiResources, error: aiResourceError }, { data: aiItems, error: aiItemsError }] = await Promise.all([
    db.from('education_eval_benchmark_sets').select('*').eq('code', 'meb-k12-controlled').eq('version', 1).maybeSingle(),
    db.from('education_eval_benchmark_items').select('*').order('ordinal'),
    db.from('exam_resources').select('id,title,grade,subject,topic,subtopic,raw_text,source_type,purpose,reuse_policy,review_status,publication_evidence_paths,created_at').eq('source_type', 'teacher').eq('purpose', 'instant_test').eq('review_status', 'approved').order('created_at', { ascending: false }).limit(100),
    db.from('exam_resources').select('id,title,grade,subject,topic,subtopic,raw_text,source_type,purpose,review_status,created_at').eq('source_type', 'ai').eq('purpose', 'instant_test').eq('review_status', 'approved').order('created_at', { ascending: false }).limit(100),
    db.from('education_eval_ai_question_items').select('*').order('created_at', { ascending: false }).limit(1000),
  ])
  if (itemError || resourceError || aiResourceError || aiItemsError) return NextResponse.json({ error: itemError?.message || resourceError?.message || aiResourceError?.message || aiItemsError?.message }, { status: 500 })

  const eligibleResources = (resources || []).filter(resource => Array.isArray(resource.publication_evidence_paths) && resource.publication_evidence_paths.length > 0)
  // Fetch the complete active catalog for this curriculum in explicit pages,
  // then scope locally with the same canonical grade/subject rules as the
  // benchmark insert. SQL equality here is intentionally avoided: catalog
  // values can be "5", "5. Sınıf", "Ortaokul 5. sınıf" etc., and Postgres
  // equality is case-sensitive even though these are the same grade to us.
  const catalogRows: any[] = []
  let objectiveError: any = null
  if (benchmark?.curriculum_version_id) {
    const pageSize = 500
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await db.from('learning_objective_catalog')
        .select('id,objective_code,title,grade,subject,verification_status,lifecycle_status,is_active,curriculum_version_id')
        .eq('curriculum_version_id', benchmark.curriculum_version_id)
        .eq('verification_status', 'verified').eq('lifecycle_status', 'active').eq('is_active', true)
        .order('objective_code').range(offset, offset + pageSize - 1)
      if (error) { objectiveError = error; break }
      catalogRows.push(...(data || []))
      if (!data || data.length < pageSize) break
    }
  }
  if (objectiveError) return NextResponse.json({ error: objectiveError.message }, { status: 500 })

  const candidates: any[] = []
  const usedBankQuestionIds = new Set((items || []).map((item: any) => item.question_bank_id))
  for (const resource of eligibleResources) {
    const { data: questions } = await db.from('question_bank')
      .select('id,question,grade_key,subject_key,topic_key,difficulty,question_type,source_engine,review_status')
      .eq('review_status', 'approved').eq('source_engine', 'teacher_booklet_exact')
      .contains('question', { bookletResourceId: resource.id, sourcePolicy: 'teacher_exact' })
      .order('created_at', { ascending: true }).limit(200)
    for (const row of questions || []) {
      if (!validQuestion(row.question) || usedBankQuestionIds.has(row.id)) continue
      if (educationEvalGradeKey(row.grade_key) !== educationEvalGradeKey(resource.grade) || questionBankKey(row.subject_key) !== questionBankKey(resource.subject)) continue
      candidates.push({ id: row.id, question: row.question, grade: resource.grade, subject: resource.subject,
        topic: resource.subtopic || resource.topic || row.topic_key, difficulty: row.difficulty,
        resourceId: resource.id, resourceTitle: resource.title })
    }
  }

  const evidence = await Promise.all(eligibleResources.map(async resource => {
    const paths = (resource.publication_evidence_paths || []).filter((path: unknown): path is string => typeof path === 'string')
    const signed = await Promise.all(paths.slice(0, 5).map(async path => {
      const { data } = await db.storage.from('publication-evidence').createSignedUrl(path, 60 * 30)
      return data?.signedUrl || null
    }))
    const objectiveScope = catalogRows.filter((objective: any) => isEducationEvalObjectiveInScope(objective, {
      grade: resource.grade, subject: resource.subject, curriculumVersionId: benchmark?.curriculum_version_id,
    }))
    return { id: resource.id, title: resource.title, grade: resource.grade, subject: resource.subject,
      topic: resource.subtopic || resource.topic || '',
      sourceVersion: createHash('sha256').update(JSON.stringify({ id: resource.id, title: resource.title, raw_text: resource.raw_text || '', updated_at: resource.created_at })).digest('hex'),
      evidenceUrls: signed.filter(Boolean), evidenceCount: paths.length,
      questionCount: candidates.filter(candidate => candidate.resourceId === resource.id).length,
      objectives: objectiveScope.map(({ id, objective_code, title }) => ({ id, objective_code, title })) }
  }))

  const aiQuestionItems = new Set((aiItems || []).map((item: any) => item.question_bank_id))
  const aiQuestionCandidates: any[] = []
  const aiResourceDetails = await Promise.all((aiResources || []).map(async resource => {
    const { data: questions } = await db.from('question_bank')
      .select('id,question,grade_key,subject_key,topic_key,difficulty,question_type,source_engine,review_status')
      .eq('review_status', 'approved').eq('source_engine', 'ai_booklet_exact')
      .contains('question', { bookletResourceId: resource.id, sourcePolicy: 'ai_exact' })
      .order('created_at', { ascending: true }).limit(500)
    const validQuestions = (questions || []).filter((row: any) => validQuestion(row.question)
      && educationEvalGradeKey(row.grade_key) === educationEvalGradeKey(resource.grade)
      && questionBankKey(row.subject_key) === questionBankKey(resource.subject))
    for (const row of validQuestions) {
      if (aiQuestionItems.has(row.id)) continue
      aiQuestionCandidates.push({ id: row.id, question: row.question, grade: resource.grade, subject: resource.subject,
        topic: resource.subtopic || resource.topic || row.topic_key, difficulty: row.difficulty,
        resourceId: resource.id, resourceTitle: resource.title })
    }
    const objectiveScope = catalogRows.filter((objective: any) => isEducationEvalObjectiveInScope(objective, {
      grade: resource.grade, subject: resource.subject, curriculumVersionId: benchmark?.curriculum_version_id,
    }))
    const linkedQuestionIds = (aiItems || []).filter((item: any) => item.source_resource_id === resource.id).map((item: any) => item.question_bank_id)
    return { id: resource.id, title: resource.title, grade: resource.grade, subject: resource.subject,
      topic: resource.subtopic || resource.topic || '',
      questionCount: new Set([...validQuestions.map((question: any) => question.id), ...linkedQuestionIds]).size,
      objectives: objectiveScope.map(({ id, objective_code, title }) => ({ id, objective_code, title })) }
  }))

  const metricCount = (items || []).filter((item: any) => item.metric_eligible).length
  const regressionCount = (items || []).filter((item: any) => item.case_type === 'regression').length
  return NextResponse.json({ benchmark, items: items || [], metricCount, regressionCount, candidates, resources: evidence,
    aiResources: aiResourceDetails, aiCandidates: aiQuestionCandidates, aiItems: aiItems || [],
    readiness: { target: benchmark?.target_size ?? 50, eligibleQuestions: candidates.length,
      eligibleBooklets: eligibleResources.length, teacherApprovedBooklets: resources?.length || 0,
      missingEvidenceBooklets: (resources || []).filter(resource => !resource.publication_evidence_paths?.length).length,
      aiBooklets: aiResources?.length || 0, aiPoolItems: aiItems?.length || 0 } })
}

export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body.action !== 'string') return NextResponse.json({ error: 'İşlem bilgisi gerekli.' }, { status: 400 })

  if (body.action === 'activate') {
    const { data: set } = await db.from('education_eval_benchmark_sets').select('id').eq('code', 'meb-k12-controlled').eq('version', 1).maybeSingle()
    if (!set) return NextResponse.json({ error: 'Benchmark seti bulunamadı.' }, { status: 404 })
    const { error } = await db.from('education_eval_benchmark_sets').update({ status: 'active', activated_by: user.id }).eq('id', set.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  if (body.action === 'add-ai') {
    const { sourceResourceId, questionBankId, objectiveId } = body
    if (![sourceResourceId, questionBankId, objectiveId].every(value => typeof value === 'string')) {
      return NextResponse.json({ error: 'AI kitapçığı, soru ve doğrulanmış kazanım seçin.' }, { status: 400 })
    }
    const [{ data: set }, { data: resource }, { data: bankQuestion }, { data: objective }] = await Promise.all([
      db.from('education_eval_benchmark_sets').select('curriculum_version_id').eq('code', 'meb-k12-controlled').eq('version', 1).maybeSingle(),
      db.from('exam_resources').select('id,title,grade,subject,source_type,purpose,review_status').eq('id', sourceResourceId).maybeSingle(),
      db.from('question_bank').select('id,question,grade_key,subject_key,topic_key,source_engine,review_status').eq('id', questionBankId).maybeSingle(),
      db.from('learning_objective_catalog').select('id,objective_code,title,grade,subject,verification_status,lifecycle_status,is_active,curriculum_version_id').eq('id', objectiveId).maybeSingle(),
    ])
    if (!set?.curriculum_version_id) return NextResponse.json({ error: 'Etkin MEB müfredat sürümü bulunamadı.' }, { status: 409 })
    if (!resource || resource.source_type !== 'ai' || resource.purpose !== 'instant_test' || resource.review_status !== 'approved') {
      return NextResponse.json({ error: 'Onaylı AI kaynaklı anlık test kitapçığı gerekli.' }, { status: 400 })
    }
    const question = bankQuestion?.question
    if (!bankQuestion || bankQuestion.review_status !== 'approved' || bankQuestion.source_engine !== 'ai_booklet_exact'
      || question?.bookletResourceId !== resource.id || question?.sourcePolicy !== 'ai_exact' || !validQuestion(question)
      || educationEvalGradeKey(bankQuestion.grade_key) !== educationEvalGradeKey(resource.grade)
      || questionBankKey(bankQuestion.subject_key) !== questionBankKey(resource.subject)) {
      return NextResponse.json({ error: 'Soru bu AI kitapçığına bağlı veya kalite kontrolden geçmiş değil.' }, { status: 400 })
    }
    if (!objective || objective.verification_status !== 'verified' || objective.lifecycle_status !== 'active' || !objective.is_active
      || objective.curriculum_version_id !== set.curriculum_version_id
      || educationEvalGradeKey(objective.grade) !== educationEvalGradeKey(resource.grade)
      || questionBankKey(objective.subject) !== questionBankKey(resource.subject)) {
      return NextResponse.json({ error: 'Kazanım aynı sınıf/ders için etkin ve doğrulanmış MEB kazanımı olmalı.' }, { status: 400 })
    }
    const { data: inserted, error } = await db.from('education_eval_ai_question_items').insert({
      source_resource_id: resource.id, question_bank_id: bankQuestion.id,
      grade: resource.grade, subject: resource.subject, objective_id: objective.id,
      objective_code: objective.objective_code, objective_title: objective.title,
      question_snapshot: question,
      answer_key: { answerIndex: question.ans, answerText: question.opts[question.ans] },
      status: 'ready', added_by: user.id,
    }).select('*').single()
    if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? 'Bu soru AI değerlendirme havuzunda zaten var.' : error.message }, { status: 400 })
    return NextResponse.json({ success: true, item: inserted })
  }

  if (body.action === 'map-ai') {
    const { aiItemId, objectiveId } = body
    if (typeof aiItemId !== 'string' || typeof objectiveId !== 'string') {
      return NextResponse.json({ error: 'AI soru kaydı ve kazanım seçin.' }, { status: 400 })
    }
    const [{ data: set }, { data: item }, { data: objective }] = await Promise.all([
      db.from('education_eval_benchmark_sets').select('curriculum_version_id').eq('code', 'meb-k12-controlled').eq('version', 1).maybeSingle(),
      db.from('education_eval_ai_question_items').select('id,grade,subject').eq('id', aiItemId).maybeSingle(),
      db.from('learning_objective_catalog').select('id,objective_code,title,grade,subject,verification_status,lifecycle_status,is_active,curriculum_version_id').eq('id', objectiveId).maybeSingle(),
    ])
    if (!set?.curriculum_version_id || !item) return NextResponse.json({ error: 'AI değerlendirme sorusu bulunamadı.' }, { status: 404 })
    if (!objective || objective.verification_status !== 'verified' || objective.lifecycle_status !== 'active' || !objective.is_active
      || objective.curriculum_version_id !== set.curriculum_version_id
      || educationEvalGradeKey(objective.grade) !== educationEvalGradeKey(item.grade)
      || questionBankKey(objective.subject) !== questionBankKey(item.subject)) {
      return NextResponse.json({ error: 'Kazanım doğrulanmış, güncel ve aynı sınıf/ders kapsamında olmalı.' }, { status: 400 })
    }
    const { error } = await db.from('education_eval_ai_question_items').update({
      objective_id: objective.id, objective_code: objective.objective_code,
      objective_title: objective.title, status: 'ready', added_by: user.id,
    }).eq('id', item.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  if (body.action !== 'add') return NextResponse.json({ error: 'Desteklenmeyen işlem.' }, { status: 400 })
  const { sourceResourceId, questionBankId, objectiveId, sourceVersion, evidenceConfirmed } = body
  if (![sourceResourceId, questionBankId, objectiveId].every(value => typeof value === 'string') || evidenceConfirmed !== true) {
    return NextResponse.json({ error: 'Kaynak, soru, kazanım ve kanıtı kontrol ettiğinizi onaylamanız gerekli.' }, { status: 400 })
  }
  const [{ data: set }, { data: resource }, { data: bankQuestion }, { data: objective }] = await Promise.all([
    db.from('education_eval_benchmark_sets').select('id,status,target_size,curriculum_version_id').eq('code', 'meb-k12-controlled').eq('version', 1).maybeSingle(),
    db.from('exam_resources').select('id,title,grade,subject,topic,subtopic,raw_text,source_type,purpose,reuse_policy,review_status,publication_evidence_paths,created_at').eq('id', sourceResourceId).maybeSingle(),
    db.from('question_bank').select('id,question,grade_key,subject_key,topic_key,difficulty,question_type,source_engine,review_status').eq('id', questionBankId).maybeSingle(),
    db.from('learning_objective_catalog').select('id,objective_code,title,grade,subject,verification_status,lifecycle_status,is_active,curriculum_version_id').eq('id', objectiveId).maybeSingle(),
  ])
  if (!set || set.status !== 'draft') return NextResponse.json({ error: 'Benchmark taslak durumda değil.' }, { status: 409 })
  if (!resource || resource.source_type !== 'teacher' || resource.purpose !== 'instant_test' || resource.review_status !== 'approved'
    || !Array.isArray(resource.publication_evidence_paths) || resource.publication_evidence_paths.length === 0) {
    return NextResponse.json({ error: 'Öğretmen onayı ve yayın izni kanıtı bulunan kaynak kitapçık gerekli.' }, { status: 400 })
  }
  const question = bankQuestion?.question
  if (!bankQuestion || bankQuestion.review_status !== 'approved' || bankQuestion.source_engine !== 'teacher_booklet_exact'
    || question?.bookletResourceId !== resource.id || question?.sourcePolicy !== 'teacher_exact'
    || !validQuestion(question) || educationEvalGradeKey(bankQuestion.grade_key) !== educationEvalGradeKey(resource.grade)
    || questionBankKey(bankQuestion.subject_key) !== questionBankKey(resource.subject)) {
    return NextResponse.json({ error: 'Soru bu öğretmen onaylı kitapçıkla birebir eşleşmiyor veya doğrulanmış değil.' }, { status: 400 })
  }
  if (!objective || objective.verification_status !== 'verified' || objective.lifecycle_status !== 'active' || !objective.is_active
    || objective.curriculum_version_id !== set.curriculum_version_id
    || educationEvalGradeKey(objective.grade) !== educationEvalGradeKey(resource.grade) || questionBankKey(objective.subject) !== questionBankKey(resource.subject)) {
    return NextResponse.json({ error: 'Kazanım doğrulanmış ve kaynakla aynı sınıf/ders kapsamında olmalı.' }, { status: 400 })
  }
  const currentSourceVersion = createHash('sha256').update(JSON.stringify({ id: resource.id, title: resource.title, raw_text: resource.raw_text || '', updated_at: resource.created_at })).digest('hex')
  if (sourceVersion !== currentSourceVersion) return NextResponse.json({ error: 'Kaynak sürümü değişmiş. Sayfayı yenileyip tekrar kontrol edin.' }, { status: 409 })
  const evidenceChecks = await Promise.all(resource.publication_evidence_paths.map(async (path: string) => {
    const { data, error } = await db.storage.from('publication-evidence').createSignedUrl(path, 60)
    return Boolean(data?.signedUrl && !error)
  }))
  if (!evidenceChecks.some(Boolean)) return NextResponse.json({ error: 'Yayın izni kanıt dosyaları açılamıyor. Kitapçıkta kanıtı yenileyin.' }, { status: 400 })
  const { data: lastItem } = await db.from('education_eval_benchmark_items').select('ordinal').eq('benchmark_set_id', set.id).order('ordinal', { ascending: false }).limit(1).maybeSingle()
  const ordinal = (lastItem?.ordinal || 0) + 1
  if (ordinal > set.target_size) return NextResponse.json({ error: '50 soruluk set dolu.' }, { status: 409 })
  const { data: inserted, error } = await db.from('education_eval_benchmark_items').insert({
    benchmark_set_id: set.id, ordinal, case_type: 'benchmark', source_type: 'teacher', source_resource_id: resource.id,
    question_bank_id: bankQuestion.id, source_version: currentSourceVersion, source_reference: `${resource.title} (${resource.id})`,
    grade: resource.grade, subject: resource.subject, objective_id: objective.id,
    objective_code: objective.objective_code, objective_title: objective.title,
    question_snapshot: question, answer_key: { answerIndex: question.ans, answerText: question.opts[question.ans] },
    teacher_approved: true, approval_evidence_paths: resource.publication_evidence_paths,
    evidence_verified_by: user.id, evidence_verified_at: new Date().toISOString(), reviewed_by: user.id,
    reviewed_at: new Date().toISOString(), metric_eligible: true,
  }).select('id,ordinal,source_reference,grade,subject,objective_code,objective_title,metric_eligible').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, item: inserted })
}

export async function DELETE(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const params = new URL(req.url).searchParams
  const itemId = params.get('itemId')
  const aiItemId = params.get('aiItemId')
  if (aiItemId) {
    const { error } = await db.from('education_eval_ai_question_items').delete().eq('id', aiItemId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }
  if (!itemId) return NextResponse.json({ error: 'Madde kimliği gerekli.' }, { status: 400 })
  const { error } = await db.from('education_eval_benchmark_items').delete().eq('id', itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
