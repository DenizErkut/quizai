import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const maxDuration = 60
export const runtime = 'nodejs'

// ─── SINAV FORMATLARI ────────────────────────────────────────────────────────
export const EXAM_FORMATS = {
  LGS: {
    label: 'LGS',
    fullName: 'Liselere Geçiş Sınavı',
    duration: 80,
    sections: [
      { id: 'turkce',    label: 'Türkçe',              count: 20, subject: 'Türkçe',                    grade: 'ortaokul 8. sinif', netCoef: 4 },
      { id: 'matematik', label: 'Matematik',            count: 20, subject: 'Matematik',                 grade: 'ortaokul 8. sinif', netCoef: 4 },
      { id: 'fen',       label: 'Fen Bilimleri',        count: 20, subject: 'Fen Bilimleri',             grade: 'ortaokul 8. sinif', netCoef: 4 },
      { id: 'inkilap',   label: 'T.C. İnkılap Tarihi', count: 10, subject: 'T.C. İnkılap Tarihi',       grade: 'ortaokul 8. sinif', netCoef: 4 },
      { id: 'ingilizce', label: 'İngilizce',            count: 10, subject: 'İngilizce',                 grade: 'ortaokul 8. sinif', netCoef: 4 },
      { id: 'din',       label: 'Din Kültürü',          count: 10, subject: 'Din Kültürü ve Ahlak',      grade: 'ortaokul 8. sinif', netCoef: 4 },
    ],
    scoring: { correct: 4, wrong: -1, base: 0 },
    maxScore: 500,
    description: '90 soru · 80 dakika · Net × 4 puan',
    targetAudience: 'ortaokul',
    color: '#6366f1',
  },
  TYT: {
    label: 'TYT',
    fullName: 'Temel Yeterlilik Testi',
    duration: 135,
    sections: [
      { id: 'turkce',    label: 'Türkçe',          count: 40, subject: 'Türkçe',          grade: 'lise 12. sinif', netCoef: 1 },
      { id: 'sosyal',    label: 'Sosyal Bilimler',  count: 20, subject: 'Sosyal Bilimler', grade: 'lise 12. sinif', netCoef: 1 },
      { id: 'matematik', label: 'Temel Matematik',  count: 40, subject: 'Matematik',       grade: 'lise 12. sinif', netCoef: 1 },
      { id: 'fen',       label: 'Fen Bilimleri',    count: 20, subject: 'Fen Bilimleri',   grade: 'lise 12. sinif', netCoef: 1 },
    ],
    scoring: { correct: 1, wrong: -0.25, base: 0 },
    maxScore: 400,
    description: '120 soru · 135 dakika · Net puan sistemi',
    targetAudience: 'lise',
    color: '#0ea5e9',
  },
  AYT: {
    label: 'AYT',
    fullName: 'Alan Yeterlilik Testi',
    duration: 180,
    sections: [
      { id: 'matematik', label: 'Matematik',             count: 40, subject: 'Matematik İleri',                  grade: 'lise 12. sinif', netCoef: 1.2 },
      { id: 'fizik',     label: 'Fizik',                 count: 14, subject: 'Fizik',                            grade: 'lise 12. sinif', netCoef: 1.2 },
      { id: 'kimya',     label: 'Kimya',                 count: 13, subject: 'Kimya',                            grade: 'lise 12. sinif', netCoef: 1.2 },
      { id: 'biyoloji',  label: 'Biyoloji',              count: 13, subject: 'Biyoloji',                         grade: 'lise 12. sinif', netCoef: 1.2 },
      { id: 'edebiyat',  label: 'Türk Dili ve Edebiyatı',count: 24, subject: 'Türk Edebiyatı',                  grade: 'lise 12. sinif', netCoef: 1.2 },
      { id: 'tarih1',    label: 'Tarih-1',               count: 10, subject: 'Tarih',                            grade: 'lise 12. sinif', netCoef: 1.2 },
      { id: 'cografya1', label: 'Coğrafya-1',            count: 6,  subject: 'Coğrafya',                        grade: 'lise 12. sinif', netCoef: 1.2 },
      { id: 'tarih2',    label: 'Tarih-2',               count: 11, subject: 'Çağdaş Türk ve Dünya Tarihi',     grade: 'lise 12. sinif', netCoef: 1.2 },
      { id: 'cografya2', label: 'Coğrafya-2',            count: 11, subject: 'Coğrafya',                        grade: 'lise 12. sinif', netCoef: 1.2 },
      { id: 'felsefe',   label: 'Felsefe Grubu',         count: 12, subject: 'Felsefe',                         grade: 'lise 12. sinif', netCoef: 1.2 },
      { id: 'din',       label: 'Din',                   count: 6,  subject: 'Din Kültürü',                     grade: 'lise 12. sinif', netCoef: 1.2 },
    ],
    scoring: { correct: 1, wrong: -0.25, base: 0 },
    maxScore: 500,
    description: '160 soru · 180 dakika · Sayısal / Sözel / EA',
    targetAudience: 'lise',
    color: '#f59e0b',
  },
  KPSS_GENEL: {
    label: 'KPSS',
    fullName: 'KPSS Genel Yetenek / Genel Kültür',
    duration: 120,
    sections: [
      { id: 'turkce',      label: 'Türkçe',           count: 30, subject: 'Türkçe',           grade: 'universite mezun', netCoef: 1 },
      { id: 'matematik',   label: 'Matematik',         count: 30, subject: 'Matematik',        grade: 'universite mezun', netCoef: 1 },
      { id: 'tarih',       label: 'Tarih',             count: 16, subject: 'Türk Tarihi',      grade: 'universite mezun', netCoef: 1 },
      { id: 'cografya',    label: 'Coğrafya',          count: 7,  subject: 'Coğrafya',         grade: 'universite mezun', netCoef: 1 },
      { id: 'vatandaslik', label: 'Vatandaşlık',       count: 7,  subject: 'Vatandaşlık',      grade: 'universite mezun', netCoef: 1 },
      { id: 'ataturk',     label: 'Atatürk İlkeleri',  count: 10, subject: 'Atatürk İlkeleri', grade: 'universite mezun', netCoef: 1 },
    ],
    scoring: { correct: 1, wrong: -0.25, base: 0 },
    maxScore: 100,
    description: '100 soru · 120 dakika · GY + GK',
    targetAudience: 'universite',
    color: '#10b981',
  },
} as const

