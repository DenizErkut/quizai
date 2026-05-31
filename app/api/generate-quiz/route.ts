import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalizeTR(s: string): string {
  return s.toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
}

const CURRICULUM_KEYWORDS = [
  'matematik','sayi','sayilar','islem','toplama','cikarma','carpma','bolme','kesir','ondalik',
  'denklem','oran','yuzde','geometri','alan','hacim','cevre','aci','ucgen','dortgen',
  'cember','daire','istatistik','olasilik','cebir','fonksiyon','turev','integral',
  'logaritma','trigonometri','vektor','matris','kombinasyon','permutasyon',
  'tam sayi','dogal sayi','rasyonel','carpanlar','katlar','asal','oruntu',
  'hucre','organeller','organel','fotosent','solunum','bitki','hayvan',
  'madde','enerji','kuvvet','hareket','isik','ses','elektrik','miknatis',
  'atom','element','bilesi','asit','baz','reaksiyon','dna','gen','evrim',
  'ekosistem','cevre','fizik','kimya','biyoloji','fen','termodinamik','mekanik',
  'mitokondri','ribozom','cekirdek','lizozom','kloroplast','vakuol','zar',
  'doku','organ','sistem','sindirim','dolasim','solunum sistemi','bosaltim',
  'iskelet','kas','sinir','ureme','kalitim','kromozom','mutasyon',
  'fotosentez','klorofil','madde dongusu','besin zinciri','populasyon',
  'tarih','osmanli','cumhuriyet','ataturk','turkiye','anadolu','uygarlik','kultur',
  'cografya','harita','iklim','nufus','ekonomi','siyasi','devlet','demokrasi',
  'inkilap','savas','anlasma','imparatorluk','medeniyet','koy','sehir','bolge',
  'turkce','dil','cumle','paragraf','yazim','noktalama','edeb','siir','roman',
  'kelime','anlam','ses','hece','sozcuk','metin','hikaye','masal','destan',
  'ucak','kanat','govde','motor','yakit','pist','kokpit','inis','kalkis','navigasyon',
  'meteoroloji','havacilik','pervane','irtifa','radar','basinc','flap','aileron',
  'hidrolik','pnomatik','aviyonik','kaldirma kuvveti','suruklenme','itki',
  'cell','organelle','photosynthesis','respiration','atom','molecule','force',
  'energy','history','geography','math','algebra','geometry','biology','chemistry','physics',
  'lgs','yks','tyt','ayt','kpss','ales','dgs','osym','sinav','hazirlik',
  'deneme','kazanim','ogrenme','okul','ders','test','soru','konu','mufredat','sinif',
]

function isInCurriculum(topic: string, plan: string): boolean {
  if (plan === 'premium' || plan === 'unlimited') return true
  const norm = normalizeTR(topic)
  return CURRICULUM_KEYWORDS.some(kw => norm.includes(kw) || kw.includes(norm.split(' ')[0]))
}

// ─── GÖRSEL KATEGORI TESPİTİ ──────────────────────────────────────────────────
function detectVisualCategory(topic: string): string | null {
  const t = normalizeTR(topic)

  if (/ucgen|kare|dortgen|daire|cember|geometri|alan|cevre|hacim|piramit|kup|silindir|prizma|aci|kenar|kose|kosegen|eskenar|ikizkenar|scalene|dikdortgen|trapez|paralelkenar/.test(t)) return 'geometry'
  if (/koordinat|grafik|fonksiyon|turev|integral|sinusoidal|parabolik|dogrusal|eksponansiyel|cebir|denklem|eksik/.test(t)) return 'math_graph'
  if (/harita|turkiye|bolge|il|sehir|cografya|iklim|akarsu|dag|deniz|kiyi|nufus|yeryuzu|kita|okyanuslar|enlem|boylam/.test(t)) return 'map'
  if (/hucre|organell|organel|mitokondri|ribozom|kloroplast|dna|gen|kromozom|zar|sitoplazma|biyoloji|bakteri|virus|bitki hucresi|hayvan hucresi/.test(t)) return 'biology'
  if (/atom|element|periyodik|molekul|kimyasal|bagli|orbital|elektron|proton|notron|asit|baz|reaksiyon/.test(t)) return 'chemistry'
  if (/kuvvet|hareket|enerji|elektrik|devre|magnet|miknatis|optik|ses dalgasi|fizik|newton|ivme|hiz|momentum|dalga/.test(t)) return 'physics'
  if (/gunes sistemi|gezegen|ay|dunya|uzay|yildiz|galaksi|asteroid|kuyruklu yildiz/.test(t)) return 'space'
  if (/besin zinciri|ekosistem|gida agi|fotosent|solunum|populasyon|biyom|biyocevre/.test(t)) return 'ecosystem'
  if (/tarih|osmanli|cumhuriyet|savas|anlasma|kronoloji|zaman cetveli|donem|yuzyil/.test(t)) return 'timeline'
  if (/matematik|sayi|kesir|ondalik|oran|yuzde|istatistik|olasilik|ortalama/.test(t)) return 'math_graph'

  return null
}

