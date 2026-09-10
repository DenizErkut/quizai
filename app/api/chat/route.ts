import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 60
export const runtime = 'nodejs'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server-create-client'
import { getTopicMastery } from '@/lib/mastery'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { inspectTutorInput, inspectTutorOutput } from '@/lib/tutor-safety'

const client = new Anthropic()
type TutorQuestion = { q: string; opts: string[]; ans: number; exp?: string; userAns?: number }
type TutorAnswer = { userAns?: number; correct?: boolean }

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const sbAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: { user } } = await sbAuth.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum gecersiz.' }, { status: 401 })
  const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Rate limiting — 30 istek/gün
  try {
    const rlDb = adminDb
    const today = new Date().toISOString().split('T')[0]
    const { data: rl } = await rlDb.from('api_rate_limits').select('id, count').eq('user_id', user.id).eq('endpoint', 'chat').eq('window_date', today).maybeSingle()
    if (rl) {
      if (rl.count >= 30) return NextResponse.json({ error: 'Günlük chat limiti aşıldı.', limit: 30 }, { status: 429 })
      await rlDb.from('api_rate_limits').update({ count: rl.count + 1 }).eq('id', rl.id)
    } else { await rlDb.from('api_rate_limits').insert({ user_id: user.id, endpoint: 'chat', count: 1, window_date: today }) }
  } catch { /* devam et */ }

  try {
    const { messages, topic, language, questions = [], answers = [] } = await req.json()
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 24 || typeof topic !== 'string' || topic.length > 160) {
      return NextResponse.json({ error: 'Geçersiz sohbet bağlamı.' }, { status: 400 })
    }
    const safeMessages = messages.filter((message: unknown): message is { role: 'user' | 'assistant'; content: string } => {
      if (!message || typeof message !== 'object') return false
      const item = message as { role?: unknown; content?: unknown }
      return (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string' && item.content.length <= 4000
    })
    if (safeMessages.length !== messages.length) return NextResponse.json({ error: 'Geçersiz mesaj.' }, { status: 400 })
    const lastUserMessage = [...safeMessages].reverse().find(message => message.role === 'user')?.content || ''
    const inputSafety = inspectTutorInput(lastUserMessage)
    if ('code' in inputSafety) {
      await adminDb.from('agent_decision_audit').insert({ actor_id:user.id, agent_name:'ai-tutor-v1', policy_version:'tutor-safety-v2', input_summary:{ safety_code:inputSafety.code, message_count:safeMessages.length }, decision_summary:{ blocked:true } })
      return NextResponse.json({ reply:inputSafety.reply, policy_version:'tutor-safety-v2', safety_intervention:inputSafety.code, requires_teacher_review:inputSafety.code==='self_harm' })
    }

    // ÖNEMLİ: questions/answers her zaman gelmeyebilir — örn. app/exam/page.tsx
    // sınav sonu analiz özelliği sadece messages+topic+language gönderiyor
    // (soru/cevap detayını doğrudan mesaj metnine gömüyor). Önceki halde
    // questions.map(...) burada undefined üzerinde çöküyordu, hata catch
    // bloğunda sessizce yutulup "Bir hata oluştu" mesajı gerçek bir AI
    // cevabıymış gibi gösteriliyordu — yani sınav analizi muhtemelen hiç
    // çalışmıyordu. questions=[] varsayılanıyla bu artık çökmüyor.
    const hasQuizContext = Array.isArray(questions) && questions.length > 0

    const typedQuestions = questions as TutorQuestion[]
    const typedAnswers = Array.isArray(answers) ? answers as TutorAnswer[] : []
    const wrongQuestions = hasQuizContext
      ? typedQuestions
          .map((q, i) => ({ ...q, userAns: typedAnswers[i]?.userAns }))
          .filter((_, i) => !typedAnswers[i]?.correct)
      : []

    const score = hasQuizContext ? typedAnswers.filter(a => a.correct).length : 0
    const pct = hasQuizContext ? Math.round((score / questions.length) * 100) : null

    // Faz 1 (Learning Intelligence) entegrasyonu: bu konudaki geçmiş
    // mastery skoru varsa (sadece bu quiz değil, öğrencinin bu konudaki
    // TÜM geçmişi) sohbete dahil edilir — AI'ın ne kadar sabırlı/temel
    // seviyeden başlaması gerektiğini bilmesi için.
    let masteryNote = ''
    let graphNote = ''
    let learnerLevelNote = ''
    try {
      const dbForMastery = adminDb
      const { data: learnerProfile } = await dbForMastery.from('profiles').select('grade, age').eq('id', user.id).maybeSingle()
      if (learnerProfile?.grade || learnerProfile?.age) {
        learnerLevelNote = `\nÖĞRENCİ SEVİYESİ: sınıf=${learnerProfile.grade || 'belirtilmemiş'}, yaş=${learnerProfile.age || 'belirtilmemiş'}. Anlatımı bu seviyeye uyarla; gereksiz teknik terim kullanma.`
      }
      const mastery = await getTopicMastery(dbForMastery, user.id, topic)
      if (mastery && mastery.totalCount >= 3) {
        masteryNote = `\n\nÖĞRENCİNİN BU KONUDAKİ GENEL GEÇMİŞİ (sadece bu test değil, tüm zamanlar): ${mastery.masteryScore}/100 mastery skoru (${mastery.totalCount} soru, ${mastery.wrongCount} yanlış). ${mastery.masteryScore < 50 ? 'Bu öğrenci bu konuda genel olarak zorlanıyor — özellikle sabırlı ol, en temel kavramdan başlamaktan çekinme.' : ''}${mastery.forgettingRisk === 'yüksek' ? ' Bu konuyu uzun süredir tekrar etmemiş, temel hatırlatmalarla başlamak iyi olur.' : ''}`
      }
      // Kanonik kazanım ve aktif öneri bağlamı: bulunamazsa mevcut akış aynen sürer.
      const [{ data: objective }, { data: recommendation }] = await Promise.all([
        dbForMastery.from('student_mastery').select('learning_objective_key, subject, topic').eq('student_id', user.id).eq('topic', topic).order('last_mastery_update', { ascending: false }).limit(1).maybeSingle(),
        dbForMastery.from('student_recommendations').select('subject, topic, reason, status').eq('student_id', user.id).eq('topic', topic).in('status', ['active', 'accepted']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (objective?.learning_objective_key) graphNote += `\nKANONİK ÖĞRENME BAĞLAMI: ders=${objective.subject || 'belirtilmemiş'}, konu=${objective.topic || topic}, kazanım=${objective.learning_objective_key}. Kazanımın dışına taşmadan, yaşa uygun anlat.`
      if (recommendation) graphNote += `\nAKTİF ÖNERİ BAĞLAMI: durum=${recommendation.status}, gerekçe=${String(recommendation.reason || '').slice(0, 240)}. Yanıtı bu önerinin hedefiyle uyumlu tut.`
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
${graphNote}
${learnerLevelNote}

${wrongQuestions.length > 0 ? `Yanlış sorular (kendi cevabı ve doğru cevap dahil — SEN bunları biliyorsun, öğrenciye HEMEN söyleme):\n${wrongQuestions.map((q, i) => `${i + 1}. Soru: ${q.q}\n   Doğru cevap: ${q.opts[q.ans]}\n   Öğrencinin cevabı: ${q.userAns === undefined ? 'Yanıtlanmadı' : q.opts[q.userAns]}\n   Açıklama: ${q.exp || ''}`).join('\n\n')}` : ''}` : `Bu, tek seferlik bir analiz isteği (interaktif bir sohbet değil) — öğrencinin soru/cevap detayı doğrudan aşağıdaki kullanıcı mesajının içinde. Bu durumda Sokratik yöntemi UYGULAMA, doğrudan ve net bir analiz yaz (kullanıcı mesajı zaten bunu istiyor).`}

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

4a. **Seviye ve güvenlik:** Öğrencinin sınıf/yaş seviyesinin üstünde içerik, korkutucu dil, kişisel veri talebi veya yaşa uygun olmayan konu üretme. Seviyeden emin değilsen temel ve güvenli açıklamayla başla. İpucu seviyesini birer adım artır; ilk yanıtta doğrudan çözümü verme.

5. Genel platform sorularını normal şekilde yanıtla, yeni soru üretme isteklerini karşıla (şık formatında: A) B) C) D)).

6. Cevaplarını ${language === 'Türkçe' ? 'Türkçe' : language} ver.`
    const approvalBoundary = `\n\nYETKİ SINIRI (değişmez): Not, puan, kazanım doğrulama, ödev, sınıf planı, öğrenci profili veya öneri durumu değiştirme. Bu tür bir istek gelirse yalnızca açıklama yap, işlemi gerçekleştiremeyeceğini söyle ve "öğretmen onayı gerekli" ifadesini kullan. Öğretmen onayı gerektiren hiçbir işlemi sohbet içinde olmuş gibi gösterme. Politika sürümü: tutor-safety-v1.`

    const startedAt = Date.now()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: systemPrompt + approvalBoundary,
      messages: safeMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    })

    const rawReply = response.content[0].type === 'text' ? response.content[0].text : ''
    const outputSafety = inspectTutorOutput(rawReply)
    const reply = 'code' in outputSafety ? outputSafety.reply : rawReply
    const requiresTeacherReview = /öğretmen onayı|not değiştir|puan değiştir|ödev ata|sınıf planı/i.test(reply)
    await Promise.allSettled([
      logAnthropicUsage('tutor-response', 'claude-sonnet-4-5', response, { userId: user.id, durationMs: Date.now() - startedAt, meta: { policy_version: 'tutor-safety-v2', has_quiz_context: hasQuizContext } }),
      adminDb.from('agent_decision_audit').insert({ actor_id: user.id, agent_name: 'ai-tutor-v1', policy_version: 'tutor-safety-v2', input_summary: { topic, has_quiz_context: hasQuizContext, message_count: safeMessages.length, wrong_question_count: wrongQuestions.length }, decision_summary: { response_length: reply.length, requires_teacher_review: requiresTeacherReview, output_blocked:'code' in outputSafety } }),
    ])
    return NextResponse.json({ reply, policy_version: 'tutor-safety-v2', requires_teacher_review: requiresTeacherReview, safety_intervention:'code' in outputSafety?outputSafety.code:null })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({ reply: 'Bir hata oluştu, lütfen tekrar dene.' }, { status: 500 })
  }
}
