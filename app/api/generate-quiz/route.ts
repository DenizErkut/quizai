import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface ProfileParams {
  name: string; age: number; gender: string; grade: string
  gradeLevel: string; language: string; topic: string
  questionCount: number; difficulty: string
  fileContent?: string; fileType?: string
  includeVisuals?: boolean
}

interface Question {
  q: string
  opts: string[]
  ans: number
  exp: string
  svg?: string        // opsiyonel SVG — görsel sorular için
  table?: string[][]  // opsiyonel tablo verisi
  qtype?: 'text' | 'svg' | 'table'
}

const CURRICULUM_SCOPE: Record<string, string> = {
  'ilkokul 1. sinif': 'Sayilari okuma/yazma (1-20), basit toplama cikarma (10a kadar), sekil tanima.',
  'ilkokul 2. sinif': 'Toplama cikarma (100e kadar), saat okuma (tam ve yarim), uzunluk olcme.',
  'ilkokul 3. sinif': 'Carpma islemi (2,3,4,5 ile), bolme kavrami, kesir kavrami (1/2, 1/4).',
  'ilkokul 4. sinif': 'Carpim tablosu (1-9), dort islem, ondalik gosterim (baslangic), kesirler.',
  'ortaokul 5. sinif': 'Dogal sayilar, tam sayilara giris, kesirler ve ondalik sayilar, yuzde kavrami (basit).',
  'ortaokul 6. sinif': 'Tam sayilar ve islemler, kesirler (dort islem), oran ve orani (giris), temel geometri. OBEB ve OKEK bu sinifta YOKTUR.',
  'ortaokul 7. sinif': 'Tam sayilar (dort islem), rasyonel sayilar, oran-orani, yuzde hesabi, denklemler (basit).',
  'ortaokul 8. sinif': 'Carpanlara ayirma, denklem sistemleri (giris), ucgenler, Pisagor teoremi, olasilik.',
  'lise 9. sinif': 'Kumeler, sayi sistemleri, mutlak deger, denklem ve esitsizlikler, fonksiyon kavrami.',
  'lise 10. sinif': 'Polinomlar, ikinci derece denklemler, logaritma, trigonometri, dortgenler.',
  'lise 11. sinif': 'Turev, integral (giris), karmasik sayilar, istatistik.',
  'lise 12. sinif': 'Integral uygulamalari, dizi ve seriler, olasilik (ileri).',
}

const DIFFICULTY_HINTS: Record<string, string> = {
  kolay: 'KOLAY: Temel tanim ve kavram sorulari. Dogrudan hatirlama. Siklar cok belirgin farkli.',
  normal: 'NORMAL: Mufredat seviyesinde standart sorular. Kavramin uygulamasi.',
  zor: 'ZOR: Analiz ve sentez gerektiren. Birden fazla adim. Siklar birbirine yakin.',
  'cok zor': 'COK ZOR: Olimpiyat seviyesi. Derin analiz, yaratici dusunme. Zekice tuzaklar iceriyor.',
}

function getCurriculumNote(grade: string): string {
  const normalized = grade.toLowerCase().trim()
    .replace(/\u0131/g, 'i').replace(/\u015f/g, 's').replace(/\u011f/g, 'g')
    .replace(/\u00fc/g, 'u').replace(/\u00f6/g, 'o').replace(/\u00e7/g, 'c')
  for (const [k, v] of Object.entries(CURRICULUM_SCOPE)) {
    const kn = k.replace(/\u0131/g, 'i').replace(/\u015f/g, 's').replace(/\u011f/g, 'g')
      .replace(/\u00fc/g, 'u').replace(/\u00f6/g, 'o').replace(/\u00e7/g, 'c')
    if (kn === normalized) return v
  }
  return ''
}

