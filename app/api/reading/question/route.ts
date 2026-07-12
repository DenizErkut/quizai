// app/api/reading/question/route.ts
// Öğrencinin az önce dinlediği metin parçasından, dikkatini/anlamasını ölçmek
// için TEK bir çoktan seçmeli soru üretir. Sabit aralıklarla (ör. 90sn) çağrılır.
//
// NOT: Önceden aynı anda 3 soru üretiliyordu, ama modelin 3 sorunun TAMAMINI
// (her biri tam 4 şıklı) hatasız formatta üretme oranı düşüktü — bu da üretimde
// sık sık "soru hazırlanamadı" hatasına yol açıyordu. Tek soru çok daha güvenilir.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/auth-middleware'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 30

const anthropic = new Anthropic()
const QUESTION_COUNT = 1

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
{"questions": [
  {"question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0}
]}

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
      else throw new Error('Sorular üretilemedi (format hatası).')
    }

    const questions = parsed?.questions
    // correct_index bazen sayı yerine "0" gibi string gelebiliyor — normalize et
    if (Array.isArray(questions)) {
      questions.forEach((q: any) => {
        if (q && typeof q.correct_index === 'string' && /^\d+$/.test(q.correct_index)) {
          q.correct_index = parseInt(q.correct_index, 10)
        }
      })
    }
    if (
      !Array.isArray(questions) || questions.length < QUESTION_COUNT ||
      questions.some((q: any) =>
        !q?.question || !Array.isArray(q.options) || q.options.length !== 4 ||
        typeof q.correct_index !== 'number' || q.correct_index < 0 || q.correct_index > 3
      )
    ) {
      throw new Error('Üretilen sorular geçersiz formatta.')
    }

    return NextResponse.json({
      questions: questions.slice(0, QUESTION_COUNT).map((q: any) => ({
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
      })),
    })
  } catch (e: any) {
    console.error('[reading/question]', e)
    return NextResponse.json({ error: e?.message || 'Sorular üretilemedi.' }, { status: 500 })
  }
}
