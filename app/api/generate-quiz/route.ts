import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

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

const CURRICULUM_SCOPE: Record<string, string> = {
  'ilkokul 1. sinif': 'Sayilari okuma/yazma (1-20), basit toplama cikarma (10a kadar), sekil tanima, gunluk hayat kelimeleri.',
  'ilkokul 2. sinif': 'Toplama cikarma (100e kadar), saat okuma (tam ve yarim), uzunluk olcme, hece ve kelime.',
  'ilkokul 3. sinif': 'Carpma islemi (2,3,4,5 ile), bolme kavrami, kesir kavrami (1/2, 1/4), cevre ve alan kavrami.',
  'ilkokul 4. sinif': 'Carpim tablosu (1-9), dort islem, ondalik gosterim (baslangic), kesirler, veri okuma.',
  'ortaokul 5. sinif': 'Dogal sayilar, tam sayilara giris, kesirler ve ondalik sayilar, yuzde kavrami (basit), alan ve cevre hesabi, veri analizi.',
  'ortaokul 6. sinif': 'Tam sayilar ve islemler, kesirler (dort islem), oran ve orani (giris), temel geometri (acilar, cokgenler), veri analizi. OBEB ve OKEK bu sinifta mufredatta YOKTUR.',
  'ortaokul 7. sinif': 'Tam sayilar (dort islem), rasyonel sayilar, oran-orani, yuzde hesabi, denklemler (basit), veri analizi, cember ve daire.',
  'ortaokul 8. sinif': 'Carpanlara ayirma, denklem sistemleri (giris), ucgenler (benzerlik), Pisagor teoremi, olasilik, istatistik.',
  'lise 9. sinif': 'Kumeler, sayi sistemleri, mutlak deger, denklem ve esitsizlikler, fonksiyon kavrami, trigonometri (giris), analitik geometri.',
  'lise 10. sinif': 'Polinomlar, ikinci derece denklemler, logaritma, trigonometri, dortgenler, olasilik.',
  'lise 11. sinif': 'Turev, integral (giris), karmasik sayilar, istatistik, ucgenlerde alan, koniler ve kureler.',
  'lise 12. sinif': 'Integral uygulamalari, dizi ve seriler, olasilik (ileri), analitik geometri (konikler).',
}

function getCurriculumNote(grade: string): string {
  const key = grade.toLowerCase().trim()
  // Try exact match first
  if (CURRICULUM_SCOPE[key]) return CURRICULUM_SCOPE[key]
  // Try normalized (remove accent chars)
  const normalized = key
    .replace(/\u0131/g, 'i')
    .replace(/\u015f/g, 's')
    .replace(/\u011f/g, 'g')
    .replace(/\u00fc/g, 'u')
    .replace(/\u00f6/g, 'o')
    .replace(/\u00e7/g, 'c')
    .replace(/\u00e2/g, 'a')
  for (const k of Object.keys(CURRICULUM_SCOPE)) {
    const kn = k
      .replace(/\u0131/g, 'i')
      .replace(/\u015f/g, 's')
      .replace(/\u011f/g, 'g')
      .replace(/\u00fc/g, 'u')
      .replace(/\u00f6/g, 'o')
      .replace(/\u00e7/g, 'c')
      .replace(/\u00e2/g, 'a')
    if (kn === normalized) return CURRICULUM_SCOPE[k]
  }
  return ''
}

function buildPrompt(p: ProfileParams): string {
  const difficultyHint: Record<string, string> = {
    ilkokul: 'Cok basit ve somut cumleler, gunluk hayattan ornekler. Soyut kavramlardan kacin.',
    ortaokul: 'Orta zorluk, kavram odakli. Formul gerektiren sorularda basit sayilar kullan.',
    lise: 'Analitik dusunme gerektiren, formul ve ilke uygulamasi icerebilir.',
    universite: 'Akademik ve teknik terimler kullanilabilir, derinlikli ve uygulamali sorular.',
  }

  const curriculumNote = getCurriculumNote(p.grade)

  const answerPattern = Array.from(
    { length: p.questionCount },
    (_, i) => i % 4
  ).join(', ')

  return `Sen Turkiye MEB mufredatina hakim deneyimli bir egitim uzmanisın.

Ogrenci profili:
- Ad: ${p.name}
- Sinif: ${p.grade}
- Yas: ${p.age}
- Cinsiyet: ${p.gender}
- Test konusu: ${p.topic}
- Yanitlama dili: ${p.language}

MEB MUFREDAT SINIRI:
${curriculumNote ? `${p.grade} icin kapsam: ${curriculumNote}` : `${p.grade} seviyesine uygun konularla sinirli tut.`}
Ust siniflara ait kavram, formul veya kisaltma KULLANMA.
Ogrencinin yasina (${p.age}) uygun bir dil kullan.

Zorluk: ${difficultyHint[p.gradeLevel] ?? ''}

Gorev: "${p.topic}" konusunda ${p.questionCount} adet coktan secmeli soru hazirla.

CEVAP DAGILIMI KURALI:
- "ans" degerlerini sirasıyla su sekilde ata: ${answerPattern}
- Yani 1. soru ans=0, 2. soru ans=1, 3. soru ans=2, 4. soru ans=3, 5. soru ans=0 ...
- Dogru cevabi o indexe yerlestir; diger siklara makul ama yanlis secenekler koy.
- ASLA tum sorularin ans degerini 0 yapma.

Diger kurallar:
- Her soruda tam olarak 4 sik (opts dizisi 4 elemanli).
- Siklar net ayrimli ama yakin zorlukta olmali.
- Aciklama 1-2 cumle, ogretici ve sade, ${p.language} dilinde yaz.
- Sorular birbirini tekrar etmemeli.

SADECE asagidaki JSON formatinda yanit ver, baska hicbir sey yazma:
{
  "questions": [
    {
      "q": "Soru metni?",
      "opts": ["Sik A", "Sik B", "Sik C", "Sik D"],
      "ans": 0,
      "exp": "Aciklama."
    }
  ]
}`
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz erisim.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Oturum gecersiz.' }, { status: 401 })
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('name, age, gender, grade, language')
    .eq('id', user.id)
    .single()

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profil bulunamadi.' }, { status: 404 })
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
    : 'universite'

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
    console.error('Claude API hatasi:', e)
    return NextResponse.json({ error: 'Sorular uretilemedi.' }, { status: 500 })
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
    return NextResponse.json({ error: 'Kayit basarisiz.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
