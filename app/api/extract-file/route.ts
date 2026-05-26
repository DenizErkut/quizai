import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// In-memory chunk store (Vercel serverless — same instance)
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

    // Chunk'ı store'a ekle
    if (!chunkStore.has(sessionId)) chunkStore.set(sessionId, [])
    const chunks = chunkStore.get(sessionId)!
    chunks[chunkIndex] = chunkBuffer

    // Tüm chunk'lar gelmediyse sadece progress döndür
    const received = chunks.filter(Boolean).length
    if (received < totalChunks) {
      return NextResponse.json({
        status: 'chunk_received',
        received,
        total: totalChunks,
        progress: Math.round((received / totalChunks) * 80), // 0-80 arası
      })
    }

    // Tüm chunk'lar tamam — birleştir
    const fullBuffer = Buffer.concat(chunks)
    chunkStore.delete(sessionId)

    // Dosyayı işle
    const result = await processFile(fullBuffer, ext, filename)
    return NextResponse.json({ status: 'complete', progress: 100, ...result })

  } catch (e: any) {
    console.error('Extract error:', e)
    return NextResponse.json({ error: e.message || 'Dosya işlenemedi.' }, { status: 500 })
  }
}

async function processFile(buffer: Buffer, ext: string, filename: string) {
  if (ext === 'txt') {
    const content = buffer.toString('utf-8').slice(0, 15000)
    return { content, type: 'text', filename }
  }

  if (ext === 'pdf') {
    try {
      // AŞAMA 1: pdf-parse ile metin çıkar (sayfa sınırı yok)
      const pdfParse = (await import('pdf-parse')).default
      let pdfData: any = null
      let parsedText = ''

      try {
        pdfData = await pdfParse(buffer, { max: 0 }) // max:0 = tüm sayfalar
        parsedText = (pdfData?.text || '').trim()
      } catch (parseErr) {
        console.warn('[extract-file] pdf-parse failed, falling back:', parseErr)
      }

      // Metin yeterliyse direkt döndür (100 sayfa sınırı YOK)
      if (parsedText.length >= 200) {
        const pageCount = pdfData?.numpages || 0
        return {
          content: parsedText.slice(0, 30000),
          type: 'pdf',
          filename,
          pageCount,
          note: pageCount > 0 ? `${pageCount} sayfa işlendi` : undefined,
        }
      }

      // AŞAMA 2: Taranmış PDF — Anthropic API, 90 sayfa chunk ile
      const totalPages = pdfData?.numpages || 0

      // Küçük taranmış PDF: direkt gönder
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
        return { content: message.content[0].text, type: 'pdf', filename, pageCount: totalPages }
      }

      // Büyük taranmış PDF: chunk'lara bölerek metin çek
      const CHUNK_PAGES = 90
      const pageTexts: string[] = []
      const chunkCount = Math.ceil(Math.max(totalPages, 1) / CHUNK_PAGES)

      for (let i = 0; i < chunkCount; i++) {
        const endPage = Math.min((i + 1) * CHUNK_PAGES, totalPages)
        try {
          const chunkData = await pdfParse(buffer, { max: endPage })
          const fullText = chunkData?.text || ''
          const sliceStart = i === 0 ? 0 : Math.floor(fullText.length * (i / chunkCount))
          const chunkText = fullText.slice(sliceStart).trim()
          if (chunkText) pageTexts.push(chunkText)
        } catch {}
      }

      const combinedText = pageTexts.join('\n\n').trim()
      if (combinedText.length >= 100) {
        return {
          content: combinedText.slice(0, 30000),
          type: 'pdf',
          filename,
          pageCount: totalPages,
          note: `${totalPages} sayfa, ${chunkCount} bolumde islendi`,
        }
      }

      // Tamamen görsel PDF
      return {
        error: 'pdf_image_only',
        content: '',
        type: 'pdf',
        filename,
        message: 'Bu PDF tamamen taranmis gorsel iceriyor. Lutfen metni kopyalayip yapistirin veya Word dosyasi olarak yukleyin.',
      }

    } catch (pdfErr: any) {
      console.error('[extract-file] PDF error:', pdfErr)
      return {
        error: 'pdf_error',
        content: '',
        type: 'pdf',
        filename,
        message: 'PDF isle nemedi. Lutfen Word (.docx) veya metin (.txt) formatinda yukleyin.',
      }
    }
  }

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
          { type: 'text', text: 'Bu görseli detaylıca açıkla. Grafik, tablo, diyagram, metin varsa hepsini say. Eğitim soruları üretmek için kullanılacak.' },
        ],
      }],
    }) as any
    return { content: message.content[0].text, type: 'image', filename }
  }

  if (['mp3', 'm4a', 'wav', 'ogg'].includes(ext)) {
    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) throw new Error('Ses desteği aktif değil.')
    const whisperForm = new FormData()
    whisperForm.append('file', new Blob([new Uint8Array(buffer)]), filename)
    whisperForm.append('model', 'whisper-1')
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: whisperForm,
    })
    if (!res.ok) throw new Error('Ses dosyası işlenemedi.')
    const { text } = await res.json()
    return { content: text, type: 'audio', filename }
  }

  throw new Error(`Desteklenmeyen format: .${ext}`)
}
