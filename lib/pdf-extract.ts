// lib/pdf-extract.ts
// Kademeli PDF metin çıkarma: önce hızlı/ucuz pdf-parse (metin katmanı
// varsa), yetersizse (taranmış/görsel PDF -- ör. "Print to PDF" ile
// üretilmiş, hiç metin katmanı olmayan dosyalar) Gemini Vision, o da
// başarısız olursa Claude (native PDF vision) ile son bir deneme.
//
// app/api/extract-file (öğrenci kendi dosyasını yükleyince) VE
// app/api/admin/meb-upload (MEB kaynak yükleme) tarafından PAYLAŞILAN,
// TEK bir kaynak. Bir öğretmen geri bildiriminde (13 Ağustos 2026,
// "Yaşayan Demokrasimiz" konusu) meb-upload'ın bu kademeli mantığı hiç
// KULLANMADIĞI, sadece bare pdf-parse ile calisip taranmis PDF'lerde
// sessizce "0.0K karakter" ürettiği bulundu -- bu dosya o eksikliği
// gideriyor.
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function callGemini(model: string, parts: any[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY!
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: 4000, temperature: 0.1 } }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Gemini API hatası: ${err?.error?.message || res.status}`)
  }
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function extractWithGeminiVision(buffer: Buffer): Promise<string> {
  const base64 = buffer.toString('base64')
  const text = await callGemini('gemini-1.5-flash', [
    { inlineData: { mimeType: 'application/pdf', data: base64 } },
    { text: 'Bu PDF dosyasının tüm metin içeriğini Türkçe olarak çıkar. Başlıkları, paragrafları ve listeleri koru. Sadece metni döndür, açıklama yapma.' },
  ])
  return text.trim()
}

export interface PdfExtractResult {
  text: string
  engine: 'pdf-parse' | 'gemini-vision' | 'claude' | 'none'
  pageCount: number
}

export async function extractPdfText(buffer: Buffer, opts?: { minLength?: number }): Promise<PdfExtractResult> {
  const minLength = opts?.minLength ?? 200
  let pageCount = 0

  try {
    const { default: pdfParse } = await import('pdf-parse') as any
    const pdfData = await pdfParse(buffer, { max: 0 })
    pageCount = pdfData?.numpages || 0
    const parsedText = (pdfData?.text || '').trim()
    if (parsedText.length >= minLength) {
      return { text: parsedText, engine: 'pdf-parse', pageCount }
    }
  } catch (e) {
    console.warn('[pdf-extract] pdf-parse başarısız:', e)
  }

  // Metin katmanı yok/yetersiz -- muhtemelen taranmış/görsel PDF
  if (process.env.GEMINI_API_KEY) {
    try {
      console.log('[pdf-extract] Metin katmanı yetersiz — Gemini Vision deneniyor...')
      const geminiText = await extractWithGeminiVision(buffer)
      if (geminiText.length >= 100) {
        return { text: geminiText, engine: 'gemini-vision', pageCount }
      }
    } catch (e) {
      console.warn('[pdf-extract] Gemini Vision başarısız, Claude denenecek:', e)
    }
  }

  // Son çare: Claude (native PDF vision) -- büyük dosyalarda sınırlı
  if (buffer.length <= 15 * 1024 * 1024 && pageCount <= 90) {
    try {
      const base64 = buffer.toString('base64')
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any,
            { type: 'text', text: 'Bu PDF dosyasının tüm metin içeriğini çıkar. Sadece metni döndür.' },
          ],
        }],
      }) as any
      const text = (message.content?.[0]?.text || '').trim()
      if (text.length > 0) return { text, engine: 'claude', pageCount }
    } catch (e) {
      console.warn('[pdf-extract] Claude fallback başarısız:', e)
    }
  }

  return { text: '', engine: 'none', pageCount }
}
