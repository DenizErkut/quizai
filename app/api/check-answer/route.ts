import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 30
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  // Auth kontrolü
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  // Rate limiting — 200 istek/gün
  try {
    const rlDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const today = new Date().toISOString().split('T')[0]
    const { data: rl } = await rlDb.from('api_rate_limits').select('id, count').eq('user_id', user.id).eq('endpoint', 'check-answer').eq('window_date', today).maybeSingle()
    if (rl) {
      if (rl.count >= 200) return NextResponse.json({ error: 'Günlük limit aşıldı.', limit: 200 }, { status: 429 })
      await rlDb.from('api_rate_limits').update({ count: rl.count + 1 }).eq('id', rl.id)
    } else { await rlDb.from('api_rate_limits').insert({ user_id: user.id, endpoint: 'check-answer', count: 1, window_date: today }) }
  } catch { /* devam et */ }

  try {
    const { question, correctAnswer, userAnswer, language } = await req.json()

    // Normalize yardımcı fonksiyon
    const normalize = (s: string) => s
      .toString()
      .trim()
      .toLowerCase()
      .replace(/,/g, '.')      // Türkçe virgül → nokta (2,7 → 2.7)
      .replace(/\s+/g, ' ')

    const normCorrect = normalize(correctAnswer)
    const normUser = normalize(userAnswer)

    // Sayısal cevap kontrolü — matematik/fen soruları için AI bypass
    const isNumeric = (s: string) => /^-?\d+(\.\d+)?$/.test(s)
    if (isNumeric(normCorrect) && isNumeric(normUser)) {
      const correct = Math.abs(parseFloat(normCorrect) - parseFloat(normUser)) < 0.0001
      return NextResponse.json({ correct })
    }

    // Tam eşleşme kontrolü (case-insensitive, trim)
    if (normCorrect === normUser) {
      return NextResponse.json({ correct: true })
    }

    // Kısa cevap (≤3 kelime) — AI'sız direkt karşılaştır, partial match yok
    const wordCount = normCorrect.split(' ').length
    if (wordCount <= 2) {
      // Sadece tam eşleşme veya içerme (her iki yönde)
      const correct = normCorrect === normUser ||
        (normCorrect.length > 3 && normUser === normCorrect)
      return NextResponse.json({ correct })
    }

    // Uzun/açıklama gerektiren cevaplar için AI kullan
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `You are a teacher grading a fill-in-the-blank question.

Question: ${question}
Correct answer: ${correctAnswer}
Student answer: ${userAnswer}

Rules:
- For factual/exact answers: only accept if meaning is identical
- Do NOT accept numerically different answers as correct
- Minor spelling variations are OK for non-numeric answers
- Synonyms are OK only if meaning is truly equivalent

Respond with ONLY: {"correct": true} or {"correct": false}`
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const result = JSON.parse(text)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ correct: false })
  }
}
