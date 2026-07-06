// app/api/reading/question/route.ts
// Öğrencinin az önce dinlediği metin parçasından TEK bir çoktan seçmeli
// dikkat/anlama sorusu üretir. Sabit aralıklarla (ör. 90sn) çağrılır.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/auth-middleware'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 30

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  const rl = await checkRateLimit(user.id, { endpoint: 'reading-question', limit: 300 })
  if (!rl.allowed) return rateLimitExceeded(rl)

  try {
    const { text, grade } = await req.json()
    if (!text || typeof text !== 'string' || text.trim().length < 30) {
      return NextResponse.json({ error: 'Soru üretmek için yeterli metin yok.' }, { status: 400 })
    }

    const prompt = `Aşağıda bir öğrencinin az önce SESLİ olarak dinlediği metin parçası var. Bu metne dayanarak öğrencinin dikkatini ve anlamasını ölçecek TEK bir çoktan seçmeli soru üret.

Kurallar:
- Soru SADECE bu metindeki bilgilerle cevaplanabilmeli, dış bilgi gerektirmemeli.
- ${grade ? `Öğrenci seviyesi: ${grade}. Dili ve zorluğu buna göre uyarla.` : 'Ortaokul seviyesine uygun dil kullan.'}
- Tam olarak 4 şık üret, sadece biri doğru olsun. Şıklar birbirine yakın uzunlukta olsun.
- Soru, metindeki küçük ama fark edilebilir bir detayı veya olayı sorsun (amaç dikkat testi, genel kültür değil).
- Soru ve şıklar Türkçe olsun.
- SADECE geçerli JSON döndür, başka hiçbir açıklama ekleme:
{"question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0}

METİN:
"""
${text.slice(0, 3000)}
"""`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = raw.replace(/```json|```/g, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(clean)
    } catch {
      const match = clean.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
      else throw new Error('Soru üretilemedi (format hatası).')
    }

    if (
      !parsed?.question ||
      !Array.isArray(parsed.options) ||
      parsed.options.length !== 4 ||
      typeof parsed.correct_index !== 'number' ||
      parsed.correct_index < 0 || parsed.correct_index > 3
    ) {
      throw new Error('Üretilen soru geçersiz formatta.')
    }

    return NextResponse.json({
      question: parsed.question,
      options: parsed.options,
      correct_index: parsed.correct_index,
    })
  } catch (e: any) {
    console.error('[reading/question]', e)
    return NextResponse.json({ error: e?.message || 'Soru üretilemedi.' }, { status: 500 })
  }
}
