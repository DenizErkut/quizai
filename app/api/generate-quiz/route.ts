import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 120
export const runtime = 'nodejs'
import Anthropic from '@anthropic-ai/sdk'
import { generateQuizFallback } from '@/lib/openai'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { createClient } from '@supabase/supabase-js'
import { getTopicMastery, computeErrorPatterns, buildStudentHistoryContext } from '@/lib/mastery'
import { recordQuizLearningEvents } from '@/lib/learning-events'
import { findPrerequisiteGaps, buildPrerequisiteContext } from '@/lib/learning-graph'
import { misconceptionMetadataInstruction, normalizeQuestionMisconceptions } from '@/lib/misconceptions'
import { resolveAdaptiveLearningPolicy } from '@/lib/adaptive-learning'
import { startingDifficultyFromMastery } from '@/lib/adaptive-difficulty'

const anthropic = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getLevel(grade: string): string {
  const g = grade?.toLowerCase() || ''
  // ÖNEMLİ: üniversite kontrolü EN BAŞTA olmalı — bkz. aşağıdaki not.
  if (g.includes('universite') || g.includes('üniversite')) return 'universite'

  // Açık seviye kelimesi varsa en güvenilir sinyal budur.
  if (g.includes('ilkokul')) return 'ilkokul'
  if (g.includes('ortaokul')) return 'ortaokul'
  if (g.includes('lise')) return 'lise'

  // Seviye kelimesi yoksa (ör. sadece "6. sınıf" gibi kısa bir değer),
  // sınıf NUMARASINI regex ile çıkarıp aralığa göre eşleriz.
  //
  // ÖNEMLİ NOT — önceki halinde burada gevşek .includes('1.') /
  // .includes('2.') gibi alt dize kontrolleri vardı. Bunlar İKİ BASAMAKLI
  // sınıflarda (10, 11, 12) YANLIŞ eşleşiyordu: "12. sinif" içinde "2."
  // alt dizesi geçtiği için (12'nin son hanesi + nokta), 12. sınıf
  // öğrencisi yanlışlıkla "ilkokul" sayılıyordu. Aynı şekilde "11. sinif"
  // de "1." içerdiği için ilkokul sanılıyordu. Bunun sonucunda 11-12.
  // sınıf öğrencileri (sınava hazırlık dönemindeki lise son sınıflar)
  // türev/integral/logaritma/trigonometri gibi KENDİ müfredatlarındaki
  // konularda "ilkokul için çok ileri" diye REDDEDİLİYORDU. Aynı hata
  // "universite N. sinif" için de vardı (yukarıda ayrıca düzeltildi).
  // Regex ile tam sayı çıkarımı bu belirsizliği ortadan kaldırır.
  const m = g.match(/(\d{1,2})\s*\.?\s*s[ıi]n[ıi]f/)
  const n = m ? parseInt(m[1], 10) : NaN
  if (n >= 1 && n <= 4) return 'ilkokul'
  if (n >= 5 && n <= 8) return 'ortaokul'
  if (n >= 9 && n <= 12) return 'lise'

  return 'ortaokul'
}

