// app/api/reading/upload/route.ts
// Öğrenci kitap/metin yükler → metin çıkarılır → sesli okuma için parçalara bölünür.
// FileUploader.tsx / extract-file ile aynı chunked-upload sözleşmesini kullanır
// (chunk, chunkIndex, totalChunks, sessionId, ext, filename) — büyük dosyalar için.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth-middleware'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_CHARS = 400_000      // ~ orta boy bir roman
const MAX_READING_CHUNKS = 800  // TTS/dikkat sorusu maliyetini sınırlamak için üst sınır
const WORDS_PER_CHUNK = 120      // ~ 45-60 saniyelik konuşma parçası

// Upload oturumu başına gelen parçaları tutan bellek içi depo (extract-file ile aynı desen)
const chunkStore = new Map<string, Buffer[]>()

// Metni cümle sınırlarını bozmadan ~WORDS_PER_CHUNK kelimelik parçalara böler
function chunkForReading(text: string, wordsPerChunk = WORDS_PER_CHUNK): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
  const sentences = clean.split(/(?<=[.!?…])\s+/).filter(s => s.trim().length > 0)
  const chunks: string[] = []
  let current: string[] = []
  let wordCount = 0

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).length
    if (wordCount + words > wordsPerChunk && current.length > 0) {
      chunks.push(current.join(' ').trim())
      current = []
      wordCount = 0
    }
    current.push(sentence.trim())
    wordCount += words
  }
  if (current.length) chunks.push(current.join(' ').trim())

  const filtered = chunks.filter(c => c.length > 0)
  if (filtered.length > MAX_READING_CHUNKS) {
    return filtered.slice(0, MAX_READING_CHUNKS)
  }
  return filtered.length > 0 ? filtered : [text.slice(0, 2000)]
}

async function extractText(buffer: Buffer, ext: string): Promise<string> {
  if (ext === 'txt') {
    return buffer.toString('utf-8').slice(0, MAX_CHARS)
  }

  if (ext === 'pdf') {
    const pdfParse = require('pdf-parse')
    const parsed = await pdfParse(buffer, { max: 0 })
    const text = (parsed?.text || '').trim()
    if (text.length < 50) {
      throw new Error('PDF içinden metin çıkarılamadı. Taranmış (görsel) bir PDF olabilir.')
    }
    return text.slice(0, MAX_CHARS)
  }

  if (ext === 'docx') {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(buffer)
    const xmlFile = zip.file('word/document.xml')
    if (!xmlFile) throw new Error('DOCX içeriği okunamadı.')
    const xml = await xmlFile.async('string')
    const content = xml
      .replace(/<w:br[^>]*\/>/g, '\n').replace(/<w:p[ >][^>]*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n').trim()
    if (content.length < 50) throw new Error('DOCX içinden metin çıkarılamadı.')
    return content.slice(0, MAX_CHARS)
  }

  throw new Error(`Desteklenmeyen dosya türü: .${ext} (sadece PDF, DOCX, TXT desteklenir)`)
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  try {
    const form = await req.formData()
    const chunk = form.get('chunk') as File | null
    const chunkIndex = parseInt(form.get('chunkIndex') as string || '0')
    const totalChunks = parseInt(form.get('totalChunks') as string || '1')
    const sessionId = form.get('sessionId') as string
    const ext = ((form.get('ext') as string) || '').toLowerCase()
    const filename = (form.get('filename') as string) || 'Kitap'
    const title = (form.get('title') as string) || filename.replace(/\.[^.]+$/, '')

    if (!chunk) return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 })
    if (!['pdf', 'docx', 'txt'].includes(ext)) {
      return NextResponse.json({ error: 'Sadece PDF, DOCX ve TXT dosyaları desteklenir.' }, { status: 400 })
    }

    const chunkBuffer = Buffer.from(await chunk.arrayBuffer())
    if (!chunkStore.has(sessionId)) chunkStore.set(sessionId, [])
    const chunks = chunkStore.get(sessionId)!
    chunks[chunkIndex] = chunkBuffer

    const received = chunks.filter(Boolean).length
    if (received < totalChunks) {
      return NextResponse.json({
        status: 'chunk_received',
        received,
        total: totalChunks,
        progress: Math.round((received / totalChunks) * 70),
      })
    }

    const fullBuffer = Buffer.concat(chunks)
    chunkStore.delete(sessionId)

    const rawText = await extractText(fullBuffer, ext)
    const readingChunks = chunkForReading(rawText)

    const { data: material, error: insertErr } = await adminDb
      .from('reading_materials')
      .insert({
        user_id: user.id,
        title,
        source_type: ext,
        raw_text: rawText,
        char_count: rawText.length,
        chunks: readingChunks,
        chunk_count: readingChunks.length,
      })
      .select('id, title, chunk_count, char_count')
      .single()

    if (insertErr || !material) {
      console.error('[reading/upload] DB hatasi:', insertErr)
      return NextResponse.json({ error: 'Kitap kaydedilemedi: ' + insertErr?.message }, { status: 500 })
    }

    return NextResponse.json({
      status: 'complete',
      progress: 100,
      material_id: material.id,
      title: material.title,
      chunks: readingChunks,
      chunk_count: material.chunk_count,
      char_count: material.char_count,
    })

  } catch (e: any) {
    console.error('[reading/upload]', e)
    return NextResponse.json({ error: e?.message || 'Dosya işlenemedi.' }, { status: 500 })
  }
}

// GET: kullanıcının yüklediği kitapları listele
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  const { data, error: listErr } = await adminDb
    .from('reading_materials')
    .select('id, title, source_type, char_count, chunk_count, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })
  return NextResponse.json({ materials: data || [] })
}
