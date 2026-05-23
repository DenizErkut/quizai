import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { messages, topic, language, questions, answers } = await req.json()

    const wrongQuestions = questions
      .map((q: any, i: number) => ({ ...q, userAns: answers[i]?.userAns }))
      .filter((_: any, i: number) => !answers[i]?.correct)

    const score = answers.filter((a: any) => a.correct).length
    const pct = Math.round((score / questions.length) * 100)

    const systemPrompt = `Sen Pratium AI asistanısın. Öğrencilere ${topic} konusunda yardım ediyorsun.

Öğrencinin test bilgileri:
- Konu: ${topic}
- Dil: ${language}
- Skor: %${pct} (${score}/${questions.length} doğru)
- Yanlış soru sayısı: ${wrongQuestions.length}

${wrongQuestions.length > 0 ? `Yanlış sorular:\n${wrongQuestions.map((q: any, i: number) => `${i + 1}. Soru: ${q.q}\n   Doğru cevap: ${q.opts[q.ans]}\n   Öğrencinin cevabı: ${q.opts[q.userAns]}\n   Açıklama: ${q.exp}`).join('\n\n')}` : ''}

Görevin:
- Yanlış soruları adım adım ve net açıkla
- Konuyu sıfırdan veya özet şeklinde anlat
- İstersen yeni sorular üret (şık formatında: A) B) C) D))
- Genel soruları yanıtla
- Kısa, anlaşılır, samimi ol
- Cevaplarını ${language === 'Türkçe' ? 'Türkçe' : language} ver`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ reply })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({ reply: 'Bir hata oluştu, lütfen tekrar dene.' }, { status: 500 })
  }
}