function normalizeTR(s: string): string {
  return s.toLocaleLowerCase('tr')
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

// Bir konu MEB müfredatında GENEL OLARAK var olsa bile, öğrencinin KENDİ
// SEVİYESİ için çok ileri olabilir (ör. bir 6. sınıf öğrencisi "termodinamiğin
// birinci yasası" yazabiliyordu — bu lise/üniversite fiziği, ortaokul değil).
// Bu liste, her seviye için "bu seviyenin ÜSTÜNDE" sayılan ve REDDEDİLMESİ
// gereken kavramları tutar.
const TOO_ADVANCED_FOR_LEVEL: Record<string, string[]> = {
  ilkokul: [
    'cebirsel ifade', 'denklem', 'esitsizlik', 'oran', 'oranti', 'yuzde', 'asal sayi',
    'obeb', 'okek', 'fonksiyon', 'hucre', 'organeller', 'fotosentez', 'solunum sistemi',
    'sindirim sistemi', 'dolasim sistemi', 'kalitim', 'dna', 'gen', 'evrim', 'ekosistem',
    'atom', 'element', 'bilesik', 'asit', 'baz', 'kimyasal', 'termodinamik', 'mekanik',
    'newton', 'momentum', 'elektrik devresi', 'osmanli', 'cumhuriyet', 'inkilap', 'tbmm',
    'fiilimsi', 'soz sanati', 'divan edebiyati', 'trigonometri', 'logaritma', 'turev',
    'integral', 'limit', 'vektor', 'matris',
  ],
  ortaokul: [
    'termodinamik', 'logaritma', 'trigonometri', 'turev', 'integral', 'limit',
    'vektor', 'matris', 'karmasik sayi', 'analitik geometri', 'elektrokimya',
    'organik kimya', 'hidrokarbon', 'polimer', 'mol kavrami', 'kimyasal denge',
    'endokrin sistem', 'genetik muhendislik', 'biyoteknoloji',
    'nukleer fizik', 'atom fizigi', 'modern fizik', 'epistemoloji',
    'ontoloji', 'servet-i funun', 'tanzimat edebiyati',
    'fransiz ihtilali', 'soguk savas',
  ],
  // lise: mufredati zaten genis (fizik/kimya/biyoloji/felsefe dahil) - ek
  // bir "cok ileri" kisitlamasi uygulanmiyor, sadece universite-cok-otesi
  // (aşırı uzmanlasmis) konular icin genel whitelist zaten yetersiz kalip
  // dogal olarak reddedecektir.
}

function isTooAdvancedForLevel(topic: string, level: string): boolean {
  const norm = normalizeTR(topic)
  const blocked = TOO_ADVANCED_FOR_LEVEL[level] || []
  return blocked.some(kw => norm.includes(kw))
}

function isInCurriculum(topic: string, plan: string, grade: string): boolean {
  const level = getLevel(grade)

  // Üniversite: MEB müfredatı diye bir şey yok — her üniversite/hoca kendi
  // ders içeriğini belirler. Bu yüzden MEB whitelist/keyword kontrolüne hiç
  // sokulmadan doğrudan izin verilir. Aksi halde öğrencinin bölümüne özgü
  // (ör. "Nesne Yönelimli Programlama", "Mikroekonomi") neredeyse her konu
  // MEB listesinde olmadığı için yanlışlıkla reddedilirdi.
  if (level === 'universite') return true

  const norm = normalizeTR(topic.trim())

  // ÖNCELİKLİ KONTROL: konu genel MEB müfredatında var olsa bile, bu
  // öğrencinin SEVİYESİ için çok ileriyse REDDEDİLİR — plan/whitelist
  // durumundan bağımsız, kesin bir engel.
  if (isTooAdvancedForLevel(norm, level)) return false

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
    // Soru tipine göre SVG uygunluk kontrolü
    // true_false ve short_answer sorularında SVG üretme
    if (q.type === 'true_false' || q.type === 'short_answer' || q.type === 'multi_true_false') {
      return null
    }
    // Soru metni şekil/görsel gerektiriyor mu kontrol et
    const qText = (q.q || '').toLowerCase()
    const needsVisual = /şekil|grafik|tablo|diyagram|geometr|koordinat|venn|kesir|şema|harita|ok.*diyagram|ağaç/.test(qText)
    const hasShape = /kare|dikdörtgen|üçgen|daire|çember|çokgen|prizma|küp|silindir|koni|küre|paralelkenar|eşkenar|ikizkenar/.test(qText)
    // Sadece görsel gerektiren sorularda SVG üret
    if (category !== 'math' && !needsVisual && !hasShape) {
      return null
    }
    // Doğru cevabı prompt'a ekle — "bunu YAZMA" diye belirt
    const correctAnswer = q.opts?.[q.ans] || q.blank || q.correctOrder || ''
    const prompt = buildSVGPrompt(category, topic, q.q, grade, String(correctAnswer))
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', // SVG için hızlı model yeterli
      max_tokens: 1200,
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

function buildPrompt(type: string, topic: string, grade: string, difficulty: string, language: string, count: number, fileContent?: string, gradeCtx?: string, mebCtx?: string, department?: string, subject?: string): string {
  const contentNote = fileContent
    ? `Topic: "${topic}". Generate questions from this content:\n${fileContent.slice(0, 3000)}`
    : `Topic: "${topic}".`

  // 17 Ağustos 2026'da bulundu: "subject" (ders) bilgisi promptta hiç
  // AÇIKÇA yer almıyordu, AI sadece "topic" adından (ör. "Past simple
  // tense") ders türünü çıkarsamak zorunda kalıyordu. Artık ders açıkça
  // belirtiliyor. Yabancı dil dersleri (İngilizce/Almanca vb.) için AYRICA
  // özel bir kural ekleniyor: "Soru dili: Türkçe" talimatı, yabancı dil
  // dersinde SADECE açıklamalar için geçerli -- örnek cümleler/kelimeler/
  // gramer yapıları o dilde (İngilizce) kalmalı, Türkçe'ye çevrilmemeli.
  const subjectLine = subject ? `Ders: ${subject}.` : ''
  const FOREIGN_LANGUAGE_SUBJECTS = ['ingilizce', 'almanca', 'fransızca', 'fransizca', 'ispanyolca', 'arapça', 'arapca', 'rusça', 'rusca', 'italyanca', 'çince', 'cince', 'japonca', 'korece']
  const isLanguageCourse = !!subject && FOREIGN_LANGUAGE_SUBJECTS.includes(subject.trim().toLocaleLowerCase('tr'))
  // 18 Ağustos 2026'da güçlendirildi: eski metin sadece "örnek cümleler
  // İngilizce kalsın" diyordu, soru KÖKÜNÜN (q alanı) ve ŞIKLARIN kendisinin
  // Türkçe kalmasına hiçbir engel koymuyordu (öğrenci geri bildirimi: "Aşağıdaki
  // cümlelerden hangisi..." Türkçe kök + İngilizce şıklar çıkıyordu). Artık
  // çağıran taraf (POST handler) zaten "language" parametresini bu derste
  // hedef dile (subject) çeviriyor, bu not SADECE bunu pekiştirip "exp"
  // alanının Türkçe kalması gerektiğini netleştiriyor.
  const languageCourseNote = isLanguageCourse
    ? `\n\n🌐 YABANCI DİL DERSİ KURALI: Bu bir ${subject} dersi sorusu — gerçek bir ${subject} sınavı gibi davran. Soru kökü (q alanı) DAHİL HER ŞEY -- soru metni, şıklar (opts), örnek cümleler, kelimeler, gramer yapıları -- TAMAMEN ${subject} DİLİNDE olmalı, soru/şık metninde TEK BİR TÜRKÇE CÜMLE bile olmamalı. SADECE "exp" (açıklama/doğru cevap gerekçesi) alanını öğrenci/veli anlayışı için TÜRKÇE yaz. SORULARIN TAMAMI (${count} sorunun ${count}'ü de) konu olarak "${topic}" ile SIKI SIKIYA ilgili kalmalı -- konudan sapıp alakasız bir dilde/temada (ör. Türkçe okuma-anlama, edebiyat, iletişim etiği gibi bambaşka bir konu) soru üretme. Yeterli çeşitlilik bulamıyorsan, aynı gramer/kelime konusunu FARKLI örnek cümlelerle/kelimelerle tekrar işle -- asla konu dışına çıkma.`
    : ''

  const isUniversity = getLevel(grade) === 'universite'

  const mebSection = mebCtx
    ? `\n\n⚠️ KRİTİK TALİMAT: Aşağıdaki MEB kaynak metni verilmiştir. Üreteceğin ${count} sorunun TAMAMI (yalnızca bazıları değil, ${count} sorunun ${count}'ü de) bu metindeki bilgilere, örneklere, olaylara veya kavramlara dayanmalıdır. Her soruyu hazırlarken metnin FARKLI bir bölümünü/paragrafını/örneğini kullan ki sorular birbirini tekrar etmesin ama hepsi metne sadık kalsın. Metinde geçen kişiler, olaylar, örnekler ve bilgilere SADIK KAL. Metinde olmayan bilgileri UYDURMA. Eğer metin bir sorunun tamamını karşılamıyorsa bile, o soruyu yine metindeki en yakın kavram/örnek üzerinden kur — genel/metin dışı bilgiye başvurma.\n\n📚 SORU DERİNLİĞİ KURALI (ÖNEMLİ): Sorularının çoğu SADECE metindeki bir cümleyi başka kelimelerle yeniden sorma ("okuduğunu anlama"/paraphrase) tuzağına düşmemeli — böyle bir soru öğrencinin cümleyi ezberden tanıyıp tanımadığını ölçer, konuyu GERÇEKTEN anlayıp anlamadığını ölçmez. Bunun yerine metindeki OLGUYU/ÖRNEĞİ/KAVRAMI bir ZEMİN olarak kullan ve öğrenciyi düşünmeye zorlayan, öğrenme-temelli sorular kur: bir SONUÇ çıkarmasını, yaygın bir YANLIŞ-KAVRAYIŞI düzeltmesini/ayırt etmesini, iki kavram arasında İLİŞKİ kurmasını, ya da metindeki örneği/ilkeyi BENZER YENİ bir duruma/senaryoya uygulamasını iste (örnek kalıp: "Bir öğrenci ... diye düşünüyor/soruyor — bu düşüncedeki [eksiklik/hata] nedir?" gibi). ${count} soru arasında en fazla 2-3 tanesi metindeki BİRE BİR aynı cümleyi/pasajı hedefleyebilir; geri kalanlar metnin FARKLI kavram/örneklerinden veya metindeki bir ilkenin genel uygulamasından türetilmeli. Yine de UYDURMA yasağı devam ediyor: kavramsal/uygulamalı bir soru bile olsa, dayandığı bilgi/olgu MUTLAKA metinde (ya da metnin doğrudan işaret ettiği kavramda) karşılığı olmalı — metin dışına, kaynakta hiç geçmeyen bilgiye asla çıkma.\n\n🎯 KONU MERKEZLİLİK KURALI (ÖNEMLİ): Kaynak metin genellikle asıl konudan (topic) daha GENİŞ bir anlatı/kıssa/örnek içerir (ör. bir öğretici hikâye, bir gözlem listesi) ve bu geniş metnin İÇİNDE konuyla doğrudan ilgisiz yan-temalar da geçebilir (ör. estetik/çeşitlilik güzelliği, doğaya-saygı/dayanışma ahlakı, ya da metnin sadece dil-bilgisel bir kelimesi gibi konudan bağımsız ayrıntılar). Metne sadık kalma kuralı, metindeki HER cümleden soru üretmen gerektiği anlamına GELMEZ — sadece konunun ("${topic}") kendi çekirdek kavramına (ör. bir itikat/inanç konusuysa Allah'ın varlığı/birliği/sıfatları gibi doğrudan o kazanıma ait fikirler) hizmet eden cümle/örnekleri seç. Bir cümle ilginç veya metinde varsa bile, sorduğu şey asıl konudan çok metnin yan bir detayına (ör. "çiçekler neden renklidir" gibi estetik bir gözlem, ya da "insan hangi özelliğiyle ayrılır" gibi konudan bağımsız genel bir tanım) odaklanıyorsa o cümleyi ATLA, konunun çekirdeğine daha yakın başka bir cümle/örnek seç. Her sorunun cevabını doğrulamak isteyen bir öğretmenin "bu soru gerçekten '${topic}' konusunu mu ölçüyor?" diye sorduğunda açıkça "evet" diyebileceği sorular üret.\n\n🚫 ÖNEMLİ İSTİSNA 1: Eğer bu metin bir MÜFREDAT KAZANIM KODU LİSTESİYSE (örn. \"SB.6.4.1. ... a) ... b) ...\" formatında, öğretmene yönelik öğrenme çıktısı tanımları içeriyorsa) — ASLA \"hangi kazanımın hangi alt maddesi X der\" gibi kod/madde numarasına dayalı sorular ÜRETME. Bunun yerine, o kazanımın işaret ettiği GERÇEK KONUYU (örn. \"vatandaşlık haklarının kullanımında dijitalleşme etkileri\" kazanımından yola çıkarak, dijital vatandaşlık kavramının kendisi hakkında) öğrenciye anlamlı bir içerik sorusu sor. Öğrenci kazanım kodlarını asla görmemeli ve bunlar hakkında sorgulanmamalı. KRİTİK SINIR: kazanım metni kısa/yetersiz olsa bile, ASLA kendi genel bilgine dayanarak BAŞKA, İSİMLENDİRİLMİŞ bir tarihi metne/esere/konuşmaya (ör. Gençliğe Hitabesi, İstiklal Marşı, Nutuk, belirli bir yazarın belirli bir eseri) atlama ve o metinden alıntı/soru üretme — BU METİNLER SANA VERİLMEDİYSE ONLAR HAKKINDA SORU ÜRETMEK KESİNLİKLE YASAK, kazanımla ne kadar tematik olarak yakın görünürse görünsün. Bunun yerine SADECE kazanımın kendi tanımladığı KAVRAM/BECERİ üzerinden, somut ama İSİMSİZ bir senaryo/örnek kurgula (ör. \"Bir yerleşim biriminde alınan bir kararı etkileyen unsurları düşünelim...\" gibi, gerçek bir kişi/eser/tarihi olaya atıfta bulunmayan, kendi kurguladığın bir örnek). SOMUT ÖRNEK — YANLIŞ: kazanım \"toplumsal düzenin sürdürülmesinde temel hak ve sorumlulukların önemi\" iken \"Gençliğe Hitabesi'nde Atatürk'ün ... ifadesi hangi tutumu hedeflemiştir?\" gibi bir soru üretmek (kazanımla ilgisi olmayan, sana verilmeyen bir kaynağa kaçış). DOĞRU: aynı kazanım için \"Bir toplumda bireylerin hem haklarını kullanıp hem sorumluluklarını yerine getirmesi, toplumsal düzenin sürdürülmesi açısından neden önemlidir?\" gibi kazanımın kendi kavramına sadık, kurgusal bir soru.\n\n🚫 ÖNEMLİ İSTİSNA 2: Bu metin gerçek bir sınav kitapçığı/soru bankası çıktısı olabilir ve bu tür kaynaklarda "Soru 39'da verilen örneğe göre...", "38 ve 39. soruları aşağıdaki bilgiye göre cevaplayınız" gibi BAŞKA numaralı bir soruya/örneğe atıfta bulunan, çok parçalı bir soru zincirinin sadece bir kısmı yer alabilir. Metinde böyle bir referans görürsen o referansı asla olduğu gibi kopyalama — ya atıf yaptığı bilgiyi/örneği (metinde başka bir yerde varsa) bulup doğrudan senin ürettiğin sorunun metnine dahil et, ya da metindeki tamamen bağımsız (başka soruya atıf yapmayan) başka bir örnek/kavram kullan. Öğrenci SADECE senin ürettiğin tek soruyu görecek; "yukarıda", "az önce", "Soru X'te" dediğin hiçbir şey öğrenciye ayrıca gösterilmeyecek.\n\n🚫 ÖNEMLİ İSTİSNA 3: Kaynak metinde İSTATİSTİK, ANKET SONUCU, TABLO veya SAYISAL VERİ (ör. "kişiler günde ortalama 6 saat TV izliyor, 1 dakika kitap okuyor" gibi) varsa ve bu veriye dayalı bir soru üretmek istiyorsan, "metinde verilen istatistiklere göre" gibi bir ifadeyle veriye SADECE ATIFTA BULUNMA — o veriyi/sayıları/istatistikleri DOĞRUDAN sorunun kendi metnine TAŞI. Öğrenci o istatistiği görmeden soruyu cevaplayamaz. SOMUT ÖRNEK — YANLIŞ: "Metinde verilen istatistiklere göre, Türkiye'de bir kişi günde kitap okumaya ayrılan zaman ile TV izlemeye ayrılan zaman arasında kaç saat fark vardır?" (sayılar hiç verilmemiş, cevaplanamaz). DOĞRU: "Yapılan bir araştırmaya göre Türkiye'de bir kişi günde ortalama 6 saat televizyon izlerken, kitap okumaya sadece 1 dakika ayırmaktadır. Bu bilgiye göre, TV izlemeye ayrılan süre kitap okumaya ayrılan süreden kaç saat fazladır?" (gerekli sayılar sorunun içinde). Aynı kural, metinde geçen alıntılanmış CÜMLELER/CEVAPLAR için de geçerlidir — "metinde sıralanan cevaplara göre" demek yerine, o cevapları/alıntıları KISACA sorunun içine al.

MEB KAYNAK METNİ:\n${mebCtx}\n\n`
    : ''

  // Üniversite: MEB'in aksine tek bir resmi müfredat yok (her üniversite/
  // hoca kendi ders içeriğini belirler) — bu yüzden "SADECE MEB müfredatı"
  // kısıtı burada UYGULANMAZ. Bunun yerine bölüm bağlamı (varsa) verilir ve
  // AI kendi genel akademik bilgisiyle üretim yapar.
  const base = isUniversity
    ? `Sen üniversite düzeyinde soru üreten bir eğitim asistanısın. Bu öğrenci${department ? ` "${department}" bölümünde okuyor` : ' bir üniversite öğrencisi'}. MEB K-12 müfredatı kısıtı BURADA GEÇERLİ DEĞİL — kendi genel akademik bilgine dayanarak üniversite seviyesinde${department ? `, ${department} bölümüne uygun` : ''} sorular üret.\n\n${contentNote}${gradeCtx || ''}\n${subjectLine}\nSınıf: ${grade}${department ? ` (${department})` : ''}. Zorluk: ${difficulty}. Soru dili: ${language}. Soru sayısı: ${count}.${languageCourseNote}\n\nDOĞRULUK KURALLARI:\n1. Sayısal/hesaplama gerektiren sorularda: Her soruyu adım adım çöz, cevabın opts dizisinde doğru indexte olduğunu doğrula\n2. Sadece kesin bildiğin, akademik olarak doğru bilgileri yaz\n3. "ans" indexi MUTLAKA doğru cevabı göstermeli\n4. Emin olmadığın sorular yerine daha basit ama kesin sorular yaz\n5. Sadece multiple_choice ve true_false sorularında altı çizili/vurgulu metin için [köşeli parantez] kullan. fill_blank sorularında ASLA kullanma.\n6. HER SORU TAMAMEN KENDİ İÇİNDE EKSİKSİZ VE ÇÖZÜLEBİLİR OLMALI — öğrenci başka bir soruya/örneğe/tabloya atıfta bulunan bir soru görmemeli.\n7. Herhangi bir kaynak metin/kitap kullanıyorsan, KAYNAĞIN KENDİSİ (yazarı, ISBN'i, künye bilgisi vb.) hakkında ASLA soru üretme — öğrenci kaynağı hiç görmedi, sadece senin sorunu görecek. "Verilen metne göre", "metinde anlatılan X örneğinde" gibi bir ifade kullanıyorsan, o metnin/örneğin/olayın ÖZETİNİ (2-3 cümle) MUTLAKA sorunun kendi "q" alanının İÇİNE/BAŞINA yaz — öğrenci metni görmeden bu ifadeyi kullanan bir soru ASLA üretme, bu cevaplanamayan bir soru üretmek demektir.\n8. Kullandığın dil ve kelime seçimi bile öğrencinin SEVİYESİNE uygun kalmalı, gereksiz yere akademik/soyut kelimeler kullanma.\n\nYalnızca geçerli JSON döndür, markdown veya açıklama ekleme.\n\n`
    : `Sen Türkiye Milli Eğitim Bakanlığı (MEB) müfredatına göre soru üreten bir eğitim asistanısın.\n\nKESİN KURAL: Yalnızca MEB müfredatında yer alan konularda, MEB kazanımlarına uygun sorular üret. Müfredat dışı, spekülatif veya tartışmalı içerik kesinlikle üretme.\n\n${mebSection}${contentNote}${gradeCtx || ''}\n${subjectLine}\nSeviye: ${grade}. Zorluk: ${difficulty}. Soru dili: ${language}. Soru sayısı: ${count}.${languageCourseNote}\n\nDOĞRULUK KURALLARI:\n1. Matematik: Her soruyu adım adım çöz, cevabın opts dizisinde doğru indexte olduğunu doğrula\n2. Fen/Tarih: Sadece kesin bildiğin gerçekleri yaz\n3. "ans" indexi MUTLAKA doğru cevabı göstermeli\n4. Emin olmadığın sorular yerine daha basit ama kesin sorular yaz\n5. MEB müfredatına uygun kazanım ve konu kapsamında kal\n6. Sadece multiple_choice ve true_false sorularında altı çizili/vurgulu metin için [köşeli parantez] kullan. fill_blank sorularında ASLA kullanma.\n7. MEB kaynak metni verilmişse: Metindeki gerçek kişi, olay ve bilgileri kullan — uydurma.\n8. HER SORU TAMAMEN KENDİ İÇİNDE EKSİKSİZ VE ÇÖZÜLEBİLİR OLMALI. Kaynak metin gerçek bir sınav kitapçığından alınmış olabilir ve orada "Soru 39'da verilen örneğe göre...", "yukarıdaki tabloya göre...", "38 ve 39. soruları bu bilgiye göre cevaplayınız..." gibi BAŞKA bir soruya/örneğe/tabloya/paragrafa atıfta bulunan, bir soru zincirinin parçası olan ifadeler geçebilir. Bu şekilde başka bir soruya bağımlı, kendi başına çözülemeyecek bir soru ASLA üretme — öğrenci sadece bu tek soruyu görecek, referans verdiğin diğer soru/örnek/tablo öğrenciye HİÇ gösterilmeyecek. Böyle bir referans fark edersen: ya o referansı YOK SAY ve gerekli tüm bilgiyi (verileri, örneği, senaryoyu) doğrudan bu sorunun kendi metnine TAŞI, ya da kaynaktaki bambaşka, bağımsız (başka bir soruya atıf yapmayan) bir örnek/kavram seç.\n9. KAYNAK METNİN KENDİSİ (kitabın yazarları, ISBN'i, kaç sayfa olduğu, hangi yayınevi bastığı, kapak/İçindekiler bilgisi vb.) HAKKINDA ASLA SORU ÜRETME — bunlar kitabın idari/künye bilgisidir, ders içeriği/kazanım DEĞİLDİR. Öğrenci bu kitabı hiç görmedi ve göremeyecek, sadece senin ürettiğin tek bir soruyu görecek. Bu yüzden: (a) "verilen ders kitabının yazarı kimdir", "ISBN numarası nedir", "kaç yazar tarafından hazırlanmıştır" gibi sorular KESİNLİKLE YASAK; (b) BİR OKUMA PARÇASINA/GERÇEK KİŞİ ÖRNEĞİNE/VAKAYA dayalı soru üretiyorsan (ör. "Metinde anlatılan Ahmet Bey örneğinde...", "verilen metne göre", "parçada anlatılan olayda") o metnin/örneğin/kişinin/olayın ÖZETİNİ (2-3 cümle, kim/ne/nerede/nasıl) MUTLAKA sorunun kendi "q" alanının BAŞINA yaz, sonra soruyu sor. SOMUT ÖRNEK — YANLIŞ: {"q":"Metinde anlatılan Ahmet Bey örneğinde, hangi amaçla ekonomik faaliyet gerçekleştirilmiştir?"} (öğrenci metni hiç görmedi, cevaplayamaz!). DOĞRU: {"q":"Ahmet Bey, şehirdeki işini bırakıp köyüne dönmüş ve dedesinden kalan tarlalarda organik tarım yapmaya başlamıştır. Bu örnekte Ahmet Bey'in ekonomik faaliyeti hangi amaca yöneliktir?"} (gerekli bilgi sorunun içinde). ASLA öğrencinin görmediği bir metne/örneğe atıfta bulunup o metni özetlemeyen bir soru üretme.\n10. KELİME SEVİYESİ: Kullandığın dil, ${grade} seviyesindeki bir öğrencinin günlük hayatta bildiği kelimelerle sınırlı kalmalı. Bu yaş grubunun bilmeyeceği akademik, soyut veya üniversite düzeyinde kelimeler ASLA kullanma — gerekiyorsa daha basit eş anlamlısını tercih et.\n11. MÜFREDAT ÇERÇEVE DOKÜMANININ KENDİ YAPISI HAKKINDA SORU ÜRETME: Kaynak metin bazen (tymm.meb.gov.tr gibi resmi bir portaldan alınmış) bir MÜFREDAT ÇERÇEVE DOKÜMANI olabilir — bu dokümanlar "Öğrenme Kanıtları", "Performans Görevi", "Köprü Kurma", "Öğrenme-Öğretme Yaşantıları", "Ön Değerlendirme Süreci", "Zenginleştirme", "Destekleme" gibi ÖĞRETMENE yönelik pedagojik planlama bölümleri içerir. Bu bölüm başlıklarının KENDİSİ hakkında ("X bölümünde hangi yöntem kullanılabilir?", "Y aşamasında öğretmenlerin ne yapması öngörülmektedir?" gibi) SORU ÜRETME — bunlar öğretmenin nasıl öğreteceğine dair idari bilgidir, öğrencinin öğrenmesi gereken KONU İÇERİĞİ değildir (tıpkı kitabın İçindekiler sayfası gibi). Bunun yerine bu bölümlerin İÇİNDE GEÇEN somut örnek/senaryoyu (ör. "Köprü Kurma" bölümünde "STK'ların MEB destekli proje örnekleri incelenir" yazıyorsa, STK'ların demokrasideki rolü hakkında bir soru sor — "Köprü Kurma aşamasında ne inceleniyor" diye sorma) gerçek konu sorusuna dönüştür.\n\nYalnızca geçerli JSON döndür, markdown veya açıklama ekleme.\n\n`

  if (type === 'fill_blank') return base + `Generate fill-in-the-blank questions. Leave a critical word/concept as blank. Provide 4 options (one correct), write the correct answer in "blank" field too.\n\nCRITICAL RULES:\n1. NEVER put the answer or any hint inside the question text. The blank ___ must be the ONLY clue.\n2. Do NOT use [brackets] in fill_blank questions - brackets reveal the answer!\n3. Do NOT add (verb), (noun), (drink) or any word hints in parentheses.\n4. WRONG: "Normal koşullarda en kararlı karbon formu olan [grafit], kurşun kalemlerinde kullanılır." (REVEALS ANSWER!)\n5. CORRECT: "Normal koşullarda en kararlı karbon formu olan _____, kurşun kalemlerinde kullanılır."\n\n{"questions":[{"type":"fill_blank","q":"_____ is the powerhouse of the cell.","blank":"Mitochondria","opts":["Mitochondria","Ribosome","Nucleus","Lysosome"],"ans":0,"exp":"Mitochondria produces ATP through cellular respiration."}]}`

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

// Öğretmen geri bildirimleriyle bulunan 4 ayrı içerik kalitesi hatasına
// karşı TEK, paylaşılan filtre fonksiyonu (hem ana üretim hem eksik-soru
// tamamlama turu bunu kullanır — kopya mantık yok).
function applyContentQualityFilters(qs: any[], mebContext: string): any[] {
  // 29 Ağustos 2026 — Deniz'in gerçek log karşılaştırmasıyla bulunan sorun:
  // bu filtreler bazı çağrılarda üretilen soruların %60-100'ünü eliyordu
  // (log: "5 -> 2", "2 -> 0", "5 -> 2") ama HANGİ filtrenin HANGİ soruyu
  // hangi gerekçeyle elediği hiçbir yerde görünmüyordu — bu da kör bir
  // şekilde topup turlarını tetikleyip (AI aynı sınırlı pasajdan tekrar
  // tekrar üretmek zorunda kalıyor), dolaylı olarak soru TEKRARINI
  // artırıyordu. Artık her filtre, elediği soruyu (ilk 70 karakter) ve
  // gerekçesini greplenebilir bir etiketle logluyor — bir sonraki
  // yoğun-eleme olayında kör tahmin yerine gerçek kanıt olacak.
  const logRejected = (stage: string, q: any, reason: string) => {
    console.warn(`[content-filter-reject] stage=${stage} reason="${reason}" q="${(q.q || '').slice(0, 70)}"`)
  }

  // 1) Kaynağın kendisi (yazar, ISBN, İçindekiler) hakkında soru
  const bookMetadataPattern = /\bISBN\b|yazar kadrosu|kaç yazar (tarafından|kişi)|kitab(ı|ın)[ıi]n yazarlarından|(ders kitab|kaynağ[ıi]n yer ald[ıi]ğ[ıi] kitab).{0,30}(hazırlanmıştır|hazırlamıştır)|kitab[ıi]n künye|İçindekiler/i
  let result = qs.filter((q: any) => {
    const ok = !bookMetadataPattern.test(q.q || '')
    if (!ok) logRejected('book-metadata', q, 'kaynağın kendisi hakkında soru')
    return ok
  })

  // 2) Görünmeyen metne/parçaya atıf (14 Ağustos 2026'da genişletildi:
  // "metinde/metne/parçada" kelimesinin genel kullanımı yakalanır;
  // sorunun içinde gerçekten anlamlı uzunlukta (40+ karakter) tırnaklı
  // bir alıntı varsa kaynağın gömülü olduğu kabul edilip güvenli sayılır.
  //
  // 29 Ağustos 2026 — İSTİSNA eklendi: bir önceki oturumda eklenen "SORU
  // DERİNLİĞİ KURALI" AI'ı özellikle "Bir öğrenci ... diye düşünüyor — bu
  // düşüncedeki eksiklik nedir?" kalıbındaki misconception-tarzı sorular
  // üretmeye teşvik ediyor. Bu kalıptaki sorular KENDİ İÇİNDE eksiksizdir
  // (öğrencinin YANLIŞ düşüncesi sorunun kendi metninde zaten yazılı) —
  // pasajdan ayrıca 40+ karakterlik BİREBİR bir alıntıya ihtiyaç duymazlar,
  // çünkü test edilen şey pasajın kendisi değil, o düşüncedeki mantık
  // hatasıdır. Eski filtre bu kalıbı da "görünmeyen metne atıf" sayıp
  // gereksiz yere eliyordu (muhtemelen "5 -> 2" gibi ağır elemelerin bir
  // parçası). Artık "Bir öğrenci"/"öğrenci" kelimesiyle başlayan ve tırnak
  // içinde bir düşünce/söylem içeren sorular bu filtreden muaf tutuluyor.
  const unseenPassagePattern = /\bmetinde\b|\bmetne göre\b|\bmetnin\b|\bparçada\b|\bparçaya göre\b|\byukarıdaki (metin|parça)|\bhikayede\b/i
  // Tırnak tespiti: düz çift tırnak ("), Türkçe/İngilizce eğik çift tırnak
  // (" "), VE düz/eğik TEK tırnak (apostrof) hepsi kapsanmalı — gerçek
  // AI çıktısı öğrenci sözünü çoğunlukla 'böyle' tek tırnakla aktarıyor
  // (çift tırnak değil). İlk sürümde bu unutulmuş, test edilince (bir
  // düzeltmeyi asla test etmeden bırakma prensibi) hemen yakalanıp
  // düzeltildi — aksi hâlde bu "düzeltme" gerçek veride hiç tetiklenmeyip
  // sorunu çözmemiş olacaktı.
  const QUOTE_PATTERN = /["“‘']([^"”’']{15,})["”’']/
  const hasEmbeddedQuote = (text: string) => {
    const m = text.match(QUOTE_PATTERN)
    return !!m && m[1].length >= 40
  }
  const isSelfContainedMisconceptionQuestion = (text: string) =>
    // NOT: baştaki \b kasıtlı olarak YOK — "öğrenci" gibi Türkçe özel
    // karakterle (ö) başlayan kelimelerde JS'in varsayılan \w sınıfı
    // Türkçe harfleri içermediği için \böğrenci hiç eşleşmiyordu (bu
    // dosyada tekrar eden "Turkish karakter" hata ailesinin bir üyesi
    // daha — bkz. .toLocaleLowerCase('tr') notları). Sondaki \b sorun
    // değil çünkü "si"/"nin" ekleri ASCII harfle bitiyor.
    /öğrenci(nin|si)?\b/i.test(text) && QUOTE_PATTERN.test(text)
  result = result.filter((q: any) => {
    const text = q.q || ''
    const flagged = unseenPassagePattern.test(text) && !hasEmbeddedQuote(text) && !isSelfContainedMisconceptionQuestion(text)
    if (flagged) logRejected('unseen-passage-reference', q, 'metne/parçaya atıf var ama alıntı/self-contained değil')
    return !flagged
  })

  // 3) Kaynakta gerçekten OLMAYAN, isimlendirilmiş bir esere kaçış
  // (ör. Gençliğe Hitabesi, İstiklal Marşı). 15 Ağustos 2026'da bulunan
  // İKİ ayrı hata düzeltildi:
  //  a) Önceki liste tam "Gençliğe Hitabesi" (iyelik ekiyle) string'i
  //     arıyordu, ama AI çoğunlukla "Gençliğe Hitabe" (eksiz) ya da
  //     "Hitabe'sinde"/"Hitabe metninde" yazıyordu -- alt dize hiç
  //     eşleşmiyordu. Artık YAZAR/ESER ADI yerine, o esere özgü NADİR
  //     kelime/ifadeler aranıyor (izmihlal, hürriyyet, müstevli, "ey
  //     türk gençliği") -- bunlar hangi ek/çekimle yazılırsa yazılsın
  //     hep aynı kalır.
  //  b) "Ersoy" gibi bir YAZAR ADI kaynakta geçmesi, o yazarın ESERİNİN
  //     TAM METNİNİN de kaynakta olduğu anlamına gelmez (ör. yazar
  //     biyografisi başka bir bağlamda geçebilir) -- yazar adı kontrolü
  //     tamamen kaldırıldı, sadece gerçek metin parçaları aranıyor.
  //  c) KRİTİK: JS'in standart .toLowerCase() metodu Türkçe büyük "İ"
  //     harfini YANLIŞ karaktere çevirir (Unicode'un "Turkish I problem"i
  //     -- "İ" -> "i̇" [i + kombine nokta, 2 kod noktası], "i" değil).
  //     Bu yüzden "GENÇLİĞE HİTABE" gibi büyük harfli başlıklar
  //     .toLowerCase() sonrası aranan küçük harfli string ile HİÇ
  //     eşleşmiyordu. .toLocaleLowerCase('tr') kullanılarak düzeltildi.
  const namedWorkMarkers = ['gençliğe hitabe', 'izmihlal', 'izmihlâl', 'hürriyyet', 'müstevli', 'ey türk gençliği', 'istiklal marşı', 'istiklâl marşı']
  result = result.filter((q: any) => {
    const text = (q.q || '').toLocaleLowerCase('tr')
    const ctx = mebContext.toLocaleLowerCase('tr')
    for (const marker of namedWorkMarkers) {
      if (text.includes(marker) && !ctx.includes(marker)) {
        logRejected('named-work-escape', q, `kaynakta olmayan esere kaçış: "${marker}"`)
        return false
      }
    }
    return true
  })

  // 4) Müfredat çerçeve dokümanının kendi pedagojik/idari bölüm başlıkları
  // (Köprü Kurma, Performans Görevi vb.) hakkında soru — öğretmene
  // yönelik metodoloji, öğrenciye sorulacak konu içeriği değil.
  const curriculumMetaPattern = /Öğrenme Kanıtları|Performans Görevi|Köprü Kurma|Öğrenme-Öğretme Yaşantıları|Ön Değerlendirme Süreci|Beceriler Arası İlişkiler|Disiplinler Arası İlişkiler|Öğrenme Çıktıları ve Süreç Bileşenleri/
  result = result.filter((q: any) => {
    const ok = !curriculumMetaPattern.test(q.q || '')
    if (!ok) logRejected('curriculum-meta', q, 'müfredat dokümanının idari başlığı')
    return ok
  })

  return result
}

// 31 Ağustos 2026 — Deniz'in gerçek test karşılaştırmasıyla bulunan sorun:
// önceki oturumda eklenen "önceki parçanın cümlelerini tekrar hedefleme"
// talimatı (previousQuestionsNote'a eklenen KAYNAK METİN SÜREKLİLİĞİ notu)
// sadece PROMPT SEVİYESİNDE bir uyarıydı — ve AI bunu güvenilir şekilde
// takip etmedi: gerçek bir testte chunk1'deki "İslam'da Allah'ın kaç ismi
// var?" sorusu, chunk2'de neredeyse birebir aynı kelimelerle ("Esma-ül
// Hüsna" eklenerek) TEKRAR üretildi — talimata rağmen. Ders: LLM'e "tekrar
// etme" demek yeterli bir garanti DEĞİL, promptlar kalabalıklaştıkça bu
// tür talimatlar güvenilirliğini kaybediyor. Bu yüzden artık deterministik
// bir kod-seviyesi kontrolü var: her yeni soru, DAHA ÖNCE SORULMUŞ (bu
// oturumun önceki parçası + bu çağrının kendi içinde önce üretilmiş)
// sorularla kelime-örtüşümü (Jaccard benzerliği) açısından karşılaştırılır;
// eşik aşılırsa soru silinir ve zaten var olan topup mekanizması (yukarıda)
// boşluğu otomatik doldurur — talimata güvenmek yerine kod garantisi.
const DUP_STOPWORDS = new Set([
  'metinde', 'metne', 'metnin', 'göre', 'hangi', 'aşağıdakilerden', 'olduğu',
  'olarak', 'için', 'ile', 'nedir', 'bir', 'bu', 'şu', 'ne', 'gibi', 'kadar',
  'olan', 'olduğunu', 'olması', 'diye', 'diyor', 'düşünüyor', 'öğrenci',
  'öğrencinin', 'öğrencisi', 'soruyor', 'aşağıdaki', 'işaret', 'belirtilen',
  'edilmiştir', 'edilmektedir', 'göstermektedir', 've', 'ya', 'da', 'de',
])
function normalizeWordsForDupCheck(text: string): Set<string> {
  const words = (text || '')
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !DUP_STOPWORDS.has(w))
  return new Set(words)
}
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let overlap = 0
  a.forEach((w) => { if (b.has(w)) overlap++ })
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : overlap / union
}
const DUP_SIMILARITY_THRESHOLD = 0.4
function filterOutNearDuplicates(qs: any[], alreadyAskedTexts: string[]): any[] {
  const alreadyAskedWordSets = alreadyAskedTexts.map(normalizeWordsForDupCheck)
  const acceptedWordSets: Set<string>[] = []
  const result: any[] = []
  for (const q of qs) {
    const qWords = normalizeWordsForDupCheck(q.q || '')
    const isDup =
      alreadyAskedWordSets.some((prev) => jaccardSimilarity(qWords, prev) >= DUP_SIMILARITY_THRESHOLD) ||
      acceptedWordSets.some((prev) => jaccardSimilarity(qWords, prev) >= DUP_SIMILARITY_THRESHOLD)
    if (isDup) {
      console.warn(`[content-filter-reject] stage=near-duplicate reason="daha önce sorulan bir soruyla yüksek kelime örtüşümü" q="${(q.q || '').slice(0, 70)}"`)
      continue
    }
    acceptedWordSets.push(qWords)
    result.push(q)
  }
  return result
}
// "öğrenciye kaynak metni göster" özelliği, mebContext'in HAM HÂLİNİ
// (meb-search'ün kendi iç etiketleriyle -- "[MEB Kaynak N - ...]",
// "[Sınav Sorusu N - ...]", "---" ayraçları -- ve HİÇ KIRPMADAN) doğrudan
// "passage" alanına koyuyordu. Sonuç: öğrenciye LGS sınav kapak sayfası
// ("SINAVLA ÖĞRENCİ ALACAK ORTAÖĞRETİM KURUMLARINA...") gibi tamamen
// alakasız, dev bir metin "Kaynak Metin" diye gösteriliyordu. Bu fonksiyon:
// (a) SADECE gerçek "[MEB Kaynak ...]" bloklarını tutar -- "[Sınav Sorusu
// ...]" blokları (farklı derslerin LGS sorularını, kapak sayfasını
// içerebilir) öğrenciye "kaynak metin" olarak ASLA gösterilmemeli, sadece
// AI'ın soru üretirken referans alması için mebContext'te kalmaya devam
// eder. (b) iç etiketleri temizler. (c) makul bir uzunlığa (paragraf
// sınırında) kırpar -- fileContent zaten 4000 karaktere kırpılıyordu,
// mebContext hiç kırpılmıyordu, bu tutarsızlık da giderildi.
// 28 Ağustos 2026 (ikinci bulgu, aynı gün) — Deniz'in bildirdiği başka bir
// örnek: passage GERÇEKTEN doğru MEB kaynağından geliyordu (soru kaynakla
// birebir örtüşüyordu) ama başında "ALLAH İNANCI\n13\nÜnite\nPdf Dosyası\n
// Ünite \nSunusu\nBaşlarken" gibi anlamsız bir META VERİ/SAYFA ÜSTBİLGİSİ
// bloğu vardı -- muhtemelen raw_text içinde HER SAYFADA tekrarlanan bir
// üstbilgi (tıpkı sınav kitapçıklarındaki "Ortaöğretim Genel Müdürlüğü..."
// tekrarına benzer), findContentStart() konu adını ararken TESADÜFEN bu
// üstbilgiye denk gelmiş. Özel bir kelime listesi yerine GENEL bir yapısal
// desen: art arda ≥3 KISA (< 20 karakter) satır, gerçek (uzun) bir paragraf
// satırından hemen önce geliyorsa üstbilgi sayılır ve atlanır.
function stripLeadingShortLineHeader(text: string): string {
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim().length > 0 && lines[i].trim().length < 20) i++
  if (i >= 3 && i <= 12) return lines.slice(i).join('\n').replace(/^\n+/, '')
  return text
}

