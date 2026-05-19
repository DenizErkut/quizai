import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('name, age, gender, grade, language')
    .eq('id', user.id)
    .single()

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profil bulunamadı.' }, { status: 404 })
  }

  const body = await req.json()
  const topic: string = body.topic?.trim()
  const questionCount: number = Math.min(body.questionCount ?? 10, 20)

  if (!topic) {
    return NextResponse.json({ error: 'Konu belirtilmedi.' }, { status: 400 })
  }

  const gradeLevel = profile.grade.startsWith('ilk') ? 'ilkokul'
    : profile.grade.startsWith('orta') ? 'ortaokul'
    : profile.grade.startsWith('lise') ? 'lise'
    : 'üniversite'

  const prompt = buildPrompt({
    name: profile.name,
    age: profile.age,
    gender: profile.gender,
    grade: profile.grade,
    gradeLevel,
    language: profile.language,
    topic,
    questionCount,
  })

  let questions: Question[]
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (message.content[0] as { text: string }).text
      .replace(/```json|```/g, '')
      .trim()
    const parsed = JSON.parse(raw)
    questions = parsed.questions

    // Şıkları karıştır — doğru cevap index'ini güncelle
    questions = questions.map((q: Question) => {
      const correctOpt = q.opts[q.ans]
      const shuffled = [...q.opts].sort(() => Math.random() - 0.5)
      return {
        ...q,
        opts: shuffled,
        ans: shuffled.indexOf(correctOpt),
      }
    })
  } catch (e) {
    console.error('Claude API hatası:', e)
    return NextResponse.json({ error: 'Sorular üretilemedi.' }, { status: 500 })
  }

  const { data: session } = await supabase
    .from('quiz_sessions')
    .insert({
      user_id: user.id,
      topic,
      grade: profile.grade,
      language: profile.language,
      question_count: questionCount,
      questions,
      answers: [],
      completed: false,
    })
    .select('id')
    .single()

  return NextResponse.json({
    sessionId: session?.id ?? null,
    questions,
    profile: {
      name: profile.name,
      grade: profile.grade,
      language: profile.language,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { sessionId, answers, score } = await req.json()

  const { error } = await supabase
    .from('quiz_sessions')
    .update({ answers, score, completed: true })
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Kayıt başarısız.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

interface ProfileParams {
  name: string
  age: number
  gender: string
  grade: string
  gradeLevel: string
  language: string
  topic: string
  questionCount: number
}

interface Question {
  q: string
  opts: string[]
  ans: number
  exp: string
}

// Türkiye MEB müfredatına göre sınıf bazlı kapsam tanımları
const CURRICULUM_SCOPE: Record<string, string> = {
  'ilkokul 1. sınıf': 'Sayıları okuma/yazma (1-20), basit toplama çıkarma (10'a kadar), şekil tanıma, günlük hayat kelimeleri.',
  'ilkokul 2. sınıf': 'Toplama çıkarma (100'e kadar), saat okuma (tam ve yarım), uzunluk ölçme, hece ve kelime.',
  'ilkokul 3. sınıf': 'Çarpma işlemi (2,3,4,5 ile), bölme kavramı, kesir kavramı (1/2, 1/4), çevre ve alan kavramı.',
  'ilkokul 4. sınıf': 'Çarpım tablosu (1-9), dört işlem, ondalık gösterim (başlangıç), kesirler, veri okuma.',
  'ortaokul 5. sınıf': 'Doğal sayılar, tam sayılara giriş, kesirler ve ondalık sayılar, yüzde kavramı (basit), alan ve çevre hesabı, veri analizi.',
  'ortaokul 6. sınıf': 'Tam sayılar ve işlemler, kesirler (dört işlem), oran ve orantı (giriş), temel geometri (açılar, çokgenler), veri analizi. NOT: OBEB ve OKEK 6. sınıfta müfredatta YOKTUR, kullanma.',
  'ortaokul 7. sınıf': 'Tam sayılar (dört işlem), rasyonel sayılar, oran-orantı, yüzde hesabı, denklemler (basit), veri analizi, çember ve daire (alan-çevre).',
  'ortaokul 8. sınıf': 'Çarpanlara ayırma, denklem sistemleri (giriş), üçgenler (benzerlik), Pisagor teoremi, olasılık, istatistik.',
  'lise 9. sınıf': 'Kümeler, sayı sistemleri, mutlak değer, denklem ve eşitsizlikler, fonksiyon kavramı, trigonometri (giriş), analitik geometri (nokta ve doğru).',
  'lise 10. sınıf': 'Polinomlar, ikinci derece denklemler, logaritma, trigonometri, dörtgenler, olasılık.',
  'lise 11. sınıf': 'Türev, integral (giriş), karmaşık sayılar, istatistik, üçgenlerde alan, koniler ve küreler.',
  'lise 12. sınıf': 'İntegral uygulamaları, dizi ve seriler, olasılık (ileri), analitik geometri (konikler).',
}

function getCurriculumNote(grade: string): string {
  const key = grade.toLowerCase().trim()
  return CURRICULUM_SCOPE[key] ?? ''
}

function buildPrompt(p: ProfileParams): string {
  const difficultyHint: Record<string, string> = {
    ilkokul:    'Çok basit ve somut cümleler, günlük hayattan örnekler. Soyut kavramlardan kaçın.',
    ortaokul:   'Orta zorluk, kavram odaklı. Formül gerektiren sorularda basit sayılar kullan.',
    lise:       'Analitik düşünme gerektiren, formül ve ilke uygulaması içerebilir.',
    üniversite: 'Akademik ve teknik terimler kullanılabilir, derinlikli ve uygulamalı sorular.',
  }

  const curriculumNote = getCurriculumNote(p.grade)

  const answerPattern = Array.from(
    { length: p.questionCount },
    (_, i) => i % 4
  ).join(', ')

  return `Sen Türkiye MEB müfredatına hâkim deneyimli bir eğitim uzmanısın.

Öğrenci profili:
- Ad: ${p.name}
- Sınıf: ${p.grade}
- Yaş: ${p.age} yaşında
- Cinsiyet: ${p.gender}
- Test konusu: ${p.topic}
- Yanıt dili: ${p.language}

MEB MÜFREDAт SINIRI — ÇOK ÖNEMLİ:
${curriculumNote ? `${p.grade} için MEB müfredatı kapsamı: ${curriculumNote}` : `${p.grade} seviyesine uygun, bu sınıfta öğretilen konularla sınırlı tut.`}

Bu sınıfın MÜFREDATINDAKİ konuları sor. Üst sınıflara ait kavram, formül veya kısaltma KULLANMA.
Öğrencinin yaşına (${p.age}) ve bilgi birikimine uygun bir dil kullan.

Zorluk: ${difficultyHint[p.gradeLevel] ?? ''}

Görev: "${p.topic}" konusunda ${p.questionCount} adet çoktan seçmeli soru hazırla.

KRİTİK KURAL — CEVAP DAĞILIMI:
- "ans" değerlerini sırayla şöyle ata: ${answerPattern}
- Yani 1. soru ans=0, 2. soru ans=1, 3. soru ans=2, 4. soru ans=3, 5. soru ans=0 ...
- Doğru cevabı o index'e yerleştir; diğer şıklara makul ama yanlış seçenekler koy.
- ASLA tüm soruların ans değerini 0 yapma.

Diğer kurallar:
- Her soruda tam olarak 4 şık (opts dizisi 4 elemanlı).
- Şıklar net ayrımlı ama yakın zorlukta olmalı.
- Açıklama 1-2 cümle, öğretici ve sade, ${p.language} dilinde.
- Sorular birbirini tekrar etmemeli.

SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:
{
  "questions": [
    {
      "q": "Soru metni?",
      "opts": ["Şık A", "Şık B", "Şık C", "Şık D"],
      "ans": 0,
      "exp": "Açıklama."
    }
  ]
}`
}
