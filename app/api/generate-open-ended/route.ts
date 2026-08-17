// app/api/generate-open-ended/route.ts
// MEB'in 2023-2024'ten itibaren ülke geneli ortak sınavlarda kullandığı
// "senaryo/durum temelli açık uçlu soru + dereceli puanlama anahtarı (rubrik)"
// formatına uygun soru üretimi. (Kaynak: MEB Ölçme, Değerlendirme ve Sınav
// Hizmetleri Genel Müdürlüğü — Türkiye Yüzyılı Maarif Modeli Modül 5 kılavuzu)

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
// Bu derslerde öğrencinin CEVABI hedef dilde yazılmalı — senaryo/soru
// kökü yine Türkçe kalabilir (Türkçe eğitim ortamı bağlamı) ama soru
// öğrenciden AÇIKÇA hedef dilde yanıt istemeli, aksi halde AI hem soruyu
// hem beklenen cevabı yanlışlıkla tamamen Türkçeleştiriyor — bir
// "Future tense (will/going to)" konusunda öğrenci İngilizce (doğru
// şekilde will/going to kullanarak) cevap verse bile grade-open-ended
// tarafında "yanlış dil" diye 0 puan almasına yol açıyordu.
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
  return FOREIGN_LANGUAGE_SUBJECTS.has(subject.trim().toLocaleLowerCase('tr'))
}

