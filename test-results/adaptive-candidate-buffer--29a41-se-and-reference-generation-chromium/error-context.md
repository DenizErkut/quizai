# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: adaptive-candidate-buffer.spec.ts >> admin accepts AI question booklets for exact reuse and reference generation
- Location: e2e/adaptive-candidate-buffer.spec.ts:157:5

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "source_type !== 'anonymous'"
Received string:    "import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createHash, randomUUID } from 'node:crypto'
import { bookletBatches } from '@/lib/booklet-processing'
import { bookletQuestionLabels, printedQuestionObjective } from '@/lib/booklet-objective-label'
import { callOpenAI } from '@/lib/openai'
import { questionBankKey } from '@/lib/question-bank'
import { educationEvalGradeKey } from '@/lib/education-eval-grade'
import { educationEvalSubjectKey } from '@/lib/education-eval-subject'
import { requiresBookletVisual } from '@/lib/booklet-visual-gate'
import { matchVerifiedObjectiveCode, parseLearningObjectiveCodes } from '@/lib/learning-objective-codes'·
const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)·
const anthropic = new Anthropic()·
function canonicalBookletGrade(value: unknown): string {
  const key = questionBankKey(value)
  if (!/^\\d{1,2}$/.test(key)) return key
  const grade = Number(key)
  if (grade >= 1 && grade <= 4) return `ilkokul ${grade} sinif`
  if (grade >= 5 && grade <= 8) return `ortaokul ${grade} sinif`
  if (grade >= 9 && grade <= 12) return `lise ${grade} sinif`
  return key
}·
async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    // 21 Eylül 2026 — teşhis logu: \"Forbidden\" hatası tekrarlarsa Vercel
    // runtime log'larında en azından \"oturum yok\" mu yoksa \"admin değil\" mi
    // olduğunu görebilelim (öncesinde ikisi de sessizce 403 dönüyordu).
    console.warn('[admin/exam-upload] Forbidden: cookie/oturum bulunamadı (muhtemelen aynı tarayıcıda başka bir hesapla giriş yapılmış ya da oturum süresi dolmuş).')
    return null
  }
  const { data: p } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!p?.is_admin) {
    console.warn(`[admin/exam-upload] Forbidden: ${user.email} oturumu geçerli ama is_admin=false.`)
    return null
  }
  return user
}·
export const maxDuration = 120
export const runtime = 'nodejs'·
function normTR(s: string) {
  return s
    .replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
    .replace(/[^a-zA-Z0-9_\\-]/g, '_').replace(/_+/g, '_')
}·
function chunkText(text: string, size = 800): string[] {
  const paragraphs = text.split(/\\n{2,}/).filter(p => p.trim().length > 50)
  const chunks: string[] = []
  let current = ''
  for (const para of paragraphs) {
    if ((current + para).length > size && current) {
      chunks.push(current.trim())
      current = para
    } else {
      current += '\\n\\n' + para
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.length > 0 ? chunks : [text.slice(0, size)]
}·
async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text: text.slice(0, 2000) }] } })
      }
    )
    const data = await res.json()
    return data?.embedding?.values || null
  } catch { return null }
}·
async function processExam(params: {
  title: string; exam_type: string; year: string; subject: string; answer_key: string; learning_objective_codes: string[]
  rawText: string; fileUrl?: string; fileName?: string; source_type: 'anonymous' | 'teacher' | 'ai'; grade: string; subtopic: string; topic?: string; purpose: 'exam' | 'instant_test'; uploaded_by?: string
}) {
  const { title, exam_type, year, subject, answer_key, learning_objective_codes, rawText, fileUrl, fileName, source_type, grade, subtopic, topic, purpose, uploaded_by } = params·
  // A retry of an interrupted upload reuses the saved document, not a second
  // resource with the same questions. Never overwrite a different document.
  const { data: previous } = await adminDb.from('exam_resources').select('id,raw_text,grade,subject,subtopic,learning_objective_codes')
    .eq('uploaded_by', uploaded_by || '').eq('title', title).eq('purpose', purpose).eq('source_type', source_type)
    .eq('review_status', 'pending').order('created_at', { ascending: false }).limit(10)
  const existing = previous?.find(item => item.raw_text === rawText && item.grade === grade && item.subject === subject
    && item.subtopic === subtopic && JSON.stringify(item.learning_objective_codes || []) === JSON.stringify(learning_objective_codes))
  if (existing) return { resource_id: existing.id, chunks: chunkText(rawText).length, embedded: 0, chars: rawText.length }
  // exam_resources tablosuna kaydet
  const { data: examRow, error: rowErr } = await adminDb.from('exam_resources').insert({
    title, exam_type, year: parseInt(year), subject: subject || null,
    answer_key: answer_key || null,
    file_url: fileUrl || null,
    raw_text: rawText,
    purpose,
    source_type,
    reuse_policy: source_type === 'anonymous' ? 'reference_only' : 'exact_reuse',
    grade: grade || '',
    subtopic: subtopic || '', topic: topic || subtopic || '',
    learning_objective_codes,
    review_status: 'pending',
    uploaded_by: uploaded_by || null,
    file_name: fileName || null,
    created_at: new Date().toISOString(),
  }).select('id').single()·
  if (rowErr || !examRow) {
    return { error: `DB kayit hatasi: ${rowErr?.message}` }
  }·
  // Save all source chunks in one bounded database call. Embeddings are done
  // in resumable steps after the upload response and publication evidence.
  const chunks = chunkText(rawText)
  const { error: chunksError } = await adminDb.from('exam_chunks').insert(chunks.map((content, i) => ({
      exam_resource_id: examRow.id,
      chunk_index: i,
      content,
      embedding: null,
      exam_type, year: parseInt(year), subject: subject || null,
      source_type, reuse_policy: source_type === 'anonymous' ? 'reference_only' : 'exact_reuse',
      grade: grade || '', subtopic: subtopic || '',
    })))
  if (chunksError) throw chunksError·
  return { resource_id: examRow.id, chunks: chunks.length, embedded: 0, chars: rawText.length }
}·
// GET: kitapçıkları listele (ya da ?id= ile TEK kitapçığın TAM içeriğini
// görüntüle — \"önce gör, sonra sil\" kontrol listesi için, bkz.
// pratium-bekleyen-isler-uygulama-plani.md Madde 5)
export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })·
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const purpose = searchParams.get('purpose')·
  if (id) {
    const { data, error } = await adminDb
      .from('exam_resources')
      .select('id, title, exam_type, year, subject, answer_key, file_url, raw_text, purpose, source_type, reuse_policy, grade, topic, subtopic, learning_objective_codes, review_status, publication_evidence_paths, created_at')
      .eq('id', id).single()
    if (error || !data) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 })
    const evidencePaths = Array.isArray(data.publication_evidence_paths) ? data.publication_evidence_paths : []
    const { data: signedEvidence } = evidencePaths.length
      ? await adminDb.storage.from('publication-evidence').createSignedUrls(evidencePaths, 600)
      : { data: [] }
    const publication_evidence = (signedEvidence || []).map((item, index) => ({ path: evidencePaths[index], url: item.signedUrl }))
    return NextResponse.json({ exam: { ...data, publication_evidence, char_count: data.raw_text?.length || 0 } })
  }·
  let examQuery = adminDb
    .from('exam_resources')
    .select('id, title, exam_type, year, subject, purpose, source_type, reuse_policy, grade, topic, subtopic, learning_objective_codes, review_status, publication_evidence_paths, created_at, file_url')
    .order('exam_type', { ascending: true })
    .order('year', { ascending: false })
  if (purpose === 'instant_test' || purpose === 'exam') examQuery = examQuery.eq('purpose', purpose)
  const { data: exams } = await examQuery·
  // chunk sayısını da ekle
  const withCounts = await Promise.all((exams || []).map(async (ex) => {
    const { count } = await adminDb
      .from('exam_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('exam_resource_id', ex.id)
    return { ...ex, publication_evidence_count: Array.isArray(ex.publication_evidence_paths) ? ex.publication_evidence_paths.length : 0, chunk_count: count || 0 }
  }))·
  return NextResponse.json({ exams: withCounts })
}·
async function loadVerifiedBookletObjectives(row: { subject?: string | null; grade?: string | null; learning_objective_codes?: unknown; raw_text?: string | null }) {
  const codes = [...new Set([...parseLearningObjectiveCodes(row.learning_objective_codes), ...bookletQuestionLabels(row.raw_text || '').flatMap(label => label.codes)])]
  if (!codes.length || !row.subject || !row.grade) return []·
  const { data: benchmarkSet } = await adminDb.from('education_eval_benchmark_sets')
    .select('curriculum_version_id').eq('code', 'meb-k12-controlled').order('version', { ascending: false }).limit(1).maybeSingle()
  if (!benchmarkSet?.curriculum_version_id) return []·
  const { data, error } = await adminDb.from('learning_objective_catalog')
    .select('objective_code,title,grade,subject,verification_status,lifecycle_status,is_active,curriculum_version_id')
    .eq('curriculum_version_id', benchmarkSet.curriculum_version_id)
    .eq('verification_status', 'verified').eq('lifecycle_status', 'active').eq('is_active', true)
    .in('objective_code', codes)
  if (error) {
    console.warn('[admin/exam-upload] Booklet objective code lookup failed; exact question extraction will continue without automatic objective tags.')
    return []
  }
  const seen = new Set<string>()
  return (data || []).filter(objective => {
    const code = matchVerifiedObjectiveCode(objective.objective_code, codes)
    const inScope = educationEvalGradeKey(objective.grade) === educationEvalGradeKey(row.grade)
      && educationEvalSubjectKey(objective.subject) === educationEvalSubjectKey(row.subject)
    if (!code || !inScope || seen.has(code)) return false
    seen.add(code)
    return true
  }).map(objective => ({ code: objective.objective_code, title: objective.title }))
}·
async function promoteExactQuestions(row: { id?: string; subject?: string | null; grade?: string | null; topic?: string | null; subtopic?: string | null; raw_text?: string | null; learning_objective_codes?: unknown }, sourceType: 'teacher' | 'ai', batch: string) {
  const sourceLabel = sourceType === 'teacher' ? 'öğretmen imzalı' : 'yapay zekâ ile ayrıca hazırlanmış'
  const labels = bookletQuestionLabels(batch)
  const objectiveReferences = await loadVerifiedBookletObjectives({ ...row, learning_objective_codes: [...new Set([...parseLearningObjectiveCodes(row.learning_objective_codes), ...labels.flatMap(label => label.codes)])] })
  const verifiedCodes = objectiveReferences.map(objective => objective.code)
  const objectiveInstruction = objectiveReferences.length
    ? `\\nKitapçıkta ilişkilendirilecek doğrulanmış MEB kazanımları: ${JSON.stringify(objectiveReferences)}. Her soruyu içerik bakımından en uygun kodla eşleştir; eşleşme açık değilse objective_code null olsun. Yalnızca bu listede bulunan kodlardan birini kullan; kod uydurma veya listedeki soruyu değiştirme.\\n`
    : '\\nobjective_code alanını null döndür.\\n'
  const extractedGroups = await Promise.all([batch].map(async batch => {
    const prompt = `Aşağıdaki ${sourceLabel} kitapçık bölümündeki çoktan seçmeli soruları AYNI soru metni, AYNI seçenekler ve AYNI doğru cevapla ayıkla. Yeniden yazma, sadeleştirme veya benzer soru üretme. Bölümün sonundaki cevap anahtarından yalnız bu bölümdeki soruların cevaplarını kullan. Açıklama kitapçıkta yoksa doğru cevabı kısaca açıkla. Eksik ya da cevabı belirlenemeyen soruyu atla. En fazla 55 soru döndür. ${objectiveInstruction}Yalnız JSON döndür: {\"questions\":[{\"q\":\"...\",\"opts\":[\"...\"],\"ans\":0,\"exp\":\"...\",\"topic\":\"...\",\"difficulty\":\"easy|medium|hard\",\"objective_code\":null}]}\\n\\n<KITAPCIK_METNI>\\n${batch}\\n</KITAPCIK_METNI>`
    const response = await anthropic.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 8000, messages: [{ role: 'user', content: prompt + '\\nSeçeneksiz kısa cevaplı soruları çoktan seçmeliye dönüştürme; seçenek uydurma, atla. Görsel/şekil/grafik gerektiren sorularda requires_visual:true döndür. Şekli metinden uydurma. Metin, seçenek ve cevap anahtarı tam ise görseli eksik soruyu da aktar; sistem bunu öğrenciye vermeden insan görsel incelemesine ayıracak.' }] }, { timeout: 50000, maxRetries: 0 })
    if (response.stop_reason === 'max_tokens') throw new Error('Ayıklama çıktısı kesildi; bu grup yeniden denenmeli.')
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    if (!Array.isArray(parsed.questions)) throw new Error('Ayıklayıcı geçerli soru listesi döndürmedi.')
    return parsed.questions
  }))
  const extracted = extractedGroups.flat().filter((q: any) => q?.q && Array.isArray(q.opts) && q.opts.length >= 4 && q.opts.length <= 5 && Number.isInteger(q.ans) && q.ans >= 0 && q.ans < q.opts.length && q.exp)
  if (!extracted.length) return 0
  const validationText = await callOpenAI([
    { role: 'system', content: 'Sen bağımsız soru kalite denetçisisin. Soruları değiştirme. Yalnızca doğru cevabı kesin, seçenekleri benzersiz ve soru eksiksiz olan kayıtları onayla. JSON döndür.' },
    { role: 'user', content: `${JSON.stringify({ questions: extracted.map((q: any, index: number) => ({ index, q: q.q, opts: q.opts, ans: q.ans, exp: q.exp })) })}\\nYanıt şeması: {\"results\":[{\"index\":0,\"approved\":true,\"reason\":\"...\"}]}` },
  ], { model: process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4.1-mini', max_tokens: 4000, json: true, timeoutMs: 25000, requireComplete: true, operation: `${sourceType}-booklet-validator` })
  const validation = JSON.parse(validationText)
  if (!Array.isArray(validation.results) || validation.results.length !== extracted.length
    || new Set(validation.results.map((item: { index: unknown }) => item.index)).size !== extracted.length
    || validation.results.some((item: { index: unknown; approved: unknown }) => !Number.isInteger(item.index)
      || Number(item.index) < 0 || Number(item.index) >= extracted.length || typeof item.approved !== 'boolean')) {
    throw new Error('Kalite denetçisi bütün sorular için geçerli karar döndürmedi; grup yeniden denenmeli.')
  }
  const approvedIndexes = new Set<number>((validation.results || []).filter((item: any) => item.approved === true).map((item: any) => Number(item.index)))
  const questions = extracted.filter((q: any, index: number) => approvedIndexes.has(index) || requiresBookletVisual(q))
  const rows = questions.map((q: any) => ({
    fingerprint: createHash('sha256').update(`${q.q}|${q.opts.join('|')}`.toLocaleLowerCase('tr')).digest('hex'),
    subject_key: questionBankKey(row.subject || 'genel'),
    // `topic_key` is the booklet's selected parent unit so all extracted
    // questions stay together in admin filters and parent-topic bank lookup.
    // Preserve the classifier's finer subtopic separately in the question.
    topic_key: questionBankKey(row.subtopic || row.topic || q.topic || 'genel'),
    grade_key: canonicalBookletGrade(row.grade || ''), language_key: 'tr', question_type: 'multiple_choice', difficulty: q.difficulty === 'easy' ? 'kolay' : q.difficulty === 'hard' ? 'zor' : 'normal',
    question: { q: q.q, opts: q.opts, ans: q.ans, exp: q.exp, requiresBookletVisual: requiresBookletVisual(q), objective: q.topic || row.subtopic || '', learningObjectiveCode: labels.some(label => label.codes.length) ? printedQuestionObjective(q.q, labels, verifiedCodes) : matchVerifiedObjectiveCode(q.objective_code, verifiedCodes), bookletObjectiveCodes: verifiedCodes, bookletTopic: row.subtopic || row.topic || '', bookletResourceId: row.id || null, subject: row.subject || 'Genel', sourcePolicy: sourceType === 'teacher' ? 'teacher_exact' : 'ai_exact' },
    review_status: requiresBookletVisual(q) ? 'candidate' : 'approved', quality_score: requiresBookletVisual(q) ? 0 : 1, source_engine: sourceType === 'teacher' ? 'teacher_booklet_exact' : 'ai_booklet_exact', report_count: 0
  }))
  if (!rows.length) return 0
  const result = await adminDb.from('question_bank').upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true }).select('id,review_status')
  if (result.error) throw result.error
  if (sourceType === 'ai' && row.id) {
    try {
      const { data: promotedRows, error: promotedError } = await adminDb.from('question_bank')
        .select('id,question,grade_key,subject_key,review_status,source_engine')
        .eq('review_status', 'approved').eq('source_engine', 'ai_booklet_exact')
        .contains('question', { bookletResourceId: row.id, sourcePolicy: 'ai_exact' }).limit(500)
      if (promotedError) throw promotedError
      const references = await loadVerifiedBookletObjectives(row)
      const referenceCodes = references.map(objective => objective.code)
      const { data: benchmarkSet } = await adminDb.from('education_eval_benchmark_sets')
        .select('curriculum_version_id').eq('code', 'meb-k12-controlled').order('version', { ascending: false }).limit(1).maybeSingle()
      const { data: catalogRows } = referenceCodes.length && benchmarkSet?.curriculum_version_id
        ? await adminDb.from('learning_objective_catalog')
          .select('id,objective_code,title,grade,subject,verification_status,lifecycle_status,is_active,curriculum_version_id')
          .eq('curriculum_version_id', benchmarkSet.curriculum_version_id)
          .eq('verification_status', 'verified').eq('lifecycle_status', 'active').eq('is_active', true)
          .in('objective_code', referenceCodes)
        : { data: [] }
      const objectiveByCode = new Map((catalogRows || []).filter(objective =>
        educationEvalGradeKey(objective.grade) === educationEvalGradeKey(row.grade)
        && questionBankKey(objective.subject) === questionBankKey(row.subject || '')
      ).map(objective => [objective.objective_code.toLocaleUpperCase('tr-TR'), objective]))
      const evalRows = (promotedRows || []).filter(bankRow => {
        const question = bankRow.question as { q?: unknown; opts?: unknown; ans?: unknown }
        return typeof question?.q === 'string' && Array.isArray(question.opts) && Number.isInteger(question.ans)
          && Number(question.ans) >= 0 && Number(question.ans) < question.opts.length
      }).map(bankRow => {
        const question = bankRow.question as { q: string; opts: string[]; ans: number; learningObjectiveCode?: unknown }
        const verifiedCode = matchVerifiedObjectiveCode(question.learningObjectiveCode, referenceCodes)
        const objective = verifiedCode ? objectiveByCode.get(verifiedCode) : null
        return {
          source_resource_id: row.id,
          question_bank_id: bankRow.id,
          grade: row.grade || bankRow.grade_key,
          subject: row.subject || bankRow.subject_key,
          objective_id: objective?.id || null,
          objective_code: objective?.objective_code || null,
          objective_title: objective?.title || null,
          question_snapshot: question,
          answer_key: { answerIndex: question.ans, answerText: question.opts[question.ans] },
          status: objective ? 'ready' : 'needs_objective',
        }
      })
      if (evalRows.length) {
        const { error: evalError } = await adminDb.from('education_eval_ai_question_items')
          .upsert(evalRows, { onConflict: 'question_bank_id', ignoreDuplicates: true })
        if (evalError) throw evalError
      }
    } catch (error) {
      console.error('[exam-upload] AI Education Eval pool sync failed', error)
    }
  }
  return result.data?.filter(item => item.review_status === 'approved').length || 0
}·
// POST: yeni kitapçık yükle
export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })·
  try {
    const contentType = req.headers.get('content-type') || ''·
    let title = '', exam_type = 'LGS', year = '', subject = '', answer_key = '', source_type: 'anonymous' | 'teacher' | 'ai' = 'anonymous', grade = '', subtopic = '', topic = '', fileName = '', purpose: 'exam' | 'instant_test' = 'exam'
    let learning_objective_codes: string[] = []
    let rawText = '', fileUrl = ''·
    // JSON mod: storage_path ile (büyük dosya)
    if (contentType.includes('application/json')) {
      const body = await req.json()
      title = body.title; exam_type = body.exam_type; year = body.year
      subject = body.subject || ''; answer_key = body.answer_key || ''
      source_type = body.source_type === 'teacher' || body.source_type === 'ai' ? body.source_type : 'anonymous'; grade = body.grade || ''; subtopic = body.subtopic || ''; topic = body.topic || subtopic; fileName = body.file_name || ''
      learning_objective_codes = parseLearningObjectiveCodes(body.learningObjectiveCodes ?? body.learning_objective_codes)
      purpose = body.purpose === 'instant_test' ? 'instant_test' : 'exam'·
      const { data: fileData, error: dlErr } = await adminDb.storage
        .from('meb-resources').download(body.storage_path)·
      if (dlErr || !fileData) return NextResponse.json({ error: `Storage indirme hatasi: ${dlErr?.message}` }, { status: 500 })·
      fileUrl = body.file_url
      try {
        const pdfBytes = Buffer.from(await fileData.arrayBuffer())
        if (pdfBytes.length < 10 * 1024 * 1024) {
          const pdfParse = require('pdf-parse')
          const parsed = await pdfParse(pdfBytes)
          rawText = parsed.text || ''
        } else {
          rawText = `[PDF cok buyuk (${Math.round(pdfBytes.length/1024/1024)}MB) - Storage: ${fileUrl}]`
        }
      } catch { rawText = `[PDF: ${fileUrl}]` }·
    } else {
      // FormData mod (küçük dosya)
      const form = await req.formData()
      title = form.get('title') as string
      exam_type = form.get('exam_type') as string
      year = form.get('year') as string
      subject = form.get('subject') as string || ''
      answer_key = form.get('answer_key') as string || ''
      const submittedSourceType = form.get('source_type')
      source_type = submittedSourceType === 'teacher' || submittedSourceType === 'ai' ? submittedSourceType : 'anonymous'
      grade = form.get('grade') as string || ''
      subtopic = form.get('subtopic') as string || ''
      topic = form.get('topic') as string || subtopic
      learning_objective_codes = parseLearningObjectiveCodes(form.get('learningObjectiveCodes') || '')
      purpose = form.get('purpose') === 'instant_test' ? 'instant_test' : 'exam'
      const file = form.get('file') as File | null
      fileName = file?.name || ''·
      if (file && file.size > 0) {
        const bytes = await file.arrayBuffer()
        const path = `${normTR(exam_type)}/${year}/${normTR(subject || 'genel')}_${Date.now()}.pdf`
        const { error: upErr } = await adminDb.storage.from('meb-resources')
          .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
        if (!upErr) {
          const { data: u } = adminDb.storage.from('meb-resources').getPublicUrl(path)
          fileUrl = u?.publicUrl || ''
        }
        try {
          if (Buffer.from(bytes).length < 10 * 1024 * 1024) {
            const pdfParse = require('pdf-parse')
            const parsed = await pdfParse(Buffer.from(bytes))
            rawText = parsed.text || ''
          } else {
            rawText = `[PDF cok buyuk (${Math.round(Buffer.from(bytes).length/1024/1024)}MB)]`
          }
        } catch { rawText = '[PDF yuklendi]' }
      }
    }·
    if (purpose === 'instant_test') {
      if (!grade.trim() || !subject.trim()) {
        return NextResponse.json({ error: 'Anlık test kitapçığı için sınıf ve ders zorunludur.' }, { status: 400 })
      }
      exam_type = 'ANLIK_TEST'
      year = new Date().getFullYear().toString()
      answer_key = ''
    }
    if (!title || !exam_type || !year) {
      return NextResponse.json({ error: 'Baslik, sinav turu ve yil zorunlu.' }, { status: 400 })
    }
    if (!rawText) rawText = `[${exam_type} ${year} ${subject}]`·
    const result = await processExam({ title, exam_type, year, subject, answer_key, learning_objective_codes, rawText, fileUrl, fileName, source_type, grade, subtopic, topic, purpose, uploaded_by: user.id })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })·
    return NextResponse.json({ success: true, ...result, promoted: 0, processingPending: true })·
  } catch (e: any) {
    console.error('[exam-upload]', e)
    const msg = e?.message || 'Bilinmeyen hata'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}·
