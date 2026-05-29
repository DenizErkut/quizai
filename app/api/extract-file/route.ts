// app/api/extract-file/route.ts
// Güncellenmiş versiyon: Gemini Vision (görsel PDF) + Gemini Audio (ses) entegrasyonu

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Gemini API helper — fetch tabanlı (SDK gerektirmez)
async function callGemini(model: string, parts: any[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY!
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: 4000, temperature: 0.1 },
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Gemini API hatası: ${err?.error?.message || res.status}`)
  }
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// Görsel PDF → Gemini Vision
async function extractWithGeminiVision(buffer: Buffer, filename: string): Promise<string> {
  const base64 = buffer.toString('base64')
  const text = await callGemini('gemini-1.5-flash', [
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: base64,
      }
    },
    {
      text: 'Bu PDF dosyasının tüm metin içeriğini Türkçe olarak çıkar. Başlıkları, paragrafları ve listeleri koru. Sadece metni döndür, açıklama yapma.'
    }
  ])
  return text.trim()
}

// Ses dosyası → Gemini Audio
async function extractWithGeminiAudio(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const base64 = buffer.toString('base64')
  const text = await callGemini('gemini-1.5-flash', [
    {
      inlineData: {
        mimeType,
        data: base64,
      }
    },
    {
      text: 'Bu ses dosyasını transkribe et. Konuşulan dili koru (Türkçe ise Türkçe yaz). Sadece transkripti döndür, açıklama yapma.'
    }
  ])
  return text.trim()
}

// Chunk store
const chunkStore = new Map<string, Buffer[]>()

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const chunk = formData.get('chunk') as File
    const chunkIndex = parseInt(formData.get('chunkIndex') as string || '0')
    const totalChunks = parseInt(formData.get('totalChunks') as string || '1')
    const sessionId = formData.get('sessionId') as string
    const ext = (formData.get('ext') as string || '').toLowerCase()
    const filename = formData.get('filename') as string || 'file'

    if (!chunk) return NextResponse.json({ error: 'Chunk bulunamadı.' }, { status: 400 })

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
        progress: Math.round((received / totalChunks) * 80),
      })
    }

    const fullBuffer = Buffer.concat(chunks)
    chunkStore.delete(sessionId)

    const result = await processFile(fullBuffer, ext, filename)
    return NextResponse.json({ status: 'complete', progress: 100, ...result })

  } catch (e: any) {
    console.error('Extract error:', e)
    return NextResponse.json({ error: e.message || 'Dosya işlenemedi.' }, { status: 500 })
  }
}

async function processFile(buffer: Buffer, ext: string, filename: string) {
  // ── TXT ──
  if (ext === 'txt') {
    const content = buffer.toString('utf-8').slice(0, 15000)
    return { content, type: 'text', filename }
  }

  // ── PDF ──
  if (ext === 'pdf') {
    try {
      const { default: pdfParse } = await import('pdf-parse') as any
      let pdfData: any = null
      let parsedText = ''

      try {
        pdfData = await pdfParse(buffer, { max: 0 })
        parsedText = (pdfData?.text || '').trim()
      } catch (parseErr) {
        console.warn('[extract-file] pdf-parse failed:', parseErr)
      }

      // Metin yeterliyse direkt döndür
      if (parsedText.length >= 200) {
        return {
          content: parsedText.slice(0, 30000),
          type: 'pdf',
          filename,
          pageCount: pdfData?.numpages || 0,
        }
      }

      // Taranmış PDF → Gemini Vision'ı dene
      if (process.env.GEMINI_API_KEY) {
        try {
          console.log('[extract-file] Taranmış PDF — Gemini Vision deneniyor...')
          const geminiText = await extractWithGeminiVision(buffer, filename)
          if (geminiText.length >= 100) {
            return {
              content: geminiText.slice(0, 30000),
              type: 'pdf',
              filename,
              pageCount: pdfData?.numpages || 0,
              note: '🤖 Gemini Vision ile taranmış PDF okundu',
              engine: 'gemini-vision',
            }
          }
        } catch (geminiErr) {
          console.warn('[extract-file] Gemini Vision failed, falling back to Claude:', geminiErr)
        }
      }

      // Gemini yoksa veya başarısız → Claude fallback
      const totalPages = pdfData?.numpages || 0
      if (buffer.length <= 15 * 1024 * 1024 && totalPages <= 90) {
        const base64 = buffer.toString('base64')
        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 3000,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any,
              { type: 'text', text: 'Bu PDF dosyasinin tum metin icerigini cikar. Sadece metni dondur.' },
            ],
          }],
        }) as any
        return { content: message.content[0].text, type: 'pdf', filename, pageCount: totalPages, engine: 'claude' }
      }

      return {
        error: 'pdf_image_only',
        content: '',
        type: 'pdf',
        filename,
        message: 'Bu PDF tamamen taranmış görsel içeriyor ve metin çıkarılamadı.',
      }

    } catch (pdfErr: any) {
      return { error: 'pdf_error', content: '', type: 'pdf', filename, message: 'PDF işlenemedi.' }
    }
  }

  // ── DOCX ──
  if (ext === 'docx' || ext === 'doc') {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(buffer)
    const xmlFile = zip.file('word/document.xml')
    if (!xmlFile) throw new Error('DOCX içeriği okunamadı.')
    const xml = await xmlFile.async('string')
    const content = xml
      .replace(/<w:br[^>]*\/>/g, '\n').replace(/<w:p[ >][^>]*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n').trim().slice(0, 15000)
    return { content, type: 'docx', filename }
  }

  // ── GÖRSEL ──
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    const base64 = buffer.toString('base64')
    const mediaType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'Bu görseldeki tüm metni çıkar. Ders notu, soru veya içerik varsa olduğu gibi yaz.' },
        ],
      }],
    }) as any
    return { content: message.content[0].text, type: 'image', filename }
  }

  // ── SES (MP3, M4A, WAV, OGG) — Gemini Audio ──
  if (['mp3', 'm4a', 'wav', 'ogg', 'aac', 'flac', 'opus'].includes(ext)) {
    if (!process.env.GEMINI_API_KEY) {
      return {
        error: 'gemini_required',
        content: '',
        type: 'audio',
        filename,
        message: 'Ses dosyası işleme için Gemini API anahtarı gerekli.',
      }
    }

    try {
      const mimeMap: Record<string, string> = {
        mp3: 'audio/mpeg',
        m4a: 'audio/mp4',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        aac: 'audio/aac',
        flac: 'audio/flac',
        opus: 'audio/opus',
      }
      const mimeType = mimeMap[ext] || 'audio/mpeg'

      console.log(`[extract-file] Ses dosyası — Gemini Audio ile transkribe ediliyor: ${filename}`)
      const transcript = await extractWithGeminiAudio(buffer, mimeType, filename)

      if (!transcript) {
        return { error: 'audio_empty', content: '', type: 'audio', filename, message: 'Ses dosyasında konuşma bulunamadı.' }
      }

      return {
        content: transcript.slice(0, 30000),
        type: 'audio',
        filename,
        note: '🎤 Gemini Audio ile transkribe edildi',
        engine: 'gemini-audio',
      }
    } catch (audioErr: any) {
      console.error('[extract-file] Audio error:', audioErr)
      return {
        error: 'audio_error',
        content: '',
        type: 'audio',
        filename,
        message: `Ses dosyası işlenemedi: ${audioErr?.message || 'Bilinmeyen hata'}`,
      }
    }
  }

  return { error: 'unsupported', content: '', type: 'unknown', filename, message: `Desteklenmeyen dosya türü: .${ext}` }
}
