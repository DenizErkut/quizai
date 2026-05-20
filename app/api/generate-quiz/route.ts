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
  const ansPattern = Array.from({length: p.questionCount}, (_,i) => i % 4).join(', ')

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

  return `Sen MEB mufredatina hakim egitim uzmanisın.

Profil: ${p.name}, ${p.grade}, ${p.age} yas, ${p.gender}
Konu: ${p.topic} | Dil: ${p.language} | Zorluk: ${p.difficulty.toUpperCase()}
${fileSec}
Mufredat: ${curriculum || p.grade + ' seviyesine uygun'}
${diffHint}
${visualSec}

${p.questionCount} adet soru uret. "ans" sirasi: ${ansPattern}
4 sik, aciklama ${p.language} dilinde, tekrar yok.

SADECE JSON:
{"questions":[{"qtype":"text","q":"?","opts":["A","B","C","D"],"ans":0,"exp":"...","svg":null}]}`
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (message.content[0] as { text: string }).text
      .replace(/```json|```/g, '').trim()
    questions = JSON.parse(raw).questions

    questions = questions.map((q: Question) => {
      const correctOpt = q.opts[q.ans]
      const shuffled = [...q.opts].sort(() => Math.random() - 0.5)
      return { ...q, opts: shuffled, ans: shuffled.indexOf(correctOpt), qtype: q.qtype || 'text' }
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

  const { sessionId, answers, score } = await req.json()
  const { error } = await supabase.from('quiz_sessions')
    .update({ answers, score, completed: true })
    .eq('id', sessionId).eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Kayit basarisiz.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
