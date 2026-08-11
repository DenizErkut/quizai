import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 60
export const runtime = 'nodejs'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { getTopicMastery } from '@/lib/mastery'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const sbAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: { user } } = await sbAuth.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum gecersiz.' }, { status: 401 })

  // Rate limiting — 30 istek/gün
  try {
    const rlDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const today = new Date().toISOString().split('T')[0]
    const { data: rl } = await rlDb.from('api_rate_limits').select('id, count').eq('user_id', user.id).eq('endpoint', 'chat').eq('window_date', today).maybeSingle()
    if (rl) {
      if (rl.count >= 30) return NextResponse.json({ error: 'Günlük chat limiti aşıldı.', limit: 30 }, { status: 429 })
      await rlDb.from('api_rate_limits').update({ count: rl.count + 1 }).eq('id', rl.id)
    } else { await rlDb.from('api_rate_limits').insert({ user_id: user.id, endpoint: 'chat', count: 1, window_date: today }) }
  } catch { /* devam et */ }

  try {
    const { messages, topic, language, questions = [], answers = [] } = await req.json()

    // ÖNEMLİ: questions/answers her zaman gelmeyebilir — örn. app/exam/page.tsx
    // sınav sonu analiz özelliği sadece messages+topic+language gönderiyor
    // (soru/cevap detayını doğrudan mesaj metnine gömüyor). Önceki halde
    // questions.map(...) burada undefined üzerinde çöküyordu, hata catch
    // bloğunda sessizce yutulup "Bir hata oluştu" mesajı gerçek bir AI
    // cevabıymış gibi gösteriliyordu — yani sınav analizi muhtemelen hiç
    // çalışmıyordu. questions=[] varsayılanıyla bu artık çökmüyor.
    const hasQuizContext = Array.isArray(questions) && questions.length > 0

    const wrongQuestions = hasQuizContext
      ? questions
          .map((q: any, i: number) => ({ ...q, userAns: answers[i]?.userAns }))
          .filter((_: any, i: number) => !answers[i]?.correct)
      : []

    const score = hasQuizContext ? answers.filter((a: any) => a.correct).length : 0
    const pct = hasQuizContext ? Math.round((score / questions.length) * 100) : null

    // Faz 1 (Learning Intelligence) entegrasyonu: bu konudaki geçmiş
    // mastery skoru varsa (sadece bu quiz değil, öğrencinin bu konudaki
    // TÜM geçmişi) sohbete dahil edilir — AI'ın ne kadar sabırlı/temel
    // seviyeden başlaması gerektiğini bilmesi için.
    let masteryNote = ''
    try {
      const dbForMastery = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const mastery = await getTopicMastery(dbForMastery, user.id, topic)
      if (mastery && mastery.totalCount >= 3) {
        masteryNote = `\n\nÖĞRENCİNİN BU KONUDAKİ GENEL GEÇMİŞİ (sadece bu test değil, tüm zamanlar): ${mastery.masteryScore}/100 mastery skoru (${mastery.totalCount} soru, ${mastery.wrongCount} yanlış). ${mastery.masteryScore < 50 ? 'Bu öğrenci bu konuda genel olarak zorlanıyor — özellikle sabırlı ol, en temel kavramdan başlamaktan çekinme.' : ''}${mastery.forgettingRisk === 'yüksek' ? ' Bu konuyu uzun süredir tekrar etmemiş, temel hatırlatmalarla başlamak iyi olur.' : ''}`
      }
    } catch { /* mastery opsiyonel bağlam, hata olursa sessiz geç */ }

    // ── SOKRATİK ÖĞRETİM METODOLOJİSİ (Faz 3) ──
    // Önceki halde bu prompt "yanlış soruları adım adım açıkla" diyordu —
    // yani AI doğrudan cevabı veriyordu. Roadmap'in istediği: Hata → İpucu
    // → Örnek → Mini açıklama → Yeni soru zinciri. Öğrenci önce kendi
    // düşünmeye teşvik edilir, cevap hemen verilmez.
    const systemPrompt = `Sen Pratium AI asistanısın — bir konuyu doğrudan anlatan bir ansiklopedi değil, öğrencinin kendi kendine düşünmesini teşvik eden bir ÖĞRETMENSİN. Öğrenciye ${topic} konusunda yardım ediyorsun.

${hasQuizContext ? `Öğrencinin bu testteki bilgileri:
- Konu: ${topic}
- Dil: ${language}
- Skor: %${pct} (${score}/${questions.length} doğru)
- Yanlış soru sayısı: ${wrongQuestions.length}
${masteryNote}

${wrongQuestions.length > 0 ? `Yanlış sorular (kendi cevabı ve doğru cevap dahil — SEN bunları biliyorsun, öğrenciye HEMEN söyleme):\n${wrongQuestions.map((q: any, i: number) => `${i + 1}. Soru: ${q.q}\n   Doğru cevap: ${q.opts[q.ans]}\n   Öğrencinin cevabı: ${q.opts[q.userAns]}\n   Açıklama: ${q.exp}`).join('\n\n')}` : ''}` : `Bu, tek seferlik bir analiz isteği (interaktif bir sohbet değil) — öğrencinin soru/cevap detayı doğrudan aşağıdaki kullanıcı mesajının içinde. Bu durumda Sokratik yöntemi UYGULAMA, doğrudan ve net bir analiz yaz (kullanıcı mesajı zaten bunu istiyor).`}

SOKRATİK ÖĞRETİM KURALLARI (interaktif sohbette geçerli — tek seferlik analiz isteklerinde değil):

1. **Cevabı hemen verme.** Bir öğrenci bir yanlış sorusunu sormanı istediğinde, doğru cevabı ilk mesajında yazma. Bunun yerine önce ona düşündürecek bir soru sor — örneğin: "Bu soruda önce şunu bir düşünelim: [ilgili kavram] ne demek sence?" ya da "Sen [öğrencinin seçtiği yanlış şık] demişsin — bu seçeneği neden düşündün?" (köşeli parantez içindekileri kendi cümlenle, o soruya özel doldur.)

2. **Hata → İpucu → Örnek → Mini açıklama → Yeni soru zinciri izle:**
   - Önce öğrencinin nerede/neden yanlış düşünmüş olabileceğini nazikçe sorgula (bir suçlama değil, meraklı bir keşif havasında)
   - Öğrenci hâlâ emin değilse bir İPUCU ver (cevabı değil, doğru yöne işaret eden bir sezgi/kural)
   - Hâlâ zorlanıyorsa somut, günlük hayattan bir ÖRNEK ver
   - Bunlardan sonra kısa, net bir MİNİ AÇIKLAMA yap (tam cevabı ve nedenini söyle — bu noktada artık saklama)
   - Anladığından emin olmak için (mümkünse) benzer, YENİ bir mini soru sor — öğrenci kendi başına uygulayabiliyor mu diye

3. **İstisna — doğrudan cevap verilecek durumlar:** Öğrenci açıkça "sadece cevabı söyle", "direkt anlat", "vaktim yok" derse ya da aynı soru için ikinci kez sorarsa, o zaman doğrudan ve net anlat — Sokratik yöntemi ısrarla dayatma, öğrencinin isteğine saygı göster. Konuyu SIFIRDAN anlatma isteğinde (yanlış bir soru bağlamında değil) de doğrudan, düzenli bir anlatım yap — Sokratik yöntem özellikle "bu soruyu neden yanlış yaptım" durumları için.

4. **Ton:** Meraklı, sıcak, sabırlı bir öğretmen gibi — asla küçümseyici veya sınav yapar gibi değil. Kısa tut (2-4 cümle), tek seferde çok fazla soru sorma.

5. Genel platform sorularını normal şekilde yanıtla, yeni soru üretme isteklerini karşıla (şık formatında: A) B) C) D)).

6. Cevaplarını ${language === 'Türkçe' ? 'Türkçe' : language} ver.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ reply })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({ reply: 'Bir hata oluştu, lütfen tekrar dene.' }, { status: 500 })
  }
}
