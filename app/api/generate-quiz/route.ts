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

function getLevel(grade: string): string {
  const g = grade?.toLowerCase() || ''
  if (g.includes('ilkokul') || g.includes('1.') || g.includes('2.') || g.includes('3.') || g.includes('4.')) return 'ilkokul'
  if (g.includes('ortaokul') || g.includes('5.') || g.includes('6.') || g.includes('7.') || g.includes('8.')) return 'ortaokul'
  if (g.includes('lise') || g.includes('9.') || g.includes('10.') || g.includes('11.') || g.includes('12.')) return 'lise'
  if (g.includes('universite') || g.includes('üniversite')) return 'universite'
  return 'ortaokul'
}

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

// MEB müfredatı whitelist — SUBJECT_MAP'ten üretilmiş normalize edilmiş konular
const MEB_WHITELIST = new Set([
  // Matematiksel kavramlar
  'dogal sayilar','tam sayilar','ondalik sayilar','kesirler','rasyonel sayilar',
  'asal sayilar','obeb','okek','carpanlar','katlar','oruntu','dizi',
  'oran','orantı','yuzde','denklem','esitsizlik','cebirsel ifade',
  'fonksiyon','koordinat','parabol','logaritma','trigonometri','limit','turev',
  'integral','istatistik','olasilik','kombinasyon','permutasyon','binom',
  'vektor','matris','karmasik sayi','analitik geometri',
  'ucgen','dortgen','cember','daire','alan','cevre','hacim','prizma','piramit',
  'geometri','simetri','donusum','karekok','uslu','polinom',
  // Fen
  'hucre','organeller','fotosentez','solunum','sindirim','dolasim','bosaltim',
  'destek','hareket','sinir','endokrin','ureme','kalitim','dna','gen','evrim',
  'ekosistem','biyocevre','madde','atom','element','bilisik','bag','mol',
  'asit','baz','cozunurluk','termodinamik','kuvvet','newton','enerji','is','guc',
  'momentum','dalga','ses','isik','optik','elektrik','manyetizma','induktif',
  'atom modeli','periyodik','nukleer','radyoaktivite','fotovoltaik',
  // Tarih
  'osmanli','selcuklu','cumhuriyet','ataturk','inkilap','kurtulus savasi',
  'lozan','misak','tbmm','fransiz ihtilali','sanayi devrimi','dunya savasi',
  'soguk savas','turk tarihi','ilk uygarliklar','orta asya','islam medeniyeti',
  'mogol','bizans','hacilar','reformasyon','aydinlanma','kolonizasyon',
  // Coğrafya
  'harita','iklim','yer sekli','litosfer','hidrosfer','atmosfer','biyosfer',
  'nufus','goc','yerlесme','tarim','sanayi','enerji','ticaret','ulasim',
  'cevre sorunu','kuresel isinma','dogal afet','erozyon','cografya',
  // Türkçe / Edebiyat
  'ses bilgisi','hece','vurgu','unk','kok','ek','isim','sifat','zarf','zamir',
  'fiil','baglac','unlem','edema','cumle','paragraf','metin','tur','anlam',
  'yazi kuralı','noktalama','sozcu','deyim','atasoz','siir','roman','hikaye',
  'tiyatro','deneme','makale','divan','halk edebiyati','tanzimat','servetifunun',
  'milli edebiyat','cumhuriyet edebiyati','soz sanati',
  // İngilizce
  'present','past','future','tense','modal','passive','reported','conditional',
  'grammar','vocabulary','reading','writing','listening','speaking',
  // Din Kültürü
  'iman','ibadet','namaz','oruc','zekat','hac','kuran','peygamber','ahlak',
  'dini bayram','islam','hristiyanlık','yahudilik','din felsefesi',
  // Felsefe
  'epistemoloji','ontoloji','etik','estetik','siyaset felsefesi',
  'antik yunan','sofistler','sokrates','platon','aristoteles','kant','descartes',
  // Havacılık (üniversite müfredatı)
  'ucak','aerodinamik','navigasyon','aviyonik','meteoroloji','atc','vfr','ifr',
  // Genel akademik
  'beden egitimi','muzik','gorsel sanatlar','teknoloji tasarim',
])