// Admin-only document editor. The original PDF stays untouched; only the
// metadata and extracted text used by search/question grounding are replaced.
// The RPC updates the resource and all searchable chunks atomically.
export async function PUT(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })·
  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const grade = typeof body?.grade === 'string' ? body.grade.trim() : ''
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
  const topic = typeof body?.topic === 'string' ? body.topic.trim() : ''
  const rawText = typeof body?.raw_text === 'string' ? body.raw_text : ''·
  if (!id || title.length < 2 || title.length > 300 || !grade || !subject || !topic) {
    return NextResponse.json({ error: 'Kitapçık kimliği, başlık, sınıf, ders ve ünite/konu zorunludur.' }, { status: 400 })
  }
  if (!rawText.trim() || rawText.length > 500_000) {
    return NextResponse.json({ error: 'Kitapçık metni boş olamaz ve 500.000 karakteri aşamaz.' }, { status: 400 })
  }
  const chunks = chunkText(rawText)
  if (!chunks.length || chunks.length > 500) {
    return NextResponse.json({ error: 'Kitapçık metni aranabilir parçalara ayrılamadı.' }, { status: 400 })
  }·
  const learningObjectiveCodes = parseLearningObjectiveCodes(body?.learning_objective_codes)
  const { data, error } = await adminDb.rpc('update_exam_resource_document_v2', {
    p_resource_id: id,
    p_title: title,
    p_grade: grade,
    p_subject: subject,
    p_topic: topic,
    p_raw_text: rawText,
    p_chunks: chunks,
    p_learning_objective_codes: learningObjectiveCodes,
  })
  if (error) {
    const status = /not found/i.test(error.message) ? 404 : 400
    return NextResponse.json({ error: status === 404 ? 'Kitapçık bulunamadı.' : error.message }, { status })
  }
  return NextResponse.json({ success: true, chunks: data, char_count: rawText.length, learning_objective_codes: learningObjectiveCodes })
}·
async function processNextBooklet(id: string) {
  const { data: row, error: resourceError } = await adminDb.from('exam_resources')
    .select('id,source_type,purpose,review_status,subject,grade,topic,subtopic,raw_text,learning_objective_codes')
    .eq('id', id).maybeSingle()
  if (resourceError) throw resourceError
  if (!row || row.review_status === 'rejected') return NextResponse.json({ error: 'İşlenebilir kitapçık bulunamadı.' }, { status: 404 })
  const exact = row.purpose === 'instant_test' && ['teacher', 'ai'].includes(row.source_type)
  const batches = exact ? bookletBatches(row.raw_text || '') : []
  const contentHash = createHash('sha256').update(JSON.stringify([row.raw_text, row.grade, row.subject, row.subtopic, row.learning_objective_codes, row.source_type, 'batch-v1'])).digest('hex')
  const { error: createError } = await adminDb.from('booklet_processing_jobs').upsert({ resource_id: id, content_hash: contentHash }, { onConflict: 'resource_id', ignoreDuplicates: true })
  if (createError) throw createError
  const { data: current, error: readError } = await adminDb.from('booklet_processing_jobs').select('*').eq('resource_id', id).single()
  if (readError) throw readError
  if (current.content_hash !== contentHash) return NextResponse.json({ error: 'Kitapçık içeriği işlem sırasında değişmiş. Yeni belge için ayrı yükleme yapın.' }, { status: 409 })
  if (current.status === 'complete') return NextResponse.json({ success: true, done: true, promoted: current.promoted, progress: 'İşleme tamamlandı.' })
  const token = randomUUID()
  const { data: claimed, error: claimError } = await adminDb.from('booklet_processing_jobs')
    .update({ lease_token: token, lease_until: new Date(Date.now() + 150000).toISOString() })
    .eq('resource_id', id).eq('content_hash', contentHash).eq('status', 'pending')
    .lte('lease_until', new Date().toISOString()).select('*').maybeSingle()
  if (claimError) throw claimError
  if (!claimed) return NextResponse.json({ error: 'Bu kitapçık başka bir işlemde açık. Birkaç dakika sonra sürdürün.' }, { status: 409 })
  try {
    let { data: chunks, error: chunkError } = await adminDb.from('exam_chunks').select('id,content,embedding,chunk_index').eq('exam_resource_id', id).order('chunk_index', { ascending: true })
    if (chunkError) throw chunkError
    // Older uploads could time out halfway through sequential chunk inserts.
    // Restore only absent chunks from the saved text, preserving embeddings.
    const expectedChunks = chunkText(row.raw_text || '')
    const present = new Set((chunks || []).map(chunk => chunk.chunk_index))
    const missing = expectedChunks.map((content, chunk_index) => ({ content, chunk_index })).filter(chunk => !present.has(chunk.chunk_index))
    if (missing.length) {
      const { data: metadata, error: metadataError } = await adminDb.from('exam_resources').select('exam_type,year,reuse_policy').eq('id', id).single()
      if (metadataError) throw metadataError
      const { error: restoreError } = await adminDb.from('exam_chunks').insert(missing.map(chunk => ({ ...chunk, exam_resource_id: id, embedding: null, ...metadata, subject: row.subject, source_type: row.source_type, grade: row.grade, subtopic: row.subtopic })))
      if (restoreError) throw restoreError
      const restored = await adminDb.from('exam_chunks').select('id,content,embedding,chunk_index').eq('exam_resource_id', id).order('chunk_index', { ascending: true })
      if (restored.error) throw restored.error
      chunks = restored.data
    }
    const next = { next_chunk: claimed.next_chunk, next_batch: claimed.next_batch, promoted: claimed.promoted, status: 'pending' }
    let progress = ''
    if (claimed.next_chunk < (chunks || []).length) {
      const group = (chunks || []).slice(claimed.next_chunk, claimed.next_chunk + 5)
      await Promise.all(group.map(async chunk => {
        if (chunk.embedding) return
        const embedding = await embedText(chunk.content)
        if (embedding) {
          const { error } = await adminDb.from('exam_chunks').update({ embedding: JSON.stringify(embedding) }).eq('id', chunk.id)
          if (error) throw error
        }
      }))
      next.next_chunk += group.length
      progress = `Kaynak hazırlığı: ${next.next_chunk}/${chunks?.length || 0} parça.`
    } else if (claimed.next_batch < batches.length) {
      next.promoted += await promoteExactQuestions(row, row.source_type as 'teacher' | 'ai', batches[claimed.next_batch])
      next.next_batch++
      progress = `Soru kontrolü: ${next.next_batch}/${batches.length} grup; ${next.promoted} yeni soru havuzda.`
    }
    const done = next.next_chunk >= (chunks || []).length && next.next_batch >= batches.length
    if (done && exact) {
      const { error } = await adminDb.from('exam_resources').update({ review_status: 'approved', reuse_policy: 'exact_reuse' }).eq('id', id).neq('review_status', 'rejected')
      if (error) throw error
    }
    if (done) next.status = 'complete'
    const { error } = await adminDb.from('booklet_processing_jobs').update({ ...next, lease_token: null, lease_until: new Date(0).toISOString(), updated_at: new Date().toISOString() }).eq('resource_id', id).eq('lease_token', token)
    if (error) throw error
    return NextResponse.json({ success: true, done, promoted: next.promoted, progress })
  } finally {
    // Failed extraction never advances its cursor. Retrying is safe because
    // question fingerprints remain unique even if a prior response was lost.
    await adminDb.from('booklet_processing_jobs').update({ lease_token: null, lease_until: new Date(0).toISOString() }).eq('resource_id', id).eq('lease_token', token)
  }
}·
export async function PATCH(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  if (body?.action === 'process-next') {
    if (typeof body.id !== 'string') return NextResponse.json({ error: 'Kitapçık kimliği gerekli.' }, { status: 400 })
    try { return await processNextBooklet(body.id) } catch (error) {
      console.error('[exam-upload] resumable processing failed', error)
      return NextResponse.json({ error: 'Bu grup işlenemedi. Kitapçık kaydedildi; “İşlemeyi sürdür” ile tekrar deneyin.' }, { status: 500 })
    }
  }
  if (body?.action === 'reprocess-ai-booklet') {
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ error: 'Kitapçık kimliği gerekli.' }, { status: 400 })
    const { data: row } = await adminDb.from('exam_resources')
      .select('id,title,source_type,purpose,review_status,subject,grade,topic,subtopic,raw_text,learning_objective_codes')
      .eq('id', id).maybeSingle()
    if (!row || row.source_type !== 'ai' || row.purpose !== 'instant_test' || row.review_status !== 'approved') {
      return NextResponse.json({ error: 'Onaylı bir AI anlık test kitapçığı gerekli.' }, { status: 400 })
    }
    try {
      return NextResponse.json({ success: true, promoted: 0, processingPending: true, resource_id: id })
    } catch (error) {
      console.error('[exam-upload] AI booklet reprocessing failed', error)
      return NextResponse.json({ error: 'Kitapçık yeniden işlenemedi; sunucu kayıtlarını kontrol edin.' }, { status: 500 })
    }
  }
  const { id, review_status } = body
  if (!id || !['pending', 'approved', 'rejected'].includes(review_status)) return NextResponse.json({ error: 'Geçersiz durum' }, { status: 400 })
  const { data: row } = await adminDb.from('exam_resources').select('id,source_type,purpose,title,subject,grade,topic,subtopic,raw_text,learning_objective_codes').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 })
  const { error } = await adminDb.from('exam_resources').update({ review_status, reuse_policy: row.source_type === 'anonymous' ? 'reference_only' : 'exact_reuse' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, promoted: 0, processingPending: review_status === 'approved', resource_id: id })
}·
// DELETE: kitapçık sil. Bu tablolar için repoda bir FK/migration
// tanımı bulunamadığından exam_chunks CASCADE ile silineceği garanti
// değil — önce exam_chunks satırları, sonra exam_resources satırı elle
// silinir. \"confirmed:true\" olmadan (önce tam içerik görülmeden)
// çalışmaz (bkz. pratium-bekleyen-isler-uygulama-plani.md Madde 5).
// Bu endpoint'ten ÖNCE exam_chunks silmeleri tamamen repo dışı, elle
// SQL ile yapılıyordu (bir kez kontrol karakteri içeren bir chunk'ta
// hataya yol açmıştı, transaction rollback ile kurtarılmıştı) — artık
// güvenli, tekrar kullanılabilir, kayıtlı bir yol var.
export async function DELETE(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })·
  const { id, confirmed } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID gerekli' }, { status: 400 })
  if (!confirmed) {
    return NextResponse.json(
      { error: 'Silme onayı gerekli — önce tam içeriği görüntüleyin (confirmed:true olmadan silme çalışmaz).' },
      { status: 400 }
    )
  }·
  const { data: resource } = await adminDb.from('exam_resources').select('publication_evidence_paths').eq('id', id).single()
  const evidencePaths = Array.isArray(resource?.publication_evidence_paths) ? resource.publication_evidence_paths : []·
  const { error: chunkErr } = await adminDb.from('exam_chunks').delete().eq('exam_resource_id', id)
  if (chunkErr) return NextResponse.json({ error: `Chunk silme hatası: ${chunkErr.message}` }, { status: 500 })·
  const { error } = await adminDb.from('exam_resources').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })·
  if (evidencePaths.length) {
    const { error: storageError } = await adminDb.storage.from('publication-evidence').remove(evidencePaths)
    if (storageError) console.error('[exam-upload] publication evidence cleanup failed', storageError)
  }·
  return NextResponse.json({ success: true })
}
"
```

# Test source

```ts
  64  |   const events = readFileSync(join(process.cwd(), 'lib/learning-events.ts'), 'utf8')
  65  |   const route = readFileSync(join(process.cwd(), 'app/api/transfer-check/route.ts'), 'utf8')
  66  |   expect(events).toContain("schedule_transfer_checks_v1")
  67  |   expect(events).toContain('p_min_delay: 10')
  68  |   expect(route).toContain("eq('status', 'pending')")
  69  |   expect(route).toContain('due_after_event_count')
  70  |   expect(route).not.toContain("select('*')")
  71  |   expect(route).toContain('export async function POST')
  72  |   expect(route).toContain("['claim', 'complete']")
  73  |   expect(route).toContain(".eq('status', 'pending')")
  74  |   expect(route).toContain(".eq('status', 'served')")
  75  |   expect(route).toContain('transfer_result')
  76  |   expect(route).toContain('prompt_context?.sourceQuestionType')
  77  | })
  78  | 
  79  | test('transfer report separates independent transfer from baseline performance', () => {
  80  |   const route = readFileSync(join(process.cwd(), 'app/api/student/transfer-report/route.ts'), 'utf8')
  81  |   expect(route).toContain("eq('status', 'completed')")
  82  |   expect(route).toContain("neq('source_type', 'transfer_check')")
  83  |   expect(route).toContain('independentRate')
  84  |   expect(route).toContain('impactDelta')
  85  |   expect(route).toContain('transferRate')
  86  | })
  87  | 
  88  | test('education AI safety scorecard uses live evidence and admin authorization', () => {
  89  |   const route = readFileSync(join(process.cwd(), 'app/api/admin/ai-safety-scorecard/route.ts'), 'utf8')
  90  |   const admin = readFileSync(join(process.cwd(), 'app/admin/page.tsx'), 'utf8')
  91  |   expect(route).toContain("select('is_admin')")
  92  |   expect(route).toContain("from('agent_decision_audit')")
  93  |   expect(route).toContain("from('agent_action_approval_queue')")
  94  |   expect(route).toContain("from('learning_transfer_checks')")
  95  |   const scoring = readFileSync(join(process.cwd(), 'lib/safety-scorecard.ts'), 'utf8')
  96  |   expect(scoring).toContain('privacy_access')
  97  |   expect(admin).toContain('<EducationAISafetyScorecard />')
  98  | })
  99  | 
  100 | test('provider observability reports real usage cost and qualified quality samples', () => {
  101 |   const route = readFileSync(join(process.cwd(), 'app/api/admin/provider-observability/route.ts'), 'utf8')
  102 |   const admin = readFileSync(join(process.cwd(), 'app/admin/page.tsx'), 'utf8')
  103 |   expect(route).toContain("from('ai_usage_logs')")
  104 |   expect(route).toContain('pricingCoverage')
  105 |   expect(route).toContain('observedSuccessRate')
  106 |   expect(route).toContain('qualitySample')
  107 |   expect(route).toContain("select('is_admin')")
  108 |   expect(admin).toContain('<ProviderObservability />')
  109 | })
  110 | 
  111 | test('measured router uses operational cost and volume metrics in shadow mode without overriding protected roles', () => {
  112 |   const router = readFileSync(join(process.cwd(), 'lib/ai-gateway/measured-quiz-router.ts'), 'utf8')
  113 |   const live = readFileSync(join(process.cwd(), 'app/api/live-quiz/route.ts'), 'utf8')
  114 |   const exam = readFileSync(join(process.cwd(), 'app/api/generate-exam/route.ts'), 'utf8')
  115 |   expect(router).toContain("from('ai_usage_logs')")
  116 |   expect(router).toContain('current.calls < 20')
  117 |   expect(router).toContain('current.outcomeSample < 10')
  118 |   expect(router).toContain('current.operationalSuccessRate < 0.7')
  119 |   expect(router).toContain('CALL_SUCCESS_BELOW_70')
  120 |   expect(router).toContain('current.costPerCall > cheapestComparable.costPerCall * 2.5')
  121 |   expect(router).toContain("opts.hardDifficulty === true")
  122 |   expect(router).toContain("decision(base.engine, 'METRICS_UNAVAILABLE_FAIL_SAFE')")
  123 |   expect(router).toContain("process.env.MEASURED_ROUTER_MODE === 'active' ? 'active' : 'shadow'")
  124 |   const providerRouter = readFileSync(join(process.cwd(), 'lib/ai-gateway/quiz-provider-router.ts'), 'utf8')
  125 |   const usage = readFileSync(join(process.cwd(), 'lib/ai-usage.ts'), 'utf8')
  126 |   const observationApi = readFileSync(join(process.cwd(), 'app/api/admin/provider-observability/route.ts'), 'utf8')
  127 |   expect(providerRouter).toContain('routerRecommendedEngine: decision.recommendedEngine || decision.engine')
  128 |   expect(usage).toContain('meta: u.meta || null')
  129 |   expect(observationApi).toContain('routerShadow: [...routerShadow.values()]')
  130 |   expect(live).toContain('await pickMeasuredQuizEngine')
  131 |   expect(exam).toContain('await pickMeasuredQuizEngine')
  132 | })
  133 | 
  134 | test('database plan constraint accepts every checkout profile plan', () => {
  135 |   const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260927150931_allow_current_profile_plans.sql'), 'utf8')
  136 |   for (const plan of ['free', 'silver', 'premium', 'unlimited']) expect(migration).toContain(`'${plan}'::text`)
  137 | })
  138 | 
  139 | test('teacher and AI booklets ground generation and approved exact questions re-enter the live bank', () => {
  140 |   const route = readFileSync(join(process.cwd(), 'app/api/generate-quiz/route.ts'), 'utf8')
  141 |   const upload = readFileSync(join(process.cwd(), 'app/api/admin/exam-upload/route.ts'), 'utf8')
  142 |   const bank = readFileSync(join(process.cwd(), 'lib/question-bank.ts'), 'utf8')
  143 |   expect(route).toContain('ÖĞRETMEN İMZALI SORU KİTAPÇIĞI REFERANSI')
  144 |   expect(route).toContain('+ bookletContext')
  145 |   expect(route).not.toContain('if (bookletContext) mebContext += bookletContext')
  146 |   expect(route).toContain('const bankEligible = bankWriteEligible && !continueSessionId')
  147 |   expect(route).toContain('validatedQuestionsForBank = questions.slice()')
  148 |   expect(route.indexOf('validatedQuestionsForBank = questions.slice()')).toBeGreaterThan(route.indexOf('questions = balanceAnswerPositions(questions)'))
  149 |   expect(upload).toContain("sourcePolicy: sourceType === 'teacher' ? 'teacher_exact' : 'ai_exact'")
  150 |   expect(upload).toContain("difficulty: q.difficulty === 'easy' ? 'kolay'")
  151 |   expect(bank).toContain("['teacher_exact', 'ai_exact'].includes")
  152 |   expect(bank).toContain('hasRealVisualAsset(clean)')
  153 |   expect(route).toContain('AI SORU KİTAPÇIĞI REFERANSI')
  154 |   expect(route).toContain("row.source_type === 'anonymous'")
  155 | })
  156 | 
  157 | test('admin accepts AI question booklets for exact reuse and reference generation', () => {
  158 |   const upload = readFileSync(join(process.cwd(), 'app/api/admin/exam-upload/route.ts'), 'utf8')
  159 |   const admin = readFileSync(join(process.cwd(), 'app/admin/page.tsx'), 'utf8')
  160 |   const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260928072735_add_ai_question_booklet_source.sql'), 'utf8')
  161 |   expect(admin).toContain('<option value="ai">AI — birebir + yeni soru referansı</option>')
  162 |   expect(admin).toContain('<option value="teacher">Öğretmen imzalı — birebir + yeni soru referansı</option>')
  163 |   expect(upload).toContain("source_engine: sourceType === 'teacher' ? 'teacher_booklet_exact' : 'ai_booklet_exact'")
> 164 |   expect(upload).toContain("source_type !== 'anonymous'")
      |                  ^ Error: expect(received).toContain(expected) // indexOf
  165 |   expect(upload).toContain('canonicalBookletGrade')
  166 |   expect(upload).toContain(".upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true }).select('id')")
  167 |   expect(upload).toContain('return result.data?.length || 0')
  168 |   expect(migration).toContain("('anonymous', 'teacher', 'ai')")
  169 | })
  170 | 
  171 | test('question bank facets page through the whole pool and cascade by grade and subject', () => {
  172 |   const route = readFileSync(join(process.cwd(), 'app/api/admin/question-bank-review/route.ts'), 'utf8')
  173 |   const editor = readFileSync(join(process.cwd(), 'components/QuestionBankEditor.tsx'), 'utf8')
  174 |   const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260928073554_normalize_exact_question_bank_grades.sql'), 'utf8')
  175 |   const facetsMigration = readFileSync(join(process.cwd(), 'supabase/migrations/20260928074527_question_bank_admin_facets_pagination.sql'), 'utf8')
  176 |   expect(route).toContain("db.rpc('question_bank_admin_facets_v1'")
  177 |   expect(route).toContain('.range(from, from + pageSize - 1)')
  178 |   expect(route).toContain("page_size') || '50'")
  179 |   expect(editor).toContain("{ grade: value, subject: '', topic: '' }")
  180 |   expect(editor).toContain('editing?.id === r.id')
  181 |   expect(editor).toContain('Sayfa {pagination.page} / {pagination.total_pages}')
  182 |   expect(migration).toContain("when '7' then 'ortaokul 7 sinif'")
  183 |   expect(migration).toContain("'ai_booklet_exact'")
  184 |   expect(facetsMigration).toContain('security invoker')
  185 |   expect(facetsMigration).toContain('from public, anon, authenticated')
  186 |   expect(facetsMigration).toContain('to service_role')
  187 | })
  188 | 
  189 | test('exact booklet questions use the selected parent topic while preserving subtopics for retrieval', () => {
  190 |   const upload = readFileSync(join(process.cwd(), 'app/api/admin/exam-upload/route.ts'), 'utf8')
  191 |   const bank = readFileSync(join(process.cwd(), 'lib/question-bank.ts'), 'utf8')
  192 |   expect(upload).toContain('topic_key: questionBankKey(row.subtopic || row.topic || q.topic || \'genel\')')
  193 |   expect(upload).toContain('bookletTopic: row.subtopic || row.topic || \'\'')
  194 |   expect(bank).toContain('row.question?.bookletTopic, row.question?.objective, row.topic_key')
  195 | })
  196 | 
  197 | test('question booklet records can be viewed, edited and safely deleted by admins', () => {
  198 |   const upload = readFileSync(join(process.cwd(), 'app/api/admin/exam-upload/route.ts'), 'utf8')
  199 |   const admin = readFileSync(join(process.cwd(), 'app/admin/page.tsx'), 'utf8')
  200 |   const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260927184506_update_exam_resource_document_v1.sql'), 'utf8')
  201 |   expect(upload).toContain('export async function PUT')
  202 |   expect(upload).toContain("adminDb.rpc('update_exam_resource_document_v2'")
  203 |   expect(upload).toContain('const user = await getAdminUser()')
  204 |   expect(admin).toContain('👁️ Görüntüle')
  205 |   expect(admin).toContain('✏️ Düzelt')
  206 |   expect(admin).toContain('🗑️ Sil')
  207 |   expect(admin).toContain('✓ Onayla — referans kullan')
  208 |   expect(admin).toContain('yalnızca benzer/özgün soru üretiminde referans olarak kullanılacak')
  209 |   expect(admin).toContain('orijinal PDF korunur')
  210 |   expect(migration).toContain('security invoker')
  211 |   expect(migration).toContain('from public, anon, authenticated')
  212 |   expect(migration).toContain('to service_role')
  213 | })
  214 | 
  215 | test('teacher publication evidence stays private and admin-managed', () => {
  216 |   const evidenceRoute = readFileSync(join(process.cwd(), 'app/api/admin/exam-upload/evidence/route.ts'), 'utf8')
  217 |   const uploadRoute = readFileSync(join(process.cwd(), 'app/api/admin/exam-upload/route.ts'), 'utf8')
  218 |   const admin = readFileSync(join(process.cwd(), 'app/admin/page.tsx'), 'utf8')
  219 |   const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260927185740_add_exam_publication_evidence.sql'), 'utf8')
  220 |   expect(evidenceRoute).toContain("const BUCKET = 'publication-evidence'")
  221 |   expect(evidenceRoute).toContain('const user = await getAdminUser()')
  222 |   expect(evidenceRoute).toContain("resource.source_type !== 'teacher'")
  223 |   expect(evidenceRoute).toContain('createSignedUrls(paths, 600)')
  224 |   expect(uploadRoute).toContain("from('publication-evidence').createSignedUrls")
  225 |   expect(uploadRoute).toContain("from('publication-evidence').remove")
  226 |   expect(admin).toContain('Yayın izni görsel kanıtı')
  227 |   expect(admin).toContain('Yayın izni kanıtları')
  228 |   expect(migration).toContain("'publication-evidence'")
  229 |   expect(migration).toContain('false,')
  230 |   expect(migration).not.toContain('create policy')
  231 | })
  232 | 
  233 | test('open-ended grading accepts age-appropriate concise student language', () => {
  234 |   const generate = readFileSync(join(process.cwd(), 'app/api/generate-open-ended/route.ts'), 'utf8')
  235 |   const grade = readFileSync(join(process.cwd(), 'app/api/grade-open-ended/route.ts'), 'utf8')
  236 |   const teacher = readFileSync(join(process.cwd(), 'app/api/teacher/create-open-ended/route.ts'), 'utf8')
  237 |   expect(generate).toContain('YAŞA UYGUN CEVAP STANDARDI — ZORUNLU')
  238 |   expect(generate).toContain('Ortaokul için 1-3 kısa ve açık cümle')
  239 |   expect(teacher).toContain('YAŞA UYGUN CEVAP STANDARDI — ZORUNLU')
  240 |   expect(grade).toContain('YAŞA UYGUN PUANLAMA KURALI — EN ÖNCELİKLİ KURAL')
  241 |   expect(grade).toContain("gradeKey.includes('lise') ? 20 : 12")
  242 |   expect(grade).not.toContain('en az 50 karakter olmalı')
  243 |   expect(grade).toContain('teknik sözcükleri birebir kullanma şartı arama')
  244 | })
  245 | 
```