function cleanPassageForDisplay(raw: string): string {
  if (!raw) return ''
  const blocks = raw.split(/\n\n---\n\n/)
  const mebBlocks = blocks.filter(b => /^\[MEB Kaynak/.test(b.trim()))
  if (mebBlocks.length === 0) return ''
  const combined = mebBlocks
    .map(b => stripLeadingShortLineHeader(b.replace(/^\[[^\]]+\]\n/, '').trim()))
    .join('\n\n')
  const MAX = 3000
  if (combined.length <= MAX) return combined
  const cut = combined.slice(0, MAX)
  const lastPara = cut.lastIndexOf('\n\n')
  return (lastPara > MAX * 0.5 ? cut.slice(0, lastPara) : cut).trim() + '…'
}

// 28 Ağustos 2026 (üçüncü bulgu, aynı gün) — Deniz'in bildirdiği hata:
// AYNI kaynak metin, o metne HİÇ dayanmayan (genel bilgi) sorulara da
// gösteriliyordu (ör. "Allah'ın varlığını ve birliğini ifade eden temel
// inanç ilkesine ne ad verilir?" — cevabı "Tevhid", ama bu kelime
// pasajda hiç geçmiyor, öğrenci pasajı okuyup cevap bulamaz, kafası
// karışır). Kod, sourcePassage'ı TÜM sorulara körlemesine uyguluyordu.
// Artık her soru için, sorunun kendi metninin (q+exp) pasajla GERÇEKTEN
// kelime düzeyinde örtüşüp örtüşmediği kontrol ediliyor -- örtüşmüyorsa
// passage o soruya eklenmiyor. Basit ama etkili bir yöntem: stopword'ler
// hariç, 4+ harfli kelimelerin kesişim sayısı. Gerçek 6 örnekle (3'ü
// pasaja dayalı, 3'ü genel bilgi) test edildi, eşik>=2 ile 6/6 doğru
// sınıflandı (bkz. commit mesajı).
const PASSAGE_OVERLAP_STOPWORDS = new Set(['bir','bu','şey','için','göre','olan','olarak','ile','de','da','ve','ya','ki','mi','mı','mu','mü','değil','hangisi','aşağıdaki','nedir','hangisidir','allah','eden','olduğu','olduğunu'])
function extractMeaningfulWords(text: string): Set<string> {
  const matches = text.toLocaleLowerCase('tr').match(/[a-zçğıöşüâî]{4,}/g) || []
  return new Set(matches.filter(w => !PASSAGE_OVERLAP_STOPWORDS.has(w)))
}
function questionReferencesPassage(q: any, passage: string, passageWords: Set<string>): boolean {
  const qWords = extractMeaningfulWords(`${q.q || ''} ${q.exp || ''}`)
  let overlap = 0
  for (const w of qWords) if (passageWords.has(w)) overlap++
  return overlap >= 2
}

