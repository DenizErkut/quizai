import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { createClient } from '@/lib/supabase/server-create-client'
import { checkMinorConsentBlock } from '@/lib/identity/client'
import { balanceAnswerPositions } from '@/lib/question-bank'
import { callOpenAI } from '@/lib/openai'
import { EXAM_FORMATS, resolveExamFormat, type ExamFormat, type ExamSection } from '@/lib/exam-system'
import { createHash } from 'node:crypto'

const anthropic = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const maxDuration = 120
export const runtime = 'nodejs'

type ExamKey = keyof typeof EXAM_FORMATS

// 18 Ağustos 2026'da bulundu: generate-quiz/route.ts'te ("Serbest Pratik"
// testleri) İngilizce dersi için önce eklenen dil kuralı, bu dosyadaki
// (LGS/TYT/AYT/KPSS sınav SİMÜLASYONU) soru üretimine HİÇ uygulanmamıştı —
// buradaki prompt tamamen ayrı ve dil farkındalığı sıfırdı, LGS'nin
// "İngilizce" bölümü dahil her şey doğrudan Türkçe üretiliyordu. Kullanıcı
// geri bildirimiyle bulundu, aynı kural burada da uygulanıyor.
const FOREIGN_LANGUAGE_SUBJECTS = ['ingilizce', 'almanca', 'fransızca', 'fransizca', 'ispanyolca', 'arapça', 'arapca', 'rusça', 'rusca', 'italyanca', 'çince', 'cince', 'japonca', 'korece']
function isForeignLanguageSubject(subject: string): boolean {
  // .toLowerCase() (locale'siz) KULLANMA: JS'de 'İ'.toLowerCase() -> 'i̇'
  // üretir, düz 'i' ile eşleşmez — "İngilizce" hiç tanınmazdı.
  return FOREIGN_LANGUAGE_SUBJECTS.includes(subject.trim().toLocaleLowerCase('tr'))
}

type ExamQuestion = {
  q: string
  opts: string[]
  ans: number
  exp: string
  difficulty?: 'easy' | 'medium' | 'hard'
  cognitiveSkill?: 'comprehension' | 'application' | 'reasoning' | 'analysis'
  objective?: string
  passage?: string
  visual?: { kind: 'table' | 'diagram'; title?: string; headers?: string[]; rows?: string[][]; description?: string }
}

function buildSectionPrompt(section: ExamSection, count: number, format: ExamFormat): string {
  const { subject, grade } = section
  const examType = format.label
  const isLanguageSection = isForeignLanguageSubject(subject)
  const optionCount = examType === 'LGS' ? 4 : 5
  const optionLabels = optionCount === 4 ? 'A/B/C/D' : 'A/B/C/D/E'
  const languageNote = isLanguageSection
    ? `\n\n🌐 YABANCI DİL BÖLÜMÜ KURALI: Bu bir ${subject} bölümü — gerçek bir ${examType} ${subject} sınavı gibi davran. Soru kökü (q alanı) DAHİL HER ŞEY -- soru metni, şıklar (opts), örnek cümleler, kelimeler, gramer yapıları -- TAMAMEN ${subject} DİLİNDE olmalı, soru/şık metninde TEK BİR TÜRKÇE CÜMLE bile olmamalı. SADECE "exp" (açıklama) alanını öğrenci anlayışı için TÜRKÇE yaz.`
    : ''

  return `Sen ${examType} sınavı için soru hazırlayan bir eğitim uzmanısın.
Ders: ${subject}
Seviye: ${grade}
Soru sayısı: ${count}
Sınav yılı: ${format.examYear}
Müfredat sürümü: ${format.curriculumVersion}

KURALLAR:
- Gerçek ${examType} sınav sorusu formatında, MEB müfredatına uygun
- ${optionCount} şık (${optionLabels}), tek doğru cevap
- Zorluk dağılımı: %30 kolay, %50 orta, %20 zor
- Bilişsel beceri dağılımı: anlama, uygulama, akıl yürütme ve analiz
- Güncel ve doğru bilgi içeren sorular
- Paragraf gerektiren soruda "passage" alanına öğrencinin göreceği metnin tamamını yaz
- Tablo veya şema gerçekten gerekiyorsa "visual" alanını kullan; görünmeyen bir metne ya da şekle atıf yapma
- Kısa açıklama ekle${languageNote}

SADECE geçerli JSON döndür, markdown yok. passage ve visual gerekmiyorsa null gönder:
{"questions":[{"type":"multiple_choice","q":"Soru metni","opts":[${optionCount === 4 ? '"A şıkkı","B şıkkı","C şıkkı","D şıkkı"' : '"A şıkkı","B şıkkı","C şıkkı","D şıkkı","E şıkkı"'}],"ans":0,"exp":"Kısa açıklama","difficulty":"medium","cognitiveSkill":"reasoning","objective":"ölçülen kazanım","passage":null,"visual":null}]}`
}

