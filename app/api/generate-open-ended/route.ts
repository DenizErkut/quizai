// app/api/generate-open-ended/route.ts
// MEB'in 2023-2024'ten itibaren ülke geneli ortak sınavlarda kullandığı
// "senaryo/durum temelli açık uçlu soru + dereceli puanlama anahtarı (rubrik)"
// formatına uygun soru üretimi. (Kaynak: MEB Ölçme, Değerlendirme ve Sınav
// Hizmetleri Genel Müdürlüğü — Türkiye Yüzyılı Maarif Modeli Modül 5 kılavuzu)

import { turkishOpenEndedPrompt } from '@/lib/turkish-question-rules'
import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 60
export const runtime = 'nodejs'
import { generateWithRoutedProvider } from '@/lib/ai-gateway/quiz-provider-router'
import { pickMeasuredQuizEngine } from '@/lib/ai-gateway/measured-quiz-router'
import { createClient } from '@/lib/supabase/server-create-client'
import { checkMinorConsentBlock } from '@/lib/identity/client'
import { gradeKeyFromProfile, isSelectableOpenEndedTopic, loadOpenEndedCatalog } from '@/lib/open-ended-practice-catalog'
import { exampleBlock, pickExamples, scenarioLabel, sanitizeFigureSvg, sanitizeAnswerTable, type ScenarioRubricItem } from '@/lib/open-ended-scenarios'
import { gradeNumberOf } from '@/lib/written-exam'
import { addToAusPool } from '@/lib/aus-pool'

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

    // Madde 7 (pratium-bekleyen-isler-uygulama-plani.md) — veli onayı
    // enforcement'ı. Açık uçlu soru "veri-yoğun" bir özellik olarak
    // planda açıkça işaretlenmişti. Sadece veli AÇIKÇA "hayır" dediyse
    // engellenir (bkz. checkMinorConsentBlock yorumu — dar kapsam, bilinçli).
    const consentCheck = await checkMinorConsentBlock(user.id).catch(() => ({ blocked: false as const }))
    if (consentCheck.blocked) {
      return NextResponse.json({ error: consentCheck.reason }, { status: 403 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, monthly_test_count, daily_test_count, daily_test_date, grade, country')
      .eq('id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    // Ayni gunluk/aylik kota mantigi (bir acik uclu soru = bir 'test' hakki)
    // — Premium ve Unlimited planlarda HİÇBİR sınır yok.
    const body = await req.json()
    // Senaryo serisinde 2. ve sonraki sorular aynı "test hakkı"nın devamıdır: yeniden kota düşmez.
    const questionIndex = Math.max(0, Math.floor(Number(body?.questionIndex) || 0))
    // Devam sorusu yalnızca kullanıcı aynı senaryonun bir önceki sorusunu son 24 saatte başlatmışsa kota düşmez (indeks uydurarak bedava soru alınamaz).
    let isFollowUp = false
    if (questionIndex > 0) {
      const sinceIso = new Date(Date.now() - 24 * 3600_000).toISOString()
      const { data: previous } = await supabase.from('open_ended_sessions').select('id').eq('user_id', user.id)
        .eq('topic', scenarioLabel(Number(body?.term), Number(body?.scenarioNo))).ilike('subject', String(body?.subject || '').trim().replace(/[\\%_]/g, '\\$&'))
        .eq('question_index', questionIndex - 1).gte('created_at', sinceIso).limit(1)
      isFollowUp = !!previous?.length
    }
    // Aynı soru son 24 saatte üretilmiş ve henüz çözülmemişse yeniden üretme: aynı soruyu döndür (devam / yazdırılmış kâğıt tutarlı kalır, AI maliyeti ve hak düşmez).
    {
      const reuseTerm = Number(body?.term), reuseNo = Number(body?.scenarioNo)
      if ((reuseTerm === 1 || reuseTerm === 2) && Number.isInteger(reuseNo) && reuseNo >= 1 && reuseNo <= 99 && typeof body?.subject === 'string') {
        const sinceIso = new Date(Date.now() - 24 * 3600_000).toISOString()
        const { data: open } = await supabase.from('open_ended_sessions').select('id,scenario,question,rubric,figure_svg,answer_table,total_possible')
          .eq('user_id', user.id).eq('topic', scenarioLabel(reuseTerm, reuseNo)).ilike('subject', body.subject.trim().replace(/[\\%_]/g, '\\$&'))
          .eq('question_index', questionIndex).is('graded_at', null).gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (open) {
          const gradeNumber = gradeNumberOf(profile.grade || '')
          const country = String((profile as { country?: string | null }).country || 'TR').toUpperCase()
          const { count } = gradeNumber
            ? await supabase.from('open_ended_scenario_examples').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('grade_number', gradeNumber).eq('country', country).eq('term', reuseTerm).eq('scenario_no', reuseNo).ilike('subject', body.subject.trim().replace(/[\\%_]/g, '\\$&'))
            : { count: 1 }
          return NextResponse.json({ sessionId: open.id, questionIndex, questionTotal: count || 1, scenario: open.scenario, question: open.question, rubric: open.rubric, figureSvg: open.figure_svg, answerTable: open.answer_table, totalPossible: open.total_possible, reused: true })
        }
      }
    }
    const plan = profile.plan || 'free'
    const today = new Date().toISOString().split('T')[0]
    const dailyCount = profile.daily_test_date === today ? (profile.daily_test_count || 0) : 0
    if (plan !== 'premium' && plan !== 'unlimited' && !isFollowUp) {
      // 6 Eylül 2026 — bkz. generate-quiz/route.ts'teki aynı düzeltmenin notu:
      // eski `?? 10` varsayılanı, plan tablosunda YER ALMAYAN her durumda
      // (ör. yeni 'none' kullanıcıları) yanlışlıkla 10 hak veriyordu. Artık
      // `?? 0` — bir plan (silver/premium/unlimited) satın alınmadan hiç
      // hak verilmiyor. 'free' (mevcut kullanıcılar, dokunulmadı) ve
      // 'silver' (yeni ücretli giriş planı, 30/ay) tabloda açıkça tanımlı.
      const DAILY_LIMIT: Record<string, number> = { free: 10, silver: 10 }
      const MONTHLY_LIMIT: Record<string, number> = { free: 10, silver: 30 }
      if (dailyCount >= (DAILY_LIMIT[plan] ?? 0)) {
        return NextResponse.json({ error: 'daily_limit_reached' }, { status: 429 })
      }
      if ((profile.monthly_test_count || 0) >= (MONTHLY_LIMIT[plan] ?? 0)) {
        return NextResponse.json({ error: 'monthly_limit_reached' }, { status: 429 })
      }
    }

    const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
    // Senaryo kartı modu: yöneticinin yüklediği örneklere benzer yeni bir senaryo (dönem + senaryo numarası ile).
    const scenarioTerm = Number(body?.term)
    const scenarioNo = Number(body?.scenarioNo)
    const scenarioMode = (scenarioTerm === 1 || scenarioTerm === 2) && Number.isInteger(scenarioNo) && scenarioNo >= 1 && scenarioNo <= 99
    const topic = scenarioMode ? scenarioLabel(scenarioTerm, scenarioNo) : (typeof body?.topic === 'string' ? body.topic.trim() : '')
    if (!subject || !topic) {
      return NextResponse.json({ error: 'Ders ve konu zorunlu.' }, { status: 400 })
    }

    const grade = profile.grade || 'ortaokul 6. sınıf'
    const level = getLevel(grade)
    let examplesText = ''
    let wantFigure = false
    let wantTable = false
    let questionTotal = 1
    if (scenarioMode) {
      const gradeNumber = gradeNumberOf(grade)
      const country = String((profile as { country?: string | null }).country || 'TR').toUpperCase()
      const { data: found } = gradeNumber
        ? await supabase.from('open_ended_scenario_examples').select('scenario,question,rubric,figure_svg,answer_table')
          .eq('status', 'published').eq('grade_number', gradeNumber).eq('country', country).eq('term', scenarioTerm).eq('scenario_no', scenarioNo)
          .ilike('subject', subject.replace(/[\\%_]/g, '\\$&')).order('seq').order('created_at').limit(60)
        : { data: null }
      if (!found?.length) return NextResponse.json({ error: 'Bu senaryo için henüz örnek yüklenmemiş.' }, { status: 404 })
      // Soru serisi: öğrenciye sırayla, her soru ilgili örneğe benzer yeni bir soru olarak gelir.
      questionTotal = found.length
      if (questionIndex >= found.length) return NextResponse.json({ error: 'Bu senaryoda başka soru yok.' }, { status: 400 })
      const picked = [found[questionIndex]] as Array<{ scenario: string; question: string; rubric: ScenarioRubricItem[]; figure_svg?: string | null; answer_table?: string | null }>
      wantTable = picked.some(example => !!example.answer_table)
      wantFigure = !wantTable && picked.some(example => !!example.figure_svg)
      examplesText = exampleBlock(picked)
    } else {
      const available = await loadOpenEndedCatalog(supabase, gradeKeyFromProfile(grade))
      if (!isSelectableOpenEndedTopic(available, subject, topic)) {
        return NextResponse.json({ error: 'Seçilen ders/konu bu sınıfın açık uçlu pratik kataloğunda aktif değil.' }, { status: 400 })
      }
    }

    const prompt = `Sen MEB Ölçme, Değerlendirme ve Sınav Hizmetleri Genel Müdürlüğü tarzında soru hazırlayan bir uzmansın.
2023-2024 eğitim öğretim yılından itibaren ülke geneli ortak sınavlarda kullanılan format şu şekildedir:
1) Önce kısa bir SENARYO/DURUM verilir (bir görsel tasviri, günlük hayattan bir durum, bir metin parçası — 2-4 cümle).
2) Bu senaryoya dayanan, öğrencinin ELEŞTİRİEL/ANALİTİK DÜŞÜNMESİNİ gerektiren, kendi cümleleriyle cevaplayacağı AÇIK UÇLU bir soru sorulur (şık YOKTUR, çoktan seçmeli DEĞİLDİR).
3) Sorunun değerlendirilmesi için 3-4 kriterden oluşan DERECELİ PUANLAMA ANAHTARI (rubrik) hazırlanır, toplam 100 puan.

YAŞA UYGUN CEVAP STANDARDI — ZORUNLU:
- Beklenen cevap bir akademisyen/uzman cevabı değil, ${grade} öğrencisinin kendi kurabileceği doğal cümleler olmalıdır.
- Ortaokul için 1-3 kısa ve açık cümle; lise için 2-4 açık cümle tam puan almaya yeterli olabilmelidir.
- Rubrik, teknik terimi birebir söylemeyi değil doğru düşünceyi/kavramı ölçsün. Öğrenci doğru fikri gündelik ve basit sözcüklerle anlatırsa tam puan verilebilsin.
- Yazım, noktalama ve anlatım kusurları; ders Türkçe/yabancı dil değilse ve anlamı bozmuyorsa puan kaybettirmesin.
- Rubrik açıklamalarına üniversite düzeyi ayrıntı, kaynak dili, profesyonel terminoloji veya soruda istenmeyen ek gerekçe koyma.
- Her kriter tek, gözlenebilir ve yaşa uygun bir beklenti içersin; aynı bilgi farklı kriterlerde tekrar puanlanmasın.

Seviye: ${level} (${grade})
Ders: ${subject}
${scenarioMode ? `Bölüm: ${topic}

Aşağıda bu bölüm için hazırlanmış ÖRNEK senaryolar var. Bu örneklerin ölçtüğü beceriyi/kazanımı ölçen, aynı biçim ve zorlukta ama FARKLI bağlam, isim ve verilerle YENİ bir senaryo+soru+rubrik hazırla. Örneği kelimesi kelimesine KOPYALAMA; örnekteki puanlama mantığını ve rubrik yapısını koru.\n\n${examplesText}` : `Konu: ${topic}${turkishOpenEndedPrompt(subject, topic)}\n\nYukarıdaki konuya uygun, ${grade} seviyesine uygun zorlukta, gerçek bir MEB ortak sınav sorusu gibi bir senaryo+soru+rubrik hazırla.`}

${isForeignLanguageSubject(subject) ? `ÖNEMLİ (DİL): Bu bir YABANCI DİL dersi sorusu (${subject}) — gerçek bir ${subject} sınavında olduğu gibi davran. SENARYOYU ve SORUYU TAMAMEN "${subject}" DİLİNDE yaz (Türkçe DEĞİL) — öğrenci o dilde okuduğunu anlayıp yine o dilde cevap verecek, bu yüzden Türkçe tek cümle bile olmamalı senaryo/soru metninde. "${topic}" konusundaki hedef dil yapısının kullanılmasını gerektiren bir soru kur. SADECE rubrikteki "criterion" (kriter adı) ve "description" (açıklama) alanlarını TÜRKÇE yaz — bunlar öğretmenin/velinin okuyacağı değerlendirme ölçütleridir, ama açıklamalarda öğrencinin "${subject}" dilinde doğru yazıp yazmadığının değerlendirileceği net olsun.` : `ÖNEMLİ: Tüm metinleri SADECE TÜRKÇE yaz. Başka hiçbir dilden (İngilizce, Korece, Çince vb.) tek bir kelime bile kullanma.`}

SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir açıklama ekleme:
{
  "scenario": "Senaryo/durum metni (2-4 cümle, ${isForeignLanguageSubject(subject) ? subject : 'Türkçe'})",
  "question": "Senaryoya dayanan açık uçlu soru (${isForeignLanguageSubject(subject) ? subject : 'Türkçe'})",
  ${wantTable ? '"table": "Örnekteki doldurulacak tablonun YENİ verilerle hazırlanmış hâli: satır başına bir satır, hücreler | ile; ilk satır başlıklar, ilk sütun satır adları; öğrencinin dolduracağı hücreler BOŞ. Senaryo metnine tabloyu tekrar yazma; soru bu tabloyu doldurmayı istemeli, rubrik doğru hücre değerlerini ölçmeli",' : ''}
  ${wantFigure ? '"figureSvg": "Örnekteki şekil türünde, YENİ verilerle çizilmiş sade SVG (viewBox=\\"0 0 400 260\\", yalnızca path/rect/circle/line/polygon/text, Türkçe etiketler, 5000 karakteri geçmesin, beyaz arka plan). Soru şekle dayanmalı; senaryo metni şekildeki tüm verileri de içermeli",' : ''}
  "rubric": [
    { "criterion": "Kriter adı (kısa, Türkçe)", "maxPoints": 30, "description": "${grade} öğrencisinin basit cümlelerle karşılayabileceği tek ve somut tam puan koşulu (1 cümle, Türkçe)" }
  ]
}
Rubrikteki maxPoints toplamı MUTLAKA 100 olmalı. 3 veya 4 kriter kullan.`

    // 22 Eylül 2026 — Deniz'in fark ettiği gibi bu uç nokta hâlâ SADECE
    // Claude kullanıyordu. Aynı çoklu-sağlayıcı tasarım burada da devreye
    // alınıyor (bkz. lib/ai-gateway/quiz-provider-router.ts). Bu uçta
    // önceden bilinen bir zorluk seçimi yok (sadece sınıf seviyesinden
    // çıkarılıyor) — bu yüzden hardDifficulty kullanılmıyor, sadece
    // GPT-4.1-mini gövde + Mistral'in mevcut payı uygulanıyor.
    const openEndedDecision = await pickMeasuredQuizEngine({ bucketKey: `open-ended-v1:${user.id}` })
    let text: string
    try {
      const result = await generateWithRoutedProvider(openEndedDecision, {
        systemPrompt: '',
        userPrompt: prompt,
        maxTokens: wantFigure || wantTable ? 4500 : 1500,
        operationTag: `generate-open-ended:${openEndedDecision.genEngineTag}`,
        userId: user.id,
      })
      text = result.text
    } catch (primaryError) {
      console.error('[generate-open-ended] birincil motor başarısız, Claude fallback:', openEndedDecision.engine, primaryError)
      if (openEndedDecision.engine === 'claude-sonnet' || openEndedDecision.engine === 'claude-haiku') throw primaryError
      const fallback = await generateWithRoutedProvider(
        { engine: 'claude-sonnet', experimentVariant: null, genEngineTag: 'claude-sonnet-fallback' },
        { systemPrompt: '', userPrompt: prompt, maxTokens: wantFigure || wantTable ? 4500 : 1500, operationTag: 'generate-open-ended:fallback-claude', userId: user.id }
      )
      text = fallback.text
    }
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
    parsed.rubric = parsed.rubric.map((r) => ({
      ...r,
      criterion: stripForeignScripts(r.criterion || ''),
      description: stripForeignScripts(r.description || ''),
    }))

    const totalPossible = parsed.rubric.reduce((s: number, r) => s + (r.maxPoints || 0), 0)

    const { data: sessionRow, error: insErr } = await supabase
      .from('open_ended_sessions')
      .insert({
        user_id: user.id,
        grade,
        subject: subject.trim(),
        topic: topic.trim(),
        question_index: scenarioMode ? questionIndex : null,
        scenario: parsed.scenario,
        question: parsed.question,
        rubric: parsed.rubric,
        answer_table: wantTable ? sanitizeAnswerTable((parsed as { table?: unknown }).table) : null,
        figure_svg: wantFigure ? sanitizeFigureSvg((parsed as { figureSvg?: unknown }).figureSvg) : null,
        total_possible: totalPossible,
      })
      .select('id')
      .single()

    if (insErr || !sessionRow) return NextResponse.json({ error: 'Kaydedilemedi.' }, { status: 500 })
    // Üretilen soru AUS havuzuna (bekleyen) alınır; inceleme yönetici/öğretmen tarafından yapılır.
    await addToAusPool(supabase, { source: 'student_ai', sourceRef: sessionRow.id, grade, subject: subject.trim(), topic: topic.trim(), scenario: parsed.scenario, question: parsed.question, rubric: parsed.rubric,
      figureSvg: wantFigure ? sanitizeFigureSvg((parsed as { figureSvg?: unknown }).figureSvg) : null, answerTable: wantTable ? sanitizeAnswerTable((parsed as { table?: unknown }).table) : null })

    // Kota artir (ayni gunluk test hakki havuzu)
    if (!isFollowUp) await supabase.from('profiles').update({
      monthly_test_count: (profile.monthly_test_count || 0) + 1,
      daily_test_count: dailyCount + 1,
      daily_test_date: today,
    }).eq('id', user.id)

    return NextResponse.json({
      sessionId: sessionRow.id,
      questionIndex,
      questionTotal,
      scenario: parsed.scenario,
      question: parsed.question,
      rubric: parsed.rubric,
      answerTable: wantTable ? sanitizeAnswerTable((parsed as { table?: unknown }).table) : null,
      figureSvg: wantFigure ? sanitizeFigureSvg((parsed as { figureSvg?: unknown }).figureSvg) : null,
      totalPossible,
    })
  } catch (e) {
    console.error('[generate-open-ended]', e?.message)
    return NextResponse.json({ error: 'Bir hata oluştu, tekrar dene.' }, { status: 500 })
  }
}
