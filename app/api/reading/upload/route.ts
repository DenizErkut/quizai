// app/api/reading/upload/route.ts
// Öğrenci kitabı doğrudan Supabase Storage'a yükler (reading-uploads bucket,
// kendi user_id klasörüne), sonra bu API'ye SADECE dosya yolunu gönderir.
// API dosyayı Storage'dan indirir, metni çıkarır, parçalara böler ve Storage'daki
// dosyayı SİLER (içerik kalıcı saklanmaz — sadece başlık geçmişi tutulur).
//
// NOT: Önceki chunked-upload (bellek içi chunkStore) yaklaşımı Vercel serverless'ta
// güvenilir değildi — paralel parçalar farklı lambda kopyalarına düşünce birleştirme
// asla tamamlanmıyor ve yükleme %40-70 arasında takılı kalıyordu. Storage üzerinden
// akış bu sorunu kökten çözer.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/auth-middleware'

export const runtime = 'nodejs'
export const maxDuration = 280
export const dynamic = 'force-dynamic'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const MAX_CHARS = 400_000      // ~ orta boy bir roman
const MAX_READING_CHUNKS = 800  // TTS/dikkat sorusu maliyetini sınırlamak için üst sınır
const WORDS_PER_CHUNK = 120      // ~ 45-60 saniyelik konuşma parçası
const BUCKET = 'reading-uploads'

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

// Küçük eşzamanlılık havuzu — aynı anda en fazla `limit` kadar iş çalışır
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// PDF'i sayfa gruplarına böler (pdf-lib) — büyük/taranmış kitaplarda paralel OCR için
async function splitPdfIntoBatches(buffer: Buffer, pagesPerBatch: number): Promise<Buffer[]> {
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const totalPages = src.getPageCount()
  const batches: Buffer[] = []
  for (let start = 0; start < totalPages; start += pagesPerBatch) {
    const end = Math.min(start + pagesPerBatch, totalPages)
    const sub = await PDFDocument.create()
    const indices = Array.from({ length: end - start }, (_, i) => start + i)
    const copied = await sub.copyPages(src, indices)
    copied.forEach(p => sub.addPage(p))
    batches.push(Buffer.from(await sub.save()))
  }
  return batches
}

async function getPdfPageCount(buffer: Buffer): Promise<number> {
  try {
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
    return doc.getPageCount()
  } catch { return 0 }
}
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

    // Taranmış / görsel PDF — sayfa sayısını öğren, büyükse paralel batch'ler halinde OCR yap
    const pageCount = totalPages || await getPdfPageCount(buffer)
    const BATCH_SIZE = 8      // batch başına sayfa sayısı
    const CONCURRENCY = 4     // aynı anda kaç batch işlenecek

    if (process.env.GEMINI_API_KEY) {
      try {
        if (pageCount > BATCH_SIZE) {
          console.log(`[reading/upload] ${pageCount} sayfa - Gemini Vision paralel batch (${CONCURRENCY} eszamanli)...`)
          const batches = await splitPdfIntoBatches(buffer, BATCH_SIZE)
          const texts = await mapWithConcurrency(batches, CONCURRENCY, async (batchBuf) => {
            try { return await extractWithGeminiVision(batchBuf) } catch (e) {
              console.warn('[reading/upload] Gemini batch basarisiz:', (e as any)?.message)
              return ''
            }
          })
          const combined = texts.filter(Boolean).join('\n\n').trim()
          if (combined.length >= 100) {
            return { text: combined.slice(0, MAX_CHARS), engine: 'gemini-vision-parallel' }
          }
        } else {
          console.log('[reading/upload] Taranmis PDF - Gemini Vision deneniyor...')
          const geminiText = await extractWithGeminiVision(buffer)
          if (geminiText.length >= 100) {
            return { text: geminiText.slice(0, MAX_CHARS), engine: 'gemini-vision' }
          }
        }
      } catch (e) {
        console.warn('[reading/upload] Gemini Vision basarisiz:', (e as any)?.message)
      }
    }

    // Gemini yoksa/başarısızsa — Claude fallback (paralel batch, maliyet için sayfa/boyut sınırlı)
    if (buffer.length <= 15 * 1024 * 1024 && pageCount <= 60) {
      try {
        const claudeBatches = pageCount > BATCH_SIZE ? await splitPdfIntoBatches(buffer, BATCH_SIZE) : [buffer]
        const texts = await mapWithConcurrency(claudeBatches, 3, async (batchBuf) => {
          try {
            const base64 = batchBuf.toString('base64')
            const message = await anthropic.messages.create({
              model: 'claude-sonnet-4-5',
              max_tokens: 4000,
              messages: [{
                role: 'user',
                content: [
                  { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any,
                  { type: 'text', text: 'Bu PDF taranmis/gorsel bir kitabin bir bolumu. Tum sayfalardaki metni sayfa sirasina gore eksiksiz cikar. Sadece metni dondur.' },
                ],
              }],
            }) as any
            return (message.content[0]?.text || '').trim()
          } catch (e) {
            console.warn('[reading/upload] Claude batch basarisiz:', (e as any)?.message)
            return ''
          }
        })
        const combined = texts.filter(Boolean).join('\n\n').trim()
        if (combined.length >= 100) {
          return { text: combined.slice(0, MAX_CHARS), engine: 'claude-parallel' }
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

  let storagePath = ''
  try {
    const body = await req.json()
    storagePath = (body?.path as string) || ''
    const ext = ((body?.ext as string) || '').toLowerCase()
    const title = ((body?.title as string) || 'Kitap').slice(0, 200)

    if (!storagePath || !['pdf', 'docx', 'txt'].includes(ext)) {
      return NextResponse.json({ error: 'Geçersiz istek (path/ext eksik).' }, { status: 400 })
    }
    // Güvenlik: kullanıcı sadece kendi klasöründeki dosyayı işletebilir
    if (!storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: 'Bu dosyaya erişim yetkiniz yok.' }, { status: 403 })
    }

    // Dosyayı Storage'dan indir (service role — RLS'e takılmaz, yol zaten doğrulandı)
    const { data: fileData, error: dlErr } = await adminDb.storage.from(BUCKET).download(storagePath)
    if (dlErr || !fileData) {
      console.error('[reading/upload] Storage indirme hatasi:', dlErr)
      return NextResponse.json({ error: 'Dosya Storage üzerinden okunamadı.' }, { status: 500 })
    }
    const fullBuffer = Buffer.from(await fileData.arrayBuffer())

    const { text: rawText, engine } = await extractText(fullBuffer, ext)
    console.log(`[reading/upload] metin cikarildi: ${rawText.length} karakter, engine=${engine}`)
    const readingChunks = chunkForReading(rawText)

    // NOT: Kitabın içeriği (metin) veritabanında SAKLANMIYOR — telif/gizlilik
    // nedeniyle sadece başlık + istatistikler tutuluyor (kullanıcının "hangi
    // kitapları dinledim" listesi için). Parçalar sadece bu response ile
    // istemciye dönüyor ve o oturum boyunca tarayıcı belleğinde kalıyor.
    const { data: material, error: insertErr } = await adminDb
      .from('reading_materials')
      .insert({
        user_id: user.id,
        title,
        source_type: ext,
        char_count: rawText.length,
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
  } finally {
    // İçerik kalıcı saklanmıyor — işlenen (veya başarısız olan) dosyayı Storage'dan temizle
    if (storagePath) {
      adminDb.storage.from(BUCKET).remove([storagePath]).catch((e: any) =>
        console.warn('[reading/upload] Storage temizligi basarisiz:', e?.message))
    }
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

