// app/api/teacher/create-open-ended/route.ts
//
// Öğretmenin bir sınıfa açık uçlu soru ödevi ataması. İki yöntem:
// - mode: 'ai', preview: true  → sadece senaryo/soru/rubrik ÜRETİR,
//   KAYDETMEZ — öğretmen önce önizler/düzenler.
// - mode: 'manual'             → gerçek kayıt burada olur. Hem tamamen
//   manuel yazılmış hem de AI ile üretilip öğretmen tarafından
//   onaylanmış/düzenlenmiş içerik AYNI yoldan (manual) kalıcı olarak
//   kaydedilir — 'created_via' alanında bu iki oluşturma yöntemi
//   frontend tarafından ayrıca işaretlenip gönderilir.
import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 60
export const runtime = 'nodejs'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { verifyQuestionWithOpenAI } from '@/lib/openai'

const anthropic = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function stripForeignScripts(text: string): string {
  if (!text) return text
  return text.replace(/[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/g, '').replace(/\s{2,}/g, ' ').trim()
}

function getLevel(grade: string): string {
  const g = grade?.toLowerCase() || ''
  if (g.includes('ilkokul')) return 'ilkokul'
  if (g.includes('ortaokul')) return 'ortaokul'
  if (g.includes('lise')) return 'lise'
  if (g.includes('universite') || g.includes('üniversite')) return 'universite'
  return 'ortaokul'
}

// Öğrenci tarafındaki app/api/generate-open-ended/route.ts'te 18 Ağustos
// 2026'da bulunan ve düzeltilen AYNI hata burada da vardı: öğretmen bir
// İngilizce açık uçlu ödevi oluştururken senaryo+soru tamamen Türkçe
// üretiliyordu. Aynı çözüm.
const FOREIGN_LANGUAGE_SUBJECTS = ['ingilizce', 'almanca', 'fransızca', 'fransizca', 'ispanyolca', 'arapça', 'arapca', 'rusça', 'rusca', 'italyanca', 'çince', 'cince', 'japonca', 'korece']
function isForeignLanguageSubject(subject: string): boolean {
  return FOREIGN_LANGUAGE_SUBJECTS.includes(subject.trim().toLocaleLowerCase('tr'))
}

function buildPrompt(level: string, grade: string, subject: string, topic: string, mebContext: string): string {
  const mebSection = mebContext
    ? `\n\n⚠️ AŞAĞIDA GERÇEK BİR MEB KAYNAK METNİ VERİLMİŞTİR. Senaryonu ve soruyu MÜMKÜN OLDUĞUNCA bu metindeki gerçek bilgilere, örneklere, olaylara veya kavramlara dayandır — metinde olmayan bilgi uydurma.\n\n` +
      `🚫 ÖNEMLİ İSTİSNA 1: Eğer bu metin bir MÜFREDAT KAZANIM KODU LİSTESİYSE (örn. "SB.6.4.1..." formatında, öğretmene yönelik öğrenme çıktısı tanımları içeriyorsa) — kazanım kodlarına dayalı soru ÜRETME, sadece işaret ettiği GERÇEK KONUYU kullan.\n\n` +
      `🚫 ÖNEMLİ İSTİSNA 2: Bu metin gerçek bir sınav kitapçığı olabilir ve "Soru 39'da verilen örneğe göre...", "38 ve 39. soruları bu bilgiye göre cevaplayınız" gibi BAŞKA bir soruya/örneğe atıfta bulunan ifadeler içerebilir. Böyle bir referans görürsen ASLA olduğu gibi kopyalama — öğrenci SADECE senin ürettiğin bu tek soruyu görecek. Ya atıfta bulunulan bilgiyi doğrudan senin senaryonun içine taşı, ya da metindeki tamamen bağımsız başka bir örnek/kavram kullan.\n\n` +
      `MEB KAYNAK METNİ:\n${mebContext}\n\n`
    : ''

  return `Sen MEB Ölçme, Değerlendirme ve Sınav Hizmetleri Genel Müdürlüğü tarzında soru hazırlayan bir uzmansın.
2023-2024 eğitim öğretim yılından itibaren ülke geneli ortak sınavlarda kullanılan format şu şekildedir:
1) Önce kısa bir SENARYO/DURUM verilir (bir görsel tasviri, günlük hayattan bir durum, bir metin parçası — 2-4 cümle).
2) Bu senaryoya dayanan, öğrencinin ELEŞTİRİEL/ANALİTİK DÜŞÜNMESİNİ gerektiren, kendi cümleleriyle cevaplayacağı AÇIK UÇLU bir soru sorulur (şık YOKTUR, çoktan seçmeli DEĞİLDİR).
3) Sorunun değerlendirilmesi için 3-4 kriterden oluşan DERECELİ PUANLAMA ANAHTARI (rubrik) hazırlanır, toplam 100 puan.

📐 MEB SORU DİLİ VE STİLİ (harici bir MEB uygunluk değerlendirmesiyle doğrulanmış kurallar):
- Senaryo ASLA çıplak bir işlem talimatı olmasın (ör. "3/4 + 2/3 + 1/2 işlemini yapınız" YANLIŞ). Bunun yerine öğrenciyi günlük yaşam bağlamına yerleştir: alışveriş, yemek tarifi, boya/badana, bahçe, su tüketimi, yol/mesafe, zaman planlama gibi somut, tanıdık durumlar kullan.
- Senaryoda "...nasıl [işlem yapacağını/çözeceğini] düşünüyor" gibi ifadelerle öğrenciyi bağlamsallaştır — doğrudan sonuca değil, DÜŞÜNME SÜRECİNE yönlendir.
- Soru kökünde şu üç isteği MÜMKÜN OLDUĞUNCA birlikte kullan (dersin doğasına uymuyorsa uyarlayabilirsin, ama matematik/fen gibi işlem gerektiren derslerde bu kalıp tercih edilir):
  1. "İşlem basamaklarını gösteriniz." (süreç şeffaflığı)
  2. Sonucun nasıl sunulması gerektiğini belirt — ör. "Sonucu en sade kesir biçiminde yazınız."
  3. "Kullandığınız yöntemi gerekçelendiriniz." — ASLA sadece "çözümünü açıklayınız" gibi daha genel/gayri resmî bir ifade kullanma, MEB'in tercih ettiği resmî "gerekçelendiriniz" kalıbını kullan.
  Örnek MEB tarzı soru kökü: "Ayşe'nin pasta tarifi için gereken malzemelerin toplam ağırlığını hesaplayınız. İşlem basamaklarını gösteriniz. Sonucu en sade kesir biçiminde yazınız ve kullandığınız yöntemi gerekçelendiriniz."
- Soru, Bloom taksonomisinde en az UYGULAMA + ANALİZ seviyesini hedeflemeli — öğrenci sadece bir işlemi tekrar etmemeli, bir süreci (ör. ortak payda bulma → dönüştürme → işlem → sadeleştirme → gerekçelendirme) tamamlamalı.

Seviye: ${level} (${grade})
Ders: ${subject}
Konu: ${topic}
${mebSection}
Bir ÖĞRETMEN, bu soruyu SINIFINA ÖDEV olarak atayacak — birden fazla öğrenci aynı soruyu cevaplayacak. Yukarıdaki konuya uygun, ${grade} seviyesine uygun zorlukta, gerçek bir MEB ortak sınav sorusu gibi bir senaryo+soru+rubrik hazırla.

${isForeignLanguageSubject(subject) ? `ÖNEMLİ (DİL): Bu bir YABANCI DİL dersi sorusu (${subject}) — gerçek bir ${subject} sınavında olduğu gibi davran. SENARYOYU ve SORUYU TAMAMEN "${subject}" DİLİNDE yaz (Türkçe DEĞİL) — öğrenci o dilde okuduğunu anlayıp yine o dilde cevap verecek, Türkçe tek cümle bile olmamalı. SADECE rubrikteki "criterion" ve "description" alanlarını TÜRKÇE yaz (öğretmenin okuyacağı değerlendirme ölçütleri).` : `ÖNEMLİ: Tüm metinleri SADECE TÜRKÇE yaz. Başka hiçbir dilden (İngilizce, Korece, Çince vb.) tek bir kelime bile kullanma.`}

SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir açıklama ekleme:
{
  "scenario": "Senaryo/durum metni (2-4 cümle, ${isForeignLanguageSubject(subject) ? subject : 'Türkçe'})",
  "question": "Senaryoya dayanan açık uçlu soru (${isForeignLanguageSubject(subject) ? subject : 'Türkçe'})",
  "rubric": [
    { "criterion": "Kriter adı (kısa, Türkçe)", "maxPoints": 30, "description": "Bu kriterden tam puan almak için cevapta ne olmalı (1 cümle, Türkçe)" }
  ]
}
Rubrikteki maxPoints toplamı MUTLAKA 100 olmalı. 3 veya 4 kriter kullan.`
}

async function searchMebContext(origin: string, subject: string, topic: string, grade: string, level: string): Promise<string> {
  try {
    const mebRes = await fetch(`${origin}/api/meb-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || 'internal' },
      body: JSON.stringify({ topic, grade, subject, unit: topic, level, limit: 2 }),
      signal: AbortSignal.timeout(3000),
    })
    if (mebRes.ok) {
      const mebData = await mebRes.json()
      if (mebData.found && mebData.context) return mebData.context.slice(0, 6500)
    }
  } catch { /* MEB kaynağı opsiyonel — bulunamazsa AI genel bilgiden üretir */ }
  return ''
}

async function generateWithAI(subject: string, topic: string, grade: string, origin: string) {
  const effectiveGrade = grade || 'ortaokul 6. sınıf'
  const level = getLevel(effectiveGrade)
  const mebContext = await searchMebContext(origin, subject, topic, effectiveGrade, level)
  const prompt = buildPrompt(level, effectiveGrade, subject, topic, mebContext)

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
    throw new Error('Soru üretilemedi.')
  }
  // Ders Çince/Japonca/Korece ise senaryo/soru bilerek o alfabede üretiliyor
  // — stripForeignScripts çalışırsa hedef dilin kendisini silerdi.
  const skipStrip = isForeignLanguageSubject(subject)
  return {
    scenario: skipStrip ? parsed.scenario : stripForeignScripts(parsed.scenario),
    question: skipStrip ? parsed.question : stripForeignScripts(parsed.question),
    rubric: parsed.rubric.map((r: any) => ({
      criterion: stripForeignScripts(r.criterion || ''),
      maxPoints: Number(r.maxPoints) || 0,
      description: stripForeignScripts(r.description || ''),
    })),
    usedMebSource: !!mebContext,
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

    const { data: teacherRow } = await supabase.from('teachers').select('*').eq('user_id', user.id).maybeSingle()
    if (!teacherRow?.approved) return NextResponse.json({ error: 'Onaylı öğretmen hesabı gerekir.' }, { status: 403 })

    const body = await req.json()
    const { mode, classroom_id, title, grade, subject, topic, due_date, preview } = body as {
      mode: 'ai' | 'manual'; classroom_id: string; title: string
      grade?: string; subject?: string; topic?: string; due_date?: string; preview?: boolean
    }

    // preview: SADECE üret, kaydetme — öğretmen önce önizler/düzenler,
    // asıl kayıt 'manual' modla (onaylanmış içerikle) yapılır.
    if (mode === 'ai' && preview) {
      if (!subject?.trim() || !topic?.trim()) {
        return NextResponse.json({ error: 'Ders ve konu zorunlu.' }, { status: 400 })
      }
      try {
        const result = await generateWithAI(subject, topic, grade || '', req.nextUrl.origin)
        return NextResponse.json(result)
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Soru üretilemedi, tekrar dene.' }, { status: 500 })
      }
    }

    if (!classroom_id || !title?.trim()) {
      return NextResponse.json({ error: 'Sınıf ve başlık zorunlu.' }, { status: 400 })
    }

    // Sınıf gerçekten bu öğretmene mi ait — başka bir öğretmenin sınıfına
    // ödev atanmasını engelle
    const { data: classroom } = await supabase.from('classrooms').select('id, teacher_id').eq('id', classroom_id).maybeSingle()
    if (!classroom || classroom.teacher_id !== teacherRow.id) {
      return NextResponse.json({ error: 'Bu sınıf size ait değil.' }, { status: 403 })
    }

    let scenario = ''
    let question = ''
    let rubric: { criterion: string; maxPoints: number; description?: string }[] = []
    let createdVia = mode

    if (mode === 'ai') {
      // Doğrudan (önizlemesiz) AI üretimi — nadiren kullanılır, ama API
      // esnekliği için destekleniyor.
      if (!subject?.trim() || !topic?.trim()) {
        return NextResponse.json({ error: 'Yapay zeka için ders ve konu zorunlu.' }, { status: 400 })
      }
      try {
        const result = await generateWithAI(subject, topic, grade || '', req.nextUrl.origin)
        scenario = result.scenario; question = result.question; rubric = result.rubric
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Soru üretilemedi, tekrar dene.' }, { status: 500 })
      }
    } else if (mode === 'manual') {
      const b = body as any
      if (!b.scenario?.trim() || !b.question?.trim()) {
        return NextResponse.json({ error: 'Senaryo ve soru zorunlu.' }, { status: 400 })
      }
      if (!Array.isArray(b.rubric) || b.rubric.length === 0) {
        return NextResponse.json({ error: 'En az bir puanlama kriteri girmelisiniz.' }, { status: 400 })
      }
      scenario = b.scenario.trim()
      question = b.question.trim()
      rubric = b.rubric.map((r: any) => ({
        criterion: (r.criterion || '').trim(),
        maxPoints: Number(r.maxPoints) || 0,
        description: (r.description || '').trim(),
      })).filter((r: any) => r.criterion && r.maxPoints > 0)
      if (rubric.length === 0) {
        return NextResponse.json({ error: 'Geçerli bir puanlama kriteri girmelisiniz (kriter adı + puan).' }, { status: 400 })
      }
      // Frontend, AI-üretimli-ama-onaylanmış içerik için de 'manual' yolunu
      // kullanıyor; asıl kaynağı ayırt etmek istersen body.created_via
      // opsiyonel olarak gönderilebilir.
      createdVia = (b.created_via === 'ai' ? 'ai' : 'manual') as any
    } else {
      return NextResponse.json({ error: "mode 'ai' veya 'manual' olmalı." }, { status: 400 })
    }

    // ── Bağımsız MEB uygunluk kontrolü (OpenAI) ──
    // Kaynak fark etmeksizin (AI-üretimli VEYA öğretmenin kendi yazdığı),
    // öğrenciye gitmeden önce SENARYO+SORU MEB müfredatına uygunluk, yaş
    // grubu uygunluğu ve güvenlik açısından bağımsız bir modelle (Claude'un
    // kendi ürettiğini yine Claude'a kontrol ettirmek yerine) kontrol
    // edilir. Sadece onay alırsa kaydedilip öğrenciye gösterilir.
    const rubricSummary = rubric.map(r => `${r.criterion} (${r.maxPoints}p)`).join(', ')
    const verifyPrompt = `Bir öğretmen, ${grade || 'belirtilmemiş'} seviyesindeki öğrencilerine "${subject || 'belirtilmemiş'}" dersinde şu açık uçlu soruyu ödev olarak atamak istiyor. Bu içeriği Türkiye MEB müfredatına uygunluk, yaş grubuna uygunluk, bilimsel/faktüel doğruluk ve genel eğitim içeriği güvenliği açısından değerlendir.

SENARYO: "${scenario}"
SORU: "${question}"
PUANLAMA KRİTERLERİ: ${rubricSummary}

Bu içerik, belirtilen seviyedeki öğrencilere gösterilmeye uygun mu? Sadece şu JSON formatında yanıt ver:
{"ok": true veya false, "reason": "Türkçe, kısa (1 cümle) gerekçe — uygun değilse neden, uygunsa boş bırakabilirsin"}`

    const verification = await verifyQuestionWithOpenAI(verifyPrompt)
    if (verification.ok === false) {
      return NextResponse.json({
        error: `İçerik MEB uygunluk kontrolünden geçemedi: ${verification.reason || 'Uygun bulunmadı.'} Lütfen senaryo/soruyu düzenleyip tekrar dene.`,
      }, { status: 422 })
    }

    const { data: created, error: insErr } = await supabase
      .from('open_ended_assignments')
      .insert({
        teacher_id: teacherRow.id,
        classroom_id,
        title: title.trim(),
        grade: grade || null,
        subject: subject?.trim() || null,
        topic: topic?.trim() || null,
        scenario,
        question,
        rubric,
        created_via: createdVia,
        due_date: due_date || null,
        verified: true,
      })
      .select('*, classrooms(name)')
      .single()

    if (insErr || !created) {
      console.error('[create-open-ended] kayıt hatası:', insErr)
      return NextResponse.json({ error: 'Ödev kaydedilemedi.' }, { status: 500 })
    }

    return NextResponse.json({ assignment: created })
  } catch (e: any) {
    console.error('[create-open-ended]', e?.message)
    return NextResponse.json({ error: 'Bir hata oluştu, tekrar dene.' }, { status: 500 })
  }
}