function structurallyValid(question: ExamQuestion, optionCount: number): boolean {
  return Boolean(
    question && typeof question.q === 'string' && question.q.trim()
    && Array.isArray(question.opts) && question.opts.length === optionCount
    && question.opts.every(option => typeof option === 'string' && option.trim())
    && new Set(question.opts.map(option => option.trim().toLocaleLowerCase('tr'))).size === optionCount
    && Number.isInteger(question.ans) && question.ans >= 0 && question.ans < optionCount
    && typeof question.exp === 'string' && question.exp.trim()
  )
}

async function validateWithIndependentModel(
  questions: ExamQuestion[], section: ExamSection, format: ExamFormat, userId: string,
): Promise<ExamQuestion[]> {
  if (!questions.length) return []
  const accepted: ExamQuestion[] = []
  for (let offset = 0; offset < questions.length; offset += 10) {
    const batch = questions.slice(offset, offset + 10)
    const content = await callOpenAI([
      { role: 'system', content: 'Sen bağımsız ve katı bir sınav sorusu denetçisisin. Yalnızca geçerli JSON döndür.' },
      { role: 'user', content: `Bu ${format.examYear} ${format.label} ${section.label} sorularını doğruluk, tek doğru cevap, seçenek-açıklama tutarlılığı, yaş düzeyi, müfredat, görünür kaynak metin/şekil ve dil açısından denetle. Yalnızca tamamen güvenli soruların sıfır tabanlı indekslerini döndür: {"acceptedIndices":[0,1]}\n\n${JSON.stringify(batch)}` },
    ], {
      model: process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4.1-mini',
      max_tokens: 500,
      temperature: 0,
      json: true,
      operation: 'generate-exam:validator',
      userId,
    })
    const parsed = JSON.parse(content) as { acceptedIndices?: number[] }
    if (!Array.isArray(parsed.acceptedIndices)) throw new Error('Validator şeması geçersiz')
    for (const index of parsed.acceptedIndices) {
      if (Number.isInteger(index) && index >= 0 && index < batch.length) accepted.push(batch[index])
    }
  }
  return accepted
}

function examFingerprint(question: ExamQuestion, format: ExamFormat, section: ExamSection): string {
  return createHash('sha256').update(JSON.stringify({
    examYear: format.examYear, examType: format.label, track: format.track || '', language: format.language || '',
    section: section.id, q: question.q, opts: question.opts,
  })).digest('hex')
}

async function getApprovedExamQuestions(format: ExamFormat, section: ExamSection, count: number): Promise<ExamQuestion[]> {
  const { data, error } = await supabase.from('exam_question_bank')
    .select('id, question')
    .eq('exam_year', format.examYear)
    .eq('exam_type', format.label)
    .eq('track', format.track || '')
    .eq('language', format.language || 'Türkçe')
    .eq('section_id', section.id)
    .eq('curriculum_version', format.curriculumVersion)
    .eq('review_status', 'approved')
    .eq('report_count', 0)
    .order('use_count', { ascending: true })
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(count)
  if (error) throw error
  const rows = data || []
  if (rows.length) {
    await supabase.rpc('mark_exam_questions_used', { p_ids: rows.map(row => row.id) })
  }
  return rows.map(row => row.question as ExamQuestion)
}