function isInCurriculum(topic: string, plan: string): boolean {
  const norm = normalizeTR(topic.trim())
  
  // Whitelist kontrolü — her planda geçerli
  if (MEB_WHITELIST.has(norm)) return true
  
  // Kısmi eşleşme — whitelist'teki bir kelimeyi içeriyor mu
  const words = norm.split(' ').filter(w => w.length > 3)
  const hasWhitelistMatch = words.some(w => 
    MEB_WHITELIST.has(w) || [...MEB_WHITELIST].some(wl => wl.includes(w) || w.includes(wl))
  )
  if (hasWhitelistMatch) return true

  // Eski keyword kontrolü (geriye dönük uyumluluk)
  const hasKeyword = CURRICULUM_KEYWORDS.some(kw => norm.includes(kw))
  if (hasKeyword) return true

  // Premium kullanıcılar dosya yüklemişse geçir (fileContent zaten kontrol ediliyor)
  if (plan === 'premium' || plan === 'unlimited') return true

  return false
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
function buildSVGPrompt(category: string, topic: string, questionText: string, grade: string, correctAnswer: string = ''): string {
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
- Return ONLY the SVG code, nothing else, starting with <svg
- CORRECT ANSWER (DO NOT SHOW THIS IN SVG): "${correctAnswer}"

ABSOLUTE RULE - NEVER REVEAL THE ANSWER IN THE DIAGRAM:
You are creating a QUESTION diagram, NOT an answer key.

FORBIDDEN - never include these in the SVG:
- The word/term/value that is the correct answer to the question
- Any text that directly answers what the question is asking
- Formulas showing the final result if the result IS the answer
- Labels that give away the answer

ALLOWED - the diagram should show:
- The SETUP or CONTEXT of the question (what is given)
- Unknowns marked clearly as "?" or "___"
- Supporting visual elements (shapes, arrows, axes) WITHOUT the answer
- If physics: show the scenario (object, force arrows) but NOT "W=F×d=JOULE" if that's the answer
- If fill-blank: show the concept visually but leave the blank as "___"

EXAMPLE - Question: "Yapılan işe ne denir?"
WRONG SVG: includes text "İş" or "Joule" or "W=F×d birimi Joule"  
CORRECT SVG: shows force arrow pushing object, labels "F=Kuvvet", "d=Mesafe", unknown box "=???"

The student must figure out the answer from the question, NOT from your diagram.`

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
    // Doğru cevabı prompt'a ekle — "bunu YAZMA" diye belirt
    const correctAnswer = q.opts?.[q.ans] || q.blank || q.correctOrder || ''
    const prompt = buildSVGPrompt(category, topic, q.q, grade, String(correctAnswer))
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

  const base = `Sen Türkiye Milli Eğitim Bakanlığı (MEB) müfredatına göre soru üreten bir eğitim asistanısın.\n\nKESİN KURAL: Yalnızca MEB müfredatında yer alan konularda, MEB kazanımlarına uygun sorular üret. Müfredat dışı, spekülatif veya tartışmalı içerik kesinlikle üretme.\n\n${contentNote}\nSeviye: ${grade}. Zorluk: ${difficulty}. Soru dili: ${language}. Soru sayısı: ${count}.\n\nDOĞRULUK KURALLARI:\n1. Matematik: Her soruyu adım adım çöz, cevabın opts dizisinde doğru indexte olduğunu doğrula\n2. Fen/Tarih: Sadece kesin bildiğin gerçekleri yaz\n3. "ans" indexi MUTLAKA doğru cevabı göstermeli\n4. Emin olmadığın sorular yerine daha basit ama kesin sorular yaz\n5. MEB müfredatına uygun kazanım ve konu kapsamında kal\n6. Altı çizili/vurgulu metin gerektiren sorularda ilgili kelimeyi [köseli parantez] içine al\n\nYalnızca geçerli JSON döndür, markdown veya açıklama ekleme.\n\n`

  if (type === 'fill_blank') return base + `Generate fill-in-the-blank questions. Leave a critical word/concept as blank. Provide 4 options (one correct), write the correct answer in "blank" field too.\n\nCRITICAL: Do NOT include hints like (verb), (noun), (drink) etc. in parentheses in the question text. The blank itself should be the only clue. WRONG: "My father ___ coffee every morning. (drink)" CORRECT: "My father ___ coffee every morning."\n\n{"questions":[{"type":"fill_blank","q":"_____ is the powerhouse of the cell.","blank":"Mitochondria","opts":["Mitochondria","Ribosome","Nucleus","Lysosome"],"ans":0,"exp":"Mitochondria produces ATP through cellular respiration."}]}`

  if (type === 'true_false') return base + `Generate true/false questions with reasoning. ans:0 means True, ans:1 means False. opts must always be ["True","False"] but translated to ${language}.\n\n{"questions":[{"type":"true_false","q":"Photosynthesis only occurs during daytime.","opts":["True","False"],"ans":0,"exp":"Photosynthesis requires light energy so it occurs during daytime."}]}`

  if (type === 'multi_true_false') return base + `Generate Maarif Model multi-statement true/false questions. Each question has 4-5 statements.\n\n{"questions":[{"type":"multi_true_false","q":"Aşağıdaki ifadeleri Doğru (D) ya da Yanlış (Y) olarak değerlendirin.","statements":[{"text":"Mitokondri hücrenin enerji merkezidir.","correct":true},{"text":"Ribozom DNA saklar.","correct":false}],"opts":["D","Y"],"ans":0,"exp":"Açıklama..."}]}`

  if (type === 'table_fill') return base + `Generate Maarif Model table-fill questions.\n\n{"questions":[{"type":"table_fill","q":"Aşağıdaki tabloyu tamamlayın.","tableData":{"headers":["Organel","Görevi"],"rows":[{"cells":["Mitokondri","___"],"blanks":[1]},{"cells":["Ribozom","___"],"blanks":[1]}]},"tableAnswers":["ATP üretimi","Protein sentezi"],"opts":["A","B"],"ans":0,"exp":"..."}]}`

  if (type === 'matching') return base + `Generate matching questions with exactly 4 unique concept-definition pairs.\n\n{"questions":[{"type":"matching","q":"Match organelles with functions.","pairs":[{"left":"Mitochondria","right":"Energy production"},{"left":"Ribosome","right":"Protein synthesis"},{"left":"Nucleus","right":"DNA storage"},{"left":"Lysosome","right":"Waste digestion"}],"opts":["A","B","C","D"],"ans":0,"exp":"..."}]}`

  if (type === 'ordering') return base + `Generate ordering/sequencing questions with 4-5 items.\n\n{"questions":[{"type":"ordering","q":"Order these events chronologically.","items":["Event B","Event A","Event D","Event C"],"correctOrder":[1,0,3,2],"opts":["1st","2nd","3rd","4th"],"ans":0,"exp":"..."}]}`

  if (type === 'short_answer') return base + `Generate short answer questions.\n\n{"questions":[{"type":"short_answer","q":"What is photosynthesis?","opts":["Photosynthesis is the process by which plants convert CO2 and water into glucose using sunlight."],"ans":0,"exp":"Equation: 6CO2 + 6H2O + light → C6H12O6 + 6O2"}]}`

  if (type === 'mixed') return base + `Generate MIXED questions combining multiple_choice, fill_blank, true_false. IMPORTANT: Never add hints like (verb), (noun) in parentheses in fill_blank questions., multi_true_false, matching, ordering types evenly.\n\n{"questions":[{"type":"multiple_choice","q":"...","opts":["A","B","C","D"],"ans":0,"exp":"..."},{"type":"fill_blank","q":"___ is the powerhouse","blank":"Mitochondria","opts":["Mitochondria","Ribosome","Nucleus","Lysosome"],"ans":0,"exp":"..."},{"type":"true_false","q":"...","opts":["Doğru","Yanlış"],"ans":0,"exp":"..."},{"type":"multi_true_false","q":"...","statements":[{"text":"...","correct":true}],"opts":["D","Y"],"ans":0,"exp":"..."},{"type":"matching","q":"...","pairs":[{"left":"...","right":"..."}],"opts":["A","B","C","D"],"ans":0,"exp":"..."},{"type":"ordering","q":"...","items":["B","A","D","C"],"correctOrder":[1,0,3,2],"opts":["1.","2.","3.","4."],"ans":0,"exp":"..."}]}`

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
      // ✅ Son 10 test, 50 soru — agresif tekrar önleme
      const { data: recentSessions } = await supabase
        .from('quiz_sessions')
        .select('questions')
        .eq('user_id', user.id)
        .eq('topic', topic)
        .eq('completed', true)
        .order('created_at', { ascending: false })
        .limit(10)

      if (recentSessions?.length) {
        const prevQTexts: string[] = []
        // Anahtar kelimeler çıkar — benzer soruları da yakala
        const prevKeywords = new Set<string>()

        recentSessions.forEach((s: any) => {
          (s.questions || []).forEach((q: any) => {
            if (!q.q) return
            if (prevQTexts.length < 50) prevQTexts.push(q.q.slice(0, 100))
            // İlk 3 kelimeyi keyword olarak ekle — benzer soruları önle
            q.q.split(' ').slice(0, 5).forEach((w: string) => {
              if (w.length > 3) prevKeywords.add(w.toLowerCase())
            })
          })
        })

        if (prevQTexts.length > 0) {
          previousQuestionsNote = `\n\nCRITICAL - GENERATE COMPLETELY DIFFERENT QUESTIONS:\n` +
            `These ${prevQTexts.length} questions were already asked recently - DO NOT repeat or rephrase them:\n` +
            `${prevQTexts.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n` +
            `VARIETY RULES:\n` +
            `- Ask about DIFFERENT aspects, events, or concepts within the topic\n` +
            `- Use DIFFERENT question formats and difficulty angles\n` +
            `- If a concept was already tested, test a RELATED but DIFFERENT concept\n` +
            `- Prioritize less-tested sub-topics and edge cases`
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

    // ✅ MEB kaynağından semantic context çek
    let mebContext = ''
    try {
      const mebRes = await fetch(`${req.nextUrl.origin}/api/meb-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, grade, subject: topic, level: getLevel(grade), limit: 3 }),
        signal: AbortSignal.timeout(4000), // 4 sn timeout
      })
      if (mebRes.ok) {
        const mebData = await mebRes.json()
        if (mebData.found && mebData.context) {
          mebContext = `\n\nMEB KAYNAK İÇERİĞİ (Bu içeriğe dayalı soru üret):\n${mebData.context}`
          console.log(`[generate-quiz] MEB context found: ${mebData.context.length} chars`)
        }
      }
    } catch (e) {
      console.warn('[generate-quiz] MEB search failed:', e)
    }

    const prompt = buildPrompt(questionType, topic, grade, difficulty, lang, safeQCount, (fileContent || '') + gradeContext + mebContext) + previousQuestionsNote

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000, // Artırıldı — uzun konularda JSON kesilmesini önler
      system: 'Sen Türkiye Milli Eğitim Bakanlığı (MEB) müfredatına göre soru üreten bir eğitim asistanısın. Yalnızca MEB müfredatındaki konularda soru üret. Müfredat dışı, siyasi, dini tartışma yaratabilecek veya uygunsuz içerik üretme. Her sorunun doğruluğunu teyit et.',
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(clean)
    } catch {
      // JSON bozuksa — questions array'ini direkt çıkar
      try {
        const match = clean.match(/\{[\s\S]*\}/)
        if (match) {
          parsed = JSON.parse(match[0])
        } else {
          throw new Error('No JSON object found')
        }
      } catch {
        // Son çare: questions array'ini regex ile çıkar
        try {
          const arrMatch = clean.match(/"questions"\s*:\s*(\[[\s\S]*?\](?=\s*[},]))/)
          if (arrMatch) {
            // Her soruyu ayrı ayrı parse et
            const questionsStr = arrMatch[1]
            const safeQuestions: any[] = []
            // Basit soru nesnelerini bul
            const questionMatches = questionsStr.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g)
            if (questionMatches) {
              for (const qStr of questionMatches) {
                try { safeQuestions.push(JSON.parse(qStr)) } catch {}
              }
            }
            if (safeQuestions.length > 0) {
              parsed = { questions: safeQuestions }
              console.warn('[generate-quiz] JSON recovered via regex, got', safeQuestions.length, 'questions')
            } else {
              throw new Error('Could not recover questions')
            }
          } else {
            throw new Error('Invalid JSON - no questions array')
          }
        } catch(e2) {
          console.error('[generate-quiz] JSON parse failed completely:', e2)
          return NextResponse.json({ error: 'Quiz generation failed - invalid response' }, { status: 500 })
        }
      }
    }

    if (parsed?.error?.includes?.('100 PDF pages') || parsed?.type === 'error') {
      return NextResponse.json(
        { error: 'pdf_too_long', message: 'Bu PDF 100 sayfadan fazla içeriyor.' },
        { status: 400 }
      )
    }

    let questions = parsed.questions || []

    // Soru doğrulama + SVG üretimi — PARALEL çalışır (timeout optimizasyonu)
    const visualCategory = detectVisualCategory(topic)
    console.log(`[generate-quiz] topic="${topic}" visualCategory=${visualCategory} includeVisuals=${includeVisuals}`)

    // Verify ve SVG'yi aynı anda başlat
    const [verifyResult, svgResults] = await Promise.allSettled([
      // 1. Soru doğrulama
      questions.length > 0
        ? fetch(`${req.nextUrl.origin}/api/verify-questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || 'internal' },
            body: JSON.stringify({ questions, topic, grade, language: lang, questionType }),
          }).then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null),

      // 2. SVG üretimi (max 2, paralel)
      includeVisuals && visualCategory
        ? Promise.all(
            Array.from({ length: Math.min(questions.length, 2) }, (_, i) =>
              generateVisualForQuestion(questions[i], visualCategory, topic, grade)
                .then(svg => ({ i, svg }))
                .catch(() => ({ i, svg: null }))
            )
          )
        : Promise.resolve([]),
    ])

    // Verify sonucunu uygula
    if (verifyResult.status === 'fulfilled' && verifyResult.value?.questions?.length > 0) {
      questions = verifyResult.value.questions
    }

    // SVG sonuçlarını uygula
    if (svgResults.status === 'fulfilled' && Array.isArray(svgResults.value)) {
      for (const { i, svg } of svgResults.value as { i: number; svg: string | null }[]) {
        if (svg && questions[i]) {
          questions[i] = { ...questions[i], svg, qtype: 'svg' }
          console.log(`[generate-quiz] visual generated for q[${i}]`)
        }
      }
    }

    if (!dailyChallenge) {
      await supabase
        .from('profiles')
        .update({
          monthly_test_count: (profile.monthly_test_count || 0) + 1,
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
