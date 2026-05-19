import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Desteklenen dosya tipleri
const SUPPORTED = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // ── TXT ──
    if (ext === 'txt') {
      const text = buffer.toString('utf-8').slice(0, 15000)
      return NextResponse.json({ content: text, type: 'text', filename: file.name })
    }

    // ── PDF → Claude API (native PDF support) ──
    if (ext === 'pdf') {
      const base64 = buffer.toString('base64')
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            {
              type: 'text',
              text: 'Bu PDF dosyasının tüm metin içeriğini çıkar. Sadece metni döndür, başka açıklama ekleme. Maksimum 8000 kelime.',
            },
          ],
        }],
      }) as any
      const content = message.content[0].text
      return NextResponse.json({ content, type: 'pdf', filename: file.name })
    }

    // ── DOCX → metin çıkar (basit XML parsing) ──
    if (ext === 'docx' || ext === 'doc') {
      // DOCX aslında ZIP — içindeki word/document.xml'den metin çıkar
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(buffer)
      const xmlFile = zip.file('word/document.xml')
      if (!xmlFile) return NextResponse.json({ error: 'DOCX okunamadı.' }, { status: 400 })
      const xml = await xmlFile.async('string')
      // XML tag'lerini temizle
      const text = xml
        .replace(/<w:br[^>]*\/>/g, '\n')
        .replace(/<w:p[ >][^>]*>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 15000)
      return NextResponse.json({ content: text, type: 'docx', filename: file.name })
    }

    // ── Resim → Claude Vision ile açıkla ──
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      const base64 = buffer.toString('base64')
      const mediaType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'png' ? 'image/png' : 'image/webp'
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: 'Bu görseli detaylıca açıkla. Grafik, tablo, diyagram, metin — ne varsa hepsini say. Bu açıklama eğitim soruları üretmek için kullanılacak.',
            },
          ],
        }],
      }) as any
      const content = message.content[0].text
      return NextResponse.json({ content, type: 'image', filename: file.name })
    }

    // ── Ses → OpenAI Whisper ile transcript ──
    if (['mp3', 'm4a', 'wav', 'ogg'].includes(ext)) {
      const openaiKey = process.env.OPENAI_API_KEY
      if (!openaiKey) {
        return NextResponse.json({ error: 'Ses desteği için OPENAI_API_KEY gerekli.' }, { status: 500 })
      }

      const whisperForm = new FormData()
      const blob = new Blob([buffer], { type: file.type || 'audio/mpeg' })
      whisperForm.append('file', blob, file.name)
      whisperForm.append('model', 'whisper-1')
      whisperForm.append('language', 'tr')

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: whisperForm,
      })

      if (!whisperRes.ok) {
        return NextResponse.json({ error: 'Ses dosyası işlenemedi.' }, { status: 500 })
      }

      const { text } = await whisperRes.json()
      return NextResponse.json({ content: text, type: 'audio', filename: file.name })
    }

    return NextResponse.json({ error: `Desteklenmeyen dosya türü: .${ext}` }, { status: 400 })

  } catch (e) {
    console.error('File extraction error:', e)
    return NextResponse.json({ error: 'Dosya işlenemedi.' }, { status: 500 })
  }
}

export const config = {
  api: { bodyParser: false },
}