type ExamKey = keyof typeof EXAM_FORMATS

function buildSectionPrompt(subject: string, grade: string, count: number, examType: string): string {
  return `Sen ${examType} sınavı için soru hazırlayan bir eğitim uzmanısın.
Ders: ${subject}
Seviye: ${grade}
Soru sayısı: ${count}

KURALLAR:
- Gerçek ${examType} sınav sorusu formatında, MEB müfredatına uygun
- 4 şık (A/B/C/D), tek doğru cevap
- Zorluk dağılımı: %30 kolay, %50 orta, %20 zor
- Güncel ve doğru bilgi içeren sorular
- Kısa açıklama ekle

SADECE geçerli JSON döndür, markdown yok:
{"questions":[{"q":"Soru metni","opts":["A şıkkı","B şıkkı","C şıkkı","D şıkkı"],"ans":0,"exp":"Kısa açıklama","difficulty":"easy"}]}`
}

export async function GET() {
  return NextResponse.json({ formats: EXAM_FORMATS })
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('plan, grade').eq('id', user.id).single()

  if (!profile) return NextResponse.json({ error: 'Profil bulunamadı.' }, { status: 404 })
  if (profile.plan === 'free') return NextResponse.json({ error: 'premium_required' }, { status: 403 })

  const body = await req.json()
  const { examType, sectionIds, demo } = body as { examType: ExamKey; sectionIds?: string[]; demo?: boolean }

  const format = EXAM_FORMATS[examType]
  if (!format) return NextResponse.json({ error: 'Geçersiz sınav türü.' }, { status: 400 })

  const sectionsToGenerate = sectionIds
    ? format.sections.filter((s: any) => sectionIds.includes(s.id))
    : format.sections

  // Demo: her bölümden 4 soru (hızlı)
  const countMultiplier = demo ? 0.2 : 1

  try {
    const results: Record<string, any[]> = {}

    const CHUNK = 3
    for (let i = 0; i < sectionsToGenerate.length; i += CHUNK) {
      const chunk = sectionsToGenerate.slice(i, i + CHUNK)
      await Promise.all(chunk.map(async (section: any) => {
        const sectionCount = Math.max(4, Math.round(section.count * countMultiplier))
        const prompt = buildSectionPrompt(section.subject, section.grade, sectionCount, format.label)

        try {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 6000,
            system: 'Sen Türk eğitim sisteminde sınav soruları hazırlayan bir uzmansın. Sadece geçerli JSON döndür, markdown kullanma.',
            messages: [{ role: 'user', content: prompt }],
          })

          const text = response.content[0].type === 'text' ? response.content[0].text : ''
          const clean = text.replace(/```json|```/g, '').trim()
          const parsed = JSON.parse(clean)
          results[section.id] = (parsed.questions || []).slice(0, sectionCount)
        } catch (e) {
          console.error(`[generate-exam] section ${section.id} failed:`, e)
          results[section.id] = []
        }
      }))
    }

    const { data: examRow } = await supabase
      .from('exam_sessions')
      .insert({
        user_id: user.id,
        exam_type: examType,
        sections: results,
        format: JSON.parse(JSON.stringify(format)),
        completed: false,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle()

    return NextResponse.json({ examId: examRow?.id, examType, format, sections: results })
  } catch (error) {
    console.error('[generate-exam] error:', error)
    return NextResponse.json({ error: 'Sınav oluşturulamadı.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { examId, answers, timeSpent, examType } = await req.json()
  const format = EXAM_FORMATS[examType as ExamKey]
  if (!format) return NextResponse.json({ error: 'Geçersiz sınav türü.' }, { status: 400 })

  const sectionNets: Record<string, { correct: number; wrong: number; empty: number; net: number }> = {}
  let totalNet = 0

  for (const [sectionId, sectionAnswers] of Object.entries(answers as Record<string, any[]>)) {
    const section = (format.sections as unknown as any[]).find((s: any) => s.id === sectionId)
    if (!section) continue

    let correct = 0, wrong = 0, empty = 0
    ;(sectionAnswers || []).forEach((ans: any) => {
      if (ans === null || ans === undefined) { empty++; return }
      if (ans.correct === true) correct++
      else wrong++
    })

    const net = Math.max(0, correct - wrong * 0.25)
    sectionNets[sectionId] = { correct, wrong, empty, net }
    totalNet += net * (section.netCoef || 1)
  }

  const maxPossibleNet = (format.sections as unknown as any[]).reduce((sum: number, s: any) => sum + s.count * (s.netCoef || 1), 0)
  const estimatedScore = maxPossibleNet > 0
    ? Math.round((totalNet / maxPossibleNet) * format.maxScore)
    : 0

  await supabase
    .from('exam_sessions')
    .update({
      answers,
      section_nets: sectionNets,
      total_net: totalNet,
      estimated_score: estimatedScore,
      time_spent: timeSpent,
      completed: true,
      completed_at: new Date().toISOString(),
    })
    .eq('id', examId)
    .eq('user_id', user.id)

  return NextResponse.json({ sectionNets, totalNet, estimatedScore })
}
