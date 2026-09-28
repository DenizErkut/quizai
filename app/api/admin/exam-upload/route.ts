import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createHash } from 'node:crypto'
import { callOpenAI } from '@/lib/openai'
import { questionBankKey } from '@/lib/question-bank'
import { educationEvalGradeKey } from '@/lib/education-eval-grade'
import { matchVerifiedObjectiveCode, parseLearningObjectiveCodes } from '@/lib/learning-objective-codes'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic()

function canonicalBookletGrade(value: unknown): string {
  const key = questionBankKey(value)
  if (!/^\d{1,2}$/.test(key)) return key
  const grade = Number(key)
  if (grade >= 1 && grade <= 4) return `ilkokul ${grade} sinif`
  if (grade >= 5 && grade <= 8) return `ortaokul ${grade} sinif`
  if (grade >= 9 && grade <= 12) return `lise ${grade} sinif`
  return key
}

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    // 21 Eylül 2026 — teşhis logu: "Forbidden" hatası tekrarlarsa Vercel
    // runtime log'larında en azından "oturum yok" mu yoksa "admin değil" mi
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
}

export const maxDuration = 120
export const runtime = 'nodejs'

function normTR(s: string) {
  return s
    .replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
    .replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_')
}

function chunkText(text: string, size = 800): string[] {
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 50)
  const chunks: string[] = []
  let current = ''
  for (const para of paragraphs) {
    if ((current + para).length > size && current) {
      chunks.push(current.trim())
      current = para
    } else {
      current += '\n\n' + para
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.length > 0 ? chunks : [text.slice(0, size)]
}

async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text: text.slice(0, 2000) }] } })
      }
    )
    const data = await res.json()
    return data?.embedding?.values || null
  } catch { return null }
}

async function processExam(params: {
  title: string; exam_type: string; year: string; subject: string; answer_key: string; learning_objective_codes: string[]
  rawText: string; fileUrl?: string; fileName?: string; source_type: 'anonymous' | 'teacher' | 'ai'; grade: string; subtopic: string; topic?: string; purpose: 'exam' | 'instant_test'; uploaded_by?: string
}) {
  const { title, exam_type, year, subject, answer_key, learning_objective_codes, rawText, fileUrl, fileName, source_type, grade, subtopic, topic, purpose, uploaded_by } = params

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
  }).select('id').single()

  if (rowErr || !examRow) {
    return { error: `DB kayit hatasi: ${rowErr?.message}` }
  }

  // Chunk'la ve embed et
  const chunks = chunkText(rawText)
  let embeddedCount = 0

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embedText(chunks[i])
    await adminDb.from('exam_chunks').insert({
      exam_resource_id: examRow.id,
      chunk_index: i,
      content: chunks[i],
      embedding: embedding ? JSON.stringify(embedding) : null,
      exam_type, year: parseInt(year), subject: subject || null,
      source_type, reuse_policy: source_type === 'anonymous' ? 'reference_only' : 'exact_reuse',
      grade: grade || '', subtopic: subtopic || '',
    })
    if (embedding) embeddedCount++
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 150))
  }

  return { resource_id: examRow.id, chunks: chunks.length, embedded: embeddedCount, chars: rawText.length }
}

// GET: kitapçıkları listele (ya da ?id= ile TEK kitapçığın TAM içeriğini
// görüntüle — "önce gör, sonra sil" kontrol listesi için, bkz.
// pratium-bekleyen-isler-uygulama-plani.md Madde 5)
export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const purpose = searchParams.get('purpose')

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
  }

  let examQuery = adminDb
    .from('exam_resources')
    .select('id, title, exam_type, year, subject, purpose, source_type, reuse_policy, grade, topic, subtopic, learning_objective_codes, review_status, publication_evidence_paths, created_at, file_url')
    .order('exam_type', { ascending: true })
    .order('year', { ascending: false })
  if (purpose === 'instant_test' || purpose === 'exam') examQuery = examQuery.eq('purpose', purpose)
  const { data: exams } = await examQuery

  // chunk sayısını da ekle
  const withCounts = await Promise.all((exams || []).map(async (ex) => {
    const { count } = await adminDb
      .from('exam_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('exam_resource_id', ex.id)
    return { ...ex, publication_evidence_count: Array.isArray(ex.publication_evidence_paths) ? ex.publication_evidence_paths.length : 0, chunk_count: count || 0 }
  }))

  return NextResponse.json({ exams: withCounts })
}

