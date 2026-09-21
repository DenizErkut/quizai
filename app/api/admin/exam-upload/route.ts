import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createHash } from 'node:crypto'
import { callOpenAI } from '@/lib/openai'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic()

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
  title: string; exam_type: string; year: string; subject: string; answer_key: string
  rawText: string; fileUrl?: string; fileName?: string; source_type: 'anonymous' | 'teacher'; grade: string; subtopic: string; topic?: string; purpose: 'exam' | 'instant_test'; uploaded_by?: string
}) {
  const { title, exam_type, year, subject, answer_key, rawText, fileUrl, fileName, source_type, grade, subtopic, topic, purpose, uploaded_by } = params

  // exam_resources tablosuna kaydet
  const { data: examRow, error: rowErr } = await adminDb.from('exam_resources').insert({
    title, exam_type, year: parseInt(year), subject: subject || null,
    answer_key: answer_key || null,
    file_url: fileUrl || null,
    raw_text: rawText,
    purpose,
    source_type,
    reuse_policy: source_type === 'teacher' ? 'exact_reuse' : 'reference_only',
    grade: grade || '',
    subtopic: subtopic || '', topic: topic || subtopic || '',
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
      source_type, reuse_policy: source_type === 'teacher' ? 'exact_reuse' : 'reference_only',
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
      .select('id, title, exam_type, year, subject, answer_key, file_url, raw_text, purpose, source_type, reuse_policy, grade, topic, subtopic, review_status, created_at')
      .eq('id', id).single()
    if (error || !data) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 })
    return NextResponse.json({ exam: { ...data, char_count: data.raw_text?.length || 0 } })
  }

  let examQuery = adminDb
    .from('exam_resources')
    .select('id, title, exam_type, year, subject, purpose, source_type, reuse_policy, grade, topic, subtopic, review_status, created_at, file_url')
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
    return { ...ex, chunk_count: count || 0 }
  }))

  return NextResponse.json({ exams: withCounts })
}

async function promoteTeacherQuestions(row: { subject?: string | null; grade?: string | null; subtopic?: string | null; raw_text?: string | null }) {
  const prompt = `Aşağıdaki öğretmen imzalı kitapçıktaki çoktan seçmeli soruları AYNI soru metni, AYNI seçenekler ve AYNI doğru cevapla ayıkla. Yeniden yazma, sadeleştirme veya benzer soru üretme. Açıklama kitapçıkta yoksa yalnızca doğru cevabı kısaca açıkla. Eksik ya da cevabı belirlenemeyen soruyu atla. En fazla 40 soru döndür. {"questions":[{"q":"...","opts":["..."],"ans":0,"exp":"...","topic":"...","difficulty":"easy|medium|hard"}]}\n\n${String(row.raw_text || '').slice(0, 50000)}`
  const response = await anthropic.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 12000, messages: [{ role: 'user', content: prompt }] })
  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
  const extracted = (parsed.questions || []).filter((q: any) => q?.q && Array.isArray(q.opts) && q.opts.length >= 4 && q.opts.length <= 5 && Number.isInteger(q.ans) && q.ans >= 0 && q.ans < q.opts.length && q.exp)
  if (!extracted.length) return 0
  const validationText = await callOpenAI([
    { role: 'system', content: 'Sen bağımsız soru kalite denetçisisin. Soruları değiştirme. Yalnızca doğru cevabı kesin, seçenekleri benzersiz ve soru eksiksiz olan kayıtları onayla. JSON döndür.' },
    { role: 'user', content: `${JSON.stringify({ questions: extracted.map((q: any, index: number) => ({ index, q: q.q, opts: q.opts, ans: q.ans, exp: q.exp })) })}\nYanıt şeması: {"results":[{"index":0,"approved":true,"reason":"..."}]}` },
  ], { model: process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4.1-mini', max_tokens: 3000, json: true, operation: 'teacher-booklet-validator' })
  const validation = JSON.parse(validationText)
  const approvedIndexes = new Set<number>((validation.results || []).filter((item: any) => item.approved === true).map((item: any) => Number(item.index)))
  const questions = extracted.filter((_: any, index: number) => approvedIndexes.has(index))
  const rows = questions.map((q: any) => ({
    fingerprint: createHash('sha256').update(`${q.q}|${q.opts.join('|')}`.toLocaleLowerCase('tr')).digest('hex'),
    subject_key: String(row.subject || 'genel').toLocaleLowerCase('tr'), topic_key: String(q.topic || row.subtopic || 'genel').toLocaleLowerCase('tr'), grade_key: String(row.grade || '').toLocaleLowerCase('tr'), language_key: 'tr', question_type: 'multiple_choice', difficulty: ['easy','medium','hard'].includes(q.difficulty) ? q.difficulty : 'medium', question: { q: q.q, opts: q.opts, ans: q.ans, exp: q.exp, objective: q.topic || row.subtopic || '', sourcePolicy: 'teacher_exact' }, review_status: 'approved', quality_score: 1, source_engine: 'teacher_booklet_exact', report_count: 0
  }))
  if (!rows.length) return 0
  const result = await adminDb.from('question_bank').upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true })
  if (result.error) throw result.error
  return rows.length
}