function buildPrompt(p: ProfileParams): string {
  const curriculumNote = getCurriculumNote(p.grade)
  const difficultyHint = DIFFICULTY_HINTS[p.difficulty] || DIFFICULTY_HINTS['normal']
  const answerPattern = Array.from({ length: p.questionCount }, (_, i) => i % 4).join(', ')

  const fileSection = p.fileContent ? `
DOSYA ICERIGI (bu icerikten sorular uret):
---
${p.fileContent.slice(0, 6000)}
---
Not: Sorulari bu dosya iceriginden uret. Konu olarak "${p.topic}" kullan.
` : ''

  const visualSection = p.includeVisuals ? `
GORSEL SORU TALIMATI:
Sorularin yaklasik %30-40'i gorsel ierikli olabilir. Gorsel soru olusturmak istediginde:
- "qtype": "svg" yaz
- "svg" alanina gecerli bir SVG kodu yaz (viewBox="0 0 400 250", width/height olmadan)
- SVG icinde: cizgi grafigi, sutun grafigi, pasta grafik, geometrik sekil, koordinat sistemi
- SVG renkleri: #5b4cf5 (ana), #16a34a (yesil), #dc2626 (kirmizi), #d97706 (turuncu), #64748b (gri)
- SVG font: font-family="sans-serif" kullan
- Soru metni SVG'ye referans vermeli: "Asagidaki grafige gore..." veya "Sekilye bakildiginda..."
Gorsel olmayan sorular icin "qtype": "text" yaz, "svg" alani olmayacak.
` : ''

  return `Sen Turkiye MEB mufredatina hakim deneyimli bir egitim uzmanisın.

Ogrenci profili:
- Ad: ${p.name}
- Sinif: ${p.grade}
- Yas: ${p.age}
- Cinsiyet: ${p.gender}
- Test konusu: ${p.topic}
- Yanitlama dili: ${p.language}
- Zorluk: ${p.difficulty.toUpperCase()}
${fileSection}
MEB MUFREDAT SINIRI:
${curriculumNote ? `${p.grade} icin kapsam: ${curriculumNote}` : `${p.grade} seviyesine uygun tut.`}

ZORLUK: ${difficultyHint}
${visualSection}
Gorev: ${p.questionCount} adet coktan secmeli soru hazirla.

CEVAP DAGILIMI:
- "ans" degerlerini sirasıyla ata: ${answerPattern}
- ASLA hepsini ans=0 yapma.

Kurallar:
- Her soruda tam olarak 4 sik (opts 4 elemanli).
- Aciklama 1-2 cumle, ogretici, ${p.language} dilinde.
- Sorular birbirini tekrar etmemeli.

SADECE asagidaki JSON formatinda yanit ver, baska hicbir sey yazma:
{
  "questions": [
    {
      "qtype": "text",
      "q": "Soru metni?",
      "opts": ["A", "B", "C", "D"],
      "ans": 0,
      "exp": "Aciklama.",
      "svg": null
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
  ) as any

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Oturum gecersiz.' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('profiles').select('name, age, gender, grade, language').eq('id', user.id).single()
  if (profileErr || !profile) return NextResponse.json({ error: 'Profil bulunamadi.' }, { status: 404 })

  const body = await req.json()
  const topic: string = body.topic?.trim()
  const questionCount: number = Math.min(body.questionCount ?? 10, 20)
  const difficulty: string = body.difficulty || 'normal'
  const language: string = body.language || profile.language
  const fileContent: string | undefined = body.fileContent
  const fileType: string | undefined = body.fileType
  const includeVisuals: boolean = body.includeVisuals ?? true

  if (!topic) return NextResponse.json({ error: 'Konu belirtilmedi.' }, { status: 400 })

  const gradeLevel = profile.grade.startsWith('ilk') ? 'ilkokul'
    : profile.grade.startsWith('orta') ? 'ortaokul'
    : profile.grade.startsWith('lise') ? 'lise'
    : 'universite'

  const prompt = buildPrompt({
    name: profile.name, age: profile.age, gender: profile.gender,
    grade: profile.grade, gradeLevel, language, topic, questionCount,
    difficulty, fileContent, fileType, includeVisuals,
  })

  let questions: Question[]
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (message.content[0] as { text: string }).text
      .replace(/```json|```/g, '').trim()
    questions = JSON.parse(raw).questions

    // Şıkları karıştır — doğru cevap indexini güncelle
    questions = questions.map((q: Question) => {
      const correctOpt = q.opts[q.ans]
      const shuffled = [...q.opts].sort(() => Math.random() - 0.5)
      return {
        ...q,
        opts: shuffled,
        ans: shuffled.indexOf(correctOpt),
        qtype: q.qtype || (q.svg ? 'svg' : 'text'),
      }
    })
  } catch (e) {
    console.error('Claude API hatasi:', e)
    return NextResponse.json({ error: 'Sorular uretilemedi.' }, { status: 500 })
  }

  const { data: session } = await supabase
    .from('quiz_sessions')
    .insert({
      user_id: user.id, topic, grade: profile.grade, language,
      question_count: questionCount, questions, answers: [], completed: false,
    })
    .select('id').single()

  return NextResponse.json({
    sessionId: session?.id ?? null,
    questions,
    profile: { name: profile.name, grade: profile.grade, language },
  })
}

export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { sessionId, answers, score } = await req.json()
  const { error } = await supabase
    .from('quiz_sessions')
    .update({ answers, score, completed: true })
    .eq('id', sessionId).eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Kayit basarisiz.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
