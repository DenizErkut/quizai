// app/api/grade-open-ended/route.ts
// Ogrencinin yazdigi cevabi, uretim sirasinda kaydedilen rubrige (dereceli
// puanlama anahtari) gore kriter kriter degerlendirir - MEB'in ogretmenlere
// "puanlar goruş bildiren degil, delillerle desteklenen yanitlara verilir"
// seklinde tarif ettigi yaklasimi AI'a talimat olarak veriyoruz.

import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 60
export const runtime = 'nodejs'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Guvenlik agi: AI modeli nadiren Turkce metnin arasina yabanci alfabe
// (Korece/Cince/Japonca vb.) karakterleri sikistirabiliyor. Bu unicode
// araliklarindaki karakterleri temizler - Turkce/Latin/matematik
// sembollerini etkilemez.
function stripForeignScripts(text: string): string {
  if (!text) return text
  return text.replace(/[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/g, '').replace(/\s{2,}/g, ' ').trim()
}

// Bir "ders" alanı yabancı dil dersi mi? (İngilizce, Almanca, vb.)
// generate-open-ended/route.ts'teki AYNI mantık — bu derslerde öğrencinin
// cevabının hedef dilde olması BEKLENEN/DOĞRU davranıştır, "yanlış dil"
// diye reddedilmemeli. (Bkz. o dosyadaki uzun açıklama.)
const FOREIGN_LANGUAGE_SUBJECTS = new Set([
  'ingilizce', 'almanca', 'fransızca', 'fransizca', 'ispanyolca',
  'arapça', 'arapca', 'rusça', 'rusca', 'italyanca', 'çince', 'cince',
  'japonca', 'korece',
])
function isForeignLanguageSubject(subject: string): boolean {
  // .toLowerCase() (locale'siz) KULLANMA: JS'de 'İ'.toLowerCase() -> 'i̇'
  // (nokta ayrı bir combining karakter olarak kalır) üretir, düz 'i' ile
  // ASLA eşleşmez — "İngilizce" gibi büyük noktalı İ ile başlayan tüm ders
  // adları bu yüzden hiç tanınmıyordu (bkz. app/api/generate-quiz/route.ts
  // içindeki aynı düzeltme — kod tabanında zaten bilinen bir sorun).
  return FOREIGN_LANGUAGE_SUBJECTS.has((subject || '').trim().toLocaleLowerCase('tr'))
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { sessionId, studentAnswer } = body as { sessionId: string; studentAnswer: string }
    if (!sessionId || !studentAnswer?.trim()) {
      return NextResponse.json({ error: 'Cevap boş olamaz.' }, { status: 400 })
    }
    if (studentAnswer.trim().length < 50) {
      return NextResponse.json({ error: 'Cevap çok kısa — en az 50 karakter olmalı.' }, { status: 400 })
    }

    // Rubrigi ve soruyu SUNUCUDAN oku - istemciden gelen rubrige guvenilmez
    // (aksi halde biri devtools'tan rubrigi degistirip tam puan alabilirdi)
    const { data: session, error: fetchErr } = await supabase
      .from('open_ended_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (fetchErr || !session) return NextResponse.json({ error: 'Soru bulunamadı.' }, { status: 404 })

    const rubricText = (session.rubric as any[])
      .map((r, i) => `${i + 1}. ${r.criterion} (${r.maxPoints} puan): ${r.description}`)
      .join('\n')

    const prompt = `Sen MEB'in "Açık Uçlu Soruların Puanlanması Kursu" eğitiminden geçmiş, dereceli puanlama anahtarına (rubrik) göre değerlendirme yapan deneyimli bir öğretmensin.
Puanlama ilkesi: puanlar görüş bildiren değil, DELİLLERLE DESTEKLENEN yanıtlara verilir. Kısmi puan vermekten çekinme - bir kriterin bir kısmı karşılanmışsa o kısmına denk gelen puanı ver.

SENARYO: ${session.scenario}
SORU: ${session.question}

DERECELI PUANLAMA ANAHTARI:
${rubricText}
(Toplam: ${session.total_possible} puan)

ÖĞRENCİNİN CEVABI:
"""
${studentAnswer.trim()}
"""

Her kriteri ayrı ayrı değerlendir, kaç puan hak ettiğini belirle (0 ile o kriterin maxPoints'i arasında, tam sayı) ve öğrenciye yönelik kısa, yapıcı bir geri bildirim yaz (1-2 cümle, doğrudan öğrenciye hitaben "sen" dilinde).
Ayrıca genel bir değerlendirme cümlesi yaz.

${isForeignLanguageSubject(session.subject) ? `ÖNEMLİ (DİL): Bu bir "${session.subject}" dersi sorusu. ÖĞRENCİNİN CEVABININ "${session.subject}" DİLİNDE OLMASI BEKLENEN VE DOĞRU davranıştır — öğrenci "${session.subject}" dilinde yazdıysa bunu SEBEP GÖSTEREREK ASLA puan kırma veya "yanlış dil" deme; tam tersine cevabın o dildeki dilbilgisi/kullanım açısından doğruluğunu değerlendir. SADECE senin yazacağın feedback ve overallFeedback metinleri Türkçe olsun (senin değerlendirme dilin Türkçe, öğrencinin cevap dili "${session.subject}").` : `ÖNEMLİ: Tüm metinleri SADECE TÜRKÇE yaz. Başka hiçbir dilden (İngilizce, Korece, Çince vb.) tek bir kelime bile kullanma.`}

SADECE aşağıdaki JSON formatında yanıt ver:
{
  "criteriaResults": [
    { "criterion": "Kriter adı (rubrikteki ile birebir aynı)", "maxPoints": 30, "earnedPoints": 22, "feedback": "Kısa geri bildirim" }
  ],
  "overallFeedback": "Genel değerlendirme (2-3 cümle, motive edici ama dürüst)"
}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    let parsed
    try {
      const clean = text.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
      else throw new Error('AI yanıtı ayrıştırılamadı.')
    }

    if (!Array.isArray(parsed?.criteriaResults)) {
      return NextResponse.json({ error: 'Puanlama başarısız, tekrar dene.' }, { status: 500 })
    }

    // Guvenlik agi: yabanci alfabe karakterlerini temizle
    parsed.criteriaResults = parsed.criteriaResults.map((r: any) => ({
      ...r,
      feedback: stripForeignScripts(r.feedback || ''),
      criterion: stripForeignScripts(r.criterion || ''),
    }))
    parsed.overallFeedback = stripForeignScripts(parsed.overallFeedback || '')

    const totalEarned = parsed.criteriaResults.reduce((s: number, r: any) => s + (r.earnedPoints || 0), 0)

    await supabase.from('open_ended_sessions').update({
      student_answer: studentAnswer.trim(),
      criteria_results: parsed.criteriaResults,
      total_earned: totalEarned,
      overall_feedback: parsed.overallFeedback || '',
      graded_at: new Date().toISOString(),
    }).eq('id', sessionId)

    return NextResponse.json({
      criteriaResults: parsed.criteriaResults,
      overallFeedback: parsed.overallFeedback || '',
      totalEarned,
      totalPossible: session.total_possible,
    })
  } catch (e: any) {
    console.error('[grade-open-ended]', e?.message)
    return NextResponse.json({ error: 'Bir hata oluştu, tekrar dene.' }, { status: 500 })
  }
}