async function storeApprovedExamQuestions(format: ExamFormat, section: ExamSection, questions: ExamQuestion[]) {
  if (!questions.length) return
  const rows = questions.map(question => ({
    fingerprint: examFingerprint(question, format, section), exam_year: format.examYear, exam_type: format.label,
    track: format.track || '', language: format.language || 'Türkçe', section_id: section.id,
    subject: section.subject, grade: section.grade, curriculum_version: format.curriculumVersion,
    objective: question.objective || '', cognitive_skill: question.cognitiveSkill || 'application',
    difficulty: question.difficulty || 'medium', question, review_status: 'approved', validator_model: process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4.1-mini',
  }))
  const { error } = await supabase.from('exam_question_bank').upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true })
  if (error) console.error('[generate-exam] bank insert failed', error)
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

  // Madde 7 — veli onayı enforcement'ı (sınav simülasyonu, generate-open-ended
  // ile aynı gerekçe/kapsam: bkz. lib/identity/client.ts'teki yorum).
  const consentCheck = await checkMinorConsentBlock(user.id).catch(() => ({ blocked: false as const }))
  if (consentCheck.blocked) {
    return NextResponse.json({ error: consentCheck.reason }, { status: 403 })
  }

  const { data: profile } = await supabase
    .from('profiles').select('plan, grade').eq('id', user.id).single()

  if (!profile) return NextResponse.json({ error: 'Profil bulunamadı.' }, { status: 404 })
  // 6 Eylül 2026 — GÜVENLİK DÜZELTMESİ: eski kontrol sadece plan==='free'
  // bakıyordu. Yeni kayıtların varsayılan planı artık 'none' (bkz.
  // profiles.plan kolon varsayılanı) — bu kullanıcılar 'free' değil, bu
  // yüzden eski kontrolü ATLATIP tam (demo olmayan) sınav üretebiliyorlardı.
  // Gümüş dahil Altın/Platin dışındaki her plan demo-only kabul edilir.
  const isDemoOnly = profile.plan !== 'premium' && profile.plan !== 'unlimited'

  const body = await req.json()
  const { examType, sectionIds, demo: demoParam, track, ydtLanguage } = body as {
    examType: ExamKey; sectionIds?: string[]; demo?: boolean; track?: string; ydtLanguage?: string
  }

  // Gümüş/free/none: SADECE demo modu — tam sınav isteği reddedilir.
  // Bu kontrol istemci tarafındaki (disabled buton) kontrolden BAĞIMSIZ —
  // istemci atlatılsa bile sunucu asla freemium'a tam sınav üretmez.
  if (isDemoOnly && demoParam === false) {
    return NextResponse.json({ error: 'premium_required' }, { status: 403 })
  }
  // Defense-in-depth: kısıtlı planlar için demo her koşulda true kabul edilir.
  const demo = isDemoOnly ? true : !!demoParam

  const format = resolveExamFormat(examType, track, ydtLanguage)
  if (!format) return NextResponse.json({ error: 'Geçersiz sınav türü.' }, { status: 400 })

  const sectionsToGenerate = sectionIds
    ? format.sections.filter((s: any) => sectionIds.includes(s.id))
    : format.sections

  // Demo: her bölümden 4 soru (hızlı) — Freemium demo: her alanda TAM 1 soru
  const countMultiplier = demo ? 0.2 : 1

  try {
    const results: Record<string, any[]> = {}

    const CHUNK = 3
    for (let i = 0; i < sectionsToGenerate.length; i += CHUNK) {
      const chunk = sectionsToGenerate.slice(i, i + CHUNK)
      await Promise.all(chunk.map(async (section: any) => {
        const sectionCount = isDemoOnly ? 1 : Math.max(4, Math.round(section.count * countMultiplier))

        try {
          const pooled = await getApprovedExamQuestions(format, section, sectionCount)
          const accepted: ExamQuestion[] = [...pooled]
          for (let attempt = 0; attempt < 2 && accepted.length < sectionCount; attempt++) {
            const missing = sectionCount - accepted.length
            const prompt = buildSectionPrompt(section, missing, format)
            const response = await anthropic.messages.create({
              model: 'claude-sonnet-4-5', max_tokens: 6000,
              system: 'Sen Türk eğitim sisteminde sınav soruları hazırlayan bir uzmansın. Sadece geçerli JSON döndür, markdown kullanma.',
              messages: [{ role: 'user', content: prompt }],
            })
            await logAnthropicUsage('generate-exam', 'claude-sonnet-4-5', response, { userId: user.id })
            const text = response.content[0].type === 'text' ? response.content[0].text : ''
            const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
            const optionCount = format.label === 'LGS' ? 4 : 5
            const structurallyAccepted = ((parsed.questions || []) as ExamQuestion[])
              .filter(question => structurallyValid(question, optionCount))
              .slice(0, missing)
            const independentlyAccepted = await validateWithIndependentModel(structurallyAccepted, section, format, user.id)
            await storeApprovedExamQuestions(format, section, independentlyAccepted)
            accepted.push(...independentlyAccepted)
          }
          if (accepted.length < sectionCount) throw new Error(`Kalite kontrolünden geçen soru sayısı yetersiz: ${accepted.length}/${sectionCount}`)
          results[section.id] = balanceAnswerPositions(accepted.slice(0, sectionCount))
        } catch (e) {
          console.error(`[generate-exam] section ${section.id} failed:`, e)
          results[section.id] = []
        }
      }))
    }

    const incompleteSections = sectionsToGenerate.filter(section => {
      const expected = isDemoOnly ? 1 : Math.max(4, Math.round(section.count * countMultiplier))
      return (results[section.id]?.length || 0) < expected
    })
    if (incompleteSections.length) {
      return NextResponse.json({
        error: 'quality_validation_failed',
        message: 'Kalite kontrolünden yeterli sayıda soru geçmedi. Lütfen yeniden deneyin.',
        sections: incompleteSections.map(section => section.label),
      }, { status: 422 })
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

  const { examId, answers, timeSpent } = await req.json()
  const { data: storedExam } = await supabase.from('exam_sessions')
    .select('format').eq('id', examId).eq('user_id', user.id).maybeSingle()
  const format = storedExam?.format as ExamFormat | undefined
  if (!format) return NextResponse.json({ error: 'Sınav bulunamadı.' }, { status: 404 })

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

    const wrongPenalty = Math.abs(format.scoring.wrong / format.scoring.correct)
    const net = Math.max(0, correct - wrong * wrongPenalty)
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
