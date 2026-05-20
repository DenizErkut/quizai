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
    const base64 = buffer.toString('base64')
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any,
          { type: 'text', text: 'Bu PDF dosyasının tüm metin içeriğini çıkar. Sadece metni döndür. Maksimum 8000 kelime.' },
        ],
      }],
    }) as any
    return { content: message.content[0].text, type: 'pdf', filename }
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
      model: 'claude-sonnet-4-20250514',
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
