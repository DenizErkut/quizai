import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getPromptForType(type: string, topic: string, grade: string, difficulty: string, language: string, count: number, fileContent?: string): string {
  const langNote = `Tüm sorular ve açıklamalar ${language} dilinde olsun.`
  const gradeNote = `Seviye: ${grade}. Zorluk: ${difficulty}.`
  const topicNote = fileContent
    ? `Konu: "${topic}". Aşağıdaki içerikten sorular üret:\n${fileContent.slice(0, 3000)}`
    : `Konu: "${topic}".`

  const base = `${topicNote}\n${gradeNote}\n${langNote}\nSoru sayısı: ${count}\n\n`

  const formats: Record<string, string> = {
    multiple_choice: `${base}Çoktan seçmeli sorular üret. Her soru için 4 şık (A/B/C/D), doğru cevap indexi ve açıklama olsun.

JSON formatı (başka hiçbir şey yazma):
{
  "questions": [
    {
      "type": "multiple_choice",
      "q": "Soru metni",
      "opts": ["A şıkkı", "B şıkkı", "C şıkkı", "D şıkkı"],
      "ans": 0,
      "exp": "Açıklama"
    }
  ]
}`,

    fill_blank: `${base}Boşluk doldurma soruları üret. Cümlede kritik bir kelime/kavram boşluk bırakılmış olsun. 4 şık ver (biri doğru), doğru cevabı "blank" alanına da yaz.

JSON formatı (başka hiçbir şey yazma):
{
  "questions": [
    {
      "type": "fill_blank",
      "q": "_____ hücrenin enerji merkezidir.",
      "blank": "Mitokondri",
      "opts": ["Mitokondri", "Ribozom", "Çekirdek", "Lizozom"],
      "ans": 0,
      "exp": "Mitokondri hücresel solunum yaparak ATP üretir."
    }
  ]
}`,

    true_false: `${base}Doğru/Yanlış soruları üret. Her soru için bir ifade ver, doğruysa ans:0, yanlışsa ans:1. opts her zaman ["Doğru", "Yanlış"] olsun. Açıklamada neden doğru/yanlış olduğunu belirt.

JSON formatı (başka hiçbir şey yazma):
{
  "questions": [
    {
      "type": "true_false",
      "q": "Fotosentez sadece gündüz gerçekleşir.",
      "opts": ["Doğru", "Yanlış"],
      "ans": 0,
      "exp": "Fotosentez ışık enerjisi gerektirdiği için gündüz gerçekleşir."
    }
  ]
}`,

    matching: `${base}Eşleştirme soruları üret. Her soru için 4 kavram-tanım çifti ver. Soru metninde ne eşleştirileceğini anlat.

JSON formatı (başka hiçbir şey yazma):
{
  "questions": [
    {
      "type": "matching",
      "q": "Hücre organellerini görevleriyle eşleştirin.",
      "pairs": [
        {"left": "Mitokondri", "right": "Enerji üretimi"},
        {"left": "Ribozom", "right": "Protein sentezi"},
        {"left": "Çekirdek", "right": "DNA depolama"},
        {"left": "Lizozom", "right": "Sindirim"}
      ],
      "opts": ["Mitokondri", "Ribozom", "Çekirdek", "Lizozom"],
      "ans": 0,
      "exp": "Her organel hücrede kritik bir görev üstlenir."
    }
  ]
}`,

    ordering: `${base}Sıralama soruları üret. Her soru için 4-5 öğe ver, doğru sırasını correctOrder dizisinde belirt. items karışık sırada olsun.

JSON formatı (başka hiçbir şey yazma):
{
  "questions": [
    {
      "type": "ordering",
      "q": "Osmanlı Devleti'nin kuruluşundan çöküşüne giden olayları kronolojik sıraya koyun.",
      "items": ["Fatih İstanbul'u fethetti", "Osman Bey kurdu", "Tanzimat Fermanı", "Kurtuluş Savaşı"],
      "correctOrder": [1, 0, 2, 3],
      "opts": ["1. adım", "2. adım", "3. adım", "4. adım"],
      "ans": 0,
      "exp": "Osmanlı 1299'da kuruldu, 1453'te İstanbul fethedildi, 1839'da Tanzimat, 1923'te cumhuriyet kuruldu."
    }
  ]
}`,

    short_answer: `${base}Kısa cevap soruları üret. Her soru için örnek/model cevabı opts[0]'a yaz, ans:0 olsun. Öğrenci kendi cevabını yazacak.

JSON formatı (başka hiçbir şey yazma):
{
  "questions": [
    {
      "type": "short_answer",
      "q": "Fotosentez nedir? Hangi organelde gerçekleşir?",
      "opts": ["Fotosentez; bitkinin güneş enerjisini kullanarak su ve karbondioksitten besin (glikoz) ve oksijen üretme sürecidir. Kloroplastta gerçekleşir."],
      "ans": 0,
      "exp": "Fotosentez denklemi: 6CO2 + 6H2O + ışık → C6H12O6 + 6O2"
    }
  ]
}`
  }

  return formats[type] || formats['multiple_choice']
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles')
      .select('plan, monthly_test_count, grade, language').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    if (profile.plan === 'free' && (profile.monthly_test_count || 0) >= 10) {
      return NextResponse.json({ error: 'limit_reached' }, { status: 429 })
    }

    const body = await req.json()
    const {
      topic, questionCount = 10, difficulty = 'normal',
      language, fileContent, fileType, includeVisuals = true,
      questionType = 'multiple_choice', dailyChallenge = false
    } = body

    const lang = language || profile.language || 'Türkçe'
    const grade = profile.grade || 'ortaokul 6. sinif'

    const prompt = getPromptForType(questionType, topic, grade, difficulty, lang, questionCount, fileContent)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(clean)
    } catch {
      const match = clean.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Invalid JSON response')
      parsed = JSON.parse(match[0])
    }

    const questions = parsed.questions || []

    // Test sayısını güncelle
    if (!dailyChallenge) {
      await supabase.from('profiles').update({
        monthly_test_count: (profile.monthly_test_count || 0) + 1
      }).eq('id', user.id)
    }

    // Session kaydet
    const { data: session } = await supabase.from('quiz_sessions').insert({
      user_id: user.id,
      topic,
      grade: profile.grade,
      language: lang,
      question_count: questions.length,
      questions,
      answers: [],
      score: 0,
      pct: 0,
      completed: false,
      question_type: questionType,
    }).select('id').single()

    return NextResponse.json({ questions, sessionId: session?.id })
  } catch (error) {
    console.error('Generate quiz error:', error)
    return NextResponse.json({ error: 'Quiz üretilemedi' }, { status: 500 })
  }
}