// ─── SVG PROMPT OLUŞTURMA ─────────────────────────────────────────────────────
function buildSVGPrompt(category: string, topic: string, questionText: string, grade: string): string {
  const base = `You are an expert SVG educational diagram creator for Turkish students (${grade}).
Create a SINGLE clean, educational SVG diagram for this quiz question.

QUESTION: "${questionText}"
TOPIC: "${topic}"

CRITICAL SVG RULES:
- Width: 400, Height: 280 (always use viewBox="0 0 400 280")
- Clean white background: <rect width="400" height="280" fill="white"/>
- Use clear colors: geometry=#2563eb, labels=black, highlights=#ef4444
- Font: Arial, minimum 13px for readability
- Add a subtle title at top relating to the question
- NO JavaScript, NO external resources, NO foreignObject
- Return ONLY the SVG code, nothing else, starting with <svg`

  const guides: Record<string, string> = {
    geometry: `Draw the geometric shape relevant to this question. Label all sides, angles, and measurements mentioned. Use blue for shapes, red for the unknown/highlighted element. Show the formula if applicable.`,
    math_graph: `Draw a coordinate system or relevant mathematical graph. Label axes (x,y), show key points, functions, or the relationship being asked about. Use grid lines (light gray).`,
    map: `Draw a simplified outline map relevant to the question. For Turkey: draw its distinctive outline with major regions/cities labeled. For world geography: show relevant countries/regions. Use light blue for water, light green for land.`,
    biology: `Draw a labeled diagram of the biological structure. For cells: show organelles with arrows and labels. For systems: show the organ/process with clear labels. Use soft colors (green for plants, pink for animal cells).`,
    chemistry: `Draw the chemical structure, atomic model, or reaction diagram. Show electron shells for atoms, bond lines for molecules, or equation with visual representation.`,
    physics: `Draw the physics scenario with force arrows, motion diagrams, or circuit schematic. Label all forces, velocities, or electrical components clearly.`,
    space: `Draw the relevant space object(s) with labels showing size relationships, orbital paths, or key features.`,
    ecosystem: `Draw a simple food chain or ecosystem diagram with arrows showing energy flow. Include 3-4 organisms with clear labels.`,
    timeline: `Draw a horizontal timeline with 4-6 key events marked. Use dots/markers and year labels below, event descriptions above.`,
  }

  return `${base}\n\nDIAGRAM INSTRUCTIONS:\n${guides[category] || guides.geometry}\n\nMake it directly relevant to the specific question being asked. The student should understand the concept better by seeing this diagram.`
}

// ─── GÖRSEL ÜRETİMİ ──────────────────────────────────────────────────────────
async function generateVisualForQuestion(
  q: any,
  category: string,
  topic: string,
  grade: string
): Promise<string | null> {
  try {
    const prompt = buildSVGPrompt(category, topic, q.q, grade)
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
    // SVG'yi temizle — sadece <svg...></svg> al
    const match = text.match(/<svg[\s\S]*<\/svg>/i)
    if (match) return match[0]
    return null
  } catch (e) {
    console.error('[generate-visual] error:', e)
    return null
  }
}

