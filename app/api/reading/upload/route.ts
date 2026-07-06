// app/api/reading/upload/route.ts
// Öğrenci kitap/metin yükler → metin çıkarılır → sesli okuma için parçalara bölünür.
// FileUploader.tsx / extract-file ile aynı chunked-upload sözleşmesini kullanır
// (chunk, chunkIndex, totalChunks, sessionId, ext, filename) — büyük dosyalar için.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/auth-middleware'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const MAX_CHARS = 400_000      // ~ orta boy bir roman
const MAX_READING_CHUNKS = 800  // TTS/dikkat sorusu maliyetini sınırlamak için üst sınır
const WORDS_PER_CHUNK = 120      // ~ 45-60 saniyelik konuşma parçası

// Upload oturumu başına gelen parçaları tutan bellek içi depo (extract-file ile aynı desen)
const chunkStore = new Map<string, Buffer[]>()

// Gemini API helper (extract-file/route.ts ile aynı desen — taranmış PDF'ler için)
async function callGemini(model: string, parts: any[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY!
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: 8000, temperature: 0.1 },
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Gemini API hatasi: ${err?.error?.message || res.status}`)
  }
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function extractWithGeminiVision(buffer: Buffer): Promise<string> {
  const base64 = buffer.toString('base64')
  const text = await callGemini('gemini-1.5-flash', [
    { inlineData: { mimeType: 'application/pdf', data: base64 } },
    { text: 'Bu PDF taranmış/görsel bir kitap. Tüm sayfalardaki metni, sayfa sırasına göre, Türkçe olarak eksiksiz çıkar. Başlıkları ve paragrafları koru. Sadece metni döndür, başka açıklama ekleme.' },
  ])
  return text.trim()
}

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

async function extractText(buffer: Buffer, ext: string): Promise<{ text: string; engine: string }> {
  if (ext === 'txt') {
    return { text: buffer.toString('utf-8').slice(0, MAX_CHARS), engine: 'text' }
  }

  if (ext === 'pdf') {
    let parsedText = ''
    let totalPages = 0
    try {
      const pdfParse = require('pdf-parse')
      const parsed = await pdfParse(buffer, { max: 0 })
      parsedText = (parsed?.text || '').trim()
      totalPages = parsed?.numpages || 0
    } catch (e) {
      console.warn('[reading/upload] pdf-parse basarisiz:', (e as any)?.message)
    }

    // Yeterli metin çıktıysa direkt kullan
    if (parsedText.length >= 100) {
      return { text: parsedText.slice(0, MAX_CHARS), engine: 'pdf-parse' }
    }

    // Taranmış / görsel PDF — Gemini Vision'ı dene
    if (process.env.GEMINI_API_KEY) {
      try {
        console.log('[reading/upload] Taranmis PDF - Gemini Vision deneniyor...')
        const geminiText = await extractWithGeminiVision(buffer)
        if (geminiText.length >= 100) {
          return { text: geminiText.slice(0, MAX_CHARS), engine: 'gemini-vision' }
        }
      } catch (e) {
        console.warn('[reading/upload] Gemini Vision basarisiz:', (e as any)?.message)
      }
    }

    // Gemini yoksa/başarısızsa — Claude fallback (büyük/çok sayfalı kitaplarda maliyet nedeniyle sınırlı)
    if (buffer.length <= 15 * 1024 * 1024 && totalPages <= 60) {
      try {
        const base64 = buffer.toString('base64')
        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any,
              { type: 'text', text: 'Bu PDF taranmis/gorsel bir kitap. Tum sayfalardaki metni sayfa sirasina gore eksiksiz cikar. Sadece metni dondur.' },
            ],
          }],
        }) as any
        const claudeText = (message.content[0]?.text || '').trim()
        if (claudeText.length >= 100) {
          return { text: claudeText.slice(0, MAX_CHARS), engine: 'claude' }
        }
      } catch (e) {
        console.warn('[reading/upload] Claude fallback basarisiz:', (e as any)?.message)
      }
    }

    throw new Error('Bu PDF taranmış/görsel bir kitap ve metni otomatik olarak çıkarılamadı. Lütfen farklı bir dosya deneyin veya birkaç sayfa sonra tekrar yükleyin.')
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
    return { text: content.slice(0, MAX_CHARS), engine: 'docx' }
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

    const { text: rawText, engine } = await extractText(fullBuffer, ext)
    console.log(`[reading/upload] metin cikarildi: ${rawText.length} karakter, engine=${engine}`)
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