// POST: yeni kitapçık yükle
export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const contentType = req.headers.get('content-type') || ''

    let title = '', exam_type = 'LGS', year = '', subject = '', answer_key = '', source_type: 'anonymous' | 'teacher' = 'anonymous', grade = '', subtopic = '', topic = '', fileName = '', purpose: 'exam' | 'instant_test' = 'exam'
    let rawText = '', fileUrl = ''

    // JSON mod: storage_path ile (büyük dosya)
    if (contentType.includes('application/json')) {
      const body = await req.json()
      title = body.title; exam_type = body.exam_type; year = body.year
      subject = body.subject || ''; answer_key = body.answer_key || ''
      source_type = body.source_type === 'teacher' ? 'teacher' : 'anonymous'; grade = body.grade || ''; subtopic = body.subtopic || ''; topic = body.topic || subtopic; fileName = body.file_name || ''
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
      source_type = form.get('source_type') === 'teacher' ? 'teacher' : 'anonymous'
      grade = form.get('grade') as string || ''
      subtopic = form.get('subtopic') as string || ''
      topic = form.get('topic') as string || subtopic
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

    const result = await processExam({ title, exam_type, year, subject, answer_key, rawText, fileUrl, fileName, source_type, grade, subtopic, topic, purpose, uploaded_by: user.id })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })

    let promoted = 0
    if (purpose === 'instant_test' && source_type === 'teacher') {
      promoted = await promoteTeacherQuestions({ subject, grade, subtopic, raw_text: rawText })
      await adminDb.from('exam_resources').update({ review_status: 'approved', reuse_policy: 'exact_reuse' }).eq('id', result.resource_id)
    }

    return NextResponse.json({ success: true, ...result, promoted })

  } catch (e: any) {
    console.error('[exam-upload]', e)
    const msg = e?.message || 'Bilinmeyen hata'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, review_status } = await req.json()
  if (!id || !['pending', 'approved', 'rejected'].includes(review_status)) return NextResponse.json({ error: 'Geçersiz durum' }, { status: 400 })
    const { data: row } = await adminDb.from('exam_resources').select('source_type,purpose,title,subject,grade,topic,subtopic,raw_text').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 })
  const { error } = await adminDb.from('exam_resources').update({ review_status, reuse_policy: row.source_type === 'teacher' ? 'exact_reuse' : 'reference_only' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let promoted = 0
  if (review_status === 'approved' && row.source_type === 'teacher' && row.purpose === 'instant_test') {
    try {
      promoted = await promoteTeacherQuestions(row)
    } catch (e) { console.error('[exam-upload] teacher promotion failed', e) }
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

  const { error: chunkErr } = await adminDb.from('exam_chunks').delete().eq('exam_resource_id', id)
  if (chunkErr) return NextResponse.json({ error: `Chunk silme hatası: ${chunkErr.message}` }, { status: 500 })

  const { error } = await adminDb.from('exam_resources').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