function buildPrompt(type: string, topic: string, grade: string, difficulty: string, language: string, count: number, fileContent?: string): string {
  const contentNote = fileContent
    ? `Topic: "${topic}". Generate questions from this content:\n${fileContent.slice(0, 3000)}`
    : `Topic: "${topic}".`

  const base = `${contentNote}\nLevel: ${grade}. Difficulty: ${difficulty}. Language for all questions and explanations: ${language}. Question count: ${count}.\n\nCRITICAL ACCURACY RULES:\n1. For math: solve fully before writing, verify the answer is in opts at the correct index\n2. For science/history: only include facts you are certain about\n3. The "ans" index must point to the CORRECT answer in "opts"\n4. If you are unsure, use a simpler question\n\nReturn ONLY valid JSON, no markdown, no explanation.\n\n`

  if (type === 'fill_blank') return base + `Generate fill-in-the-blank questions. Leave a critical word/concept as blank. Provide 4 options (one correct), write the correct answer in "blank" field too.\n\n{"questions":[{"type":"fill_blank","q":"_____ is the powerhouse of the cell.","blank":"Mitochondria","opts":["Mitochondria","Ribosome","Nucleus","Lysosome"],"ans":0,"exp":"Mitochondria produces ATP through cellular respiration."}]}`

  if (type === 'true_false') return base + `Generate true/false questions with reasoning. ans:0 means True, ans:1 means False. opts must always be ["True","False"] but translated to ${language}.\n\n{"questions":[{"type":"true_false","q":"Photosynthesis only occurs during daytime.","opts":["True","False"],"ans":0,"exp":"Photosynthesis requires light energy so it occurs during daytime."}]}`

  if (type === 'multi_true_false') return base + `Generate Maarif Model multi-statement true/false questions. Each question has 4-5 statements.\n\n{"questions":[{"type":"multi_true_false","q":"Aşağıdaki ifadeleri Doğru (D) ya da Yanlış (Y) olarak değerlendirin.","statements":[{"text":"Mitokondri hücrenin enerji merkezidir.","correct":true},{"text":"Ribozom DNA saklar.","correct":false}],"opts":["D","Y"],"ans":0,"exp":"Açıklama..."}]}`

  if (type === 'table_fill') return base + `Generate Maarif Model table-fill questions.\n\n{"questions":[{"type":"table_fill","q":"Aşağıdaki tabloyu tamamlayın.","tableData":{"headers":["Organel","Görevi"],"rows":[{"cells":["Mitokondri","___"],"blanks":[1]},{"cells":["Ribozom","___"],"blanks":[1]}]},"tableAnswers":["ATP üretimi","Protein sentezi"],"opts":["A","B"],"ans":0,"exp":"..."}]}`

  if (type === 'matching') return base + `Generate matching questions with exactly 4 unique concept-definition pairs.\n\n{"questions":[{"type":"matching","q":"Match organelles with functions.","pairs":[{"left":"Mitochondria","right":"Energy production"},{"left":"Ribosome","right":"Protein synthesis"},{"left":"Nucleus","right":"DNA storage"},{"left":"Lysosome","right":"Waste digestion"}],"opts":["A","B","C","D"],"ans":0,"exp":"..."}]}`

  if (type === 'ordering') return base + `Generate ordering/sequencing questions with 4-5 items.\n\n{"questions":[{"type":"ordering","q":"Order these events chronologically.","items":["Event B","Event A","Event D","Event C"],"correctOrder":[1,0,3,2],"opts":["1st","2nd","3rd","4th"],"ans":0,"exp":"..."}]}`

  if (type === 'short_answer') return base + `Generate short answer questions.\n\n{"questions":[{"type":"short_answer","q":"What is photosynthesis?","opts":["Photosynthesis is the process by which plants convert CO2 and water into glucose using sunlight."],"ans":0,"exp":"Equation: 6CO2 + 6H2O + light → C6H12O6 + 6O2"}]}`

  if (type === 'mixed') return base + `Generate MIXED questions combining multiple_choice, fill_blank, true_false, multi_true_false, matching, ordering types evenly.\n\n{"questions":[{"type":"multiple_choice","q":"...","opts":["A","B","C","D"],"ans":0,"exp":"..."},{"type":"fill_blank","q":"___ is the powerhouse","blank":"Mitochondria","opts":["Mitochondria","Ribosome","Nucleus","Lysosome"],"ans":0,"exp":"..."},{"type":"true_false","q":"...","opts":["Doğru","Yanlış"],"ans":0,"exp":"..."},{"type":"multi_true_false","q":"...","statements":[{"text":"...","correct":true}],"opts":["D","Y"],"ans":0,"exp":"..."},{"type":"matching","q":"...","pairs":[{"left":"...","right":"..."}],"opts":["A","B","C","D"],"ans":0,"exp":"..."},{"type":"ordering","q":"...","items":["B","A","D","C"],"correctOrder":[1,0,3,2],"opts":["1.","2.","3.","4."],"ans":0,"exp":"..."}]}`

  // default: multiple_choice
  return base + `Generate multiple choice questions with 4 options (A/B/C/D), correct answer index, and explanation.\n\nCRITICAL FOR MATH/SCIENCE:\n- Solve every calculation step by step BEFORE writing\n- Verify the correct answer is at the specified ans index\n\n{"questions":[{"type":"multiple_choice","q":"Question text","opts":["Option A","Option B","Option C","Option D"],"ans":0,"exp":"Explanation"}]}`
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
      .select('plan, monthly_test_count, daily_test_count, daily_test_date, grade, language')
      .eq('id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const plan = profile.plan || 'free'
    const today = new Date().toISOString().split('T')[0]

    const DAILY_LIMIT: Record<string, number> = { free: 10, premium: 25, unlimited: 99999 }
    const dailyLimit = DAILY_LIMIT[plan] ?? 10
    const dailyCount = profile.daily_test_date === today ? (profile.daily_test_count || 0) : 0
    if (dailyCount >= dailyLimit) {
      return NextResponse.json({ error: 'daily_limit_reached' }, { status: 429 })
    }

    const MONTHLY_LIMIT: Record<string, number> = { free: 10, premium: 200, unlimited: 99999 }
    const monthlyLimit = MONTHLY_LIMIT[plan] ?? 10
    if ((profile.monthly_test_count || 0) >= monthlyLimit) {
      return NextResponse.json({ error: 'limit_reached' }, { status: 429 })
    }

    const body = await req.json()
    const {
      topic,
      questionCount = 10,
      difficulty = 'normal',
      language,
      fileContent,
      includeVisuals = true,
      questionType = 'multiple_choice',
      dailyChallenge = false,
    } = body

    const MAX_QCOUNT: Record<string, number> = { free: 5, premium: 20, unlimited: 20 }
    const maxQ = MAX_QCOUNT[plan] ?? 5
    const safeQCount = Math.min(questionCount, maxQ)

    if (!fileContent && !isInCurriculum(topic, plan)) {
      return NextResponse.json({ error: 'out_of_curriculum' }, { status: 403 })
    }

    const lang = language || profile.language || 'Turkce'
    const grade = profile.grade || 'ortaokul 6. sinif'

    // Tekrar eden soruları önle
    let previousQuestionsNote = ''
    try {
      const { data: recentSessions } = await supabase
        .from('quiz_sessions')
        .select('questions')
        .eq('user_id', user.id)
        .eq('topic', topic)
        .eq('completed', true)
        .order('created_at', { ascending: false })
        .limit(5)

      if (recentSessions?.length) {
        const prevQTexts: string[] = []
        recentSessions.forEach((s: any) => {
          (s.questions || []).forEach((q: any) => {
            if (q.q && prevQTexts.length < 30) prevQTexts.push(q.q.slice(0, 80))
          })
        })
        if (prevQTexts.length > 0) {
          previousQuestionsNote = `\n\nIMPORTANT - DO NOT REPEAT these previously asked questions:\n${prevQTexts.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
        }
      }
    } catch (e) {
      console.error('Previous questions fetch error:', e)
    }

    // Zayıf ders bağlamı
    let gradeContext = ''
    try {
      const { data: gradeNotes } = await supabase
        .from('grade_notes')
        .select('subject, term1_avg, term2_avg')
        .eq('user_id', user.id)
      const weakSubjects = (gradeNotes ?? [])
        .filter((g: any) => (g.term1_avg ?? 100) < 70 || (g.term2_avg ?? 100) < 70)
        .map((g: any) => g.subject)
      if (weakSubjects.length > 0) {
        gradeContext = `\n\nNOTE: This student has low grades in: ${weakSubjects.join(', ')}. Focus on fundamentals.`
      }
    } catch { }

    const prompt = buildPrompt(questionType, topic, grade, difficulty, lang, safeQCount, (fileContent || '') + gradeContext) + previousQuestionsNote

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(clean)
    } catch {
      const match = clean.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Invalid JSON')
      parsed = JSON.parse(match[0])
    }

    if (parsed?.error?.includes?.('100 PDF pages') || parsed?.type === 'error') {
      return NextResponse.json(
        { error: 'pdf_too_long', message: 'Bu PDF 100 sayfadan fazla içeriyor.' },
        { status: 400 }
      )
    }

    let questions = parsed.questions || []

    // Soru doğrulama
    if (questions.length > 0) {
      try {
        const verifyRes = await fetch(`${req.nextUrl.origin}/api/verify-questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions, topic, grade, language: lang, questionType }),
        })
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json()
          if (verifyData.questions?.length > 0) {
            questions = verifyData.questions
          }
        }
      } catch { }
    }

    // ─── GÖRSEL ÜRETİMİ ─────────────────────────────────────────────────────
    const visualCategory = detectVisualCategory(topic)
    console.log(`[generate-quiz] topic="${topic}" visualCategory=${visualCategory} includeVisuals=${includeVisuals}`)

    if (includeVisuals && visualCategory) {
      // Her soru için paralel görsel üret (max 4 soru için — Vercel timeout riski)
      const visualLimit = Math.min(questions.length, 4)
      const visualPromises = questions.slice(0, visualLimit).map((q: any, i: number) =>
        generateVisualForQuestion(q, visualCategory, topic, grade)
          .then(svg => ({ i, svg }))
          .catch(() => ({ i, svg: null }))
      )

      const visuals = await Promise.allSettled(visualPromises)
      visuals.forEach(result => {
        if (result.status === 'fulfilled' && result.value.svg) {
          const { i, svg } = result.value
          questions[i] = { ...questions[i], svg, qtype: 'svg' }
          console.log(`[generate-quiz] visual generated for q[${i}]`)
        }
      })
    }
    // ────────────────────────────────────────────────────────────────────────

    if (!dailyChallenge) {
      await supabase
        .from('profiles')
        .update({
          monthly_test_count: (profile.monthly_test_count || 0) + 1,
          daily_test_count: dailyCount + 1,
          daily_test_date: today,
        })
        .eq('id', user.id)
    }

    const { data: sessionRow } = await supabase
      .from('quiz_sessions')
      .insert({
        user_id: user.id,
        topic,
        grade: profile.grade,
        language: lang,
        question_count: questions.length,
        questions,
        answers: [],
        score: 0,
        completed: false,
        question_type: questionType,
      })
      .select('id')
      .maybeSingle()

    return NextResponse.json({ questions, sessionId: sessionRow?.id })
  } catch (error) {
    console.error('Generate quiz error:', error)
    return NextResponse.json({ error: 'Quiz generation failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sessionId, answers, score } = await req.json()
    if (!sessionId) return NextResponse.json({ error: 'No sessionId' }, { status: 400 })

    const { data: session } = await supabase
      .from('quiz_sessions')
      .select('question_count, topic, user_id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const pct = session.question_count > 0
      ? Math.round((score / session.question_count) * 100) : 0

    await supabase
      .from('quiz_sessions')
      .update({ answers, score, pct, completed: true })
      .eq('id', sessionId)
      .eq('user_id', user.id)

    const today = new Date().toISOString().split('T')[0]
    const { data: streak } = await supabase.from('streaks').select('*').eq('user_id', user.id).single()

    if (!streak) {
      await supabase.from('streaks').insert({ user_id: user.id, current_streak: 1, longest_streak: 1, total_points: 10, last_activity_date: today })
    } else {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
      const yStr = yesterday.toISOString().split('T')[0]
      if (streak.last_activity_date === today) {
        await supabase.from('streaks').update({ total_points: (streak.total_points || 0) + 5 }).eq('user_id', user.id)
      } else if (streak.last_activity_date === yStr) {
        const ns = (streak.current_streak || 0) + 1
        await supabase.from('streaks').update({ current_streak: ns, longest_streak: Math.max(ns, streak.longest_streak || 0), total_points: (streak.total_points || 0) + 10, last_activity_date: today }).eq('user_id', user.id)
      } else {
        await supabase.from('streaks').update({ current_streak: 1, total_points: (streak.total_points || 0) + 10, last_activity_date: today }).eq('user_id', user.id)
      }
    }

    const wrongAnswers = (answers || []).filter((a: any) => !a.correct)
    if (wrongAnswers.length > 0 && session.topic) {
      const { data: existing } = await supabase.from('weak_topics').select('*').eq('user_id', user.id).eq('topic', session.topic).single()
      if (existing) {
        await supabase.from('weak_topics').update({ wrong_count: (existing.wrong_count || 0) + wrongAnswers.length, total_count: (existing.total_count || 0) + (answers?.length || 0), last_seen_at: new Date().toISOString() }).eq('id', existing.id)
      } else {
        await supabase.from('weak_topics').insert({ user_id: user.id, topic: session.topic, subject: 'Genel', wrong_count: wrongAnswers.length, total_count: answers?.length || 0, last_seen_at: new Date().toISOString() })
      }
    }

    return NextResponse.json({ success: true, pct })
  } catch (error) {
    console.error('Save quiz error:', error)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