function getLevel(grade: string): string {
  const g = grade?.toLowerCase() || ''
  if (g.includes('ilkokul')) return 'ilkokul'
  if (g.includes('ortaokul')) return 'ortaokul'
  if (g.includes('lise')) return 'lise'
  if (g.includes('universite') || g.includes('üniversite')) return 'universite'
  return 'ortaokul'
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, monthly_test_count, daily_test_count, daily_test_date, grade')
      .eq('id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    // Ayni gunluk/aylik kota mantigi (bir acik uclu soru = bir 'test' hakki)
    // — Premium ve Unlimited planlarda HİÇBİR sınır yok.
    const plan = profile.plan || 'free'
    const today = new Date().toISOString().split('T')[0]
    const dailyCount = profile.daily_test_date === today ? (profile.daily_test_count || 0) : 0
    if (plan !== 'premium' && plan !== 'unlimited') {
      const DAILY_LIMIT: Record<string, number> = { free: 10 }
      const MONTHLY_LIMIT: Record<string, number> = { free: 10 }
      if (dailyCount >= (DAILY_LIMIT[plan] ?? 10)) {
        return NextResponse.json({ error: 'daily_limit_reached' }, { status: 429 })
      }
      if ((profile.monthly_test_count || 0) >= (MONTHLY_LIMIT[plan] ?? 10)) {
        return NextResponse.json({ error: 'monthly_limit_reached' }, { status: 429 })
      }
    }

    const body = await req.json()
    const { subject, topic } = body as { subject: string; topic: string }
    if (!subject?.trim() || !topic?.trim()) {
      return NextResponse.json({ error: 'Ders ve konu zorunlu.' }, { status: 400 })
    }

    const grade = profile.grade || 'ortaokul 6. sınıf'
    const level = getLevel(grade)

    const prompt = `Sen MEB Ölçme, Değerlendirme ve Sınav Hizmetleri Genel Müdürlüğü tarzında soru hazırlayan bir uzmansın.
2023-2024 eğitim öğretim yılından itibaren ülke geneli ortak sınavlarda kullanılan format şu şekildedir:
1) Önce kısa bir SENARYO/DURUM verilir (bir görsel tasviri, günlük hayattan bir durum, bir metin parçası — 2-4 cümle).
2) Bu senaryoya dayanan, öğrencinin ELEŞTİRİEL/ANALİTİK DÜŞÜNMESİNİ gerektiren, kendi cümleleriyle cevaplayacağı AÇIK UÇLU bir soru sorulur (şık YOKTUR, çoktan seçmeli DEĞİLDİR).
3) Sorunun değerlendirilmesi için 3-4 kriterden oluşan DERECELİ PUANLAMA ANAHTARI (rubrik) hazırlanır, toplam 100 puan.

Seviye: ${level} (${grade})
Ders: ${subject}
Konu: ${topic}

Yukarıdaki konuya uygun, ${grade} seviyesine uygun zorlukta, gerçek bir MEB ortak sınav sorusu gibi bir senaryo+soru+rubrik hazırla.

${isForeignLanguageSubject(subject) ? `ÖNEMLİ (DİL): Bu bir YABANCI DİL dersi sorusu (${subject}) — gerçek bir ${subject} sınavında olduğu gibi davran. SENARYOYU ve SORUYU TAMAMEN "${subject}" DİLİNDE yaz (Türkçe DEĞİL) — öğrenci o dilde okuduğunu anlayıp yine o dilde cevap verecek, bu yüzden Türkçe tek cümle bile olmamalı senaryo/soru metninde. "${topic}" konusundaki hedef dil yapısının kullanılmasını gerektiren bir soru kur. SADECE rubrikteki "criterion" (kriter adı) ve "description" (açıklama) alanlarını TÜRKÇE yaz — bunlar öğretmenin/velinin okuyacağı değerlendirme ölçütleridir, ama açıklamalarda öğrencinin "${subject}" dilinde doğru yazıp yazmadığının değerlendirileceği net olsun.` : `ÖNEMLİ: Tüm metinleri SADECE TÜRKÇE yaz. Başka hiçbir dilden (İngilizce, Korece, Çince vb.) tek bir kelime bile kullanma.`}

SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir açıklama ekleme:
{
  "scenario": "Senaryo/durum metni (2-4 cümle, ${isForeignLanguageSubject(subject) ? subject : 'Türkçe'})",
  "question": "Senaryoya dayanan açık uçlu soru (${isForeignLanguageSubject(subject) ? subject : 'Türkçe'})",
  "rubric": [
    { "criterion": "Kriter adı (kısa, Türkçe)", "maxPoints": 30, "description": "Bu kriterden tam puan almak için cevapta ne olmalı (1 cümle, Türkçe)" }
  ]
}
Rubrikteki maxPoints toplamı MUTLAKA 100 olmalı. 3 veya 4 kriter kullan.`

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

    if (!parsed?.scenario || !parsed?.question || !Array.isArray(parsed?.rubric)) {
      return NextResponse.json({ error: 'Soru üretilemedi, tekrar dene.' }, { status: 500 })
    }

    // Guvenlik agi: yabanci alfabe karakterlerini temizle — SADECE senaryo/soru
    // TURKCE olmasi gereken derslerde uygulanir. Ders Cince/Japonca/Korece ise
    // senaryo/soru bilerek o alfabede uretiliyor (yukarida istendigi gibi),
    // bu durumda stripForeignScripts calisirsa hedef dilin kendisini silerdi.
    // Rubrik (criterion/description) her zaman Turkce kalmasi gerektigi icin
    // orada temizlik degismeden uygulanmaya devam eder.
    if (!isForeignLanguageSubject(subject)) {
      parsed.scenario = stripForeignScripts(parsed.scenario)
      parsed.question = stripForeignScripts(parsed.question)
    }
    parsed.rubric = parsed.rubric.map((r: any) => ({
      ...r,
      criterion: stripForeignScripts(r.criterion || ''),
      description: stripForeignScripts(r.description || ''),
    }))

    const totalPossible = parsed.rubric.reduce((s: number, r: any) => s + (r.maxPoints || 0), 0)

    const { data: sessionRow, error: insErr } = await supabase
      .from('open_ended_sessions')
      .insert({
        user_id: user.id,
        grade,
        subject: subject.trim(),
        topic: topic.trim(),
        scenario: parsed.scenario,
        question: parsed.question,
        rubric: parsed.rubric,
        total_possible: totalPossible,
      })
      .select('id')
      .single()

    if (insErr || !sessionRow) return NextResponse.json({ error: 'Kaydedilemedi.' }, { status: 500 })

    // Kota artir (ayni gunluk test hakki havuzu)
    await supabase.from('profiles').update({
      monthly_test_count: (profile.monthly_test_count || 0) + 1,
      daily_test_count: dailyCount + 1,
      daily_test_date: today,
    }).eq('id', user.id)

    return NextResponse.json({
      sessionId: sessionRow.id,
      scenario: parsed.scenario,
      question: parsed.question,
      rubric: parsed.rubric,
      totalPossible,
    })
  } catch (e: any) {
    console.error('[generate-open-ended]', e?.message)
    return NextResponse.json({ error: 'Bir hata oluştu, tekrar dene.' }, { status: 500 })
  }
}
