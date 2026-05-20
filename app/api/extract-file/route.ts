import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// Next.js App Router route segment config
export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 })
    }

    // Boyut kontrolü
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `Dosya çok büyük. Maksimum 10MB desteklenir. (${(file.size / 1024 / 1024).toFixed(1)}MB)`
      }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // ── TXT ──
    if (ext === 'txt') {
      const text = buffer.toString('utf-8').slice(0, 15000)
      return NextResponse.json({ content: text, type: 'text', filename: file.name })
    }

    // ── PDF ──
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
            } as any,
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

    // ── DOCX ──
    if (ext === 'docx' || ext === 'doc') {
      try {
        const JSZip = (await import('jszip')).default
        const zip = await JSZip.loadAsync(buffer)
        const xmlFile = zip.file('word/document.xml')
        if (!xmlFile) throw new Error('DOCX içeriği okunamadı.')
        const xml = await xmlFile.async('string')
        const text = xml
          .replace(/<w:br[^>]*\/>/g, '\n')
          .replace(/<w:p[ >][^>]*>/g, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
          .slice(0, 15000)
        return NextResponse.json({ content: text, type: 'docx', filename: file.name })
      } catch {
        return NextResponse.json({ error: 'DOCX dosyası okunamadı.' }, { status: 400 })
      }
    }

    // ── Resim ──
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
            { type: 'text', text: 'Bu görseli detaylıca açıkla. Grafik, tablo, diyagram, metin — ne varsa hepsini say. Bu açıklama eğitim soruları üretmek için kullanılacak.' },
          ],
        }],
      }) as any
      return NextResponse.json({ content: message.content[0].text, type: 'image', filename: file.name })
    }

    // ── Ses → OpenAI Whisper ──
    if (['mp3', 'm4a', 'wav', 'ogg'].includes(ext)) {
      const openaiKey = process.env.OPENAI_API_KEY
      if (!openaiKey) {
        return NextResponse.json({
          error: 'Ses desteği aktif değil. Lütfen PDF veya metin dosyası yükleyin.'
        }, { status: 400 })
      }

      const whisperForm = new FormData()
      const blob = new Blob([buffer], { type: file.type || 'audio/mpeg' })
      whisperForm.append('file', blob, file.name)
      whisperForm.append('model', 'whisper-1')

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: whisperForm,
      })

      if (!whisperRes.ok) {
        const err = await whisperRes.text()
        console.error('Whisper error:', err)
        return NextResponse.json({ error: 'Ses dosyası işlenemedi.' }, { status: 500 })
      }

      const { text } = await whisperRes.json()
      return NextResponse.json({ content: text, type: 'audio', filename: file.name })
    }

    return NextResponse.json({ error: `Desteklenmeyen dosya türü: .${ext}` }, { status: 400 })

  } catch (e: any) {
    console.error('File extraction error:', e)
    // JSON parse hatası — muhtemelen body too large
    if (e.message?.includes('JSON') || e.message?.includes('Entity')) {
      return NextResponse.json({
        error: 'Dosya çok büyük veya format hatalı. Maksimum 10MB ve PDF/TXT/DOCX/JPG/PNG desteklenir.'
      }, { status: 413 })
    }
    return NextResponse.json({ error: 'Dosya işlenemedi: ' + (e.message || 'Bilinmeyen hata') }, { status: 500 })
  }
}