async function loadVerifiedBookletObjectives(row: { subject?: string | null; grade?: string | null; learning_objective_codes?: unknown }) {
  const codes = parseLearningObjectiveCodes(row.learning_objective_codes)
  if (!codes.length || !row.subject || !row.grade) return []

  const { data: benchmarkSet } = await adminDb.from('education_eval_benchmark_sets')
    .select('curriculum_version_id').eq('code', 'meb-k12-controlled').order('version', { ascending: false }).limit(1).maybeSingle()
  if (!benchmarkSet?.curriculum_version_id) return []

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
      && questionBankKey(objective.subject) === questionBankKey(row.subject)
    if (!code || !inScope || seen.has(code)) return false
    seen.add(code)
    return true
  }).map(objective => ({ code: objective.objective_code, title: objective.title }))
}

async function promoteExactQuestions(row: { id?: string; subject?: string | null; grade?: string | null; topic?: string | null; subtopic?: string | null; raw_text?: string | null; learning_objective_codes?: unknown }, sourceType: 'teacher' | 'ai') {
  const sourceLabel = sourceType === 'teacher' ? 'öğretmen imzalı' : 'yapay zekâ ile ayrıca hazırlanmış'
  const rawText = String(row.raw_text || '').slice(0, 300000)
  const answerStart = rawText.search(/\n\s*(?:CEVAP(?:LAR| ANAHTARI)?|YANIT(?:LAR| ANAHTARI)?)\b/iu)
  const questionSection = answerStart > 0 ? rawText.slice(0, answerStart) : rawText
  const answerSection = answerStart > 0 ? rawText.slice(answerStart) : ''
  const numberedBlocks = questionSection.split(/(?=\n\s*\d{1,3}[\.)]\s+)/).filter(part => /^\s*\d{1,3}[\.)]\s+/u.test(part))
  const batches = numberedBlocks.length > 55
    ? Array.from({ length: Math.ceil(numberedBlocks.length / 50) }, (_, index) => `${numberedBlocks.slice(index * 50, index * 50 + 50).join('')}\n\n${answerSection}`)
    : [rawText]
  const objectiveReferences = await loadVerifiedBookletObjectives(row)
  const verifiedCodes = objectiveReferences.map(objective => objective.code)
  const objectiveInstruction = objectiveReferences.length
    ? `\nKitapçıkta ilişkilendirilecek doğrulanmış MEB kazanımları: ${JSON.stringify(objectiveReferences)}. Her soruyu içerik bakımından en uygun kodla eşleştir; eşleşme açık değilse objective_code null olsun. Yalnızca bu listede bulunan kodlardan birini kullan; kod uydurma veya listedeki soruyu değiştirme.\n`
    : '\nobjective_code alanını null döndür.\n'
  const extractedGroups = await Promise.all(batches.map(async batch => {
    const prompt = `Aşağıdaki ${sourceLabel} kitapçık bölümündeki çoktan seçmeli soruları AYNI soru metni, AYNI seçenekler ve AYNI doğru cevapla ayıkla. Yeniden yazma, sadeleştirme veya benzer soru üretme. Bölümün sonundaki cevap anahtarından yalnız bu bölümdeki soruların cevaplarını kullan. Açıklama kitapçıkta yoksa doğru cevabı kısaca açıkla. Eksik ya da cevabı belirlenemeyen soruyu atla. En fazla 55 soru döndür. ${objectiveInstruction}Yalnız JSON döndür: {"questions":[{"q":"...","opts":["..."],"ans":0,"exp":"...","topic":"...","difficulty":"easy|medium|hard","objective_code":null}]}\n\n<KITAPCIK_METNI>\n${batch}\n</KITAPCIK_METNI>`
    const response = await anthropic.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 12000, messages: [{ role: 'user', content: prompt }] })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return Array.isArray(parsed.questions) ? parsed.questions : []
  }))
  const extracted = extractedGroups.flat().filter((q: any) => q?.q && Array.isArray(q.opts) && q.opts.length >= 4 && q.opts.length <= 5 && Number.isInteger(q.ans) && q.ans >= 0 && q.ans < q.opts.length && q.exp)
  if (!extracted.length) return 0
  const validationText = await callOpenAI([
    { role: 'system', content: 'Sen bağımsız soru kalite denetçisisin. Soruları değiştirme. Yalnızca doğru cevabı kesin, seçenekleri benzersiz ve soru eksiksiz olan kayıtları onayla. JSON döndür.' },
    { role: 'user', content: `${JSON.stringify({ questions: extracted.map((q: any, index: number) => ({ index, q: q.q, opts: q.opts, ans: q.ans, exp: q.exp })) })}\nYanıt şeması: {"results":[{"index":0,"approved":true,"reason":"..."}]}` },
  ], { model: process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4.1-mini', max_tokens: 12000, json: true, operation: `${sourceType}-booklet-validator` })
  const validation = JSON.parse(validationText)
  const approvedIndexes = new Set<number>((validation.results || []).filter((item: any) => item.approved === true).map((item: any) => Number(item.index)))
  const questions = extracted.filter((_: any, index: number) => approvedIndexes.has(index))
  const rows = questions.map((q: any) => ({
    fingerprint: createHash('sha256').update(`${q.q}|${q.opts.join('|')}`.toLocaleLowerCase('tr')).digest('hex'),
    subject_key: questionBankKey(row.subject || 'genel'),
    // `topic_key` is the booklet's selected parent unit so all extracted
    // questions stay together in admin filters and parent-topic bank lookup.
    // Preserve the classifier's finer subtopic separately in the question.
    topic_key: questionBankKey(row.subtopic || row.topic || q.topic || 'genel'),
    grade_key: canonicalBookletGrade(row.grade || ''), language_key: 'tr', question_type: 'multiple_choice', difficulty: q.difficulty === 'easy' ? 'kolay' : q.difficulty === 'hard' ? 'zor' : 'normal',
    question: { q: q.q, opts: q.opts, ans: q.ans, exp: q.exp, objective: q.topic || row.subtopic || '', learningObjectiveCode: matchVerifiedObjectiveCode(q.objective_code, verifiedCodes), bookletObjectiveCodes: parseLearningObjectiveCodes(row.learning_objective_codes), bookletTopic: row.subtopic || row.topic || '', bookletResourceId: row.id || null, subject: row.subject || 'Genel', sourcePolicy: sourceType === 'teacher' ? 'teacher_exact' : 'ai_exact' },
    review_status: 'approved', quality_score: 1, source_engine: sourceType === 'teacher' ? 'teacher_booklet_exact' : 'ai_booklet_exact', report_count: 0
  }))
  if (!rows.length) return 0
  const result = await adminDb.from('question_bank').upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true }).select('id')
  if (result.error) throw result.error
  return result.data?.length || 0
}

