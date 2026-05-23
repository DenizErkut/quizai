import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Service role key — RLS bypass, limit kontrolü için
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ProfileParams {
  name: string; age: number; gender: string; grade: string
  gradeLevel: string; language: string; topic: string
  questionCount: number; difficulty: string
  fileContent?: string; fileType?: string
  includeVisuals?: boolean
}

interface Question {
  q: string; opts: string[]; ans: number; exp: string
  svg?: string | null; qtype?: 'text' | 'svg'
}

const CURRICULUM_SCOPE: Record<string, string> = {
  'ilkokul 1. sinif': 'Sayilari okuma/yazma (1-20), basit toplama cikarma (10a kadar).',
  'ilkokul 2. sinif': 'Toplama cikarma (100e kadar), saat okuma, uzunluk olcme.',
  'ilkokul 3. sinif': 'Carpma (2-5 ile), bolme, kesir (1/2, 1/4).',
  'ilkokul 4. sinif': 'Carpim tablosu (1-9), dort islem, ondalik, kesirler.',
  'ortaokul 5. sinif': 'Dogal sayilar, tam sayilara giris, kesirler, yuzde (basit).',
  'ortaokul 6. sinif': 'Tam sayilar, kesirler (dort islem), oran-orani (giris), geometri. OBEB/OKEK YOKTUR.',
  'ortaokul 7. sinif': 'Rasyonel sayilar, oran-orani, yuzde, denklemler (basit).',
  'ortaokul 8. sinif': 'Carpanlara ayirma, denklem sistemleri, Pisagor, olasilik.',
  'lise 9. sinif': 'Kumeler, mutlak deger, fonksiyon, trigonometri (giris).',
  'lise 10. sinif': 'Polinomlar, ikinci derece, logaritma, trigonometri.',
  'lise 11. sinif': 'Turev, integral (giris), istatistik.',
  'lise 12. sinif': 'Integral uygulamalari, seriler, olasilik (ileri).',
}

const DIFFICULTY_HINTS: Record<string, string> = {
  kolay: 'KOLAY: Temel tanim sorulari. Siklar cok belirgin farkli.',
  normal: 'NORMAL: Mufredat seviyesi. Kavramin uygulamasi.',
  zor: 'ZOR: Analiz gerektiren. Siklar birbirine yakin.',
  'cok zor': 'COK ZOR: Olimpiyat seviyesi. Zekice tuzaklar.',
}

function getCurriculumNote(grade: string): string {
  const n = (s: string) => s.toLowerCase()
    .replace(/\u0131/g,'i').replace(/\u015f/g,'s').replace(/\u011f/g,'g')
    .replace(/\u00fc/g,'u').replace(/\u00f6/g,'o').replace(/\u00e7/g,'c')
  const ng = n(grade.trim())
  for (const [k,v] of Object.entries(CURRICULUM_SCOPE)) {
    if (n(k) === ng) return v
  }
  return ''
}

function buildPrompt(p: ProfileParams): string {
  const curriculum = getCurriculumNote(p.grade)
  const diffHint = DIFFICULTY_HINTS[p.difficulty] || DIFFICULTY_HINTS.normal

  const fileSec = p.fileContent ? `
DOSYA ICERIGI (bu icerikten soru uret):
---
${p.fileContent.slice(0, 6000)}
---` : ''

  const visualSec = p.includeVisuals ? `
GORSEL SORU: Sorularin ~30%'i gorsel olabilir. Gorsel sorular icin:
- "qtype":"svg", "svg" alanina gecerli SVG kodu (viewBox="0 0 400 250")
- SVG renkleri: #5b4cf5 #16a34a #dc2626 #d97706 #64748b
- font-family="sans-serif"
- Soru SVG'ye referans vermeli: "Asagidaki grafige gore..."
Gorsel olmayan: "qtype":"text", "svg":null` : `Tum sorular metin tabanli. "qtype":"text", "svg":null`

  return `Sen MEB mufredatina hakim egitim uzmanisın. DOGRU CEVAPLARI URET.

Profil: ${p.name}, ${p.grade}, ${p.age} yas, ${p.gender}
Konu: ${p.topic} | Dil: ${p.language} | Zorluk: ${p.difficulty.toUpperCase()}
${fileSec}
Mufredat: ${curriculum || p.grade + ' seviyesine uygun'}
${diffHint}
${visualSec}

${p.questionCount} adet soru uret.

KRITIK KURALLAR:
1. "ans" her zaman opts dizisindeki GERCEKTEN DOGRU cevabın index'i olmalidir (0, 1, 2 veya 3).
2. Matematiksel hesaplama gerektiren sorularda ONCE hesapla, sonra cevabi yaz.
3. "exp" aciklamasi neden dogru oldugunu aciklayan TUTARLI bir metin olmalidir.
4. opts[ans] == dogru cevap. Bunu her soru icin kontrol et.
5. Hic "ans" degerini ezberden yazma — her soru icin ayri dusun.

4 sik, aciklama ${p.language} dilinde, tekrar yok.

SADECE JSON:
{"questions":[{"qtype":"text","q":"?","opts":["yanlis1","yanlis2","DOGRU","yanlis3"],"ans":2,"exp":"Aciklama.","svg":null}]}`
}

