import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
  if (!user) return null
  const { data: p } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).single()
  return p?.is_admin ? user : null
}

export const maxDuration = 60
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
  rawText: string; fileUrl?: string
}) {
  const { title, exam_type, year, subject, answer_key, rawText, fileUrl } = params

  // exam_resources tablosuna kaydet
  const { data: examRow, error: rowErr } = await adminDb.from('exam_resources').insert({
    title, exam_type, year: parseInt(year), subject: subject || null,
    answer_key: answer_key || null,
    file_url: fileUrl || null,
    raw_text: rawText,
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
    })
    if (embedding) embeddedCount++
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 150))
  }

  return { resource_id: examRow.id, chunks: chunks.length, embedded: embeddedCount, chars: rawText.length }
}

// GET: kitapçıkları listele
export async function GET() {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exams } = await adminDb
    .from('exam_resources')
    .select('id, title, exam_type, year, subject, created_at, file_url')
    .order('exam_type', { ascending: true })
    .order('year', { ascending: false })

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

// POST: yeni kitapçık yükle
export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const contentType = req.headers.get('content-type') || ''

    let title = '', exam_type = 'LGS', year = '', subject = '', answer_key = ''
    let rawText = '', fileUrl = ''

    // JSON mod: storage_path ile (büyük dosya)
    if (contentType.includes('application/json')) {
      const body = await req.json()
      title = body.title; exam_type = body.exam_type; year = body.year
      subject = body.subject || ''; answer_key = body.answer_key || ''

      const { data: fileData, error: dlErr } = await adminDb.storage
        .from('meb-resources').download(body.storage_path)

      if (dlErr || !fileData) return NextResponse.json({ error: `Storage indirme hatasi: ${dlErr?.message}` }, { status: 500 })

      fileUrl = body.file_url
      try {
        if ((await fileData.arrayBuffer()).byteLength < 10 * 1024 * 1024) {
        const pdfParse = require('pdf-parse')
        const parsed = await pdfParse(Buffer.from(await fileData.arrayBuffer()))
        rawText = parsed.text || ''
      } catch { rawText = `[PDF: ${fileUrl}]` }
        } else { rawText = `[PDF cok buyuk - Storage: ${fileUrl}]` }

    } else {
      // FormData mod (küçük dosya)
      const form = await req.formData()
      title = form.get('title') as string
      exam_type = form.get('exam_type') as string
      year = form.get('year') as string
      subject = form.get('subject') as string || ''
      answer_key = form.get('answer_key') as string || ''
      const file = form.get('file') as File | null

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
          if (bytes.length < 10 * 1024 * 1024) {
          const pdfParse = require('pdf-parse')
          const parsed = await pdfParse(Buffer.from(bytes))
          rawText = parsed.text || ''
        } catch { rawText = `[PDF yuklendi]` }
          } else { rawText = `[PDF cok buyuk (${Math.round(bytes.length/1024/1024)}MB)]` }
      }
    }

    if (!title || !exam_type || !year) {
      return NextResponse.json({ error: 'Baslik, sinav turu ve yil zorunlu.' }, { status: 400 })
    }
    if (!rawText) rawText = `[${exam_type} ${year} ${subject}]`

    const result = await processExam({ title, exam_type, year, subject, answer_key, rawText, fileUrl })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })

    return NextResponse.json({ success: true, ...result })

  } catch (e: any) {
    console.error('[exam-upload]', e)
    const msg = e?.message || 'Bilinmeyen hata'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