export async function POST(req: NextRequest) {
  // 29 Ağustos 2026 — soru sayısı tamamlama turları (aşağıda) 4 tura
  // çıkarıldı; her tur birkaç saniye sürebildiği için, Vercel'in
  // maxDuration=120sn sınırına TAM OTURMASI riski var — fonksiyon
  // zaman aşımına uğrarsa öğrenci HİÇ soru alamaz (elindeki kısmi sonuç
  // bile kaybolur). Bu yüzden topup döngüsü, kalan süre bütçesini kontrol
  // edip güvenli marj kalmadığında (DB yazımı + response için pay bırakarak)
  // erken durur — az sayıda soru eksik dönmek, hiç dönmemekten iyidir.
  const requestStartTime = Date.now()
  let promptStr = ''
  let countRef = 5
  // 26 Ağustos 2026 — öğretmen geri bildirimi: "Metinde, ..." tarzı sorularda
  // öğrenciye kaynak metnin KENDİSİ hiç gösterilmiyordu. mebContext/fileContent
  // yalnızca AI'ın prompt'una gidiyordu, response'a hiç eklenmiyordu — AI'ın
  // soru köküne gömdüğü özet/alıntı da her zaman yeterli olmuyordu. Fallback
  // (catch) bloğunun da erişebilmesi için promptStr/countRef ile aynı yerde,
  // try bloğunun DIŞINDA tanımlandı.
  let sourcePassage = ''
  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, monthly_test_count, daily_test_count, daily_test_date, grade, language, department')
      .eq('id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const plan = profile.plan || 'free'
    const today = new Date().toISOString().split('T')[0]

    // Premium ve Unlimited planlarda HİÇBİR soru/test sınırı yok — sadece
    // freemium için günlük/aylık limit uygulanır.
    if (plan !== 'premium' && plan !== 'unlimited') {
      const DAILY_LIMIT: Record<string, number> = { free: 10 }
      const dailyLimit = DAILY_LIMIT[plan] ?? 10
      const dailyCount = profile.daily_test_date === today ? (profile.daily_test_count || 0) : 0
      if (dailyCount >= dailyLimit) {
        return NextResponse.json({ error: 'daily_limit_reached' }, { status: 429 })
      }

      const MONTHLY_LIMIT: Record<string, number> = { free: 10 }
      const monthlyLimit = MONTHLY_LIMIT[plan] ?? 10
      if ((profile.monthly_test_count || 0) >= monthlyLimit) {
        return NextResponse.json({ error: 'limit_reached' }, { status: 429 })
      }
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
      continueSessionId, // adaptif akışta ikinci/sonraki parça — mevcut oturuma eklenir, yeni test sayılmaz
      excludeQuestionTexts, // aynı oturumda (henüz completed=false) az önce sorulmuş sorular — tekrar önleme
      subject, // 17 Ağustos 2026'da bulundu: frontend zaten gönderiyordu (app/quiz/page.tsx)
      // ama backend bu alanı HİÇ okumuyordu -- "İngilizce" dersi bilgisi
      // tamamen kayboluyor, AI sadece "topic" (ör. "Past simple tense")
      // adından ders türünü çıkarsamak zorunda kalıyordu. Bu, hem meb-search'ün
      // ders-filtresiz (yanlış derse ait kaynak eşleşme riski taşıyan) arama
      // yapmasına, hem de "Soru dili: Türkçe" talimatının İngilizce dersinde
      // AI'ı tamamen konu dışı, Türkçe okuma-anlama sorularına kaydırmasına
      // yol açıyordu (gerçek örnek: 10 sorudan 7'si "Past Simple Tense"le
      // hiç ilgisi olmayan Türkçe edebiyat/iletişim sorularıydı).
    } = body

    const MAX_QCOUNT: Record<string, number> = { free: 5, premium: 20, unlimited: 20 }
    const maxQ = MAX_QCOUNT[plan] ?? 5
    const safeQCount = Math.min(questionCount, maxQ)

    const grade = profile.grade || 'ortaokul 6. sinif'

    if (!fileContent && !isInCurriculum(topic, plan, grade)) {
      return NextResponse.json({ error: 'out_of_curriculum' }, { status: 403 })
    }

    // Adaptif Test Motoru (Faz 2) — zorluk seviyesi artık kullanıcıya
    // sorulmuyor (UI'dan kaldırıldı). difficulty==='auto' geldiğinde,
    // bu konudaki mastery skoruna (Faz 1, lib/mastery.ts) bakarak makul bir
    // başlangıç noktası seçilir. Sonraki parçaların zorluğu ise client
    // tarafında lib/adaptive-difficulty.ts ile hesaplanıp buraya açıkça
    // gönderilir (bkz. continueSessionId akışı).
    const adaptivePolicy = await resolveAdaptiveLearningPolicy(supabase, user.id, topic, subject)
      .catch(() => null)
    let resolvedDifficulty = difficulty
    if (difficulty === 'auto') {
      try {
        const mastery = await getTopicMastery(supabase, user.id, topic)
        resolvedDifficulty = adaptivePolicy?.startingDifficulty
          || startingDifficultyFromMastery(mastery?.masteryScore ?? null)
      } catch {
        resolvedDifficulty = 'normal'
      }
    }

    const lang = language || profile.language || 'Turkce'

    // 18 Ağustos 2026'da bulundu: İngilizce (ve diğer yabancı dil) dersinde
    // "isLanguageCourse" notu SADECE örnek cümlelerin İngilizce kalmasını
    // istiyordu, ama "Soru dili: ${lang}" talimatı hâlâ öğrencinin genel
    // arayüz dilini (çoğunlukla Türkçe) taşıyordu — AI soru KÖKÜNÜ ve
    // şıkları Türkçe üretmeye devam ediyordu (kullanıcının paylaştığı PDF:
    // "Aşağıdaki cümlelerden hangisi..." Türkçe kök + İngilizce şıklar).
    // Kullanıcı talimatı: "Türkçe olacak" varsayılan kuralı, İngilizce
    // (ve diğer yabancı dil) dersleri İÇİN İSTİSNA tutulmalı — o derste
    // TÜM soru hedef dilde sorulmalı. Bunu TEK bir noktada (burada) çözüp
    // aşağı akışın (prompt, doğrulama, DB kaydı/PDF etiketi) HEPSİNİN aynı
    // doğru dili kullanmasını sağlıyoruz — aksi halde test kaydında/PDF
    // çıktısında "Dil: Türkçe" yazıp öğrenciyi/veliyi yanıltmaya devam eder.
    const FOREIGN_LANGUAGE_SUBJECTS_SET = new Set([
      'ingilizce', 'almanca', 'fransızca', 'fransizca', 'ispanyolca',
      'arapça', 'arapca', 'rusça', 'rusca', 'italyanca', 'çince', 'cince',
      'japonca', 'korece',
    ])
    const isLanguageCourseSubject = !!subject && FOREIGN_LANGUAGE_SUBJECTS_SET.has(subject.trim().toLocaleLowerCase('tr'))
    const effectiveLang = isLanguageCourseSubject ? subject : lang

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

      if (recentSessions?.length || (Array.isArray(excludeQuestionTexts) && excludeQuestionTexts.length > 0)) {
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

        // Adaptif akışta (continueSessionId), o anki oturumun ilk parçasında
        // sorulan sorular henüz completed=true olmadığı için yukarıdaki DB
        // sorgusunda GÖRÜNMEZ — client bunları excludeQuestionTexts ile
        // açıkça gönderir, aksi halde chunk 2'de chunk 1'in aynısı sorulabilir.
        if (Array.isArray(excludeQuestionTexts)) {
          excludeQuestionTexts.forEach((t: string) => {
            if (typeof t === 'string' && prevQTexts.length < 50) prevQTexts.push(t.slice(0, 100))
          })
        }

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

    // Zayıf ders bağlamı (okul karnesi importu — grade_notes, öğretmen tarafından yüklenir)
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

    // Bu KONUDA öğrencinin Pratium içi geçmiş performansı — grade_notes'tan
    // farklı: bu, okul karnesi değil, öğrencinin bizzat Pratium'da bu
    // konuda çözdüğü sorulardaki performansı. Önceki halde burada sadece
    // ham wrong/total oranına bakan basit bir eşik kontrolü vardı (bkz.
    // lib/mastery.ts'in başındaki not) — artık Bayesian-düzeltmeli mastery
    // skoru + zaman ağırlıklı unutma riski + soru-tipi bazlı hata paterni
    // (lib/mastery.ts) kullanılıyor.
    try {
      const [mastery, patterns] = await Promise.all([
        getTopicMastery(supabase, user.id, topic),
        computeErrorPatterns(supabase, user.id, topic),
      ])
      gradeContext += buildStudentHistoryContext(mastery, patterns)

      // Learning Graph v1: yalnızca admin tarafından doğrulanmış ön koşul
      // ilişkileri öğrenci mastery sinyaliyle birlikte prompt'a eklenir.
      try {
        const gaps = await findPrerequisiteGaps(supabase, user.id, topic, subject)
        gradeContext += buildPrerequisiteContext(gaps)
      } catch { /* opsiyonel bağlam, hata olursa sessiz geç */ }
    } catch { /* öğrenci geçmişi opsiyonel bağlam, hata olursa sessiz geç */ }

    // ✅ MEB search — paralel çalışır, max 3sn bekle. Üniversite için MEB
    // grounding zaten anlamsız (tek resmi müfredat yok), bu yüzden atlanır.
    let mebContext = ''
    const level = getLevel(grade)
    if (level !== 'universite') {
      try {
        const mebRes = await fetch(`${req.nextUrl.origin}/api/meb-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || 'internal' },
          body: JSON.stringify({ topic, grade, subject, unit: topic, level, limit: 2 }),
          signal: AbortSignal.timeout(3000), // 3sn — daha agresif timeout
        })
        if (mebRes.ok) {
          const mebData = await mebRes.json()
          if (mebData.found && mebData.context) {
            mebContext = mebData.context.slice(0, 6500)
          }
        }
      } catch { /* MEB opsiyonel */ }
    }

    // 29 Ağustos 2026 — Deniz'in gerçek test karşılaştırmasıyla bulunan
    // bir sonraki katman: "soru derinliği kuralı" (a27dd47) tek bir
    // generate-quiz çağrısı İÇİNDE ("bu ${count} soru arasında en fazla
    // 2-3'ü aynı cümleyi hedefleyebilir") uygulanıyor — ama adaptif akışta
    // 10 soru 2 AYRI çağrıya (chunk1: 5, chunk2: 5) bölünüyor, ve chunk2'nin
    // prompt'u chunk1'in pasajın HANGİ cümlelerini kullandığını bilmiyor.
    // Sonuç: chunk1 kendi 5 sorusu içinde kuralına uyar, chunk2 de kendi 5
    // sorusu içinde uyar, ama İKİSİ BİRLİKTE aynı 2-3 cümleyi toplamda 6-7
    // kez hedefleyebilir (gerçek örnek: "her şeyin bir sebebi var" cümlesi
    // 3 farklı soruda çıktı). previousQuestionsNote zaten önceki soru
    // METİNLERİNİ AI'a gösteriyor ama "aynı soruyu sorma" diyor, "aynı
    // OLGUYU/CÜMLEYİ farklı ifadeyle de olsa tekrar hedefleme" demiyor —
    // bu yüzden AI aynı cümleyi başka bir açıdan yeniden sorarak kuralı
    // "teknik olarak" ihlal etmeden tekrar ediyordu. Bu ek not, mebContext
    // varken ve bu bir devam isteğiyken (excludeQuestionTexts dolu),
    // previousQuestionsNote'a AÇIKÇA bu uyarıyı ekliyor.
    if (mebContext && Array.isArray(excludeQuestionTexts) && excludeQuestionTexts.length > 0) {
      previousQuestionsNote += `\n\n⚠️ KAYNAK METİN SÜREKLİLİĞİ: Bu, aynı kaynak metne dayanan bir testin İKİNCİ (veya sonraki) parçası. Yukarıda listelenen önceki sorular, kaynak metnin BELİRLİ cümlelerini/olgularını zaten kullandı. Bu parçada o AYNI cümleleri/olguları FARKLI bir ifadeyle, farklı bir soru formatıyla, ya da "doğru mu yanlış mı" gibi tersinden bile olsa TEKRAR HEDEFLEME — bu, öğretmen tarafından "aynı bilgi 6-7 kez soruldu" diye eleştirilen bilinen bir hata deseni. Bunun yerine: (a) kaynak metnin önceki parçada HİÇ değinilmemiş başka bir cümlesini/paragrafını kullan, VEYA (b) konunun (topic) kendisi hakkında, kaynak metne dayanmayan, genel kavramsal bir soru sor (ör. temel itikat/tanım sorusu) — bu ikinci seçenek özellikle kaynak metin kısaysa ve tüm cümleleri önceki parçada tükenmişse tercih edilmeli.`
    }

    const prompt = buildPrompt(questionType, topic, grade, resolvedDifficulty, effectiveLang, safeQCount, fileContent || '', gradeContext, mebContext, profile.department || undefined, subject)
      + (adaptivePolicy?.promptContext || '')
      + misconceptionMetadataInstruction(questionType)
      + previousQuestionsNote
    promptStr = prompt
    countRef = safeQCount

    // Hız optimizasyonu: az soru → Haiku (3x hızlı), çok soru → Sonnet
    const useHaiku = safeQCount <= 7
    const response = await anthropic.messages.create({
      model: useHaiku ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-5',
      max_tokens: useHaiku ? 2500 : 3500,
      system: level === 'universite'
        ? 'Sen üniversite düzeyinde soru üreten bir eğitim asistanısın. MEB K-12 müfredatı kısıtı burada geçerli değil; öğrencinin bölümüne/seviyesine uygun, akademik olarak doğru sorular üret. Siyasi, dini tartışma yaratabilecek veya uygunsuz içerik üretme. Her sorunun doğruluğunu teyit et.'
        : 'Sen Türkiye Milli Eğitim Bakanlığı (MEB) müfredatına göre soru üreten bir eğitim asistanısın. Yalnızca MEB müfredatındaki konularda soru üret. Müfredat dışı, siyasi, dini tartışma yaratabilecek veya uygunsuz içerik üretme. Her sorunun doğruluğunu teyit et.',
      messages: [{ role: 'user', content: prompt }],
    })
    console.log(`[generate-quiz] model=${useHaiku ? 'haiku' : 'sonnet'} qCount=${safeQCount}`)
    logAnthropicUsage('generate-quiz', useHaiku ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-5', response, {
      meta: { qCount: safeQCount, topic, hasMebContext: !!mebContext },
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
            body: JSON.stringify({ questions, topic, grade, language: effectiveLang, questionType }),
            signal: AbortSignal.timeout(40000), // 40sn - asilmasin, generate-quiz kendi butcesini korusun
          }).then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null),

      // 2. SVG üretimi (max 2, paralel)
      includeVisuals && visualCategory
        ? Promise.all(
            Array.from({ length: Math.min(questions.length, 1) }, (_, i) => // Max 1 SVG — hız optimizasyonu
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

    // Kaynağın kendisi (yazar, ISBN, künye) hakkında soru üretilmesini
    // engellemek için prompt'a talimat eklendi (bkz. yukarı) — ama LLM'ler
    // talimatlara %100 uymayabiliyor. Bu yüzden ek bir kod-seviyesi güvenlik
    // ağı: bu paterne uyan bir soru sızarsa listeden çıkarılır. (Öğrenci
    // için eksik bir soru, hatalı/anlamsız bir sorudan daha iyidir.)
    const beforeFilterCount = questions.length
    questions = applyContentQualityFilters(questions, mebContext)
    if (questions.length < beforeFilterCount) {
      console.warn(`[generate-quiz] filtreler sonrası ${beforeFilterCount - questions.length} soru elendi (${beforeFilterCount} -> ${questions.length})`)
    }

    // 31 Ağustos 2026 — deterministik tekrar kontrolü (bkz. yukarıdaki
    // filterOutNearDuplicates tanımı). excludeQuestionTexts, adaptif akışın
    // önceki parçasında (chunk1) sorulmuş soruları içerir — bu çağrının
    // ürettiği sorular onlarla yüksek kelime örtüşümü gösteriyorsa silinir.
    const beforeDupCount = questions.length
    questions = filterOutNearDuplicates(questions, Array.isArray(excludeQuestionTexts) ? excludeQuestionTexts : [])
    if (questions.length < beforeDupCount) {
      console.warn(`[generate-quiz] yakın-tekrar kontrolü sonrası ${beforeDupCount - questions.length} soru elendi (${beforeDupCount} -> ${questions.length})`)
    }

    // 14 Ağustos 2026'da öğretmen geri bildirimiyle bulunan ayrı bir hata:
    // istenen soru sayısı ile üretilen soru sayısı SIK SIK uyuşmuyordu
    // (ör. 5 istenince 9 ya da 1 dönüyordu). Kök neden: (a) AI'ın kendisi
    // "count" talimatına güvenilir uymuyor, (b) yukarıdaki filtreler
    // soruları elediğinde YERİNE YENİSİ ÜRETİLMİYORDU.
    //
    // 29 Ağustos 2026 — Deniz'in "kesin çöz" talebiyle GÜÇLENDİRİLDİ:
    // önceki hâl (max 2 tur, Haiku/Sonnet karışık, sabit 1500-2000 token)
    // hâlâ kısa kalabiliyordu. Kök nedenler kod okunarak doğrulandı:
    //  a) Topup max_tokens'ı SABİTTİ (missing sayısından bağımsız) — 5+
    //     eksik soru gerektiğinde (uzun mebContext + açıklama alanları ile)
    //     JSON çoğu zaman YARIDA KESİLİYOR, parse başarısız oluyor, o tur
    //     SIFIR soru ekliyordu (0 ilerleme → döngü erken kesiliyordu).
    //  b) Topup, orijinal üretimde Haiku seçildiyse (safeQCount<=7) YİNE
    //     Haiku kullanıyordu — Haiku "TAM OLARAK N adet" talimatına Sonnet
    //     kadar güvenilir uymuyor, bu da ilk turdan itibaren açığı büyütüyordu.
    //  c) questions.length===0 (ilk üretim TAMAMEN başarısız) durumunda
    //     topup hiç ÇALIŞMIYORDU (eski `> 0` koşulu) — sıfırdan telafi şansı
    //     hiç verilmiyordu.
    //  d) Tek bir turda ilerleme olmaması döngüyü hemen kesiyordu — geçici
    //     bir JSON-parse hatası bile telafi şansı bulamadan pes ediyordu.
    // Düzeltme: 4 tura çıkarıldı, topup HER ZAMAN Sonnet kullanıyor (daha
    // güvenilir sayı takibi), max_tokens eksik soru sayısına göre ölçekleniyor
    // (~600 token/soru, taban 2000), 0 sorudan da başlayabiliyor, ve döngü
    // sadece ART ARDA 2 turda hiç ilerleme olmazsa erken kesiliyor (tek
    // seferlik bir parse/format hatasına tolerans tanınıyor).
    if (questions.length > safeQCount) {
      questions = questions.slice(0, safeQCount)
    } else if (questions.length < safeQCount) {
      const maxTopupRounds = 4
      const TOPUP_TIME_BUDGET_MS = 95000 // 120sn'lik toplam bütçeden DB yazımı/response için pay bırak
      let consecutiveNoProgress = 0
      for (let round = 0; round < maxTopupRounds && questions.length < safeQCount; round++) {
        if (Date.now() - requestStartTime > TOPUP_TIME_BUDGET_MS) {
          console.warn(`[generate-quiz] zaman bütçesi doldu, topup turu ${round + 1} atlanıyor (elde olan: ${questions.length}/${safeQCount})`)
          break
        }
        const missing = safeQCount - questions.length
        const beforeRoundCount = questions.length
        try {
          const topupPrompt = `${prompt}\n\nÖNEMLİ: Bu sefer TAM OLARAK ${missing} adet YENİ ve BİRBİRİNDEN FARKLI soru üret (ne bir eksik ne bir fazla). Daha önce üretilenlerle aynı/benzer soru üretme. Yanıtın SADECE geçerli, TAMAMLANMIŞ (yarıda kesilmemiş) JSON olmalı.`
          const topupResponse = await anthropic.messages.create({
            // Eksik soru tamamlama, sayıya SADIK KALMA konusunda Haiku'dan
            // daha güvenilir olan Sonnet ile yapılır — burada hız değil
            // doğru sayıya ulaşmak öncelikli.
            model: 'claude-sonnet-4-5',
            max_tokens: Math.min(4000, Math.max(2000, missing * 600)),
            messages: [{ role: 'user', content: topupPrompt }],
          })
          logAnthropicUsage('generate-quiz:topup', 'claude-sonnet-4-5', topupResponse, {
            meta: { round: round + 1, missing },
          })
          const topupText = topupResponse.content[0].type === 'text' ? topupResponse.content[0].text : ''
          const topupClean = topupText.replace(/```json|```/g, '').trim()
          let topupParsed: any
          try {
            topupParsed = JSON.parse(topupClean)
          } catch {
            const m = topupClean.match(/\{[\s\S]*\}/)
            if (m) {
              try { topupParsed = JSON.parse(m[0]) } catch { topupParsed = null }
            }
          }
          let topupQuestions = topupParsed?.questions || []
          topupQuestions = applyContentQualityFilters(topupQuestions, mebContext)
          // Yakın-tekrar kontrolü: hem önceki parçanın sorularına (excludeQuestionTexts)
          // hem de bu çağrıda ŞİMDİYE KADAR kabul edilmiş sorulara (questions) karşı.
          const alreadyAsked = [
            ...(Array.isArray(excludeQuestionTexts) ? excludeQuestionTexts : []),
            ...questions.map((q: any) => q.q).filter(Boolean),
          ]
          topupQuestions = filterOutNearDuplicates(topupQuestions, alreadyAsked)
          questions = [...questions, ...topupQuestions].slice(0, safeQCount)
          console.log(`[generate-quiz] eksik soru tamamlama (tur ${round + 1}/${maxTopupRounds}): ${missing} istendi, ${topupQuestions.length} eklendi (toplam ${questions.length})`)
        } catch (e) {
          console.warn(`[generate-quiz] eksik soru tamamlama (tur ${round + 1}) başarısız:`, e)
        }
        if (questions.length === beforeRoundCount) {
          consecutiveNoProgress++
          if (consecutiveNoProgress >= 2) break // 2 tur üst üste hiç ilerleme yoksa devam etmenin faydası yok
        } else {
          consecutiveNoProgress = 0
        }
      }
    }

    // 26 Ağustos 2026 — kaynak metni öğrenciye de gönder (yukarıdaki nota bkz.).
    // Öncelik: öğrencinin kendi yüklediği dosya varsa o (fileContent), yoksa
    // MEB kaynak metni (mebContext) — ikisi de AI'ın prompt'unda kullanılan
    // GERÇEK metin, AI'ın ürettiği bir özet değil. "q" metninde "metinde/
    // parçada" gibi bir ifade geçmese bile her soru aynı kaynağa dayandığı
    // için tüm sorulara ekleniyor (öğrenci istediğinde açıp bakabilir).
    // 28 Ağustos 2026: mebContext artık HAM DEĞİL, cleanPassageForDisplay
    // ile temizlenip (sınav sorusu blokları çıkarılıp, etiketler silinip,
    // kırpılıp) kullanılıyor -- bkz. fonksiyon tanımının üstündeki not.
    sourcePassage = (fileContent && fileContent.trim())
      ? fileContent.trim().slice(0, 4000)
      : cleanPassageForDisplay(mebContext || '')
    if (sourcePassage) {
      const passageWords = extractMeaningfulWords(sourcePassage)
      questions = questions.map((q: any) =>
        questionReferencesPassage(q, sourcePassage, passageWords)
          ? { ...q, passage: sourcePassage }
          : q
      )
    }

    // Learning Data Standard: these fields come from trusted request/session
    // context, not from the model. Persist them per question because adaptive
    // sessions may contain chunks at different difficulty levels. The event
    // projection reads this metadata when the completed quiz is recorded.
    const canonicalSubject = typeof subject === 'string' && subject.trim()
      ? subject.trim()
      : 'Genel'
    questions = questions.map((q: any) => ({
      ...normalizeQuestionMisconceptions(q),
      subject: canonicalSubject,
      difficulty: resolvedDifficulty,
      adaptivePolicyVersion: adaptivePolicy?.version || 'v2',
      adaptiveFocus: adaptivePolicy?.focus || 'standard',
      adaptiveReasonCode: adaptivePolicy?.reasonCode || 'NO_ACTIVE_SIGNAL',
      adaptiveRecommendationId: adaptivePolicy?.recommendationId || null,
    }))

    // continueSessionId: adaptif akışta ikinci/sonraki parça — aynı testin
    // devamı, YENİ bir test değil. Bu yüzden kota (monthly_test_count) TEKRAR
    // artırılmıyor ve DB'ye ayrı bir session satırı yazılmıyor; mevcut
    // session'ın questions dizisine EKLENİYOR (append).
    if (!dailyChallenge && !continueSessionId) {
      await supabase
        .from('profiles')
        .update({
          monthly_test_count: (profile.monthly_test_count || 0) + 1,
        })
        .eq('id', user.id)
    }

    let sessionId: string | undefined

    if (continueSessionId) {
      const { data: existing } = await supabase
        .from('quiz_sessions')
        .select('questions, question_count')
        .eq('id', continueSessionId)
        .eq('user_id', user.id) // başka kullanıcının oturumuna eklenemez
        .maybeSingle()

      if (existing) {
        const mergedQuestions = [...(existing.questions || []), ...questions]
        await supabase
          .from('quiz_sessions')
          .update({ questions: mergedQuestions, question_count: mergedQuestions.length })
          .eq('id', continueSessionId)
        sessionId = continueSessionId
      }
    }

    if (!sessionId) {
      const { data: sessionRow } = await supabase
        .from('quiz_sessions')
        .insert({
          user_id: user.id,
          topic,
          grade: profile.grade,
          language: effectiveLang,
          question_count: questions.length,
          questions,
          answers: [],
          score: 0,
          completed: false,
          question_type: questionType,
        })
        .select('id')
        .maybeSingle()
      sessionId = sessionRow?.id
    }

    return NextResponse.json({ questions, sessionId, resolvedDifficulty, adaptivePolicy: adaptivePolicy || undefined })
  } catch (error: any) {
    console.error('Generate quiz error, trying OpenAI fallback:', error?.message)
    // GPT-4o yedek model
    try {
      if (!promptStr) throw new Error('No prompt')
      const fallbackText = await generateQuizFallback(promptStr, countRef)
      const clean = fallbackText.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      const fbQuestions = parsed.questions || parsed
      if (Array.isArray(fbQuestions) && fbQuestions.length > 0) {
        console.log('[generate-quiz] OpenAI fallback success:', fbQuestions.length, 'questions')
        const fbFinal = sourcePassage
          ? fbQuestions.map((q: any) => {
              const passageWords = extractMeaningfulWords(sourcePassage)
              return questionReferencesPassage(q, sourcePassage, passageWords) ? { ...q, passage: sourcePassage } : q
            })
          : fbQuestions
        return NextResponse.json({ questions: fbFinal, sessionId: crypto.randomUUID() })
      }
    } catch (fe: any) {
      console.error('[generate-quiz] OpenAI fallback failed:', fe?.message)
    }
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

    // Legacy PATCH clients feed the same idempotent Faz 1 projection as the
    // canonical save route, so both completion paths produce identical data.
    await recordQuizLearningEvents(supabase, user.id, sessionId)

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