// ── Aylik sayaci sifirla ve limit kontrol et ──
async function checkAndIncrementLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  // Profili cek
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('plan, plan_expires_at, monthly_test_count, monthly_reset_at')
    .eq('id', userId)
    .single()

  if (error || !profile) return { allowed: false, reason: 'profile_not_found' }

  // Premium suresi dolmussa free'ye dusur
  if (profile.plan === 'premium' && profile.plan_expires_at && new Date(profile.plan_expires_at) < new Date()) {
    await supabaseAdmin.from('profiles').update({ plan: 'free' }).eq('id', userId)
    profile.plan = 'free'
  }

  // Premium — sinirsiz
  if (profile.plan === 'premium') {
    await supabaseAdmin.from('profiles')
      .update({ monthly_test_count: (profile.monthly_test_count || 0) + 1 })
      .eq('id', userId)
    return { allowed: true }
  }

  // Aylik reset kontrolu
  const resetAt = profile.monthly_reset_at ? new Date(profile.monthly_reset_at) : new Date(0)
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0)
  
  if (resetAt < monthStart) {
    // Yeni ay — sayaci sifirla
    await supabaseAdmin.from('profiles')
      .update({ monthly_test_count: 1, monthly_reset_at: monthStart.toISOString() })
      .eq('id', userId)
    return { allowed: true }
  }

  // Free plan limit: 10
  const count = profile.monthly_test_count || 0
  if (count >= 10) {
    return { allowed: false, reason: 'limit_reached' }
  }

  // Sayaci artir
  await supabaseAdmin.from('profiles')
    .update({ monthly_test_count: count + 1 })
    .eq('id', userId)
  return { allowed: true }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Oturum gecersiz.' }, { status: 401 })

  // ── SERVER-SIDE LİMİT KONTROLÜ ──
  const limitCheck = await checkAndIncrementLimit(user.id)
  if (!limitCheck.allowed) {
    if (limitCheck.reason === 'limit_reached') {
      return NextResponse.json({
        error: 'limit_reached',
        message: 'Bu ayki 10 test hakkını kullandın. Premium\'a geç veya ay başını bekle.',
      }, { status: 429 })
    }
    return NextResponse.json({ error: 'Test başlatılamadı.' }, { status: 400 })
  }

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
      model: 'claude-sonnet-4-5',
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (message.content[0] as { text: string }).text
      .replace(/```json|```/g, '').trim()
    questions = JSON.parse(raw).questions

    questions = questions.map((q: Question) => {
      if (!q.opts || q.opts.length !== 4 || q.ans < 0 || q.ans > 3) return q
      const correctOpt = q.opts[q.ans]
      // Fisher-Yates shuffle
      const shuffled = [...q.opts]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      const newAns = shuffled.indexOf(correctOpt)
      // Güvenlik: correctOpt bulunamadıysa shuffle yapma
      if (newAns === -1) return { ...q, qtype: q.qtype || 'text' }
      return { ...q, opts: shuffled, ans: newAns, qtype: q.qtype || 'text' }
    })
  } catch (e) {
    // Limit artırıldı ama soru üretilemedi — geri al
    await supabaseAdmin.from('profiles')
      .update({ monthly_test_count: (await supabaseAdmin.from('profiles').select('monthly_test_count').eq('id', user.id).single()).data?.monthly_test_count - 1 })
      .eq('id', user.id)
    console.error('Claude API:', e)
    return NextResponse.json({ error: 'Sorular uretilemedi.' }, { status: 500 })
  }

  const { data: session } = await supabase
    .from('quiz_sessions')
    .insert({ user_id: user.id, topic, grade: profile.grade, language, question_count: questionCount, questions, answers: [], completed: false })
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

  const body = await req.json()
  const { sessionId, answers, score } = body

  // Session guncelle — direkt, supabaseAdmin olmadan
  const { error: updateErr } = await supabase.from('quiz_sessions')
    .update({ answers, score, completed: true })
    .eq('id', sessionId).eq('user_id', user.id)

  if (updateErr) return NextResponse.json({ error: 'Kayit basarisiz.' }, { status: 500 })

  // pct hesapla
  const { data: sessionData, error: sessionErr } = await supabaseAdmin
    .from('quiz_sessions')
    .select('topic, question_count')
    .eq('id', sessionId)
    .single()

  const questionCount = sessionData?.question_count || 1
  const pct = Math.round((score / questionCount) * 100)
  const topic = sessionData?.topic || ''

  // (session already updated above)

  // Weak topics upsert
  if (topic) {
    const { data: existingWeak } = await supabaseAdmin
      .from('weak_topics')
      .select('id, wrong_count, total_count')
      .eq('user_id', user.id)
      .eq('topic', topic)
      .single()

    const wrong = questionCount - score
    if (existingWeak) {
      await supabaseAdmin.from('weak_topics').update({
        wrong_count: existingWeak.wrong_count + wrong,
        total_count: existingWeak.total_count + questionCount,
      }).eq('id', existingWeak.id)
    } else {
      await supabaseAdmin.from('weak_topics').insert({
        user_id: user.id, topic,
        wrong_count: wrong, total_count: questionCount,
      })
    }
  }

  // Plan progress otomatik kontrol — sadece pct >= 60 ise
  if (pct >= 60 && topic) {
    try {
      const { data: activePlan } = await supabaseAdmin
        .from('study_plans')
        .select('id, plan')
        .eq('user_id', user.id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

      if (activePlan?.plan?.weeks) {
        const weeks = activePlan.plan.weeks as Array<{ week: number; topics?: string[] }>
        const allTopics: { week: number; topic: string }[] = []
        weeks.forEach(w => w.topics?.forEach(t => allTopics.push({ week: w.week, topic: t })))

        if (allTopics.length > 0) {
          const topicList = allTopics.map(t => `Hafta ${t.week}: "${t.topic}"`).join('\n')

          const matchMsg = await anthropic.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 200,
            messages: [{
              role: 'user',
              content: `Kullanici "${topic}" konusunda test cozdu.\nAsagidaki plan konularindan hangisiyle esleşiyor? Ayni veya cok benzer konulari bul.\n\n${topicList}\n\nSadece eslesen konulari JSON olarak dondur: {"matches":[{"week":1,"topic":"konu adi"}]}\nEsleme yoksa: {"matches":[]}\nSadece JSON, baska hicbir sey yazma.`
            }]
          })

          const rawMatch = (matchMsg.content[0] as { text: string }).text.replace(/```json|```/g, '').trim()
          const { matches } = JSON.parse(rawMatch)

          if (matches?.length > 0) {
            for (const match of matches) {
              const { data: existingProg } = await supabaseAdmin
                .from('plan_progress')
                .select('id, completed')
                .eq('user_id', user.id)
                .eq('plan_id', activePlan.id)
                .eq('week_number', match.week)
                .eq('topic', match.topic)
                .single()

              if (existingProg && !existingProg.completed) {
                await supabaseAdmin.from('plan_progress').update({
                  completed: true,
                  completed_at: new Date().toISOString(),
                }).eq('id', existingProg.id)
              } else if (!existingProg) {
                await supabaseAdmin.from('plan_progress').insert({
                  user_id: user.id,
                  plan_id: activePlan.id,
                  week_number: match.week,
                  topic: match.topic,
                  completed: true,
                  completed_at: new Date().toISOString(),
                })
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Plan check error:', e)
    }
  }

  // ── Rozet kontrolü ──
  try {
    const { data: allSessions } = await supabaseAdmin
      .from('quiz_sessions')
      .select('pct, completed')
      .eq('user_id', user.id)
      .eq('completed', true)

    const { data: streakData } = await supabaseAdmin
      .from('streaks')
      .select('current_streak')
      .eq('user_id', user.id)
      .single()

    const { data: existingBadges } = await supabaseAdmin
      .from('badges')
      .select('badge_key')
      .eq('user_id', user.id)

    const earned = new Set((existingBadges || []).map((b: any) => b.badge_key))
    const totalTests = (allSessions || []).length
    const avgPct = totalTests > 0 ? Math.round((allSessions || []).reduce((s: number, x: any) => s + x.pct, 0) / totalTests) : 0
    const streak = streakData?.current_streak || 0
    const toEarn: string[] = []

    if (totalTests >= 1 && !earned.has('first_test')) toEarn.push('first_test')
    if (pct === 100 && !earned.has('perfect_score')) toEarn.push('perfect_score')
    if (totalTests >= 10 && !earned.has('tests_10')) toEarn.push('tests_10')
    if (totalTests >= 50 && !earned.has('tests_50')) toEarn.push('tests_50')
    if (totalTests >= 100 && !earned.has('tests_100')) toEarn.push('tests_100')
    if (avgPct >= 80 && totalTests >= 10 && !earned.has('high_score_80')) toEarn.push('high_score_80')
    if (streak >= 3 && !earned.has('streak_3')) toEarn.push('streak_3')
    if (streak >= 7 && !earned.has('streak_7')) toEarn.push('streak_7')
    if (streak >= 30 && !earned.has('streak_30')) toEarn.push('streak_30')

    if (toEarn.length > 0) {
      await supabaseAdmin.from('badges').insert(
        toEarn.map(badge_key => ({ user_id: user.id, badge_key }))
      )
    }
  } catch (e) {
    console.error('Badge check error:', e)
  }

  return NextResponse.json({ ok: true, pct })
}