// POST: yeni kitapçık yükle
export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const contentType = req.headers.get('content-type') || ''

    let title = '', exam_type = 'LGS', year = '', subject = '', answer_key = '', source_type: 'anonymous' | 'teacher' | 'ai' = 'anonymous', grade = '', subtopic = '', topic = '', fileName = '', purpose: 'exam' | 'instant_test' = 'exam'
    let learning_objective_codes: string[] = []
    let rawText = '', fileUrl = ''

    // JSON mod: storage_path ile (büyük dosya)
    if (contentType.includes('application/json')) {
      const body = await req.json()
      title = body.title; exam_type = body.exam_type; year = body.year
      subject = body.subject || ''; answer_key = body.answer_key || ''
      source_type = body.source_type === 'teacher' || body.source_type === 'ai' ? body.source_type : 'anonymous'; grade = body.grade || ''; subtopic = body.subtopic || ''; topic = body.topic || subtopic; fileName = body.file_name || ''
      learning_objective_codes = parseLearningObjectiveCodes(body.learningObjectiveCodes ?? body.learning_objective_codes)
      purpose = body.purpose === 'instant_test' ? 'instant_test' : 'exam'

      const { data: fileData, error: dlErr } = await adminDb.storage
        .from('meb-resources').download(body.storage_path)

      if (dlErr || !fileData) return NextResponse.json({ error: `Storage indirme hatasi: ${dlErr?.message}` }, { status: 500 })

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
      } catch { rawText = `[PDF: ${fileUrl}]` }

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
      fileName = file?.name || ''

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
    }

    if (purpose === 'instant_test') {
      exam_type = 'ANLIK_TEST'
      year = new Date().getFullYear().toString()
      answer_key = ''
    }
    if (!title || !exam_type || !year) {
      return NextResponse.json({ error: 'Baslik, sinav turu ve yil zorunlu.' }, { status: 400 })
    }
    if (!rawText) rawText = `[${exam_type} ${year} ${subject}]`

    const result = await processExam({ title, exam_type, year, subject, answer_key, learning_objective_codes, rawText, fileUrl, fileName, source_type, grade, subtopic, topic, purpose, uploaded_by: user.id })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })

    let promoted = 0
    if (purpose === 'instant_test' && source_type !== 'anonymous') {
      promoted = await promoteExactQuestions({ id: result.resource_id, subject, grade, topic, subtopic, raw_text: rawText, learning_objective_codes }, source_type)
      await adminDb.from('exam_resources').update({ review_status: 'approved', reuse_policy: 'exact_reuse' }).eq('id', result.resource_id)
    }

    return NextResponse.json({ success: true, ...result, promoted })

  } catch (e: any) {
    console.error('[exam-upload]', e)
    const msg = e?.message || 'Bilinmeyen hata'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Admin-only document editor. The original PDF stays untouched; only the
// metadata and extracted text used by search/question grounding are replaced.
// The RPC updates the resource and all searchable chunks atomically.
export async function PUT(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const grade = typeof body?.grade === 'string' ? body.grade.trim() : ''
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
  const topic = typeof body?.topic === 'string' ? body.topic.trim() : ''
  const rawText = typeof body?.raw_text === 'string' ? body.raw_text : ''

  if (!id || title.length < 2 || title.length > 300 || !grade || !subject || !topic) {
    return NextResponse.json({ error: 'Kitapçık kimliği, başlık, sınıf, ders ve ünite/konu zorunludur.' }, { status: 400 })
  }
  if (!rawText.trim() || rawText.length > 500_000) {
    return NextResponse.json({ error: 'Kitapçık metni boş olamaz ve 500.000 karakteri aşamaz.' }, { status: 400 })
  }
  const chunks = chunkText(rawText)
  if (!chunks.length || chunks.length > 500) {
    return NextResponse.json({ error: 'Kitapçık metni aranabilir parçalara ayrılamadı.' }, { status: 400 })
  }

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
}

export async function PATCH(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, review_status } = await req.json()
  if (!id || !['pending', 'approved', 'rejected'].includes(review_status)) return NextResponse.json({ error: 'Geçersiz durum' }, { status: 400 })
  const { data: row } = await adminDb.from('exam_resources').select('id,source_type,purpose,title,subject,grade,topic,subtopic,raw_text,learning_objective_codes').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 })
  const { error } = await adminDb.from('exam_resources').update({ review_status, reuse_policy: row.source_type === 'anonymous' ? 'reference_only' : 'exact_reuse' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let promoted = 0
  if (review_status === 'approved' && (row.source_type === 'teacher' || row.source_type === 'ai') && row.purpose === 'instant_test') {
    try {
      promoted = await promoteExactQuestions(row, row.source_type)
    } catch (e) { console.error(`[exam-upload] ${row.source_type} promotion failed`, e) }
  }
  return NextResponse.json({ success: true, promoted })
}

// DELETE: kitapçık sil. Bu tablolar için repoda bir FK/migration
// tanımı bulunamadığından exam_chunks CASCADE ile silineceği garanti
// değil — önce exam_chunks satırları, sonra exam_resources satırı elle
// silinir. "confirmed:true" olmadan (önce tam içerik görülmeden)
// çalışmaz (bkz. pratium-bekleyen-isler-uygulama-plani.md Madde 5).
// Bu endpoint'ten ÖNCE exam_chunks silmeleri tamamen repo dışı, elle
// SQL ile yapılıyordu (bir kez kontrol karakteri içeren bir chunk'ta
// hataya yol açmıştı, transaction rollback ile kurtarılmıştı) — artık
// güvenli, tekrar kullanılabilir, kayıtlı bir yol var.
export async function DELETE(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, confirmed } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID gerekli' }, { status: 400 })
  if (!confirmed) {
    return NextResponse.json(
      { error: 'Silme onayı gerekli — önce tam içeriği görüntüleyin (confirmed:true olmadan silme çalışmaz).' },
      { status: 400 }
    )
  }

  const { data: resource } = await adminDb.from('exam_resources').select('publication_evidence_paths').eq('id', id).single()
  const evidencePaths = Array.isArray(resource?.publication_evidence_paths) ? resource.publication_evidence_paths : []

  const { error: chunkErr } = await adminDb.from('exam_chunks').delete().eq('exam_resource_id', id)
  if (chunkErr) return NextResponse.json({ error: `Chunk silme hatası: ${chunkErr.message}` }, { status: 500 })

  const { error } = await adminDb.from('exam_resources').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (evidencePaths.length) {
    const { error: storageError } = await adminDb.storage.from('publication-evidence').remove(evidencePaths)
    if (storageError) console.error('[exam-upload] publication evidence cleanup failed', storageError)
  }

  return NextResponse.json({ success: true })
}
