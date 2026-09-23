import { after, NextRequest, NextResponse } from 'next/server'
export const maxDuration = 120
export const runtime = 'nodejs'
import Anthropic from '@anthropic-ai/sdk'
import { generateQuizFallback, callOpenAI, OpenAITruncatedError } from '@/lib/openai'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { createClient } from '@/lib/supabase/server-create-client'

function contextualAdaptiveHint(question: unknown, topic: string, fallback: string | null) {
  if (!fallback) return null
  const text = String((question as { q?: unknown })?.q || '').toLocaleLowerCase('tr-TR')
  if (/[+\-−]?[0-9]+/.test(text) || /kaç|toplam|fark|işlem|sayı/.test(text)) {
    return 'Verilen sayıları ve işlem sırasını belirle; işaretleri koruyarak işlemi adım adım yap.'
  }
  if (/hangisi|hangileri|doğru|yanlış/.test(text)) {
    return 'Önce her seçeneği sorudaki temel kuralla karşılaştır; doğru olanı eleyerek bul.'
  }
  if (/neden|amacı|görevi|işlevi/.test(text)) {
    return 'Sorunun sorduğu görevi belirle ve seçenekleri bu görevle eşleştir.'
  }
  if (topic.toLocaleLowerCase('tr-TR').includes('ingiliz')) {
    return 'Cümledeki zaman ve özne ipuçlarını bul; seçeneği bunlarla uyumlu seç.'
  }
  return 'Sorudaki ana kavramı belirle ve verilen bilgiyi onunla ilişkilendir.'
}
import { getTopicMastery, computeErrorPatterns, buildStudentHistoryContext } from '@/lib/mastery'
import { recordQuizLearningEvents } from '@/lib/learning-events'
import { findPrerequisiteGaps, buildPrerequisiteContext } from '@/lib/learning-graph'
import { misconceptionMetadataInstruction, normalizeQuestionMisconceptions } from '@/lib/misconceptions'
import { renderChartSVG, validateChartData } from '@/lib/chart-svg'
import { resolveAdaptiveLearningPolicy } from '@/lib/adaptive-learning'
import { startingDifficultyFromMastery } from '@/lib/adaptive-difficulty'
import { resolveDiagnosticQuestionStrategy } from '@/lib/diagnostic-question-strategy'
import { parsePrioritySubjects, seedScoreForSubject } from '@/lib/onboarding-priorities'
import { applyCanonicalObjectiveMappings, learningObjectivePrompt, loadCanonicalObjectiveCandidates } from '@/lib/learning-objective-mapping'
import { runMistralShadowComparison, MistralAdapter, isProviderConfigured } from '@/lib/ai-gateway'
<<<<<<< HEAD
import { balanceAnswerPositions, getQuestionBankSet, promoteQuestionsToBank, questionBankKey } from '@/lib/question-bank'
import { decideQuizProvider, getQuizProviderPolicy, QUIZ_PROVIDER_POLICY_VERSION } from '@/lib/quiz-provider-policy'
import { attachQuestionRigorMetadata, summarizeQuestionSetRigor } from '@/lib/question-rigor'
import { verifyVisualWithMistral } from '@/lib/mistral-quality'
=======
import { balanceAnswerPositions, getQuestionBankSet, hasRealVisualAsset, promoteQuestionsToBank, questionBankKey } from '@/lib/question-bank'
>>>>>>> gorsel-havuz-duzeltmesi

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

function isNewGenerationRequest(topic: string): boolean {
  return /yeni\s*nesil|beceri\s*temelli|yorum\s*gerektiren|gercek\s*yasam|gunluk\s*hayat/.test(normalizeTR(topic))
}

// 16 Eylül 2026 — öğretmen geri bildirimi: modele format seçimi tamamen
// bırakılınca (grafik/tablo/şema/... listesi) neredeyse hep en kolay yola,
// metne gömülü veri tablosuna kaçıyordu. Sonuç: örneklerde gönderilen gerçek
// sınav sorularındaki somut şekil/harita/ölçüm çizimleri yerine art arda
// "üç günlük satış tablosu" tarzı sorular. Kategoriye özgü somut bir sahne
// önerip tabloyu sayıca sınırlayarak modeli çeşitliliğe zorluyoruz.
function visualFormatGuidance(category: string | null): string {
  const guides: Record<string, string> = {
    geometry: 'somut, ölçüleri/açıları verilmiş bir geometrik şekil kurgusu (ör. iki şekli yan yana koyup çevre/alan karşılaştırması, bir kenar veya köşegen ilişkisi sorusu)',
    math_graph: 'gerçek eksenli bir koordinat sistemi grafiği (nokta/doğru/parabol) veya sayı doğrusu — satır satır sayı dizen bir tablo değil',
    map: 'basitleştirilmiş bir harita/plan üzerinde numaralandırılmış konumlar ve bu konumlar arası bir ilişkiyi (en kısa yol, mesafe, yön) soran bir kurgu',
    biology: 'etiketli bir biyolojik yapı/organ/hücre şeması',
    chemistry: 'bir atom modeli, molekül şeması veya basit deney düzeneği çizimi',
    physics: 'bir kuvvet oku, hareket diyagramı veya (farklı seviyelerde sıvı bulunan kaplar gibi) somut bir ölçüm sahnesi',
    space: 'bir gök cismi/gezegen büyüklük veya konum karşılaştırması',
    ecosystem: 'bir besin zinciri/ağı diyagramı',
    timeline: 'yatay, olayları işaretlerle gösteren bir zaman çizelgesi',
  }
  return category ? (guides[category] || guides.geometry) : 'somut bir şekil, harita veya ölçüm diyagramı'
}

function visualPedagogyInstruction(topic: string, count: number): string {
  const formatHint = visualFormatGuidance(detectVisualCategory(topic))
  if (isNewGenerationRequest(topic)) {
    const minimum = Math.max(1, Math.ceil(count * 0.5))
    const maxTables = Math.max(1, Math.floor(minimum / 3))
    return `\n\nYENİ NESİL / BECERİ TEMELLİ SORU KURALI (ZORUNLU): Kullanıcı bunu açıkça istedi. Soruları kısa işlem, tanım veya ezber sorusu olarak kurma. En az ${minimum} soru; öğrencinin verilen bir grafik, tablo, şema, koordinat sistemi, ölçüm çizimi veya gerçek yaşam veri setini yorumlayıp en az iki akıl yürütme adımıyla sonuca ulaşmasını gerektirmelidir. Soruya yalnızca uzun bir hikâye eklemek yeni nesil sayılmaz. Her görseldeki nesneler, sayılar, birimler ve etiketler soru metnindeki senaryoyla BİREBİR aynı olmalıdır; meyve sorusuna hayvan, başka denklem veya genel konu görseli koyma. Görsel soruyu tekrar etmemeli, cevabı göstermemeli ve çözüm için anlamlı veri taşımalıdır. GÖRSEL FORMAT ÖNCELİĞİ: bu görsel soruların EN FAZLA ${maxTables} tanesi metne gömülü Markdown tablo olabilir; geri kalanı ${formatHint} gibi öğrencinin GERÇEKTEN GÖRDÜĞÜ somut bir sahne olmalı, sadece sayıların satır satır dizildiği bir veri tablosu değil. Aynı görsel fikri (ör. aynı "üç günlük satış" kurgusu) birden fazla soruda tekrar etme — her görsel soru farklı bir sahne/senaryo kullanmalı. Geçerli Markdown tablo kullanılıyorsa başlık, ayraç ve her veri satırı ayrı \\n satırında olmalı, hiçbir hücre boş bırakılmamalı (bilinmeyen değer için "?" yaz, hücreyi atlama). Bu koşulları karşılamayan soruyu çıktı listesine alma.`
  }
  return `\n\nGÖRSEL SORU ÇEŞİTLİLİĞİ: Konu uygunsa soruların yaklaşık %30'unu grafik, tablo, şekil, koordinat sistemi, deney düzeneği, harita veya zaman çizelgesi üzerinden yorumlama gerektirecek biçimde kur. Gerekli bütün veri ve etiketler sorunun içinde bulunmalı; görünmeyen bir görsele "yukarıdaki" diye atıf yapma. GÖRSEL FORMAT ÖNCELİĞİ: bu görsel sorulardan en fazla 1 tanesi metne gömülü Markdown tablo olsun; diğerleri ${formatHint} gibi somut bir sahne olmalı. Metin içinde tablo gerekiyorsa her satırı \\n ile ayıran geçerli Markdown tablo biçimi kullan, tablo ayraçlarını ve satırları tek satırda birbirine yapıştırma, hiçbir hücreyi boş bırakma (bilinmeyen değer için "?" yaz).`
}

// 21 Eylül 2026 — Deniz'in isteğiyle: "grafik oluşturmada eksiğiz" sorununa
// cevap. math_graph kategorisinde artık modelden SVG XML YAZDIRMIYORUZ
// (bkz. lib/chart-svg.ts açıklaması) — bunun yerine küçük, kesin bir
// "chartData" JSON nesnesi istiyoruz, bir çizim motoru bunu HER ZAMAN doğru
// ve tutarlı şekilde çiziyor. chartData göndermezse ya da bozuk gönderirse
// üretim sonrasında yalnızca veri nesnesi bir kez onarılır; math_graph için
// serbest AI-SVG yoluna geri dönülmez. Böylece yanlış eksen/değer uyduran
// görseller sırf görsel kotasını doldurmak için öğrenciye gösterilemez.
function chartDataInstruction(category: string | null): string {
  if (category !== 'math_graph') return ''
  return `\n\nGRAFİK VERİSİ (chartData) KURALI: Bu konu koordinat/sayı doğrusu/istatistik grafiği kategorisinde. Görsel gerektirdiğini belirttiğin HER soruya, sorunun içeriğiyle BİREBİR uyumlu bir "chartData" alanı ekle — bu veri bir çizim motoru tarafından OTOMATİK çizilecek, SEN SVG/ÇİZİM ÜRETMEYECEKSİN, sadece veriyi ver. chartData eklemediğin sorularda görsel üretilmeyecek. Tam olarak şu 5 tipten birini kullan, başka alan/tip EKLEME:

1. Sayı doğrusu: {"type":"numberline","min":-10,"max":10,"points":[{"value":-3,"label":"A"},{"value":5,"label":"B"}]}
2. Koordinat sistemi (nokta/doğru/parabol): {"type":"coordinate","xMin":-5,"xMax":5,"yMin":-5,"yMax":5,"points":[{"x":2,"y":3,"label":"A"}],"lines":[{"points":[{"x":-5,"y":-5},{"x":5,"y":5}],"label":"y=x"}]}
3. Çubuk grafik: {"type":"bar","categories":["Pzt","Sal","Çar"],"series":[{"label":"Satış","values":[12,18,9]}],"unit":"adet"}
4. Çizgi grafik: {"type":"line","categories":["2021","2022","2023"],"series":[{"label":"Nüfus","values":[100,120,135]}],"unit":"bin kişi"}
5. Pasta grafik: {"type":"pie","segments":[{"label":"Elma","value":40},{"label":"Armut","value":60}]}

KRİTİK KURALLAR: (a) chartData içindeki TÜM sayı ve etiket, sorunun "q" metninde geçen değerlerle BİREBİR aynı olmalı — uydurma veri ekleme. (b) Cevabı ifşa eden bir nokta/çubuk/segment EKLEME — sadece sorunun VERDİĞİ bilgiyi göster, sorunun SORDUĞU/bilinmeyen değeri göstermeye çalışma. (c) categories/series uzunlukları birbirini tutmalı (her seri, her kategori için bir değer). (d) Sayısal olmayan, tahmini veya soruda geçmeyen bir değer YAZMA.`
}

function visualQuestionCandidate(question: any, category: string | null): boolean {
  if (!question || question.type === 'true_false' || question.type === 'short_answer' || question.type === 'multi_true_false') return false
  const text = normalizeTR(String(question.q || ''))
  const explicitVisual = /sekil|grafik|tablo|diyagram|koordinat|venn|sema|harita|zaman cizelgesi|veri/.test(text)
  const shape = /kare|dikdortgen|ucgen|daire|cember|cokgen|prizma|kup|silindir|koni|kure|paralelkenar/.test(text)
  const mathVisual = category === 'math_graph' && /denklem|fonksiyon|oran|yuzde|olasilik|istatistik|degisim|iliski|dogru|parabol/.test(text)
  return explicitVisual || shape || mathVisual
}

function rigorInstruction(difficulty: string, count: number, topic: string): string {
  const level = normalizeTR(difficulty)
  const hard = /zor|hard|ileri|advanced/.test(level)
  const easy = /kolay|easy|temel|basic/.test(level)
  const applicationCount = Math.max(1, Math.ceil(count * (hard ? 0.9 : easy ? 0.6 : 0.8)))
  const inferenceCount = Math.max(1, Math.ceil(count * (hard ? 0.7 : easy ? 0.3 : 0.5)))
  const directLimit = easy ? Math.max(1, Math.floor(count * 0.2)) : 0
  const hardMixCount = hard ? Math.ceil(count * 0.7) : easy ? 0 : Math.ceil(count * 0.3)
  const mixRule = hard
    ? `Soruların en az ${hardMixCount} tanesi zor/çok zor düzeyde, kalanları normal düzeyde olsun; kolay soru üretme.`
    : easy
      ? 'Kolay düzey, ezber demek değildir: temel kazanımı yeni bir bağlamda uygulat; en az üç soru normal düzeye yaklaşsın.'
      : `Soruların en az ${hardMixCount} tanesi zor düzeyde olsun; en fazla ${Math.max(1, Math.floor(count * 0.2))} kolay soru bulunabilir.`
  return `\n\nÖLÇME KALİTESİ VE ZORLUK KURALI (ZORUNLU): "${topic}" için ${count} soru üretirken sadece tanım ezberini veya tek adımlı işlemi ölçme. En az ${applicationCount} soru bilgiyi yeni bir bağlama/senaryoya uygulamayı, verilenleri ayıklamayı veya en az iki akıl yürütme adımını gerektirsin. En az ${inferenceCount} soru ilişki kurma, hata bulma, karşılaştırma, yanlış çözümü analiz etme ya da sonuç çıkarma ölçsün. ${mixRule} Doğrudan tanım/ezber veya tek işlemle çözülen soru sayısı en fazla ${directLimit} olabilir. Her soruya "difficulty" (kolay|normal|zor|cok zor), "cognitiveLevel" (uygulama|muhakeme) ve gerçek çözüm adımı sayısını gösteren "reasoningSteps" alanlarını ekle. Zorluk uzun ve karışık cümlelerden değil, kazanımın gerçekten kullanılmasından gelmeli. Her çoktan seçmeli soruda üç çeldirici öğrencinin yapabileceği farklı ve gerçek işlem, kavram veya yorum hatasına dayansın; komik, alakasız ya da ilk bakışta elenen seçenekler kullanma. Aynı hesap yöntemi, senaryo veya soru kalıbını tekrarlama. Sınıf seviyesinin dışına çıkma ve soruyu çözülemez hâle getirme. Açıklamada doğru sonuca giden mantığı en az iki açık adımla göster.`
}

function canonicalQuestionDifficulty(value: unknown, fallback: string): string {
  const normalized = normalizeTR(String(value || '')).replace(/çok/g, 'cok')
  return ['kolay', 'normal', 'zor', 'cok zor'].includes(normalized) ? normalized : fallback
}

function visualQuestionIndexes(questions: any[], category: string | null, requestedCount: number, forceVisuals: boolean): number[] {
  if (!category || requestedCount <= 0) return []
  // 21 Eylül 2026 — kapsamı artırma: math_graph artık çoğunlukla deterministik
  // chart-svg.ts ile (AI çağrısı YOK, maliyet/gecikme/kesilme riski yok)
  // çiziliyor, bu yüzden eski AI-SVG kategorileri için konan temkinli min(3,...)
  // sınırı math_graph'ta gereksiz — daha yüksek bir tavanla (6) kapsam artıyor.
  // Diğer kategoriler (hâlâ her görsel için gerçek bir AI çağrısı gerektiriyor)
  // eski, temkinli sınırda kalıyor.
  const cap = category === 'math_graph' ? 6 : 3
  const ratio = category === 'math_graph' ? 0.5 : 0.3
  const target = forceVisuals
    ? Math.max(1, Math.ceil(requestedCount * 0.5))
    : Math.min(cap, Math.max(1, Math.ceil(requestedCount * ratio)))
  const preferred = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => visualQuestionCandidate(question, category))
    .map(({ index }) => index)
  const fallback = questions.map((_: any, index: number) => index).filter(index => !preferred.includes(index))
  return [...preferred, ...fallback].slice(0, Math.min(target, questions.length))
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
- Every object, number, unit, label and relationship MUST come from this exact QUESTION. Never substitute another scenario, equation, person, animal, product or dataset.
- Exact semantic identity is mandatory: an animal question must not show shopping/fruit, and an equation question must not show a different equation.

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

type VisualContextQuality = { passed: boolean; score: number; reason: string }

async function repairChartDataForQuestion(q: any, topic: string, grade: string): Promise<any | null> {
  try {
    const raw = await callOpenAI([
      {
        role: 'system',
        content: 'You convert an exact Turkish K-12 question into strict chart data. Return only valid JSON. Never invent a value or reveal the answer.',
      },
      {
        role: 'user',
        content: `QUESTION: ${String(q.q || '')}\nOPTIONS: ${JSON.stringify(q.opts || [])}\nTOPIC: ${topic}\nGRADE: ${grade}\n\nReturn {"chartData":...} using exactly one supported shape below, but ONLY when the question can be meaningfully solved/interpreted with that chart. Every value and label must already be explicitly given in the question. Do not plot the unknown or correct answer. If no faithful chart can be made, return {"chartData":null}.\n\nSupported shapes:\n1) {"type":"numberline","min":-10,"max":10,"points":[{"value":-3,"label":"A"}]}\n2) {"type":"coordinate","xMin":-5,"xMax":5,"yMin":-5,"yMax":5,"points":[{"x":2,"y":3,"label":"A"}],"lines":[{"points":[{"x":-5,"y":-5},{"x":5,"y":5}],"label":"y=x"}]}\n3) {"type":"bar","categories":["Pzt","Sal"],"series":[{"label":"Satış","values":[12,18]}],"unit":"adet"}\n4) {"type":"line","categories":["2021","2022"],"series":[{"label":"Nüfus","values":[100,120]}],"unit":"bin kişi"}\n5) {"type":"pie","segments":[{"label":"Elma","value":40},{"label":"Armut","value":60}]}`,
      },
    ], {
      model: process.env.OPENAI_CHART_DATA_MODEL || process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4.1-mini',
      max_tokens: 550,
      temperature: 0,
      operation: 'visual-question:repair-chart-data',
      timeoutMs: 15000,
      json: true,
    })
    const parsed = JSON.parse(raw) as { chartData?: unknown }
    return validateChartData(parsed.chartData) ? parsed.chartData : null
  } catch (error) {
    console.warn('[generate-visual] chartData repair failed:', error)
    return null
  }
}

async function visualMatchesQuestion(questionText: string, svg: string, correctAnswer: string): Promise<VisualContextQuality> {
  try {
    // Genel konu benzerliği yeterli değildir: bağlam, soru ve SVG'nin
    // nesne/sayı/birim/etiket ilişkisi 100 üzerinden ayrı denetlenir.
    const [raw, mistralReview] = await Promise.all([
      callOpenAI([
      { role: 'system', content: 'You are a strict K-12 visual-question QA gate. Return only valid JSON.' },
      { role: 'user', content: `Score the SVG against the exact question. Check scenario/context, every object, quantity, unit, label and relationship. Verify graph/axis values mathematically. A generic topic match is NOT enough. The SVG must not reveal the answer and must add useful information instead of merely repeating the question. Return exactly {"score":0-100,"contextMatch":boolean,"answerLeak":boolean,"useful":boolean,"reason":"short Turkish reason"}.\n\nQUESTION:\n${questionText}\n\nCORRECT ANSWER (must not be shown):\n${correctAnswer}\n\nSVG:\n${svg.slice(0, 9000)}` },
    ], {
      model: process.env.OPENAI_VISUAL_VALIDATOR_MODEL || process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4.1-mini',
      max_tokens: 120,
      temperature: 0,
      operation: 'visual-question:validate',
      timeoutMs: 15000,
      json: true,
      }),
      verifyVisualWithMistral({ questionText, correctAnswer, svg }),
    ])
    const result = JSON.parse(raw) as { score?: unknown; contextMatch?: unknown; answerLeak?: unknown; useful?: unknown; reason?: unknown }
    const score = Number(result.score)
    const reason = typeof result.reason === 'string' ? result.reason.slice(0, 240) : 'Görsel bağlamı doğrulanamadı.'
    const openAIPassed = Number.isFinite(score) && score >= 90 && result.contextMatch === true && result.answerLeak !== true && result.useful !== false
    const passed = openAIPassed && (mistralReview?.passed ?? true)
    const combinedScore = mistralReview ? Math.min(Number.isFinite(score) ? score : 0, mistralReview.score) : (Number.isFinite(score) ? score : 0)
    const combinedReason = mistralReview
      ? `OpenAI: ${reason} | Mistral: ${mistralReview.reason}`.slice(0, 480)
      : reason
    if (!passed) console.warn(`[visual-validation] rejected SVG openai=${score} mistral=${mistralReview?.score ?? 'unavailable'}: ${combinedReason}`)
    return { passed, score: combinedScore, reason: combinedReason }
  } catch (error) {
    console.error('[visual-validation] error:', error)
    return { passed: false, score: 0, reason: 'Görsel kalite denetimi tamamlanamadı.' }
  }
}

// ─── GÖRSEL ÜRETİMİ ──────────────────────────────────────────────────────────
// 16 Eylül 2026 — sabit 800 token TÜM kategoriler için yeterli değildi: harita,
// zaman çizelgesi ve ekosistem gibi çok elemanlı diyagramlar bu bütçeye çoğu
// zaman sığmıyor, SVG kapanış etiketine ulaşamadan kesiliyordu (kapanmamış
// <svg>, regex eşleşmiyor, görsel sessizce kayboluyordu — ChatGPT'nin ilk
// tanısı buydu). Kategoriye göre farklılaştırıp basit şekiller için hız/maliyet
// kazanırken karmaşık diyagramlara daha baştan yeterli pay veriyoruz.
// 16 Eylül 2026 — production loglarında geometri (700) ve math_graph (950)
// kategorilerinin İLK denemesi neredeyse HER SEFERİNDE (geometri 3/3,
// math_graph 5/5) taban bütçede kesiliyordu, her seferinde ikinci bir OpenAI
// çağrısına (ekstra gecikme + maliyet) mecbur bırakıyordu; math_graph'ta
// hatta 2x retry (1900) bile bazen yetmiyordu. Aynı deseni diğer
// kategorilerde de bekleyip hepsini toptan yükselttik — amaç retry'ın
// istisna kalması, kural olmaması. Ölçü etiketi/veri noktası sayısı daha
// yüksek olan kategoriler (harita, zaman çizelgesi, ekosistem, biyoloji)
// orantılı olarak daha fazla pay alıyor.
const SVG_MAX_TOKENS: Record<string, number> = {
  geometry: 1150,
  math_graph: 1500,
  map: 1700,
  biology: 1400,
  chemistry: 1200,
  physics: 1200,
  space: 1000,
  ecosystem: 1500,
  timeline: 1500,
}
const SVG_MAX_TOKENS_DEFAULT = 1300
// Taban zaten yükseldiği için 2x retry çoğu kategoride tavana (2200) çarpıp
// gerçek faydayı kaybediyordu (ör. math_graph 1500*2=3000 → 2200'e
// kırpılırdı, oysa 1900'de bile kesilme görüldü). 2800'e çıkarıldı.
const SVG_MAX_TOKENS_CEILING = 2800

async function generateVisualForQuestion(
  q: any,
  category: string,
  topic: string,
  grade: string
): Promise<{ svg: string; contextQuality: VisualContextQuality } | null> {
  try {
    // Soru tipine göre SVG uygunluk kontrolü
    // true_false ve short_answer sorularında SVG üretme
    if (q.type === 'true_false' || q.type === 'short_answer' || q.type === 'multi_true_false') {
      return null
    }
    // Doğru cevabı iki bağımsız görsel denetçiye veririz; ikisi de cevabın
    // görselde açıkça görünmediğini kontrol eder.
    const correctAnswer = q.opts?.[q.ans] || q.blank || q.correctOrder || ''
    // 21 Eylül 2026 — DETERMİNİSTİK GRAFİK YOLU (bkz. lib/chart-svg.ts).
    // Ana üretim chartData'yı atladıysa veriyi bir kez yapılandırılmış JSON
    // olarak onarırız. Onarım da mümkün değilse görseli atlarız; math_graph
    // kategorisinde serbest SVG'ye düşmek yasaktır.
    if (category === 'math_graph') {
      let chartData = validateChartData(q.chartData) ? q.chartData : null
      if (!chartData && !q.__chartDataRepairAttempted) {
        Object.defineProperty(q, '__chartDataRepairAttempted', { value: true, writable: true, enumerable: false })
        chartData = await repairChartDataForQuestion(q, topic, grade)
        if (chartData) q.chartData = chartData
      }
      if (!chartData) {
        console.warn('[generate-visual] math_graph question has no faithful chartData; free-form SVG fallback disabled')
        return null
      }
      const svg = renderChartSVG(chartData)
      if (svg) {
        const contextQuality = await visualMatchesQuestion(q.q, svg, String(correctAnswer))
        if (contextQuality.passed) return { svg, contextQuality }
        console.warn('[generate-visual] deterministic chart rejected by visual validators')
        return null
      }
      return null
    }
    // Soru metni şekil/görsel gerektiriyor mu kontrol et
    const qText = (q.q || '').toLowerCase()
    const needsVisual = /şekil|grafik|tablo|diyagram|geometr|koordinat|venn|kesir|şema|harita|ok.*diyagram|ağaç/.test(qText)
    const hasShape = /kare|dikdörtgen|üçgen|daire|çember|çokgen|prizma|küp|silindir|koni|küre|paralelkenar|eşkenar|ikizkenar/.test(qText)
    // Sadece görsel gerektiren sorularda SVG üret
    if (category !== 'math_graph' && !needsVisual && !hasShape) {
      return null
    }
    const prompt = buildSVGPrompt(category, topic, q.q, grade, String(correctAnswer))
    // Soruya özgü eğitim görsellerinin üretimi OpenAI'ye taşındı. SVG, grafik,
    // tablo ve denklem gibi ölçülebilir içeriklerde raster görsele göre sayısal
    // doğruluğu ve erişilebilirliği korur.
    const messages = [
      { role: 'system', content: 'You create precise, safe educational SVG diagrams. Follow the user constraints exactly. Return only SVG.' },
      { role: 'user', content: prompt },
    ]
    const model = process.env.OPENAI_VISUAL_MODEL || process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4.1-mini'
    const baseMaxTokens = SVG_MAX_TOKENS[category] ?? SVG_MAX_TOKENS_DEFAULT
    let text: string
    try {
      // requireComplete: true → finish_reason='length' olursa (yanıt tam
      // kesilmişse) OpenAITruncatedError fırlatılır; aşağıda bunu "model kötü
      // cevap verdi"den ayırıp daha yüksek bütçeyle TEK SEFER yeniden deneriz.
      text = await callOpenAI(messages, {
        model,
        max_tokens: baseMaxTokens,
        temperature: 0.15,
        operation: 'visual-question:generate',
        requireComplete: true,
        timeoutMs: 20000,
      })
    } catch (e) {
      if (!(e instanceof OpenAITruncatedError)) throw e
      const retryMaxTokens = Math.min(SVG_MAX_TOKENS_CEILING, baseMaxTokens * 2)
      console.warn(`[generate-visual] truncated at ${baseMaxTokens} tokens (category=${category}), retrying with ${retryMaxTokens}`)
      try {
        text = await callOpenAI(messages, {
          model,
          max_tokens: retryMaxTokens,
          temperature: 0.15,
          operation: 'visual-question:generate-retry-truncated',
          requireComplete: true,
          timeoutMs: 25000,
        })
      } catch (e2) {
        // Yeniden deneme bile kesiliyorsa bu ARTIK beklenmedik bir hata
        // değil, sadece "bu diyagram bu bütçeye de sığmadı" durumu — dış
        // catch'e düşüp genel "[generate-visual] error" olarak loglanması
        // (log'da sanki yakalanmamış bir hata varmış izlenimi veriyordu)
        // yerine burada ayrı, açıklayıcı bir uyarıyla vazgeçiyoruz.
        if (e2 instanceof OpenAITruncatedError) {
          console.warn(`[generate-visual] still truncated after retry at ${retryMaxTokens} tokens (category=${category}), giving up on this visual`)
          return null
        }
        throw e2
      }
    }
    // SVG'yi temizle — sadece <svg...></svg> al
    const match = text.match(/<svg[\s\S]*<\/svg>/i)
    if (match) {
      const contextQuality = await visualMatchesQuestion(q.q, match[0], String(correctAnswer))
      if (contextQuality.passed) return { svg: match[0], contextQuality }
    }
    if (match) console.warn('[generate-visual] rejected unrelated, low-context, or answer-revealing SVG')
    return null
  } catch (e) {
    console.error('[generate-visual] error:', e)
    return null
  }
}

function buildPrompt(type: string, topic: string, grade: string, difficulty: string, language: string, count: number, fileContent?: string, gradeCtx?: string, mebCtx?: string, department?: string, subject?: string): string {
  const rigor = rigorInstruction(difficulty, count, topic)
  const contentNote = rigor + (fileContent
    ? `\n\nTopic: "${topic}". Generate questions from this content:\n${fileContent.slice(0, 3000)}`
    : `\n\nTopic: "${topic}".`)

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

  // 4 Eylül 2026 — Deniz'in talebiyle: MEB kaynağı yüklendiğinde ARTIK
  // sorunun TAMAMI o pasaja bağlı kalmıyor. Kaynağa aşırı sadakat, önceki
  // oturumlarda tekrarlayan "aynı 2-3 cümleden 8-10 soru" sorununun kök
  // nedeniydi (bkz. "soru derinliği kuralı" ve "konu merkezlilik kuralı" —
  // o düzeltmeler semptomu hafifletti ama kaynağı sabit tuttu). Artık ORAN
  // kendisi değişiyor: sorunun ~%30'u doğrudan kaynağa (gerçek kişi/olay/
  // örnek/veri), ~%70'i ise AI'ın konu hakkındaki GENEL MEB müfredatı
  // bilgisine dayanıyor — kaynaktaki belirli bir cümleye bağlı kalmadan,
  // ama yine de konunun/sınıf seviyesinin dışına ÇIKMADAN. En az 1 soru her
  // zaman kaynağa dayalı kalır (kaynağın hiç kullanılmaması riskini önlemek
  // için).
  const sourceBasedCount = Math.max(1, Math.round(count * 0.3))
  const aiGeneralCount = Math.max(0, count - sourceBasedCount)

  const mebSection = mebCtx
    ? `\n\n⚠️ KAYNAK KULLANIM ORANI (KRİTİK, GÜNCEL KURAL): Aşağıda bir MEB kaynak metni verilmiştir, ama üreteceğin ${count} sorunun TAMAMININ bu metne bağlı kalması ARTIK istenmiyor. Bunun yerine: yaklaşık ${sourceBasedCount} soru (yaklaşık %30) doğrudan bu kaynak metne dayanmalı — bu sorular için metindeki gerçek kişi, olay, örnek, veri ve kavramlara SADIK KAL, metinde olmayanı UYDURMA. Kalan yaklaşık ${aiGeneralCount} soru (yaklaşık %70) ise bu kaynak metne BAĞLI KALMADAN üretilmeli — konunun ("${topic}", ${grade} seviyesi) kendi genel MEB müfredatı bilgine dayanarak, kaynaktaki belirli bir cümle/örneğe atıfta bulunmadan, konunun farklı yönlerini/örneklerini/senaryolarını kapsayan sorular kur. ÖNEMLİ SINIR: bu %70\'lik grup "serbest" veya "kaynak dışı her şey olur" demek DEĞİLDİR — hâlâ MEB müfredatına, "${topic}" konusunun kapsamına ve ${grade} seviyesine SIKI SIKIYA bağlı kalmalı, sadece TEK BİR pasaja değil. Hangi sorunun hangi gruba ait olduğunu ayrı ayrı belirtmene gerek yok, çıktı formatı aynı kalıyor — sadece iki grubun ORANINA (~%30 kaynağa dayalı / ~%70 genel bilgiye dayalı) sadık kal. AYRICA (KRİTİK, teknik gereklilik): her sorunun JSON çıktısına ek bir alan ekle -- "sourceBased": true (bu soru gerçekten kaynak metne dayanıyorsa, öğrenci kaynağı okuyarak cevaplayabiliyorsa) veya "sourceBased": false (bu soru genel MEB bilgisine dayanıyorsa, kaynak metne bakmadan da cevaplanabiliyorsa). Bu alanı HER SORUDA eksiksiz doldur -- sistem bu alana göre öğrenciye kaynak metni gösterip göstermeyeceğine karar veriyor, yanlış/eksik işaretlersen öğrenci ya gereksiz bir kaynak metni görür ya da ihtiyaç duyduğu kaynağı göremez.\n\n📚 SORU DERİNLİĞİ KURALI (ÖNEMLİ): Soruların (her iki grup için de) SADECE bir cümleyi başka kelimelerle yeniden sorma ("okuduğunu anlama"/paraphrase) tuzağına düşmemeli — böyle bir soru öğrencinin cümleyi ezberden tanıyıp tanımadığını ölçer, konuyu GERÇEKTEN anlayıp anlamadığını ölçmez. Bunun yerine metindeki OLGUYU/ÖRNEĞİ/KAVRAMI bir ZEMİN olarak kullan ve öğrenciyi düşünmeye zorlayan, öğrenme-temelli sorular kur: bir SONUÇ çıkarmasını, yaygın bir YANLIŞ-KAVRAYIŞI düzeltmesini/ayırt etmesini, iki kavram arasında İLİŞKİ kurmasını, ya da metindeki örneği/ilkeyi BENZER YENİ bir duruma/senaryoya uygulamasını iste (örnek kalıp: "Bir öğrenci ... diye düşünüyor/soruyor — bu düşüncedeki [eksiklik/hata] nedir?" gibi). Kaynağa-dayalı ${sourceBasedCount} soru arasında en fazla 1-2 tanesi metindeki BİRE BİR aynı cümleyi/pasajı hedefleyebilir; geri kalanlar metnin FARKLI kavram/örneklerinden veya metindeki bir ilkenin genel uygulamasından türetilmeli. Kaynağa-dayalı sorular için UYDURMA yasağı geçerli: dayandığı bilgi/olgu MUTLAKA metinde (ya da metnin doğrudan işaret ettiği kavramda) karşılığı olmalı. Genel-bilgiye-dayalı ${aiGeneralCount} soru için ise UYDURMA yasağı MEB müfredatı doğruluğu anlamında geçerli: yanlış/uydurma bir bilgi/tarih/rakam kullanma, sadece kaynağa birebir bağlı kalma zorunluluğu yok.\n\n🎯 KONU MERKEZLİLİK KURALI (ÖNEMLİ): Kaynak metin genellikle asıl konudan (topic) daha GENİŞ bir anlatı/kıssa/örnek içerir (ör. bir öğretici hikâye, bir gözlem listesi) ve bu geniş metnin İÇİNDE konuyla doğrudan ilgisiz yan-temalar da geçebilir (ör. estetik/çeşitlilik güzelliği, doğaya-saygı/dayanışma ahlakı, ya da metnin sadece dil-bilgisel bir kelimesi gibi konudan bağımsız ayrıntılar). Metne sadık kalma kuralı, metindeki HER cümleden soru üretmen gerektiği anlamına GELMEZ — sadece konunun ("${topic}") kendi çekirdek kavramına (ör. bir itikat/inanç konusuysa Allah'ın varlığı/birliği/sıfatları gibi doğrudan o kazanıma ait fikirler) hizmet eden cümle/örnekleri seç. Bir cümle ilginç veya metinde varsa bile, sorduğu şey asıl konudan çok metnin yan bir detayına (ör. "çiçekler neden renklidir" gibi estetik bir gözlem, ya da "insan hangi özelliğiyle ayrılır" gibi konudan bağımsız genel bir tanım) odaklanıyorsa o cümleyi ATLA, konunun çekirdeğine daha yakın başka bir cümle/örnek seç. Her sorunun cevabını doğrulamak isteyen bir öğretmenin "bu soru gerçekten '${topic}' konusunu mu ölçüyor?" diye sorduğunda açıkça "evet" diyebileceği sorular üret.\n\n🚫 ÖNEMLİ İSTİSNA 1: Eğer bu metin bir MÜFREDAT KAZANIM KODU LİSTESİYSE (örn. \"SB.6.4.1. ... a) ... b) ...\" formatında, öğretmene yönelik öğrenme çıktısı tanımları içeriyorsa) — ASLA \"hangi kazanımın hangi alt maddesi X der\" gibi kod/madde numarasına dayalı sorular ÜRETME. Bunun yerine, o kazanımın işaret ettiği GERÇEK KONUYU (örn. \"vatandaşlık haklarının kullanımında dijitalleşme etkileri\" kazanımından yola çıkarak, dijital vatandaşlık kavramının kendisi hakkında) öğrenciye anlamlı bir içerik sorusu sor. Öğrenci kazanım kodlarını asla görmemeli ve bunlar hakkında sorgulanmamalı. KRİTİK SINIR: kazanım metni kısa/yetersiz olsa bile, ASLA kendi genel bilgine dayanarak BAŞKA, İSİMLENDİRİLMİŞ bir tarihi metne/esere/konuşmaya (ör. Gençliğe Hitabesi, İstiklal Marşı, Nutuk, belirli bir yazarın belirli bir eseri) atlama ve o metinden alıntı/soru üretme — BU METİNLER SANA VERİLMEDİYSE ONLAR HAKKINDA SORU ÜRETMEK KESİNLİKLE YASAK, kazanımla ne kadar tematik olarak yakın görünürse görünsün. Bunun yerine SADECE kazanımın kendi tanımladığı KAVRAM/BECERİ üzerinden, somut ama İSİMSİZ bir senaryo/örnek kurgula (ör. \"Bir yerleşim biriminde alınan bir kararı etkileyen unsurları düşünelim...\" gibi, gerçek bir kişi/eser/tarihi olaya atıfta bulunmayan, kendi kurguladığın bir örnek). SOMUT ÖRNEK — YANLIŞ: kazanım \"toplumsal düzenin sürdürülmesinde temel hak ve sorumlulukların önemi\" iken \"Gençliğe Hitabesi'nde Atatürk'ün ... ifadesi hangi tutumu hedeflemiştir?\" gibi bir soru üretmek (kazanımla ilgisi olmayan, sana verilmeyen bir kaynağa kaçış). DOĞRU: aynı kazanım için \"Bir toplumda bireylerin hem haklarını kullanıp hem sorumluluklarını yerine getirmesi, toplumsal düzenin sürdürülmesi açısından neden önemlidir?\" gibi kazanımın kendi kavramına sadık, kurgusal bir soru.\n\n🚫 ÖNEMLİ İSTİSNA 2: Bu metin gerçek bir sınav kitapçığı/soru bankası çıktısı olabilir ve bu tür kaynaklarda "Soru 39'da verilen örneğe göre...", "38 ve 39. soruları aşağıdaki bilgiye göre cevaplayınız" gibi BAŞKA numaralı bir soruya/örneğe atıfta bulunan, çok parçalı bir soru zincirinin sadece bir kısmı yer alabilir. Metinde böyle bir referans görürsen o referansı asla olduğu gibi kopyalama — ya atıf yaptığı bilgiyi/örneği (metinde başka bir yerde varsa) bulup doğrudan senin ürettiğin sorunun metnine dahil et, ya da metindeki tamamen bağımsız (başka soruya atıf yapmayan) başka bir örnek/kavram kullan. Öğrenci SADECE senin ürettiğin tek soruyu görecek; "yukarıda", "az önce", "Soru X'te" dediğin hiçbir şey öğrenciye ayrıca gösterilmeyecek.\n\n🚫 ÖNEMLİ İSTİSNA 3: Kaynak metinde İSTATİSTİK, ANKET SONUCU, TABLO veya SAYISAL VERİ (ör. "kişiler günde ortalama 6 saat TV izliyor, 1 dakika kitap okuyor" gibi) varsa ve bu veriye dayalı bir soru üretmek istiyorsan, "metinde verilen istatistiklere göre" gibi bir ifadeyle veriye SADECE ATIFTA BULUNMA — o veriyi/sayıları/istatistikleri DOĞRUDAN sorunun kendi metnine TAŞI. Öğrenci o istatistiği görmeden soruyu cevaplayamaz. SOMUT ÖRNEK — YANLIŞ: "Metinde verilen istatistiklere göre, Türkiye'de bir kişi günde kitap okumaya ayrılan zaman ile TV izlemeye ayrılan zaman arasında kaç saat fark vardır?" (sayılar hiç verilmemiş, cevaplanamaz). DOĞRU: "Yapılan bir araştırmaya göre Türkiye'de bir kişi günde ortalama 6 saat televizyon izlerken, kitap okumaya sadece 1 dakika ayırmaktadır. Bu bilgiye göre, TV izlemeye ayrılan süre kitap okumaya ayrılan süreden kaç saat fazladır?" (gerekli sayılar sorunun içinde). Aynı kural, metinde geçen alıntılanmış CÜMLELER/CEVAPLAR için de geçerlidir — "metinde sıralanan cevaplara göre" demek yerine, o cevapları/alıntıları KISACA sorunun içine al.

MEB KAYNAK METNİ:\n${mebCtx}\n\n`
    : ''

  // Üniversite: MEB'in aksine tek bir resmi müfredat yok (her üniversite/
  // hoca kendi ders içeriğini belirler) — bu yüzden "SADECE MEB müfredatı"
  // kısıtı burada UYGULANMAZ. Bunun yerine bölüm bağlamı (varsa) verilir ve
  // AI kendi genel akademik bilgisiyle üretim yapar.
  const base = isUniversity
    ? `Sen üniversite düzeyinde soru üreten bir eğitim asistanısın. Bu öğrenci${department ? ` "${department}" bölümünde okuyor` : ' bir üniversite öğrencisi'}. MEB K-12 müfredatı kısıtı BURADA GEÇERLİ DEĞİL — kendi genel akademik bilgine dayanarak üniversite seviyesinde${department ? `, ${department} bölümüne uygun` : ''} sorular üret.\n\n${contentNote}${gradeCtx || ''}\n${subjectLine}\nSınıf: ${grade}${department ? ` (${department})` : ''}. Zorluk: ${difficulty}. Soru dili: ${language}. Soru sayısı: ${count}.${languageCourseNote}\n\nDOĞRULUK KURALLARI:\n1. Sayısal/hesaplama gerektiren sorularda: Her soruyu adım adım çöz, cevabın opts dizisinde doğru indexte olduğunu doğrula\n2. Sadece kesin bildiğin, akademik olarak doğru bilgileri yaz\n3. "ans" indexi MUTLAKA doğru cevabı göstermeli\n4. Emin olmadığın sorular yerine daha basit ama kesin sorular yaz\n5. Sadece multiple_choice ve true_false sorularında altı çizili/vurgulu metin için [köşeli parantez] kullan. fill_blank sorularında ASLA kullanma.\n6. HER SORU TAMAMEN KENDİ İÇİNDE EKSİKSİZ VE ÇÖZÜLEBİLİR OLMALI — öğrenci başka bir soruya/örneğe/tabloya atıfta bulunan bir soru görmemeli.\n7. Herhangi bir kaynak metin/kitap kullanıyorsan, KAYNAĞIN KENDİSİ (yazarı, ISBN'i, künye bilgisi vb.) hakkında ASLA soru üretme — öğrenci kaynağı hiç görmedi, sadece senin sorunu görecek. "Verilen metne göre", "metinde anlatılan X örneğinde" gibi bir ifade kullanıyorsan, o metnin/örneğin/olayın ÖZETİNİ (2-3 cümle) MUTLAKA sorunun kendi "q" alanının İÇİNE/BAŞINA yaz — öğrenci metni görmeden bu ifadeyi kullanan bir soru ASLA üretme, bu cevaplanamayan bir soru üretmek demektir.\n8. Kullandığın dil ve kelime seçimi bile öğrencinin SEVİYESİNE uygun kalmalı, gereksiz yere akademik/soyut kelimeler kullanma.\n\nYalnızca geçerli JSON döndür, markdown veya açıklama ekleme.\n\n`
    : `Sen Türkiye Milli Eğitim Bakanlığı (MEB) müfredatına göre soru üreten bir eğitim asistanısın.\n\nKESİN KURAL: Yalnızca MEB müfredatında yer alan konularda, MEB kazanımlarına uygun sorular üret. Müfredat dışı, spekülatif veya tartışmalı içerik kesinlikle üretme.\n\n${mebSection}${contentNote}${gradeCtx || ''}\n${subjectLine}\nSeviye: ${grade}. Zorluk: ${difficulty}. Soru dili: ${language}. Soru sayısı: ${count}.${languageCourseNote}\n\nDOĞRULUK KURALLARI:\n1. Matematik: Her soruyu adım adım çöz, cevabın opts dizisinde doğru indexte olduğunu doğrula\n2. Fen/Tarih: Sadece kesin bildiğin gerçekleri yaz\n3. "ans" indexi MUTLAKA doğru cevabı göstermeli\n4. Emin olmadığın sorular yerine daha basit ama kesin sorular yaz\n5. MEB müfredatına uygun kazanım ve konu kapsamında kal\n6. Sadece multiple_choice ve true_false sorularında altı çizili/vurgulu metin için [köşeli parantez] kullan. fill_blank sorularında ASLA kullanma.\n7. MEB kaynak metni verilmişse: yukarıdaki KAYNAK KULLANIM ORANI kuralına göre üret — ~%30 kaynağa dayalı sorularda metindeki gerçek kişi/olay/bilgiyi kullan (uydurma), ~%70 genel-bilgiye-dayalı sorularda kaynağa bağlı kalmadan ama MEB müfredatına doğru şekilde üret.\n8. HER SORU TAMAMEN KENDİ İÇİNDE EKSİKSİZ VE ÇÖZÜLEBİLİR OLMALI. Kaynak metin gerçek bir sınav kitapçığından alınmış olabilir ve orada "Soru 39'da verilen örneğe göre...", "yukarıdaki tabloya göre...", "38 ve 39. soruları bu bilgiye göre cevaplayınız..." gibi BAŞKA bir soruya/örneğe/tabloya/paragrafa atıfta bulunan, bir soru zincirinin parçası olan ifadeler geçebilir. Bu şekilde başka bir soruya bağımlı, kendi başına çözülemeyecek bir soru ASLA üretme — öğrenci sadece bu tek soruyu görecek, referans verdiğin diğer soru/örnek/tablo öğrenciye HİÇ gösterilmeyecek. Böyle bir referans fark edersen: ya o referansı YOK SAY ve gerekli tüm bilgiyi (verileri, örneği, senaryoyu) doğrudan bu sorunun kendi metnine TAŞI, ya da kaynaktaki bambaşka, bağımsız (başka bir soruya atıf yapmayan) bir örnek/kavram seç.\n9. KAYNAK METNİN KENDİSİ (kitabın yazarları, ISBN'i, kaç sayfa olduğu, hangi yayınevi bastığı, kapak/İçindekiler bilgisi vb.) HAKKINDA ASLA SORU ÜRETME — bunlar kitabın idari/künye bilgisidir, ders içeriği/kazanım DEĞİLDİR. Öğrenci bu kitabı hiç görmedi ve göremeyecek, sadece senin ürettiğin tek bir soruyu görecek. Bu yüzden: (a) "verilen ders kitabının yazarı kimdir", "ISBN numarası nedir", "kaç yazar tarafından hazırlanmıştır" gibi sorular KESİNLİKLE YASAK; (b) BİR OKUMA PARÇASINA/GERÇEK KİŞİ ÖRNEĞİNE/VAKAYA dayalı soru üretiyorsan (ör. "Metinde anlatılan Ahmet Bey örneğinde...", "verilen metne göre", "parçada anlatılan olayda") o metnin/örneğin/kişinin/olayın ÖZETİNİ (2-3 cümle, kim/ne/nerede/nasıl) MUTLAKA sorunun kendi "q" alanının BAŞINA yaz, sonra soruyu sor. SOMUT ÖRNEK — YANLIŞ: {"q":"Metinde anlatılan Ahmet Bey örneğinde, hangi amaçla ekonomik faaliyet gerçekleştirilmiştir?"} (öğrenci metni hiç görmedi, cevaplayamaz!). DOĞRU: {"q":"Ahmet Bey, şehirdeki işini bırakıp köyüne dönmüş ve dedesinden kalan tarlalarda organik tarım yapmaya başlamıştır. Bu örnekte Ahmet Bey'in ekonomik faaliyeti hangi amaca yöneliktir?"} (gerekli bilgi sorunun içinde). ASLA öğrencinin görmediği bir metne/örneğe atıfta bulunup o metni özetlemeyen bir soru üretme.\n10. KELİME SEVİYESİ: Kullandığın dil, ${grade} seviyesindeki bir öğrencinin günlük hayatta bildiği kelimelerle sınırlı kalmalı. Bu yaş grubunun bilmeyeceği akademik, soyut veya üniversite düzeyinde kelimeler ASLA kullanma — gerekiyorsa daha basit eş anlamlısını tercih et.\n11. MÜFREDAT ÇERÇEVE DOKÜMANININ KENDİ YAPISI HAKKINDA SORU ÜRETME: Kaynak metin bazen (tymm.meb.gov.tr gibi resmi bir portaldan alınmış) bir MÜFREDAT ÇERÇEVE DOKÜMANI olabilir — bu dokümanlar "Öğrenme Kanıtları", "Performans Görevi", "Köprü Kurma", "Öğrenme-Öğretme Yaşantıları", "Ön Değerlendirme Süreci", "Zenginleştirme", "Destekleme" gibi ÖĞRETMENE yönelik pedagojik planlama bölümleri içerir. Bu bölüm başlıklarının KENDİSİ hakkında ("X bölümünde hangi yöntem kullanılabilir?", "Y aşamasında öğretmenlerin ne yapması öngörülmektedir?" gibi) SORU ÜRETME — bunlar öğretmenin nasıl öğreteceğine dair idari bilgidir, öğrencinin öğrenmesi gereken KONU İÇERİĞİ değildir (tıpkı kitabın İçindekiler sayfası gibi). Bunun yerine bu bölümlerin İÇİNDE GEÇEN somut örnek/senaryoyu (ör. "Köprü Kurma" bölümünde "STK'ların MEB destekli proje örnekleri incelenir" yazıyorsa, STK'ların demokrasideki rolü hakkında bir soru sor — "Köprü Kurma aşamasında ne inceleniyor" diye sorma) gerçek konu sorusuna dönüştür.\n\nYalnızca geçerli JSON döndür, markdown veya açıklama ekleme.\n\n`

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

// 5 Eylül 2026 — P0: Prompt caching (Deniz'in "token tüketimini nasıl
// düşürebiliriz" sorusuna gerçek ai_usage_logs verisiyle yanıt). Bulgu:
// generate-quiz (ana üretim + topup) TÜM AI harcamasının ~%75'ini
// oluşturuyor, ve bunun ~%84'ü INPUT token — yani asıl maliyet HER ÇAĞRIDA
// BİREBİR AYNI gönderilen sabit talimat metninde (DOĞRULUK KURALLARI +
// İSTİSNA 1-3 + tip şemaları), konu/kaynak farklı olsa bile.
//
// Bu bloklar (K12/MEB yolu için) TEK PARÇA halinde derlenip Anthropic'in
// cache_control (ephemeral, ~5dk TTL) ile işaretleniyor — cache-read fiyatı
// normal input'un ~%10'u. buildPrompt()'un KENDİSİNE dokunulmadı (regresyon
// riskini sıfırlamak için) — bunun yerine onun ürettiği TAM metinden bu
// bilinen statik alt-dizeler .replace() ile çıkarılıp (bkz.
// stripStaticPartsForCaching) geri kalan küçük DİNAMİK kısım user mesajı
// olarak, bu fonksiyonun ürettiği metin de system dizisinde AYRI, cache'li
// bir blok olarak gönderiliyor.
//
// ÖNEMLİ EŞİK NOTU: Anthropic'te modele göre minimum cache'lenebilir uzunluk
// var — altında kalan içerik SESSİZCE (hatasız) cache'lenmeden geçer:
//   Sonnet 4.5: 2048 token   |   Haiku 4.5: 4096 token
// Bu bloklar gerçek Anthropic tokenizer'ıyla ölçüldü: ~4211 token (K12/
// multiple_choice varsayılan kombinasyonu) — Haiku eşiğini ~115 token gibi
// DAR bir marjla geçiyor. Diğer type kombinasyonları biraz farklı
// uzunlukta olabilir. Kesin doğrulama ancak deploy sonrası ai_usage_logs
// tablosundaki cache_read_tokens/cache_creation_input_tokens alanlarıyla
// yapılabilir (bu alanlar zaten loglanıyor, bkz. lib/ai-usage.ts) — bu
// yüzden garanti değil, ÖLÇÜLECEK bir hipotez olarak işaretleniyor.
//
// KAPSAM KARARI: Sadece K12/MEB yolu (isUniversity=false) için uygulandı.
// Üniversite yolu (ayrı, department-özel intro metni içerdiği için tam
// statik değil) DEĞİŞTİRİLMEDİ — gerçek kullanım verisi zaten tamamen K12
// ağırlıklı olduğu için bu, riski düşürüp faydanın neredeyse tamamını
// yakalıyor.
//
// DAVRANIŞ NOTU: İSTİSNA 1-3 önceden SADECE mebCtx (yüklü kaynak) varken
// gönderiliyordu. Şimdi HER K12 çağrısında (kaynak olsun olmasın) statik
// blokta yer alıyor — zararsız çünkü kurallar doğal dilde "eğer bu metin
// X ise" diye kendi kendini koşullandırıyor.
// 5 Eylül 2026 — P0: Prompt caching (Deniz'in "token tüketimini nasıl
// düşürebiliriz" sorusuna gerçek ai_usage_logs verisiyle yanıt). Bulgu:
// generate-quiz (ana üretim + topup) TÜM AI harcamasının ~%75'ini
// oluşturuyor, ve bunun ~%84'ü INPUT token — yani asıl maliyet HER ÇAĞRIDA
// BİREBİR AYNI gönderilen sabit talimat metninde (DOĞRULUK KURALLARI +
// İSTİSNA 1-3 + tip şemaları), konu/kaynak farklı olsa bile.
//
// Bu bloklar (K12/MEB yolu için) TEK PARÇA halinde derlenip Anthropic'in
// cache_control (ephemeral, ~5dk TTL) ile işaretleniyor — cache-read fiyatı
// normal input'un ~%10'u. buildPrompt()'un KENDİSİNE dokunulmadı (regresyon
// riskini sıfırlamak için) — bunun yerine onun ürettiği TAM metinden bu
// bilinen statik alt-dizeler .replace() ile çıkarılıp (bkz.
// stripStaticPartsForCaching) geri kalan küçük DİNAMİK kısım user mesajı
// olarak, bu fonksiyonun ürettiği metin de system dizisinde AYRI, cache'li
// bir blok olarak gönderiliyor.
//
// ⚠️ KRİTİK UYGULAMA NOTU: Bu metinler kaynak dosyadan çıkarılırken, orijinal
// template literal'daki "\n" (2 karakterlik escape dizisi) GERÇEK satır
// sonuna çevrildi (normalize edildi) — aksi hâlde runtime'da buildPrompt()'un
// ÜRETTİĞİ metin (kendi \n'lerini gerçek satır sonuna yorumlar) ile buradaki
// sabit string'ler ASLA birebir eşleşmez, ve stripStaticPartsForCaching
// hiçbir şeyi çıkaramaz (ilk denemede yaşanan ve build+izole testle
// yakalanan gerçek bir hataydı).
//
// ÖNEMLİ EŞİK NOTU: Anthropic'te modele göre minimum cache'lenebilir uzunluk
// var — altında kalan içerik SESSİZCE (hatasız) cache'lenmeden geçer:
//   Sonnet 4.5: 2048 token   |   Haiku 4.5: 4096 token
// Gerçek Anthropic tokenizer'ıyla ölçüldü: multiple_choice/mixed/fill_blank/
// true_false (misconception kuralını alan 4 tip, en yaygın kullanılanlar)
// ~4200-4450 token ile Haiku eşiğini gerçek marjla geçiyor. table_fill/
// multi_true_false/matching/ordering/short_answer (misconception kuralı
// almayan 5 nadir Maarif-Model tipi) ~93-152 token KISA KALIYOR — bu tipler
// için Haiku çağrılarında cache devreye girmeyebilir (hata vermez, sadece
// indirim uygulanmaz). Kesin doğrulama ancak deploy sonrası ai_usage_logs
// tablosundaki cache_read_tokens/cache_creation_input_tokens alanlarıyla
// yapılabilir (bu alanlar zaten loglanıyor, bkz. lib/ai-usage.ts).
//
// KAPSAM KARARI: Sadece K12/MEB yolu (isUniversity=false) için uygulandı.
// Üniversite yolu (ayrı, department-özel intro metni içerdiği için tam
// statik değil) DEĞİŞTİRİLMEDİ — gerçek kullanım verisi zaten tamamen K12
// ağırlıklı olduğu için bu, riski düşürüp faydanın neredeyse tamamını
// yakalıyor.
//
// DAVRANIŞ NOTU: İSTİSNA 1-3 önceden SADECE mebCtx (yüklü kaynak) varken
// gönderiliyordu. Şimdi HER K12 çağrısında (kaynak olsun olmasın) statik
// blokta yer alıyor — zararsız çünkü kurallar doğal dilde "eğer bu metin
// X ise" diye kendi kendini koşullandırıyor.
// 5 Eylül 2026 — P0: Prompt caching (Deniz'in "token tüketimini nasıl
// düşürebiliriz" sorusuna gerçek ai_usage_logs verisiyle yanıt). Bulgu:
// generate-quiz (ana üretim + topup) TÜM AI harcamasının ~%75'ini
// oluşturuyor, ve bunun ~%84'ü INPUT token — yani asıl maliyet HER ÇAĞRIDA
// BİREBİR AYNI gönderilen sabit talimat metninde (DOĞRULUK KURALLARI +
// İSTİSNA 1-3 + tip şemaları), konu/kaynak farklı olsa bile.
//
// Bu bloklar (K12/MEB yolu için) TEK PARÇA halinde derlenip Anthropic'in
// cache_control (ephemeral, ~5dk TTL) ile işaretleniyor — cache-read fiyatı
// normal input'un ~%10'u. buildPrompt()'un KENDİSİNE dokunulmadı (regresyon
// riskini sıfırlamak için) — bunun yerine onun ürettiği TAM metinden bu
// bilinen statik alt-dizeler .replace() ile çıkarılıp (bkz.
// stripStaticPartsForCaching) geri kalan küçük DİNAMİK kısım user mesajı
// olarak, bu fonksiyonun ürettiği metin de system dizisinde AYRI, cache'li
// bir blok olarak gönderiliyor.
//
// ⚠️ KRİTİK UYGULAMA NOTLARI (izole testle bulunup düzeltilen 2 gerçek hata):
//  1) Kaynak dosyadan metin çıkarılırken orijinal template literal'daki "\n"
//     (2 karakterlik escape dizisi) GERÇEK satır sonuna çevrildi (normalize
//     edildi) — aksi hâlde runtime'da buildPrompt()'un ÜRETTİĞİ metin (kendi
//     \n'lerini gerçek satır sonuna yorumlar) ile buradaki sabit string'ler
//     ASLA birebir eşleşmez.
//  2) DOĞRULUK KURALLARI'nın 10. maddesi "${grade}" değişkeni içeriyordu —
//     "tamamen statik" varsayımım YANLIŞTI. Statik blokta bu madde sınıf
//     seviyesine genel bir ifadeyle ("öğrencinin sınıf seviyesine uygun")
//     yeniden yazıldı (grade zaten dinamik kısımdaki "Seviye: X." satırında
//     ayrıca belirtiliyor, bilgi kaybı yok). Dinamik promptan çıkarmak için
//     ise sabit .replace() yerine REGEX kullanılıyor (before-anchor + herhangi
//     bir grade değeri + after-anchor) — böylece HANGİ sınıf seviyesi
//     gönderilirse gönderilsin doğru şekilde çıkarılabiliyor.
//
// ÖNEMLİ EŞİK NOTU: Anthropic'te modele göre minimum cache'lenebilir uzunluk
// var — altında kalan içerik SESSİZCE (hatasız) cache'lenmeden geçer:
//   Sonnet 4.5: 2048 token   |   Haiku 4.5: 4096 token
// Gerçek Anthropic tokenizer'ıyla ölçüldü: multiple_choice/mixed/fill_blank/
// true_false (misconception kuralını alan 4 tip, en yaygın kullanılanlar)
// ~4200-4450 token ile Haiku eşiğini gerçek marjla geçiyor. table_fill/
// multi_true_false/matching/ordering/short_answer (misconception kuralı
// almayan 5 nadir Maarif-Model tipi) ~93-152 token KISA KALIYOR — bu tipler
// için Haiku çağrılarında cache devreye girmeyebilir (hata vermez, sadece
// indirim uygulanmaz). Kesin doğrulama ancak deploy sonrası ai_usage_logs
// tablosundaki cache_read_tokens/cache_creation_input_tokens alanlarıyla
// yapılabilir (bu alanlar zaten loglanıyor, bkz. lib/ai-usage.ts).
//
// KAPSAM KARARI: Sadece K12/MEB yolu (isUniversity=false) için uygulandı.
// Üniversite yolu (ayrı, department-özel intro metni içerdiği için tam
// statik değil) DEĞİŞTİRİLMEDİ.
//
// DAVRANIŞ NOTU: İSTİSNA 1-3 önceden SADECE mebCtx (yüklü kaynak) varken
// gönderiliyordu. Şimdi HER K12 çağrısında (kaynak olsun olmasın) statik
// blokta yer alıyor — zararsız çünkü kurallar doğal dilde "eğer bu metin
// X ise" diye kendi kendini koşullandırıyor.
const K12_STATIC_INTRO = "Sen Türkiye Milli Eğitim Bakanlığı (MEB) müfredatına göre soru üreten bir eğitim asistanısın.\n\nKESİN KURAL: Yalnızca MEB müfredatında yer alan konularda, MEB kazanımlarına uygun sorular üret. Müfredat dışı, spekülatif veya tartışmalı içerik kesinlikle üretme."
const K12_STATIC_ISTISNA_BLOCK = "🚫 ÖNEMLİ İSTİSNA 1: Eğer bu metin bir MÜFREDAT KAZANIM KODU LİSTESİYSE (örn. \"SB.6.4.1. ... a) ... b) ...\" formatında, öğretmene yönelik öğrenme çıktısı tanımları içeriyorsa) — ASLA \"hangi kazanımın hangi alt maddesi X der\" gibi kod/madde numarasına dayalı sorular ÜRETME. Bunun yerine, o kazanımın işaret ettiği GERÇEK KONUYU (örn. \"vatandaşlık haklarının kullanımında dijitalleşme etkileri\" kazanımından yola çıkarak, dijital vatandaşlık kavramının kendisi hakkında) öğrenciye anlamlı bir içerik sorusu sor. Öğrenci kazanım kodlarını asla görmemeli ve bunlar hakkında sorgulanmamalı. KRİTİK SINIR: kazanım metni kısa/yetersiz olsa bile, ASLA kendi genel bilgine dayanarak BAŞKA, İSİMLENDİRİLMİŞ bir tarihi metne/esere/konuşmaya (ör. Gençliğe Hitabesi, İstiklal Marşı, Nutuk, belirli bir yazarın belirli bir eseri) atlama ve o metinden alıntı/soru üretme — BU METİNLER SANA VERİLMEDİYSE ONLAR HAKKINDA SORU ÜRETMEK KESİNLİKLE YASAK, kazanımla ne kadar tematik olarak yakın görünürse görünsün. Bunun yerine SADECE kazanımın kendi tanımladığı KAVRAM/BECERİ üzerinden, somut ama İSİMSİZ bir senaryo/örnek kurgula (ör. \"Bir yerleşim biriminde alınan bir kararı etkileyen unsurları düşünelim...\" gibi, gerçek bir kişi/eser/tarihi olaya atıfta bulunmayan, kendi kurguladığın bir örnek). SOMUT ÖRNEK — YANLIŞ: kazanım \"toplumsal düzenin sürdürülmesinde temel hak ve sorumlulukların önemi\" iken \"Gençliğe Hitabesi'nde Atatürk'ün ... ifadesi hangi tutumu hedeflemiştir?\" gibi bir soru üretmek (kazanımla ilgisi olmayan, sana verilmeyen bir kaynağa kaçış). DOĞRU: aynı kazanım için \"Bir toplumda bireylerin hem haklarını kullanıp hem sorumluluklarını yerine getirmesi, toplumsal düzenin sürdürülmesi açısından neden önemlidir?\" gibi kazanımın kendi kavramına sadık, kurgusal bir soru.\n\n🚫 ÖNEMLİ İSTİSNA 2: Bu metin gerçek bir sınav kitapçığı/soru bankası çıktısı olabilir ve bu tür kaynaklarda \"Soru 39'da verilen örneğe göre...\", \"38 ve 39. soruları aşağıdaki bilgiye göre cevaplayınız\" gibi BAŞKA numaralı bir soruya/örneğe atıfta bulunan, çok parçalı bir soru zincirinin sadece bir kısmı yer alabilir. Metinde böyle bir referans görürsen o referansı asla olduğu gibi kopyalama — ya atıf yaptığı bilgiyi/örneği (metinde başka bir yerde varsa) bulup doğrudan senin ürettiğin sorunun metnine dahil et, ya da metindeki tamamen bağımsız (başka soruya atıf yapmayan) başka bir örnek/kavram kullan. Öğrenci SADECE senin ürettiğin tek soruyu görecek; \"yukarıda\", \"az önce\", \"Soru X'te\" dediğin hiçbir şey öğrenciye ayrıca gösterilmeyecek.\n\n🚫 ÖNEMLİ İSTİSNA 3: Kaynak metinde İSTATİSTİK, ANKET SONUCU, TABLO veya SAYISAL VERİ (ör. \"kişiler günde ortalama 6 saat TV izliyor, 1 dakika kitap okuyor\" gibi) varsa ve bu veriye dayalı bir soru üretmek istiyorsan, \"metinde verilen istatistiklere göre\" gibi bir ifadeyle veriye SADECE ATIFTA BULUNMA — o veriyi/sayıları/istatistikleri DOĞRUDAN sorunun kendi metnine TAŞI. Öğrenci o istatistiği görmeden soruyu cevaplayamaz. SOMUT ÖRNEK — YANLIŞ: \"Metinde verilen istatistiklere göre, Türkiye'de bir kişi günde kitap okumaya ayrılan zaman ile TV izlemeye ayrılan zaman arasında kaç saat fark vardır?\" (sayılar hiç verilmemiş, cevaplanamaz). DOĞRU: \"Yapılan bir araştırmaya göre Türkiye'de bir kişi günde ortalama 6 saat televizyon izlerken, kitap okumaya sadece 1 dakika ayırmaktadır. Bu bilgiye göre, TV izlemeye ayrılan süre kitap okumaya ayrılan süreden kaç saat fazladır?\" (gerekli sayılar sorunun içinde). Aynı kural, metinde geçen alıntılanmış CÜMLELER/CEVAPLAR için de geçerlidir — \"metinde sıralanan cevaplara göre\" demek yerine, o cevapları/alıntıları KISACA sorunun içine al."
const K12_STATIC_DOGRULUK_KURALLARI = "DOĞRULUK KURALLARI:\n1. Matematik: Her soruyu adım adım çöz, cevabın opts dizisinde doğru indexte olduğunu doğrula\n2. Fen/Tarih: Sadece kesin bildiğin gerçekleri yaz\n3. \"ans\" indexi MUTLAKA doğru cevabı göstermeli\n4. Emin olmadığın sorular yerine daha basit ama kesin sorular yaz\n5. MEB müfredatına uygun kazanım ve konu kapsamında kal\n6. Sadece multiple_choice ve true_false sorularında altı çizili/vurgulu metin için [köşeli parantez] kullan. fill_blank sorularında ASLA kullanma.\n7. MEB kaynak metni verilmişse: KAYNAK KULLANIM ORANI kuralına (~%30 kaynağa dayalı / ~%70 genel bilgiye dayalı) göre üret — kaynağa dayalı sorularda metindeki gerçek kişi/olay/bilgiyi kullan (uydurma), genel-bilgiye-dayalı sorularda kaynağa bağlı kalmadan ama MEB müfredatına doğru şekilde üret.\n8. HER SORU TAMAMEN KENDİ İÇİNDE EKSİKSİZ VE ÇÖZÜLEBİLİR OLMALI. Kaynak metin gerçek bir sınav kitapçığından alınmış olabilir ve orada \"Soru 39'da verilen örneğe göre...\", \"yukarıdaki tabloya göre...\", \"38 ve 39. soruları bu bilgiye göre cevaplayınız...\" gibi BAŞKA bir soruya/örneğe/tabloya/paragrafa atıfta bulunan, bir soru zincirinin parçası olan ifadeler geçebilir. Bu şekilde başka bir soruya bağımlı, kendi başına çözülemeyecek bir soru ASLA üretme — öğrenci sadece bu tek soruyu görecek, referans verdiğin diğer soru/örnek/tablo öğrenciye HİÇ gösterilmeyecek. Böyle bir referans fark edersen: ya o referansı YOK SAY ve gerekli tüm bilgiyi (verileri, örneği, senaryoyu) doğrudan bu sorunun kendi metnine TAŞI, ya da kaynaktaki bambaşka, bağımsız (başka bir soruya atıf yapmayan) bir örnek/kavram seç.\n9. KAYNAK METNİN KENDİSİ (kitabın yazarları, ISBN'i, kaç sayfa olduğu, hangi yayınevi bastığı, kapak/İçindekiler bilgisi vb.) HAKKINDA ASLA SORU ÜRETME — bunlar kitabın idari/künye bilgisidir, ders içeriği/kazanım DEĞİLDİR. Öğrenci bu kitabı hiç görmedi ve göremeyecek, sadece senin ürettiğin tek bir soruyu görecek. Bu yüzden: (a) \"verilen ders kitabının yazarı kimdir\", \"ISBN numarası nedir\", \"kaç yazar tarafından hazırlanmıştır\" gibi sorular KESİNLİKLE YASAK; (b) BİR OKUMA PARÇASINA/GERÇEK KİŞİ ÖRNEĞİNE/VAKAYA dayalı soru üretiyorsan (ör. \"Metinde anlatılan Ahmet Bey örneğinde...\", \"verilen metne göre\", \"parçada anlatılan olayda\") o metnin/örneğin/kişinin/olayın ÖZETİNİ (2-3 cümle, kim/ne/nerede/nasıl) MUTLAKA sorunun kendi \"q\" alanının BAŞINA yaz, sonra soruyu sor. SOMUT ÖRNEK — YANLIŞ: {\"q\":\"Metinde anlatılan Ahmet Bey örneğinde, hangi amaçla ekonomik faaliyet gerçekleştirilmiştir?\"} (öğrenci metni hiç görmedi, cevaplayamaz!). DOĞRU: {\"q\":\"Ahmet Bey, şehirdeki işini bırakıp köyüne dönmüş ve dedesinden kalan tarlalarda organik tarım yapmaya başlamıştır. Bu örnekte Ahmet Bey'in ekonomik faaliyeti hangi amaca yöneliktir?\"} (gerekli bilgi sorunun içinde). ASLA öğrencinin görmediği bir metne/örneğe atıfta bulunup o metni özetlemeyen bir soru üretme.\n10. KELİME SEVİYESİ: Kullandığın dil, öğrencinin sınıf seviyesine uygun, günlük hayatta bildiği kelimelerle sınırlı kalmalı. Bu yaş grubunun bilmeyeceği akademik, soyut veya üniversite düzeyinde kelimeler ASLA kullanma — gerekiyorsa daha basit eş anlamlısını tercih et.\n11. MÜFREDAT ÇERÇEVE DOKÜMANININ KENDİ YAPISI HAKKINDA SORU ÜRETME: Kaynak metin bazen (tymm.meb.gov.tr gibi resmi bir portaldan alınmış) bir MÜFREDAT ÇERÇEVE DOKÜMANI olabilir — bu dokümanlar \"Öğrenme Kanıtları\", \"Performans Görevi\", \"Köprü Kurma\", \"Öğrenme-Öğretme Yaşantıları\", \"Ön Değerlendirme Süreci\", \"Zenginleştirme\", \"Destekleme\" gibi ÖĞRETMENE yönelik pedagojik planlama bölümleri içerir. Bu bölüm başlıklarının KENDİSİ hakkında (\"X bölümünde hangi yöntem kullanılabilir?\", \"Y aşamasında öğretmenlerin ne yapması öngörülmektedir?\" gibi) SORU ÜRETME — bunlar öğretmenin nasıl öğreteceğine dair idari bilgidir, öğrencinin öğrenmesi gereken KONU İÇERİĞİ değildir (tıpkı kitabın İçindekiler sayfası gibi). Bunun yerine bu bölümlerin İÇİNDE GEÇEN somut örnek/senaryoyu (ör. \"Köprü Kurma\" bölümünde \"STK'ların MEB destekli proje örnekleri incelenir\" yazıyorsa, STK'ların demokrasideki rolü hakkında bir soru sor — \"Köprü Kurma aşamasında ne inceleniyor\" diye sorma) gerçek konu sorusuna dönüştür.\n\n"
const K12_STATIC_JSON_ONLY_NOTE = "Yalnızca geçerli JSON döndür, markdown veya açıklama ekleme."

// stripStaticPartsForCaching içinde ${grade}'i regex ile atlamak için:
const K12_DK_STRIP_BEFORE_GRADE = "DOĞRULUK KURALLARI:\n1. Matematik: Her soruyu adım adım çöz, cevabın opts dizisinde doğru indexte olduğunu doğrula\n2. Fen/Tarih: Sadece kesin bildiğin gerçekleri yaz\n3. \"ans\" indexi MUTLAKA doğru cevabı göstermeli\n4. Emin olmadığın sorular yerine daha basit ama kesin sorular yaz\n5. MEB müfredatına uygun kazanım ve konu kapsamında kal\n6. Sadece multiple_choice ve true_false sorularında altı çizili/vurgulu metin için [köşeli parantez] kullan. fill_blank sorularında ASLA kullanma.\n7. MEB kaynak metni verilmişse: yukarıdaki KAYNAK KULLANIM ORANI kuralına göre üret — ~%30 kaynağa dayalı sorularda metindeki gerçek kişi/olay/bilgiyi kullan (uydurma), ~%70 genel-bilgiye-dayalı sorularda kaynağa bağlı kalmadan ama MEB müfredatına doğru şekilde üret.\n8. HER SORU TAMAMEN KENDİ İÇİNDE EKSİKSİZ VE ÇÖZÜLEBİLİR OLMALI. Kaynak metin gerçek bir sınav kitapçığından alınmış olabilir ve orada \"Soru 39'da verilen örneğe göre...\", \"yukarıdaki tabloya göre...\", \"38 ve 39. soruları bu bilgiye göre cevaplayınız...\" gibi BAŞKA bir soruya/örneğe/tabloya/paragrafa atıfta bulunan, bir soru zincirinin parçası olan ifadeler geçebilir. Bu şekilde başka bir soruya bağımlı, kendi başına çözülemeyecek bir soru ASLA üretme — öğrenci sadece bu tek soruyu görecek, referans verdiğin diğer soru/örnek/tablo öğrenciye HİÇ gösterilmeyecek. Böyle bir referans fark edersen: ya o referansı YOK SAY ve gerekli tüm bilgiyi (verileri, örneği, senaryoyu) doğrudan bu sorunun kendi metnine TAŞI, ya da kaynaktaki bambaşka, bağımsız (başka bir soruya atıf yapmayan) bir örnek/kavram seç.\n9. KAYNAK METNİN KENDİSİ (kitabın yazarları, ISBN'i, kaç sayfa olduğu, hangi yayınevi bastığı, kapak/İçindekiler bilgisi vb.) HAKKINDA ASLA SORU ÜRETME — bunlar kitabın idari/künye bilgisidir, ders içeriği/kazanım DEĞİLDİR. Öğrenci bu kitabı hiç görmedi ve göremeyecek, sadece senin ürettiğin tek bir soruyu görecek. Bu yüzden: (a) \"verilen ders kitabının yazarı kimdir\", \"ISBN numarası nedir\", \"kaç yazar tarafından hazırlanmıştır\" gibi sorular KESİNLİKLE YASAK; (b) BİR OKUMA PARÇASINA/GERÇEK KİŞİ ÖRNEĞİNE/VAKAYA dayalı soru üretiyorsan (ör. \"Metinde anlatılan Ahmet Bey örneğinde...\", \"verilen metne göre\", \"parçada anlatılan olayda\") o metnin/örneğin/kişinin/olayın ÖZETİNİ (2-3 cümle, kim/ne/nerede/nasıl) MUTLAKA sorunun kendi \"q\" alanının BAŞINA yaz, sonra soruyu sor. SOMUT ÖRNEK — YANLIŞ: {\"q\":\"Metinde anlatılan Ahmet Bey örneğinde, hangi amaçla ekonomik faaliyet gerçekleştirilmiştir?\"} (öğrenci metni hiç görmedi, cevaplayamaz!). DOĞRU: {\"q\":\"Ahmet Bey, şehirdeki işini bırakıp köyüne dönmüş ve dedesinden kalan tarlalarda organik tarım yapmaya başlamıştır. Bu örnekte Ahmet Bey'in ekonomik faaliyeti hangi amaca yöneliktir?\"} (gerekli bilgi sorunun içinde). ASLA öğrencinin görmediği bir metne/örneğe atıfta bulunup o metni özetlemeyen bir soru üretme.\n10. KELİME SEVİYESİ: Kullandığın dil, "
const K12_DK_STRIP_AFTER_GRADE = " seviyesindeki bir öğrencinin günlük hayatta bildiği kelimelerle sınırlı kalmalı. Bu yaş grubunun bilmeyeceği akademik, soyut veya üniversite düzeyinde kelimeler ASLA kullanma — gerekiyorsa daha basit eş anlamlısını tercih et.\n11. MÜFREDAT ÇERÇEVE DOKÜMANININ KENDİ YAPISI HAKKINDA SORU ÜRETME: Kaynak metin bazen (tymm.meb.gov.tr gibi resmi bir portaldan alınmış) bir MÜFREDAT ÇERÇEVE DOKÜMANI olabilir — bu dokümanlar \"Öğrenme Kanıtları\", \"Performans Görevi\", \"Köprü Kurma\", \"Öğrenme-Öğretme Yaşantıları\", \"Ön Değerlendirme Süreci\", \"Zenginleştirme\", \"Destekleme\" gibi ÖĞRETMENE yönelik pedagojik planlama bölümleri içerir. Bu bölüm başlıklarının KENDİSİ hakkında (\"X bölümünde hangi yöntem kullanılabilir?\", \"Y aşamasında öğretmenlerin ne yapması öngörülmektedir?\" gibi) SORU ÜRETME — bunlar öğretmenin nasıl öğreteceğine dair idari bilgidir, öğrencinin öğrenmesi gereken KONU İÇERİĞİ değildir (tıpkı kitabın İçindekiler sayfası gibi). Bunun yerine bu bölümlerin İÇİNDE GEÇEN somut örnek/senaryoyu (ör. \"Köprü Kurma\" bölümünde \"STK'ların MEB destekli proje örnekleri incelenir\" yazıyorsa, STK'ların demokrasideki rolü hakkında bir soru sor — \"Köprü Kurma aşamasında ne inceleniyor\" diye sorma) gerçek konu sorusuna dönüştür.\n\n"

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const K12_STATIC_TYPE_SCHEMAS: Record<string, string> = {
  fill_blank: "Generate fill-in-the-blank questions. Leave a critical word/concept as blank. Provide 4 options (one correct), write the correct answer in \"blank\" field too.\n\nCRITICAL RULES:\n1. NEVER put the answer or any hint inside the question text. The blank ___ must be the ONLY clue.\n2. Do NOT use [brackets] in fill_blank questions - brackets reveal the answer!\n3. Do NOT add (verb), (noun), (drink) or any word hints in parentheses.\n4. WRONG: \"Normal koşullarda en kararlı karbon formu olan [grafit], kurşun kalemlerinde kullanılır.\" (REVEALS ANSWER!)\n5. CORRECT: \"Normal koşullarda en kararlı karbon formu olan _____, kurşun kalemlerinde kullanılır.\"\n\n{\"questions\":[{\"type\":\"fill_blank\",\"q\":\"_____ is the powerhouse of the cell.\",\"blank\":\"Mitochondria\",\"opts\":[\"Mitochondria\",\"Ribosome\",\"Nucleus\",\"Lysosome\"],\"ans\":0,\"exp\":\"Mitochondria produces ATP through cellular respiration.\"}]}",
  multi_true_false: "Generate Maarif Model multi-statement true/false questions. Each question has 4-5 statements.\n\n{\"questions\":[{\"type\":\"multi_true_false\",\"q\":\"Aşağıdaki ifadeleri Doğru (D) ya da Yanlış (Y) olarak değerlendirin.\",\"statements\":[{\"text\":\"Mitokondri hücrenin enerji merkezidir.\",\"correct\":true},{\"text\":\"Ribozom DNA saklar.\",\"correct\":false}],\"opts\":[\"D\",\"Y\"],\"ans\":0,\"exp\":\"Açıklama...\"}]}",
  table_fill: "Generate Maarif Model table-fill questions.\n\n{\"questions\":[{\"type\":\"table_fill\",\"q\":\"Aşağıdaki tabloyu tamamlayın.\",\"tableData\":{\"headers\":[\"Organel\",\"Görevi\"],\"rows\":[{\"cells\":[\"Mitokondri\",\"___\"],\"blanks\":[1]},{\"cells\":[\"Ribozom\",\"___\"],\"blanks\":[1]}]},\"tableAnswers\":[\"ATP üretimi\",\"Protein sentezi\"],\"opts\":[\"A\",\"B\"],\"ans\":0,\"exp\":\"...\"}]}",
  matching: "Generate matching questions with exactly 4 unique concept-definition pairs.\n\n{\"questions\":[{\"type\":\"matching\",\"q\":\"Match organelles with functions.\",\"pairs\":[{\"left\":\"Mitochondria\",\"right\":\"Energy production\"},{\"left\":\"Ribosome\",\"right\":\"Protein synthesis\"},{\"left\":\"Nucleus\",\"right\":\"DNA storage\"},{\"left\":\"Lysosome\",\"right\":\"Waste digestion\"}],\"opts\":[\"A\",\"B\",\"C\",\"D\"],\"ans\":0,\"exp\":\"...\"}]}",
  ordering: "Generate ordering/sequencing questions with 4-5 items.\n\n{\"questions\":[{\"type\":\"ordering\",\"q\":\"Order these events chronologically.\",\"items\":[\"Event B\",\"Event A\",\"Event D\",\"Event C\"],\"correctOrder\":[1,0,3,2],\"opts\":[\"1st\",\"2nd\",\"3rd\",\"4th\"],\"ans\":0,\"exp\":\"...\"}]}",
  short_answer: "Generate short answer questions.\n\n{\"questions\":[{\"type\":\"short_answer\",\"q\":\"What is photosynthesis?\",\"opts\":[\"Photosynthesis is the process by which plants convert CO2 and water into glucose using sunlight.\"],\"ans\":0,\"exp\":\"Equation: 6CO2 + 6H2O + light → C6H12O6 + 6O2\"}]}",
  mixed: "Generate MIXED questions combining multiple_choice, fill_blank, true_false. IMPORTANT: Never add hints like (verb), (noun) in parentheses in fill_blank questions., multi_true_false, matching, ordering types evenly.\n\n{\"questions\":[{\"type\":\"multiple_choice\",\"q\":\"...\",\"opts\":[\"A\",\"B\",\"C\",\"D\"],\"ans\":0,\"exp\":\"...\"},{\"type\":\"fill_blank\",\"q\":\"___ is the powerhouse\",\"blank\":\"Mitochondria\",\"opts\":[\"Mitochondria\",\"Ribosome\",\"Nucleus\",\"Lysosome\"],\"ans\":0,\"exp\":\"...\"},{\"type\":\"true_false\",\"q\":\"...\",\"opts\":[\"Doğru\",\"Yanlış\"],\"ans\":0,\"exp\":\"...\"},{\"type\":\"multi_true_false\",\"q\":\"...\",\"statements\":[{\"text\":\"...\",\"correct\":true}],\"opts\":[\"D\",\"Y\"],\"ans\":0,\"exp\":\"...\"},{\"type\":\"matching\",\"q\":\"...\",\"pairs\":[{\"left\":\"...\",\"right\":\"...\"}],\"opts\":[\"A\",\"B\",\"C\",\"D\"],\"ans\":0,\"exp\":\"...\"},{\"type\":\"ordering\",\"q\":\"...\",\"items\":[\"B\",\"A\",\"D\",\"C\"],\"correctOrder\":[1,0,3,2],\"opts\":[\"1.\",\"2.\",\"3.\",\"4.\"],\"ans\":0,\"exp\":\"...\"}]}",
  multiple_choice: "Generate multiple choice questions with 4 options (A/B/C/D), correct answer index, and explanation.\n\nCRITICAL FOR MATH/SCIENCE:\n- Solve every calculation step by step BEFORE writing\n- Verify the correct answer is at the specified ans index\n\n{\"questions\":[{\"type\":\"multiple_choice\",\"q\":\"Question text\",\"opts\":[\"Option A\",\"Option B\",\"Option C\",\"Option D\"],\"ans\":0,\"exp\":\"Explanation\"}]}",
}

function getK12TypeSchema(type: string, language: string): string {
  if (type === 'true_false') {
    // Tek istisna: bu şablon ${language} enterpole ediyor, bu yüzden tam
    // statik değil — ama (type, language) ikilisi sabitse yine cache'e
    // uygun kalır (aynı dil için tekrar tekrar aynı metin üretilir).
    return "Generate true/false questions with reasoning. ans:0 means True, ans:1 means False. opts must always be [\"True\",\"False\"] but translated to ${language}.\n\n{\"questions\":[{\"type\":\"true_false\",\"q\":\"Photosynthesis only occurs during daytime.\",\"opts\":[\"True\",\"False\"],\"ans\":0,\"exp\":\"Photosynthesis requires light energy so it occurs during daytime.\"}]}"
  }
  return K12_STATIC_TYPE_SCHEMAS[type] || K12_STATIC_TYPE_SCHEMAS['multiple_choice']
}

// Bu, system dizisinde cache_control ile işaretlenip gönderilecek TEK,
// BİRLEŞİK statik metin. type+language değişmediği sürece BİREBİR AYNI
// metni üretir — cache hit'in gerçekleşmesi için bu şart.
function getStaticSystemBlock(type: string, language: string): string {
  return `${K12_STATIC_INTRO}\n\n${K12_STATIC_ISTISNA_BLOCK}\n\n${K12_STATIC_DOGRULUK_KURALLARI}\n\n${K12_STATIC_JSON_ONLY_NOTE}\n\n${getK12TypeSchema(type, language)}${misconceptionMetadataInstruction(type)}`
}

// buildPrompt()'un ÜRETTİĞİ TAM metinden yukarıdaki statik alt-dizeleri
// çıkarır — buildPrompt()'un kendi iç mantığına HİÇ dokunulmadı (regresyon
// riski sıfır), sadece çıktısı post-process ediliyor. Üniversite yolu için
// çağrılmaz (isUniversity kontrolü çağıran tarafta yapılır).
function stripStaticPartsForCaching(fullPrompt: string, type: string, language: string): string {
  let result = fullPrompt
  result = result.replace("Sen Türkiye Milli Eğitim Bakanlığı (MEB) müfredatına göre soru üreten bir eğitim asistanısın.\n\nKESİN KURAL: Yalnızca MEB müfredatında yer alan konularda, MEB kazanımlarına uygun sorular üret. Müfredat dışı, spekülatif veya tartışmalı içerik kesinlikle üretme.", '')
  result = result.replace("🚫 ÖNEMLİ İSTİSNA 1: Eğer bu metin bir MÜFREDAT KAZANIM KODU LİSTESİYSE (örn. \"SB.6.4.1. ... a) ... b) ...\" formatında, öğretmene yönelik öğrenme çıktısı tanımları içeriyorsa) — ASLA \"hangi kazanımın hangi alt maddesi X der\" gibi kod/madde numarasına dayalı sorular ÜRETME. Bunun yerine, o kazanımın işaret ettiği GERÇEK KONUYU (örn. \"vatandaşlık haklarının kullanımında dijitalleşme etkileri\" kazanımından yola çıkarak, dijital vatandaşlık kavramının kendisi hakkında) öğrenciye anlamlı bir içerik sorusu sor. Öğrenci kazanım kodlarını asla görmemeli ve bunlar hakkında sorgulanmamalı. KRİTİK SINIR: kazanım metni kısa/yetersiz olsa bile, ASLA kendi genel bilgine dayanarak BAŞKA, İSİMLENDİRİLMİŞ bir tarihi metne/esere/konuşmaya (ör. Gençliğe Hitabesi, İstiklal Marşı, Nutuk, belirli bir yazarın belirli bir eseri) atlama ve o metinden alıntı/soru üretme — BU METİNLER SANA VERİLMEDİYSE ONLAR HAKKINDA SORU ÜRETMEK KESİNLİKLE YASAK, kazanımla ne kadar tematik olarak yakın görünürse görünsün. Bunun yerine SADECE kazanımın kendi tanımladığı KAVRAM/BECERİ üzerinden, somut ama İSİMSİZ bir senaryo/örnek kurgula (ör. \"Bir yerleşim biriminde alınan bir kararı etkileyen unsurları düşünelim...\" gibi, gerçek bir kişi/eser/tarihi olaya atıfta bulunmayan, kendi kurguladığın bir örnek). SOMUT ÖRNEK — YANLIŞ: kazanım \"toplumsal düzenin sürdürülmesinde temel hak ve sorumlulukların önemi\" iken \"Gençliğe Hitabesi'nde Atatürk'ün ... ifadesi hangi tutumu hedeflemiştir?\" gibi bir soru üretmek (kazanımla ilgisi olmayan, sana verilmeyen bir kaynağa kaçış). DOĞRU: aynı kazanım için \"Bir toplumda bireylerin hem haklarını kullanıp hem sorumluluklarını yerine getirmesi, toplumsal düzenin sürdürülmesi açısından neden önemlidir?\" gibi kazanımın kendi kavramına sadık, kurgusal bir soru.\n\n🚫 ÖNEMLİ İSTİSNA 2: Bu metin gerçek bir sınav kitapçığı/soru bankası çıktısı olabilir ve bu tür kaynaklarda \"Soru 39'da verilen örneğe göre...\", \"38 ve 39. soruları aşağıdaki bilgiye göre cevaplayınız\" gibi BAŞKA numaralı bir soruya/örneğe atıfta bulunan, çok parçalı bir soru zincirinin sadece bir kısmı yer alabilir. Metinde böyle bir referans görürsen o referansı asla olduğu gibi kopyalama — ya atıf yaptığı bilgiyi/örneği (metinde başka bir yerde varsa) bulup doğrudan senin ürettiğin sorunun metnine dahil et, ya da metindeki tamamen bağımsız (başka soruya atıf yapmayan) başka bir örnek/kavram kullan. Öğrenci SADECE senin ürettiğin tek soruyu görecek; \"yukarıda\", \"az önce\", \"Soru X'te\" dediğin hiçbir şey öğrenciye ayrıca gösterilmeyecek.\n\n🚫 ÖNEMLİ İSTİSNA 3: Kaynak metinde İSTATİSTİK, ANKET SONUCU, TABLO veya SAYISAL VERİ (ör. \"kişiler günde ortalama 6 saat TV izliyor, 1 dakika kitap okuyor\" gibi) varsa ve bu veriye dayalı bir soru üretmek istiyorsan, \"metinde verilen istatistiklere göre\" gibi bir ifadeyle veriye SADECE ATIFTA BULUNMA — o veriyi/sayıları/istatistikleri DOĞRUDAN sorunun kendi metnine TAŞI. Öğrenci o istatistiği görmeden soruyu cevaplayamaz. SOMUT ÖRNEK — YANLIŞ: \"Metinde verilen istatistiklere göre, Türkiye'de bir kişi günde kitap okumaya ayrılan zaman ile TV izlemeye ayrılan zaman arasında kaç saat fark vardır?\" (sayılar hiç verilmemiş, cevaplanamaz). DOĞRU: \"Yapılan bir araştırmaya göre Türkiye'de bir kişi günde ortalama 6 saat televizyon izlerken, kitap okumaya sadece 1 dakika ayırmaktadır. Bu bilgiye göre, TV izlemeye ayrılan süre kitap okumaya ayrılan süreden kaç saat fazladır?\" (gerekli sayılar sorunun içinde). Aynı kural, metinde geçen alıntılanmış CÜMLELER/CEVAPLAR için de geçerlidir — \"metinde sıralanan cevaplara göre\" demek yerine, o cevapları/alıntıları KISACA sorunun içine al.", '')
  // DOĞRULUK KURALLARI: içindeki ${grade} (10. madde) yüzünden sabit
  // .replace() kullanılamıyor — regex ile ARADAKİ değeri (hangi sınıf
  // seviyesi olursa olsun) atlayarak çıkarıyoruz.
  const dkRegex = new RegExp(escapeRegExp(K12_DK_STRIP_BEFORE_GRADE) + '[^\\n]*?' + escapeRegExp(K12_DK_STRIP_AFTER_GRADE))
  result = result.replace(dkRegex, '')
  result = result.replace(K12_STATIC_JSON_ONLY_NOTE, '')
  result = result.replace(getK12TypeSchema(type, language), '')
  result = result.replace(misconceptionMetadataInstruction(type), '')
  // Ardışık boş satırların birikmesini temizle (kozmetik, token'ı da azaltır)
  result = result.replace(/\n{3,}/g, '\n\n').trim()
  return result
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
    console.warn(`[content-filter-reject] stage=${stage} reason="${reason}" question_length=${String(q.q || '').length}`)
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

  // 11 Eylül 2026 — gerçek öğrenci bildirimi: soru "altı çizili sözcük"
  // diyordu fakat q alanında hangi sözcüğün vurgulandığını gösteren hiçbir
  // işaret yoktu. HTML/Markdown biçimlendirmesi model çıktısından UI'ya
  // güvenilir taşınmadığı için tek desteklenen gösterim [köşeli parantez].
  // Referans var ama işaret yoksa soru birden fazla şekilde yorumlanabilir;
  // öğrenciye ulaşmadan elenir ve aşağıdaki top-up akışı yerine yenisini üretir.
  const invisibleEmphasisPattern = /alt[ıi] (çizili|cizili)|vurgulan(an|mış|mis)|underlined|highlighted/i
  result = result.filter((q: any) => {
    const text = String(q.q || '')
    const hasVisibleTarget = /\[[^\]\n]{1,120}\]/.test(text)
    const flagged = invisibleEmphasisPattern.test(text) && !hasVisibleTarget
    if (flagged) logRejected('invisible-emphasis', q, 'vurgulanan/altı çizili hedef görünür biçimde işaretlenmemiş')
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

// Tek bir görsel zinciri (üretim + doğrulama, gerekirse kesilme sonrası
// yeniden deneme + tekrar doğrulama) teorik en kötü durumda birkaç ardışık
// OpenAI çağrısı yapabilir. withTimeout, bu zincirlerden biri askıda kalırsa
// tüm isteğin (maxDuration=120s) onunla birlikte boğulmasını engeller —
// zaman aşımında görsel sessizce atlanır, test yine tam teslim edilir.
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      () => { clearTimeout(timer); resolve(fallback) },
    )
  })
}

// 16 Eylül 2026 — token bütçeleri yükselince tek bir generateVisualForQuestion
// çağrısının gerçekçi en kötü süresi (üretim + kesilme sonrası yeniden deneme
// + doğrulama) sabit 45sn'lik eski üst sınırı aşabiliyordu; üstüne bu
// fonksiyon o çağrıyı yeniden BAŞTAN bir kez daha deniyordu (2×45sn=90sn).
// Sabit bir süre yerine artık ÇAĞIRANIN o an isteğin 120sn'lik bütçesinden
// GERÇEKTEN ne kadar kaldığını hesaplayıp verdiği payı kullanıyoruz — böylece
// tek bir görsel zinciri, kalan süreden fazlasını asla harcayamaz.
async function generateVisualWithRetry(q: any, category: string, topic: string, grade: string, maxMs: number): Promise<{ svg: string; contextQuality: VisualContextQuality } | null> {
  return withTimeout((async () => {
    const first = await generateVisualForQuestion(q, category, topic, grade)
    if (first) return first
    return generateVisualForQuestion(q, category, topic, grade)
  })(), maxMs, null)
}

async function loadAnonymousBookletContext(subject: string, grade: string, topic: string): Promise<string> {
  const { data, error } = await supabase.from('exam_resources')
    .select('raw_text,subject,grade,topic,subtopic')
    .eq('purpose', 'instant_test')
    .eq('source_type', 'anonymous')
    .neq('review_status', 'rejected')
    .limit(12)
  if (error || !data?.length) return ''
  const subjectKey = normalizeTR(subject)
  const gradeKey = normalizeTR(grade)
  const topicKey = normalizeTR(topic)
  const matches = data.filter((row: any) => {
    const rowSubject = normalizeTR(String(row.subject || ''))
    const rowGrade = normalizeTR(String(row.grade || ''))
    const rowTopic = normalizeTR(String(row.topic || row.subtopic || ''))
    return (!rowSubject || rowSubject.includes(subjectKey) || subjectKey.includes(rowSubject))
      && (!rowGrade || gradeKey.includes(rowGrade) || rowGrade.includes(gradeKey))
      && (!rowTopic || rowTopic.includes(topicKey) || topicKey.includes(rowTopic))
  }).slice(0, 2)
  if (!matches.length) return ''
  return `\n\nANONİM SORU KİTAPÇIĞI REFERANSI — KOPYALAMA YASAK:\n${matches.map((row: any) => String(row.raw_text || '').slice(0, 2500)).join('\n---\n')}\nBu kaynak yalnızca ölçülen kavram, soru mantığı ve zorluk seviyesini anlamak içindir. Kaynaktaki soru cümlesini, sayıları, özel isimleri, seçenekleri veya kurguyu aynen kullanma. Öğrencinin karşısına tamamen yeni fakat aynı kazanımı ölçen benzer bir soru çıkar.`
}

// Model/provider çıktısı UI'ya ulaşmadan önce soru tiplerinin zorunlu alanlarını
// tek biçime getirir. Prompt talimatları tek başına şema garantisi değildir;
// özellikle true_false sorularında opts'un atlanması sonuç ekranını çökertebilir.
function normalizeInteractiveQuestionShape(q: any, language: string): any {
  const normalized = { ...q }
  if (normalized.type === 'true_false' && (!Array.isArray(normalized.opts) || normalized.opts.length < 2)) {
    const lang = String(language || '').toLocaleLowerCase('tr')
    normalized.opts = lang.includes('türk') ? ['Doğru', 'Yanlış'] : ['True', 'False']
  }
  if (normalized.type === 'ordering') {
    const items = Array.isArray(normalized.items) && normalized.items.length >= 2
      ? normalized.items.map(String)
      : Array.isArray(normalized.opts) && normalized.opts.length >= 2
        ? normalized.opts.map(String)
        : []
    normalized.items = items
    const order = Array.isArray(normalized.correctOrder) ? normalized.correctOrder.map(Number) : []
    const isPermutation = order.length === items.length
      && new Set(order).size === items.length
      && order.every((index: number) => Number.isInteger(index) && index >= 0 && index < items.length)
    normalized.correctOrder = isPermutation ? order : items.map((_: string, index: number) => index)
  }
  if (!Array.isArray(normalized.opts)) normalized.opts = []
  return normalized
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
      console.warn(`[content-filter-reject] stage=near-duplicate reason="daha önce sorulan bir soruyla yüksek kelime örtüşümü" question_length=${String(q.q || '').length}`)
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
  // 4 Eylül 2026 — Deniz'in bulduğu sorun: soru üretimi artık %30 kaynağa
  // dayalı / %70 genel-bilgi karışımı üretiyor (bkz. KAYNAK KULLANIM ORANI
  // kuralı), ama bu fonksiyon hâlâ SADECE kelime-örtüşümüne bakıyordu —
  // genel-bilgi soruları bile konu kelimelerini (ör. "kuvvet", "dinamometre")
  // paylaştığı için YANLIŞLIKLA kaynağa-dayalı sayılıp hepsine aynı pasaj
  // ekleniyordu (gerçek test: 10 sorunun 10'u da pasaj aldı, oysa ~4'ü
  // tanımsal/genel bilgi sorusuydu). Artık AI'ın kendi ürettiği açık etiket
  // (sourceBased: true/false — bkz. mebSection promptu) ÖNCELİKLİ: etiket
  // varsa ona güvenilir, YOKSA (topup'ın bazı yolları, GPT-4o fallback JSON
  // şeması bu alanı içermeyebilir, ya da eski/legacy sorular) eski kelime-
  // örtüşümü sezgisi yedek olarak devreye girer.
  if (typeof q.sourceBased === 'boolean') return q.sourceBased
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
  // 5 Eylül 2026 — GPT-4.1-mini pilotu: bu istekte ana üretim için hangi
  // motor kullanıldı (quiz_sessions.gen_engine'e yazılacak, kalite/maliyet
  // karşılaştırması için). Varsayılan 'claude-sonnet' — kontrol varyantı
  // seçilirse ya da erken bir hata ile karşılaşılırsa bu güvenli varsayılan.
  let genEngineUsed = 'claude-sonnet'
  let usageUserId: string | undefined
  let usageRequestId: string | undefined
  let usageSessionId: string | undefined
  let experimentBucket: number | null = null
  let experimentVariant: 'gpt-4.1-mini' | 'mistral-live' | 'claude-hard-difficulty' | 'control' | null = null
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
    usageUserId = user.id

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, monthly_test_count, daily_test_count, daily_test_date, grade, language, department, priority_subjects, is_admin')
      .eq('id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const body = await req.json()
    const isDailyChallengeRequest = body?.dailyChallenge === true
    // 21 Eylül 2026 — Deniz'in isteğiyle: gerçek öğrenci trafiğine hiç
    // dokunmadan üç sağlayıcının (Mistral/GPT-4.1-mini/Claude) çıktısını
    // gözle kontrol edebilmesi için admin-only bir test anahtarı. SADECE
    // profiles.is_admin=true olan hesap body.forceProvider:'mistral'|
    // 'openai'|'claude' gönderirse etkili olur; başka hiçbir kullanıcı/istek
    // bunu tetikleyemez ve deneyin kovasını (dolayısıyla gerçek A/B
    // istatistiklerini) etkilemez — bkz. aşağıda genEngineUsed
    // '...-admin-test' ile ayrı etiketleniyor, experimentVariant her zaman
    // null kalıyor. body.forceMistralTest:true eski/geriye-dönük biçim,
    // hâlâ 'mistral' zorlamasına denk gelir.
    const rawForceProvider = typeof body?.forceProvider === 'string' ? body.forceProvider : null
    const forceProviderTest: 'mistral' | 'openai' | 'claude' | null =
      profile.is_admin === true && (rawForceProvider === 'mistral' || rawForceProvider === 'openai' || rawForceProvider === 'claude')
        ? rawForceProvider
        : (body?.forceMistralTest === true && profile.is_admin === true ? 'mistral' : null)
    const forcedMistral = forceProviderTest === 'mistral'
    const forcedOpenAI = forceProviderTest === 'openai'
    const forcedClaude = forceProviderTest === 'claude'

    const plan = profile.plan || 'free'
    const today = new Date().toISOString().split('T')[0]

    // Premium ve Unlimited planlarda HİÇBİR soru/test sınırı yok — sadece
    // freemium/silver için günlük/aylık limit uygulanır.
    if (!isDailyChallengeRequest && plan !== 'premium' && plan !== 'unlimited') {
      // 6 Eylül 2026 — Deniz'in talebiyle: "free" plan artık YENİ kayıtlara
      // verilmiyor (bkz. profiles.plan kolon varsayılanı artık 'none').
      // Mevcut 'free' kullanıcılar dokunulmadan eski haklarında (10/gün,
      // 10/ay) kalıyor. Yeni kayıtlar 'none' ile başlıyor — bu, bir plan
      // SATIN ALINANA kadar 0 test hakkı demek (aşağıdaki DAILY_LIMIT/
      // MONTHLY_LIMIT tablosunda 'none' yok, bu yüzden ?? 0 varsayılanına
      // düşer — eski `?? 10` YANLIŞ bir güvenlik açığıydı, yeni kullanıcı
      // hiç ödeme yapmadan sınırsız gibi 10 hak alıyordu; şimdi düzeltildi).
      // 'silver' (Gümüş, 2490 TL/yıl) ise yeni, ücretli giriş planı: 30/ay.
      const DAILY_LIMIT: Record<string, number> = { free: 10, silver: 10 }
      const dailyLimit = DAILY_LIMIT[plan] ?? 0
      const dailyCount = profile.daily_test_date === today ? (profile.daily_test_count || 0) : 0
      if (dailyCount >= dailyLimit) {
        return NextResponse.json({ error: 'daily_limit_reached' }, { status: 429 })
      }

      const MONTHLY_LIMIT: Record<string, number> = { free: 10, silver: 30 }
      const monthlyLimit = MONTHLY_LIMIT[plan] ?? 0
      if ((profile.monthly_test_count || 0) >= monthlyLimit) {
        return NextResponse.json({ error: 'limit_reached' }, { status: 429 })
      }
    }

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
      adaptiveSupport,
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

    const MAX_QCOUNT: Record<string, number> = { free: 5, silver: 10, premium: 20, unlimited: 20 }
    const maxQ = MAX_QCOUNT[plan] ?? 0
    const safeQCount = isDailyChallengeRequest ? Math.min(questionCount, 10) : Math.min(questionCount, maxQ)
    usageRequestId = crypto.randomUUID()
    // Yeni oturumun kimliği üretimden önce bilinir; böylece AI maliyet kaydı
    // kullanıcı ve oturumla atomik olmayan bir sonradan eşleştirmeye ihtiyaç duymaz.
    usageSessionId = continueSessionId ? undefined : crypto.randomUUID()

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
    const supportLevel = continueSessionId && adaptivePolicy?.focus !== 'standard' && ['none', 'hint', 'scaffold'].includes(adaptiveSupport)
      ? adaptiveSupport as 'none' | 'hint' | 'scaffold'
      : 'none'
    const adaptiveHint = supportLevel === 'scaffold'
      ? adaptivePolicy?.focus === 'prerequisite'
        ? 'Önce bu sorunun dayandığı temel kuralı hatırla; verilenleri o kurala göre sırala.'
        : 'Soruyu küçük adımlara ayır: verilenleri belirle, gereken işlemi seç, sonra sonucu kontrol et.'
      : supportLevel === 'hint'
        ? 'Sorudaki anahtar bilgiyi bul ve senden istenenle ilişkilendir.'
        : null
    const topicMastery = await getTopicMastery(supabase, user.id, topic).catch(() => null)
    const diagnosticStrategy = resolveDiagnosticQuestionStrategy(
      topicMastery,
      safeQCount,
      Boolean(continueSessionId),
    )
    let resolvedDifficulty = difficulty
    if (difficulty === 'auto') {
      // 19 Eylül 2026 — Deniz'in isteği: sabit "10 soruluk genel test" yerine,
      // kayıt sonrası hızlı öz-bildirim (bkz. components/PrioritySetupModal.tsx)
      // bu dersin gerçek mastery kanıtı yokken başlangıç zorluğu için bir
      // TOHUM sağlıyor. Gerçek kanıt (topicMastery) her zaman önceliklidir —
      // bu sadece "hiç veri yok" durumunda nötr 'normal' yerine kullanılan
      // daha isabetli bir varsayılan. diagnosticStrategy zaten "kanıt yok"
      // olarak davranmaya devam ediyor, yani öz-bildirim yanlış çıksa bile
      // ilk birkaç soruda gerçek cevaplara göre kendini düzeltir.
      const prioritySeed = topicMastery
        ? null
        : seedScoreForSubject(parsePrioritySubjects(profile.priority_subjects), subject)
      resolvedDifficulty = adaptivePolicy?.startingDifficulty
        || startingDifficultyFromMastery(topicMastery?.masteryScore ?? prioritySeed)
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
    const recentQuestionTexts: string[] = []
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
            if (recentQuestionTexts.length < 100) recentQuestionTexts.push(q.q)
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
            if (typeof t === 'string' && recentQuestionTexts.length < 100) recentQuestionTexts.push(t)
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
        Promise.resolve(topicMastery),
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

    const anonymousBookletContext = !fileContent
      ? await loadAnonymousBookletContext(subject, grade, topic).catch(() => '')
      : ''
    const isUniversityLevel = level === 'universite'
    const objectiveCandidates = await loadCanonicalObjectiveCandidates(supabase, {
      subject, grade, topic,
    }).catch(error => {
      console.warn('[generate-quiz] canonical objective candidates unavailable:', error?.message || 'unknown')
      return []
    })
    const objectiveInstruction = learningObjectivePrompt(objectiveCandidates)

    // Question Bank v1: only a complete, server-approved set bypasses AI.
    // Uploaded/source passages, university content, daily challenges and
    // adaptive continuation remain on their existing generation paths.
    // 21 Eylül 2026 — Deniz'in bulduğu hata: admin AI kalite testi (forceProvider)
    // aynı konu/sınıf/zorluk için banka zaten doluysa (ki test amacıyla aynı
    // konuyu tekrar tekrar üretince hemen doluyor) AI'ı HİÇ ÇAĞIRMADAN direkt
    // bankadan dönüyordu — üç sağlayıcı da aslında aynı bankadaki soruları
    // gösteriyordu. Zorlamalı testlerde bankayı tamamen devre dışı bırakıyoruz
    // ki gerçekten o sağlayıcının o anki çıktısı görülsün.
    const bankEligible = !fileContent && !continueSessionId && !dailyChallenge && !isUniversityLevel && !forcedMistral && !forcedOpenAI && !forcedClaude
    let bankQuestions: any[] = []
    if (bankEligible) {
<<<<<<< HEAD
      bankQuestions = await getQuestionBankSet(supabase, {
        subject, topic, grade, language: effectiveLang,
        questionType, difficulty: resolvedDifficulty,
      }, safeQCount, recentQuestionTexts)

      // Eski havuzda "onaylı" olmak, bilişsel derinliğin bugünkü eşiğini
      // karşıladığı anlamına gelmiyor. Temel/ezber düzeyindeki eski soruları
      // sessizce tam test olarak sunmak yerine ayır; aşağıdaki hibrit akış
      // eksik kısmı yeni ve daha güçlü kurallarla tamamlasın.
      const measuredBankQuestions = attachQuestionRigorMetadata(bankQuestions)
      const initialBankRigor = summarizeQuestionSetRigor(measuredBankQuestions, resolvedDifficulty)
      const missingReasoningSlots = Math.max(0, initialBankRigor.targetReasoningCount - initialBankRigor.reasoningCount)
      const replaceForReasoning = new Set(
        measuredBankQuestions
          .map((question, index) => ({ question, index }))
          .filter(({ question }) => question.qualityCognitiveLevel !== 'muhakeme')
          .sort((a, b) => Number(a.question.qualityRigorScore || 0) - Number(b.question.qualityRigorScore || 0))
          .slice(0, missingReasoningSlots)
          .map(({ index }) => index),
      )
      const rejectedBasicBankCount = measuredBankQuestions.filter(question => question.qualityCognitiveLevel === 'temel').length
      bankQuestions = measuredBankQuestions.filter((question, index) => question.qualityCognitiveLevel !== 'temel' && !replaceForReasoning.has(index))
      if (rejectedBasicBankCount > 0 || replaceForReasoning.size > 0) {
        console.warn(`[question-rigor] bank_basic_rejected=${rejectedBasicBankCount} bank_reasoning_replacements=${replaceForReasoning.size} topic=${topic}`)
      }

      if (bankQuestions.length === safeQCount && usageSessionId) {
        const bankRigorSummary = summarizeQuestionSetRigor(bankQuestions, resolvedDifficulty)
        const mappedCount = bankQuestions.filter((question: any) => question?.objectiveMappingStatus === 'mapped').length
=======
      bankQuestions = await getQuestionBankSet(supabase, {
        subject, topic, grade, language: effectiveLang,
        questionType, difficulty: resolvedDifficulty,
      }, safeQCount, recentQuestionTexts)

      // 23 Eylül 2026 — Deniz'in bulduğu hata: "tam vuruş" (bankQuestions.length
      // === safeQCount) durumunda aşağıdaki blok direkt döndüğü için AI/görsel
      // üretimi HİÇ tetiklenmiyordu. lib/question-bank.ts'teki eski hasVisual()
      // anahtar-kelime hatası yüzünden bazı konularda (ör. "Harita bilgisi")
      // havuzdaki eşleşen tüm sorular yanlışlıkla "görsel" sayılıyordu — o hata
      // artık düzeltildi (hasRealVisualAsset), ama düzeltme tek başına yeterli
      // değil: onunla dürüstleşen havuz artık bu konularda GERÇEKTEN 0 görsel
      // taşıdığını doğru bildirecek, ama tam-vuruş yolu bunu hiç sormadan yine
      // de anında dönerdi. Bu yüzden tam vuruşu kabul etmeden önce hedeflenen
      // görsel oranını (selectWithVisualQuota'daki aynı oran) gerçek varlığa
      // göre kontrol ediyoruz; yetersizse havuzdan o kadar görselsiz soru
      // çıkarıp yerini aşağıda zaten var olan kısmi-vuruş + AI tamamlama
      // yoluna (aiQuestionCount) bırakıyoruz — yeni bir mekanizma değil, var
      // olanın artık doğru koşulda devreye girmesi.
      const bankVisualCategory = detectVisualCategory(topic)
      if (bankQuestions.length === safeQCount && bankVisualCategory) {
        const targetVisualRatio = isNewGenerationRequest(topic) ? 0.5 : 0.3
        const neededReal = Math.max(1, Math.ceil(safeQCount * targetVisualRatio))
        const realCount = bankQuestions.filter(hasRealVisualAsset).length
        const deficit = Math.max(0, neededReal - realCount)
        if (deficit > 0) {
          let removed = 0
          bankQuestions = bankQuestions.filter((question: any) => {
            if (removed < deficit && !hasRealVisualAsset(question)) { removed++; return false }
            return true
          })
          console.log(`[question-bank] konu="${topic}" gerçek görsel oranı yetersiz (real=${realCount}, hedef=${neededReal}); ${removed} görselsiz soru çıkarılıp AI tamamlamasına bırakıldı`)
        }
      }

      if (bankQuestions.length === safeQCount && usageSessionId) {
        const mappedCount = bankQuestions.filter((question: any) => question?.objectiveMappingStatus === 'mapped').length
>>>>>>> gorsel-havuz-duzeltmesi
        const { data: bankSession, error: bankSessionError } = await supabase
          .from('quiz_sessions')
          .insert({
            id: usageSessionId,
            user_id: user.id,
            topic,
            grade,
            language: effectiveLang,
            question_count: bankQuestions.length,
            questions: bankQuestions,
            answers: [],
            score: 0,
            completed: false,
            question_type: questionType,
            gen_engine: 'question-bank-v1',
            gen_request_id: usageRequestId,
            objective_mapping_version: 'v1',
            objective_candidate_count: objectiveCandidates.length,
            objective_mapped_count: mappedCount,
            curriculum_version_id: objectiveCandidates[0]?.curriculumVersionId || null,
            objective_candidate_basis: objectiveCandidates[0]?.matchBasis || null,
          })
          .select('id')
          .maybeSingle()

        if (!bankSessionError && bankSession?.id) {
          await supabase.from('profiles').update({
            monthly_test_count: (profile.monthly_test_count || 0) + 1,
          }).eq('id', user.id)
          after(async () => { await supabase.from('question_bank_events').insert({ request_id: usageRequestId, user_id: user.id, quiz_session_id: bankSession.id, subject_key: questionBankKey(subject || 'genel'), topic_key: questionBankKey(topic), grade_key: questionBankKey(grade), requested_count: safeQCount, bank_count: bankQuestions.length, ai_count: 0, outcome: 'full' }) })
          console.log(`[question-bank] HIT topic=${topic} count=${bankQuestions.length}`)
          return NextResponse.json({
            questions: bankQuestions,
            sessionId: bankSession.id,
            resolvedDifficulty,
            source: 'question-bank',
            qualitySummary: bankRigorSummary,
            adaptivePolicy: adaptivePolicy || undefined,
            diagnosticStrategy,
          })
        }
        console.warn(`[question-bank] session insert failed code=${bankSessionError?.code || 'unknown'}`)
      }
    }
    const aiQuestionCount = Math.max(0, safeQCount - bankQuestions.length)
    // chartDataInstruction: yalnızca math_graph'ta ek talimat üretir (bkz.
    // fonksiyon tanımı) — burada erken hesaplamak için detectVisualCategory
    // tekrar çağrılıyor (saf/yan etkisiz fonksiyon, aşağıda zaten tekrar
    // çağrılacak — maliyeti sıfıra yakın, kod tekrarını önlemek riskli olurdu).
    const fullPrompt = buildPrompt(questionType, topic, grade, resolvedDifficulty, effectiveLang, aiQuestionCount, fileContent || '', gradeContext, mebContext, profile.department || undefined, subject)
      + visualPedagogyInstruction(topic, aiQuestionCount)
      + chartDataInstruction(detectVisualCategory(topic))

    // 5 Eylül 2026 — P0 prompt caching (bkz. K12_STATIC_* tanımları ve
    // getStaticSystemBlock/stripStaticPartsForCaching yukarıda). Sadece K12/
    // MEB yolu için: statik talimat bloğu (DOĞRULUK KURALLARI + İSTİSNA 1-3 +
    // tip şeması + kavram yanılgısı kuralı) artık `system` dizisinde AYRI,
    // cache_control ile işaretli bir blok olarak gönderiliyor; dinamik kısım
    // (konu/kaynak/oran metni) çok daha küçük bir user mesajı olarak kalıyor.
    // Üniversite yolu DEĞİŞTİRİLMEDİ (department-özel intro tam statik değil,
    // ayrıca gerçek kullanım verisi zaten tamamen K12 ağırlıklı olduğu için
    // bu, riski düşürüp faydanın neredeyse tamamını yakalıyor).
    const dynamicPrompt = isUniversityLevel
      ? fullPrompt
      : stripStaticPartsForCaching(fullPrompt, questionType, effectiveLang)

    const prompt = dynamicPrompt
      + (adaptivePolicy?.promptContext || '')
      + diagnosticStrategy.promptContext
      + (isUniversityLevel ? misconceptionMetadataInstruction(questionType) : '') // K12'de artık statik blokta
      + objectiveInstruction
      + anonymousBookletContext
      + previousQuestionsNote
    promptStr = fullPrompt + (adaptivePolicy?.promptContext || '') + diagnosticStrategy.promptContext + misconceptionMetadataInstruction(questionType) + objectiveInstruction + anonymousBookletContext + previousQuestionsNote // fallback için TAM metin saklanır
    countRef = aiQuestionCount

    // Hız optimizasyonu: az soru → Haiku (3x hızlı), çok soru → Sonnet
    // Kısmi havuz eşleşmesinde kısa kalan AI üretimi, öğrencinin testinin
    // eksik kaydedilmesine yol açabiliyordu. Hibrit setlerde daha güvenilir
    // Sonnet yolu kullanılır; Haiku yalnızca tamamen AI ile üretilen kısa
    // setlerde hız avantajı için tercih edilir.
    const useHaiku = aiQuestionCount <= 7 && bankQuestions.length === 0

    // 5 Eylül 2026 — Deniz'in talebiyle: KÜÇÜK, KONTROLLÜ bir pilot.
    // "Ana üretimi (en yüksek hacim, en yüksek tasarruf potansiyeli)
    // GPT-4.1-mini'ye geçirip bir hafta gerçek veriyle karşılaştıralım,
    // topup'a hiç dokunmadan." Bu yüzden:
    //  - SADECE ana üretim çağrısı (bu blok) etkileniyor — topup (aşağıda,
    //    ayrı bir bölüm) tamamen dokunulmadan Sonnet'te kalıyor.
    //  - SADECE K12/MEB yolu (üniversite hariç — orada sourceBased/statik
    //    blok mimarisi yok, pilot için hazır değil).
    //  - Rastgele bir YÜZDE (varsayılan %30 — GPT_PILOT_FRACTION ile
    //    ayarlanabilir, env değişkenine gerek yok, kod içinde sabit) Claude
    //    yerine GPT-4.1-mini kullanıyor; kalanı mevcut davranışta (Haiku/
    //    Sonnet) kalıyor — böylece AYNI hafta içinde HER İKİ motorun da
    //    gerçek verisi birikip doğrudan karşılaştırılabiliyor (A/B).
    //  - Hangi motorun kullanıldığı hem ai_usage_logs'a (operation etiketi
    //    farklı: 'generate-quiz' vs 'generate-quiz:pilot-gpt41mini') hem de
    //    quiz_sessions.gen_engine sütununa (bkz. aşağıda insert) kaydediliyor
    //    — bir hafta sonra hem MALİYET hem KALİTE (skor, tamamlanma oranı,
    //    topup'a düşme sıklığı) karşılaştırması yapılabilsin diye.
    // 21 Eylül 2026 — Deniz'in talebiyle: GPT-4.1-mini artık %30'luk bir A/B
    // dilimi değil, "gövde" (varsayılan) motor. Bugünkü geniş admin-test
    // karşılaştırmasında GPT-4.1-mini 11/11 konuda hatasız tamamladı, en
    // hızlı ve en ucuzdu; Claude ise aynı taramada %36 oranında görünür
    // şekilde başarısız oldu (bkz. yukarıdaki Anthropic timeout düzeltmesi)
    // ve ~7 kat daha pahalıydı. Varsayılan artık %100 — GPT_PILOT_FRACTION
    // env değişkeniyle Vercel'de anında (redeploy gerekmeden) düşürülebilir,
    // tıpkı MISTRAL_LIVE_FRACTION'daki güvenlik supabı gibi.
    const providerPolicy = getQuizProviderPolicy()
    // 21 Eylül 2026 — Deniz'in talebiyle: Mistral'i CANLI (gölge değil) bir
    // pilot olarak devreye al. Varsayılan %0 — MISTRAL_LIVE_FRACTION Vercel'de
    // açıkça ayarlanmadan davranış değişmez (Mistral hesabında sadece $10
    // kredi var, auto-recharge kapalı; agresif bir varsayılanla başlamak
    // riskli olur). MistralAdapter.execute() hata fırlatırsa (yanlış/eksik
    // anahtar, HTTP hatası) bu istek diğer motorlardaki gibi aşağıdaki genel
    // catch bloğuna düşer ve mevcut GPT-4o fallback'i devreye girer — yani
    // Mistral'in başarısız olması öğrenciye asla 500 döndürmez.
    // Kullanıcıyı deney boyunca aynı grupta tutan deterministik FNV-1a kovası.
    // Devam parçaları pilot dışında kalır; yalnızca ilk K12 üretimi ölçülür.
    const experimentKey = `${QUIZ_PROVIDER_POLICY_VERSION}:${user.id}`
    let hash = 2166136261
    for (let i = 0; i < experimentKey.length; i++) {
      hash ^= experimentKey.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    experimentBucket = Math.abs(hash >>> 0) % 10000
    const pilotEligible = !isUniversityLevel && !continueSessionId
    // Kova 0-9999 üzerinde bölünür: önce Mistral dilimi, sonra GPT dilimi,
    // kalanı kontrol (Claude). Böylece üçü de birbirini dışlar.
    // forceProviderTest (yalnızca admin) kovadan bağımsız olarak istenen
    // sağlayıcıyı devreye sokar — gerçek A/B istatistiklerini bozmasın diye
    // experimentVariant her zaman null kalıyor, genEngineUsed ayrı
    // '...-admin-test' etiketiyle işaretleniyor (aşağıda).
    //
    // 21 Eylül 2026 — Deniz'in talebiyle yeniden yapılandırıldı: Claude artık
    // "kalan her şeyin" varsayılanı DEĞİL — sadece zorluk seviyesi zor/çok
    // zor olan istekler için ayrılan özel bir motor. Sıra: admin
    // forceProvider testi > zorluk tabanlı Claude zorunluluğu > Mistral
    // kovası (payı değişmedi) > GPT-4.1-mini (artık varsayılan gövde).
    // Not: difficulty 'auto' iken resolvedDifficulty adaptif politikadan
    // gelir (bkz. yukarıda ~1337. satır) — yani bu kontrol hem öğrencinin
    // elle seçtiği hem sistemin otomatik atadığı zorluk için çalışır.
    const resolvedDifficultyIsHard = resolvedDifficulty === 'zor' || resolvedDifficulty === 'cok zor'
    const isForcedProviderTest = forcedMistral || forcedOpenAI || forcedClaude
    const claudeRequiredForDifficulty = pilotEligible && !isForcedProviderTest && resolvedDifficultyIsHard
    const measuredDecision = decideQuizProvider({ bucket: experimentBucket, hard: resolvedDifficultyIsHard, mistralConfigured: isProviderConfigured('mistral'), policy: providerPolicy })
    const useMistralLive = pilotEligible && !forcedOpenAI && !forcedClaude && (forcedMistral || (!claudeRequiredForDifficulty && measuredDecision === 'mistral'))
    const useGptPilot = pilotEligible && !useMistralLive && !forcedClaude && (forcedOpenAI || (!claudeRequiredForDifficulty && measuredDecision === 'openai'))
    experimentVariant = pilotEligible ? (isForcedProviderTest ? null : (useMistralLive ? 'mistral-live' : useGptPilot ? 'gpt-4.1-mini' : claudeRequiredForDifficulty ? 'claude-hard-difficulty' : 'control')) : null
    genEngineUsed = useMistralLive
      ? (forcedMistral ? 'mistral-admin-test' : 'mistral-large')
      : useGptPilot
        ? (forcedOpenAI ? 'gpt-4.1-mini-admin-test' : 'gpt-4.1-mini')
        : (forcedClaude
            ? (useHaiku ? 'claude-haiku-admin-test' : 'claude-sonnet-admin-test')
            : (claudeRequiredForDifficulty
                ? (useHaiku ? 'claude-haiku-hard-difficulty' : 'claude-sonnet-hard-difficulty')
                : (useHaiku ? 'claude-haiku' : 'claude-sonnet')))

    // 21 Eylül 2026 — Deniz'in bulduğu "Sorular tamamlanamadı" (503
    // incomplete_set) hatasının kök nedeni: ana üretim çağrısının
    // max_tokens'ı qCount'tan BAĞIMSIZ olarak sabitti (2500/3500), oysa
    // topup zaten "missing * 600, taban 2000, tavan 4000" ile ölçekleniyordu
    // (bkz. aşağıdaki topup bloğu ve 29 Ağustos yorumu). qCount=10 gibi
    // yüksek isteklerde 3500 token çoğu zaman JSON'u YARIDA kesiyordu
    // (loglarda doğrulandı: out=3500 tam sınırda, "balanced-brace parser"
    // ile kurtarma, 10 istenip 7-9 soru gelmesi) — bu da topup'u gerekli
    // kılıyor, topup da 95sn'lik zaman bütçesini dolduruyor, sonuç 503.
    // Düzeltme: ana çağrının max_tokens'ı da aynı mantıkla qCount'a göre
    // ölçeklendi, böylece topup'a düşme ihtiyacı kaynağında azalıyor.
    const genMaxTokens = Math.min(6000, Math.max(useHaiku ? 2500 : 3500, aiQuestionCount * 550))

    let text: string
    if (useMistralLive) {
      const mistralAdapter = new MistralAdapter()
      const mistralResponse = await mistralAdapter.execute(
        {
          messages: [
            { role: 'system', content: 'Sen Türkiye Milli Eğitim Bakanlığı (MEB) müfredatına göre soru üreten bir eğitim asistanısın. Yalnızca MEB müfredatındaki konularda soru üret. Müfredat dışı, siyasi, dini tartışma yaratabilecek veya uygunsuz içerik üretme. Her sorunun doğruluğunu teyit et.\n\n' + getStaticSystemBlock(questionType, effectiveLang) },
            { role: 'user', content: prompt },
          ],
          maxTokens: genMaxTokens,
          json: true,
        },
        {
          task: 'quiz_generation',
          userId: user.id,
          sessionId: usageSessionId,
          requestId: usageRequestId,
          operationTag: forcedMistral ? 'generate-quiz:admin-test-mistral' : 'generate-quiz:pilot-mistral',
          shadow: false,
        }
      )
      text = mistralResponse.content
      console.log(`[generate-quiz] ${forcedMistral ? 'ADMIN TEST' : 'LIVE PILOT'} model=mistral (${mistralResponse.model}) qCount=${aiQuestionCount}`)
    } else if (useGptPilot) {
      // 21 Eylül 2026 — 3 sağlayıcılı admin kalite/hız/maliyet karşılaştırması
      // için: callOpenAI kendi içinde durationMs ölçüp logOpenAIUsage'a
      // geçiriyor (bkz. lib/openai.ts), bu yüzden burada ayrıca ölçmeye
      // gerek yok — sadece operation etiketi forced-test'i ayırt ediyor.
      const gptResult = await callOpenAI(
        [
          { role: 'system', content: 'Sen Türkiye Milli Eğitim Bakanlığı (MEB) müfredatına göre soru üreten bir eğitim asistanısın. Yalnızca MEB müfredatındaki konularda soru üret. Müfredat dışı, siyasi, dini tartışma yaratabilecek veya uygunsuz içerik üretme. Her sorunun doğruluğunu teyit et.\n\n' + getStaticSystemBlock(questionType, effectiveLang) },
          { role: 'user', content: prompt },
        ],
        { model: 'gpt-4.1-mini', max_tokens: genMaxTokens, json: true, operation: forcedOpenAI ? 'generate-quiz:admin-test-openai' : 'generate-quiz:pilot-gpt41mini', userId: user.id, quizSessionId: usageSessionId, requestId: usageRequestId }
      )
      text = gptResult
      console.log(`[generate-quiz] ${forcedOpenAI ? 'ADMIN TEST' : 'PILOT'} model=gpt-4.1-mini qCount=${aiQuestionCount}`)
    } else {
      // 21 Eylül 2026 — Claude çağrısının süresi önceden hiç loglanmıyordu
      // (Mistral/OpenAI'nin aksine); 3 sağlayıcılı hız karşılaştırması için
      // burada da ölçülüp logAnthropicUsage'a durationMs olarak geçiriliyor.
      const claudeStartedAt = Date.now()
      // 21 Eylül 2026 — KÖK NEDEN BULUNDU: Anthropic SDK'nın varsayılan
      // isteği-zaman-aşımı 10 DAKİKA (!) ve zaman aşımına uğrayan istekler
      // varsayılan olarak 2 kez daha otomatik tekrar deneniyor. Bizim
      // fonksiyonumuzun bütçesi (Vercel maxDuration=120sn) bunun çok altında
      // — yani SDK, bizim tarafımızdan hiç yakalanamayacak kadar uzun
      // bekleyebiliyordu. Sonuç: Vercel fonksiyonu SESSIZCE saat sınırında
      // öldürülüyor, bizim try/catch'imiz (aşağıda OpenAI'a düşen fallback
      // dahil) HİÇ ÇALIŞMIYOR, istemci JSON değil Vercel'in kendi düz metin
      // hata sayfasını alıyor ("An error occurred..." → "Unexpected token
      // 'A'... is not valid JSON" client hatası olarak görünüyordu — bkz.
      // Deniz'in 21 Eylül admin-test taramasında Claude'un %36 oranında
      // görünür şekilde başarısız olması, hiç log satırı bırakmadan).
      // Düzeltme: bütçe-farkında bir timeout + maxRetries:0 veriyoruz.
      // Zaman aşımı olursa artık BİZİM kodumuz (satır ~2284'teki catch)
      // yakalıyor ve OpenAI fallback'e düşüyor — öğrenci hata yerine yine
      // de bir quiz alıyor.
      const CLAUDE_MAIN_CALL_DEADLINE_MS = 100000 // 120sn bütçeden DB yazımı+response için pay bırak
      const claudeCallTimeoutMs = Math.max(20000, CLAUDE_MAIN_CALL_DEADLINE_MS - (Date.now() - requestStartTime))
      const response = await anthropic.messages.create({
        model: useHaiku ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-5',
        max_tokens: genMaxTokens,
        system: isUniversityLevel
          ? 'Sen üniversite düzeyinde soru üreten bir eğitim asistanısın. MEB K-12 müfredatı kısıtı burada geçerli değil; öğrencinin bölümüne/seviyesine uygun, akademik olarak doğru sorular üret. Siyasi, dini tartışma yaratabilecek veya uygunsuz içerik üretme. Her sorunun doğruluğunu teyit et.'
          : [
              { type: 'text' as const, text: 'Sen Türkiye Milli Eğitim Bakanlığı (MEB) müfredatına göre soru üreten bir eğitim asistanısın. Yalnızca MEB müfredatındaki konularda soru üret. Müfredat dışı, siyasi, dini tartışma yaratabilecek veya uygunsuz içerik üretme. Her sorunun doğruluğunu teyit et.' },
              { type: 'text' as const, text: getStaticSystemBlock(questionType, effectiveLang), cache_control: { type: 'ephemeral' as const } },
            ],
        messages: [{ role: 'user', content: prompt }],
      }, { timeout: claudeCallTimeoutMs, maxRetries: 0 })
      const claudeDurationMs = Date.now() - claudeStartedAt
      console.log(`[generate-quiz] ${forcedClaude ? 'ADMIN TEST' : ''} model=${useHaiku ? 'haiku' : 'sonnet'} qCount=${aiQuestionCount} ms=${claudeDurationMs}`)
      await logAnthropicUsage(forcedClaude ? 'generate-quiz:admin-test-claude' : 'generate-quiz', useHaiku ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-5', response, {
        userId: user.id,
        quizSessionId: usageSessionId,
        requestId: usageRequestId,
        durationMs: claudeDurationMs,
        meta: { qCount: aiQuestionCount, topic, hasMebContext: !!mebContext, bankQuestionCount: bankQuestions.length },
      })
      text = response.content[0].type === 'text' ? response.content[0].text : ''
    }
    const clean = text.replace(/```json|```/g, '').trim()

    // 4 Eylül 2026 — Deniz'in gerçek loglarla bulduğu hata: "JSON parse failed
    // completely: Could not recover questions" (özellikle qCount=7, Haiku).
    // Kök neden koddan doğrulandı: eski kurtarma mekanizması İKİ AYRI hatalı
    // regex kullanıyordu:
    //  (a) `"questions"\s*:\s*(\[[\s\S]*?\](?=\s*[},]))` — TEMBEL (lazy) eşleşme,
    //      "questions" dizisinin kapanışını değil, İLK SORUNUN "opts" dizisinin
    //      kapanışını (ki o da "," ile takip ediliyor) yakalayıp orada duruyordu
    //      — yani gerçek diziyi hiç yakalayamıyordu (izole test: 7 soruluk
    //      gerçek bir JSON'da bu regex sadece İLK sorunun opts dizisini
    //      döndürüyordu, gerisi tamamen kayboluyordu).
    //  (b) `\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}` — iç içe (nested) obje içeren soru
    //      tiplerinde (ör. table_fill'in "tableData":{...}) YAPISAL OLARAK
    //      ÇALIŞAMAZ, sadece tek seviye nested'i destekliyor.
    // Bu ikisi birleşince, JSON'un normal geçerli-parse'ı başarısız olduğu HER
    // durumda (ör. token limiti nedeniyle sonun kesilmesi) kurtarma neredeyse
    // hiç işe yaramıyor, tüm soru kaybediliyor ve öğrenciye 500 hatası dönüyordu.
    // Yeni extractQuestionObjects(): karakter-karakter { }/[] denge takibi yapan,
    // string içindeki kaçışlı tırnak/parantezleri doğru ele alan, iç içe objeyi
    // destekleyen VE JSON sonda kesilmiş olsa bile TAMAMLANMIŞ soruları kurtarıp
    // sadece yarım kalan son soruyu atlayan sağlam bir çözümleyici. 5 senaryoyla
    // izole test edildi (tam JSON, nested obje, kesilmiş JSON, kaçışlı karakter,
    // gerçek hataya yol açan 7-soru senaryosu) — hepsi doğru sonuç verdi.
    function extractQuestionObjects(raw: string): any[] {
      const key = raw.indexOf('"questions"')
      if (key === -1) return []
      const arrStart = raw.indexOf('[', key)
      if (arrStart === -1) return []
      const results: any[] = []
      let i = arrStart + 1
      while (i < raw.length) {
        while (i < raw.length && /[\s,]/.test(raw[i])) i++
        if (raw[i] !== '{') break
        const objStart = i
        let depth = 0, inStr = false, esc = false
        for (; i < raw.length; i++) {
          const c = raw[i]
          if (esc) { esc = false; continue }
          if (c === '\\') { esc = true; continue }
          if (c === '"') { inStr = !inStr; continue }
          if (inStr) continue
          if (c === '{') depth++
          else if (c === '}') { depth--; if (depth === 0) { i++; break } }
        }
        if (depth !== 0) break // son obje token limiti yüzünden kesilmiş — dahil etme
        const candidate = raw.slice(objStart, i)
        try { results.push(JSON.parse(candidate)) } catch { /* bozuk tekil obje, atla */ }
      }
      return results
    }

    let parsed: any
    try {
      parsed = JSON.parse(clean)
    } catch {
      // JSON bozuksa — önce doğrudan tam obje olarak dene
      try {
        const match = clean.match(/\{[\s\S]*\}/)
        if (match) {
          parsed = JSON.parse(match[0])
        } else {
          throw new Error('No JSON object found')
        }
      } catch {
        // Son çare: dengeli-parantez çözümleyiciyle tek tek soru objelerini kurtar
        const safeQuestions = extractQuestionObjects(clean)
        if (safeQuestions.length > 0) {
          parsed = { questions: safeQuestions }
          console.warn(`[generate-quiz] JSON recovered via balanced-brace parser, got ${safeQuestions.length} questions`)
        } else {
          console.error(`[generate-quiz] JSON parse failed completely. response_length=${clean.length} recovered_questions=0`)
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

    let questions = (parsed.questions || []).map((q: any) => normalizeInteractiveQuestionShape(q, effectiveLang))
    let externalValidationPassed = false

    // Önce soru doğrulanır, sonra görsel doğrulanmış kesin soru metninden
    // üretilir. Eski paralel akışta doğrulayıcı soruların sırasını/metnini
    // değiştirdiğinde başka soruya ait SVG aynı index'e takılabiliyordu.
    const visualCategory = detectVisualCategory(topic)
    console.log(`[generate-quiz] topic="${topic}" visualCategory=${visualCategory} includeVisuals=${includeVisuals}`)

    const verifyResult = questions.length > 0
      ? await fetch(`${req.nextUrl.origin}/api/verify-questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || 'internal' },
          body: JSON.stringify({ questions, topic, grade, language: effectiveLang, questionType }),
          signal: AbortSignal.timeout(40000),
        }).then(r => r.ok ? r.json() : null).catch(() => null)
      : null

    if (verifyResult?.questions?.length > 0) {
      questions = verifyResult.questions.map((q: any) => normalizeInteractiveQuestionShape(q, effectiveLang))
      externalValidationPassed = true
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
    questions = filterOutNearDuplicates(questions, [
      ...(Array.isArray(excludeQuestionTexts) ? excludeQuestionTexts : []),
      ...bankQuestions.map((question: any) => question.q).filter(Boolean),
    ])
    if (questions.length < beforeDupCount) {
      console.warn(`[generate-quiz] yakın-tekrar kontrolü sonrası ${beforeDupCount - questions.length} soru elendi (${beforeDupCount} -> ${questions.length})`)
    }

    // Only this externally validated slice may enter the shared bank. Top-up
    // questions are generated later and are intentionally excluded until they
    // pass the same independent validation path in a future request.
    const validatedQuestionsForBank = externalValidationPassed ? questions.slice() : []

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
    if (questions.length > aiQuestionCount) {
      questions = questions.slice(0, aiQuestionCount)
    } else if (questions.length < aiQuestionCount) {
      const maxTopupRounds = 4
      const TOPUP_TIME_BUDGET_MS = 95000 // 120sn'lik toplam bütçeden DB yazımı/response için pay bırak
      let consecutiveNoProgress = 0
      for (let round = 0; round < maxTopupRounds && questions.length < aiQuestionCount; round++) {
        if (Date.now() - requestStartTime > TOPUP_TIME_BUDGET_MS) {
            console.warn(`[generate-quiz] zaman bütçesi doldu, topup turu ${round + 1} atlanıyor (elde olan: ${questions.length}/${aiQuestionCount})`)
          break
        }
        const missing = aiQuestionCount - questions.length
        const beforeRoundCount = questions.length
        try {
          const topupPrompt = `${prompt}\n\nÖNEMLİ: Bu sefer TAM OLARAK ${missing} adet YENİ ve BİRBİRİNDEN FARKLI soru üret (ne bir eksik ne bir fazla). Daha önce üretilenlerle aynı/benzer soru üretme. Yanıtın SADECE geçerli, TAMAMLANMIŞ (yarıda kesilmemiş) JSON olmalı.`
          // 21 Eylül 2026 — ana çağrıdaki aynı zaman aşımı düzeltmesi: SDK'nın
          // 10 dakikalık varsayılan zaman aşımı + otomatik tekrar denemeleri
          // burada da fonksiyonu Vercel'in sessizce öldürmesine yol açabilir.
          // Kalan TOPUP_TIME_BUDGET_MS'e göre bütçe-farkında bir timeout
          // veriyoruz; aşılırsa bu turun kendi try/catch'i (üstte) yakalar,
          // döngü bir sonraki turda zaten zaman kontrolüyle duruyor olurdu.
          const topupCallTimeoutMs = Math.max(15000, TOPUP_TIME_BUDGET_MS - (Date.now() - requestStartTime))
          const topupResponse = await anthropic.messages.create({
            // Eksik soru tamamlama, sayıya SADIK KALMA konusunda Haiku'dan
            // daha güvenilir olan Sonnet ile yapılır — burada hız değil
            // doğru sayıya ulaşmak öncelikli.
            model: 'claude-sonnet-4-5',
            max_tokens: Math.min(4000, Math.max(2000, missing * 600)),
            // 5 Eylül 2026 — P0 prompt caching: `prompt` değişkeni artık K12
            // yolunda zaten SIKIŞTIRILMIŞ (statik kısımlar çıkarılmış) hâlde,
            // bu yüzden topupPrompt de otomatik olarak küçük kalıyor. Aynı
            // statik bloğu (ana çağrıyla BİREBİR AYNI metin — cache hit için
            // şart) burada da system'e ekliyoruz. Gerçek veride topup en
            // pahalı kalemdi (çağrı başına ~$0.038) çünkü tüm promptu tekrar
            // gönderiyordu — artık hem daha küçük hem cache'den okunabilir.
            system: isUniversityLevel
              ? undefined
              : [{ type: 'text' as const, text: getStaticSystemBlock(questionType, effectiveLang), cache_control: { type: 'ephemeral' as const } }],
            messages: [{ role: 'user', content: topupPrompt }],
          }, { timeout: topupCallTimeoutMs, maxRetries: 0 })
          await logAnthropicUsage('generate-quiz:topup', 'claude-sonnet-4-5', topupResponse, {
            userId: user.id,
            quizSessionId: usageSessionId,
            requestId: usageRequestId,
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
            // 4 Eylül 2026 — ana üretimdeki aynı sağlam kurtarma burada da: JSON
            // token limiti yüzünden ortada kesilse bile TAMAMLANMIŞ soruları
            // kurtarır (bkz. yukarıdaki extractQuestionObjects tanımı ve notu).
            if (!topupParsed?.questions?.length) {
              const recovered = extractQuestionObjects(topupClean)
              if (recovered.length > 0) {
                topupParsed = { questions: recovered }
                console.warn(`[generate-quiz] topup JSON recovered via balanced-brace parser, got ${recovered.length} questions`)
              }
            }
          }
          let topupQuestions = (topupParsed?.questions || []).map((q: any) => normalizeInteractiveQuestionShape(q, effectiveLang))
          topupQuestions = applyContentQualityFilters(topupQuestions, mebContext)
          // Yakın-tekrar kontrolü: hem önceki parçanın sorularına (excludeQuestionTexts)
          // hem de bu çağrıda ŞİMDİYE KADAR kabul edilmiş sorulara (questions) karşı.
          const alreadyAsked = [
            ...(Array.isArray(excludeQuestionTexts) ? excludeQuestionTexts : []),
            ...bankQuestions.map((q: any) => q.q).filter(Boolean),
            ...questions.map((q: any) => q.q).filter(Boolean),
          ]
          topupQuestions = filterOutNearDuplicates(topupQuestions, alreadyAsked)
          questions = [...questions, ...topupQuestions].slice(0, aiQuestionCount)
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

    // Hibrit sonuç: onaylı havuz sorularını önce kullan, yalnızca eksik kısmı
    // AI ile üret. Böylece kısmi bir havuz eşleşmesi de maliyeti ve beklemeyi
    // azaltır; eskisi gibi 9/10 eşleşmede dokuz soruyu çöpe atmayız.
    questions = [...bankQuestions, ...questions].slice(0, safeQCount)

    // Sözleşme: Bir test ya eksiksizdir ya hiç oluşturulmaz. Daha önce
    // burada 4/10 gibi kısmi diziler session'a yazılıyor, arayüz de bunu
    // başlatmaya çalışıyordu. Bu kontrol kota/session değişikliklerinden
    // ÖNCE çalışır; öğrenciye yeniden deneme seçeneği verir ve bozuk oturum
    // bırakmaz.
    if (questions.length !== safeQCount) {
      console.error(`[generate-quiz] incomplete_set requested=${safeQCount} delivered=${questions.length} topic=${topic}`)
      return NextResponse.json({
        error: 'insufficient_questions',
        message: 'Soruların tamamı kalite kontrolünden geçemedi. Lütfen birkaç saniye sonra yeniden dene.',
        requestedCount: safeQCount,
        deliveredCount: questions.length,
      }, { status: 503 })
    }

    // Görsel üretimi TAM soru seti oluşmadan çalıştırılmaz. Önceki sıralamada
    // doğrulama sonrası eksik kalan sorular tamamlanmadan 5+ SVG isteği
    // başlıyor, 120 saniyelik isteğin bütçesini tüketiyor ve öğrenciye
    // "Sorular tamamlanamadı" hatası dönüyordu. Görsel hiçbir zaman testin
    // eksiksiz oluşturulmasının önüne geçemez.
    //
    // 16 Eylül 2026 — bu adımın kendisinin de bir zaman bütçesi YOKTU: topup
    // turu tek başına 95sn'ye kadar kullanabiliyor, ardından görseller hiçbir
    // kalan-süre kontrolü olmadan başlıyordu. maxDuration=120s'i aşarsa
    // fonksiyon SIFIRDAN öldürülür ve öğrenci tamamlanmış sorularını bile
    // görmez — eksik-görsel hatasından daha kötü bir sonuç. Yetersiz süre
    // kaldıysa görseller atlanır, testin kendisi yine tam teslim edilir.
    //
    // 16 Eylül 2026 (devam) — kategori token bütçeleri yükseltilince tek bir
    // görsel zincirinin gerçekçi en kötü süresi de uzadı. Eskiden burada
    // SADECE "başlamaya değer mi" diye sabit bir eşik (100sn bütçeden pay)
    // kontrol ediliyor, sonrasında Promise.all'un GERÇEKTE ne kadar süreceğine
    // hiçbir sınır konmuyordu — yani "yeterli süre var" denip başlansa bile
    // zincirler kendi iç zaman aşımlarına kadar (artık daha uzun) sürebilir
    // ve isteğin gerçek 120sn sınırını aşabilirdi. Artık kalan süre HER
    // zincire ortak bir üst sınır (maxMs) olarak da geçiliyor; hiçbir zincir
    // isteğin gerçekte sahip olduğundan fazla zaman harcayamaz.
    const REQUEST_HARD_DEADLINE_MS = 112000 // 120sn'den DB yazımı/response için pay bırak
    const visualBudgetMs = REQUEST_HARD_DEADLINE_MS - (Date.now() - requestStartTime)
    const visualIndexes = visualQuestionIndexes(questions, visualCategory, safeQCount, isNewGenerationRequest(topic))
    const shouldGenerateVisuals = includeVisuals && visualCategory && visualIndexes.length > 0 && visualBudgetMs > 15000
    if (includeVisuals && visualCategory && visualIndexes.length > 0 && !shouldGenerateVisuals) {
      console.warn(`[generate-quiz] zaman bütçesi görseller için yetersiz (${visualBudgetMs}ms kaldı), görseller atlanıyor`)
    }
    const svgResults = shouldGenerateVisuals
      ? await Promise.all(visualIndexes.map(i =>
          generateVisualWithRetry(questions[i], visualCategory, topic, grade, visualBudgetMs)
            .then(visual => ({ i, visual }))
            .catch(() => ({ i, visual: null }))
        ))
      : []

    for (const { i, visual } of svgResults) {
      if (visual && questions[i]) {
        questions[i] = {
          ...questions[i], svg: visual.svg, qtype: 'svg', visualQuestionText: questions[i].q,
          visualContextQuality: { score: visual.contextQuality.score, reason: visual.contextQuality.reason, evaluator: visual.contextQuality.reason === 'deterministic-chart' ? 'deterministic' : 'openai' },
        }
        console.log(`[generate-quiz] visual generated for q[${i}] contextScore=${visual.contextQuality.score}`)
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
    questions = questions.map((q: any, questionIndex: number) => ({
      ...normalizeQuestionMisconceptions(q),
      subject: canonicalSubject,
      // Setin istek düzeyini ayrıca korurken modelin her soru için verdiği
      // geçerli zorluk etiketini ezme. Aksi halde normal testte istenen %30
      // zor soru üretimi DB'ye yazılırken tekrar "normal"e dönüşüyordu.
      difficulty: canonicalQuestionDifficulty(q.difficulty, resolvedDifficulty),
      requestedDifficulty: resolvedDifficulty,
      adaptivePolicyVersion: adaptivePolicy?.version || 'v2',
      adaptiveFocus: adaptivePolicy?.focus || 'standard',
      adaptiveReasonCode: adaptivePolicy?.reasonCode || 'NO_ACTIVE_SIGNAL',
      adaptiveRecommendationId: adaptivePolicy?.recommendationId || null,
      adaptiveHint: contextualAdaptiveHint(q, topic, adaptiveHint),
      adaptiveSupportLevel: supportLevel,
      adaptivePresentation: supportLevel === 'scaffold' ? 'step_by_step' : supportLevel === 'hint' ? 'concise' : 'independent',
      diagnosticStrategyVersion: diagnosticStrategy.active ? diagnosticStrategy.version : null,
      diagnosticReasonCode: diagnosticStrategy.active ? diagnosticStrategy.reasonCode : null,
      diagnosticRole: diagnosticStrategy.active ? diagnosticStrategy.roles[questionIndex] || null : null,
      masteryConfidenceBefore: diagnosticStrategy.confidenceBefore,
      masteryEvidenceCountBefore: diagnosticStrategy.evidenceCountBefore,
    }))
    // Sağlayıcının kendi difficulty etiketine güvenmek yerine her soruyu
    // deterministik olarak bağlam, veri, çıkarım, açıklama ve seçenek yapısı
    // üzerinden puanla. Düşük puanlı soruları burada silmiyoruz: bu, daha önce
    // görülen eksik-set/503 döngüsünü geri getirirdi. Ölçümü soru JSON'una
    // ekleyip üretim kalitesini sağlayıcı ve zaman bazında izlenebilir kılıyoruz.
    questions = attachQuestionRigorMetadata(questions)
    const rigorSummary = summarizeQuestionSetRigor(questions, resolvedDifficulty)
    console.log(`[question-rigor] version=${rigorSummary.version} average=${rigorSummary.averageScore} minimum=${rigorSummary.minimumScore} application=${rigorSummary.applicationCount}/${rigorSummary.targetApplicationCount} reasoning=${rigorSummary.reasoningCount}/${rigorSummary.targetReasoningCount} direct=${rigorSummary.directRecallCount} visual=${rigorSummary.visualCount} target_met=${rigorSummary.meetsTarget}`)
    questions = balanceAnswerPositions(questions)
    const objectiveMapping = applyCanonicalObjectiveMappings(questions, objectiveCandidates)
    questions = objectiveMapping.questions

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
        const mergedObjectiveMappedCount = mergedQuestions.filter((question: any) => question?.objectiveMappingStatus === 'mapped').length
        await supabase
          .from('quiz_sessions')
          .update({
            questions: mergedQuestions,
            question_count: mergedQuestions.length,
            objective_mapping_version: 'v1',
            objective_candidate_count: objectiveCandidates.length,
            objective_mapped_count: mergedObjectiveMappedCount,
            curriculum_version_id: objectiveCandidates[0]?.curriculumVersionId || null,
            objective_candidate_basis: objectiveCandidates[0]?.matchBasis || null,
          })
          .eq('id', continueSessionId)
        sessionId = continueSessionId
      }
    }

    if (!sessionId) {
      const { data: sessionRow } = await supabase
        .from('quiz_sessions')
        .insert({
          id: usageSessionId,
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
          gen_engine: bankQuestions.length > 0 ? 'question-bank-hybrid-v2' : genEngineUsed,
          gen_request_id: usageRequestId,
          gen_experiment: experimentVariant ? QUIZ_PROVIDER_POLICY_VERSION : null,
          gen_experiment_variant: experimentVariant,
          gen_experiment_bucket: experimentVariant ? experimentBucket : null,
          objective_mapping_version: 'v1',
          objective_candidate_count: objectiveCandidates.length,
          objective_mapped_count: objectiveMapping.mappedCount,
          curriculum_version_id: objectiveCandidates[0]?.curriculumVersionId || null,
          objective_candidate_basis: objectiveCandidates[0]?.matchBasis || null,
        })
        .select('id')
        .maybeSingle()
      sessionId = sessionRow?.id
    }

    if (bankEligible && sessionId) {
      const bankCount = bankQuestions.length
      after(async () => { await supabase.from('question_bank_events').insert({ request_id: usageRequestId, user_id: user.id, quiz_session_id: sessionId, subject_key: questionBankKey(subject || 'genel'), topic_key: questionBankKey(topic), grade_key: questionBankKey(grade), requested_count: safeQCount, bank_count: bankCount, ai_count: Math.max(0, questions.length - bankCount), outcome: bankCount > 0 ? 'partial' : 'miss' }) })
    }

    // Multi-AI Gateway v3 shadow pilot. Varsayılan oran 0'dır; açıkça
    // etkinleştirilmeden ek sağlayıcı çağrısı/maliyet oluşmaz. Kullanıcı dosyası
    // içeren, üniversite veya adaptif devam istekleri gölge pilota alınmaz.
    const configuredShadowFraction = Number(process.env.MISTRAL_SHADOW_FRACTION || '0')
    const shadowFraction = Number.isFinite(configuredShadowFraction)
      ? Math.min(1, Math.max(0, configuredShadowFraction))
      : 0
    let shadowHash = 2166136261
    for (const character of usageRequestId) {
      shadowHash ^= character.charCodeAt(0)
      shadowHash = Math.imul(shadowHash, 16777619)
    }
    const shadowBucket = Math.abs(shadowHash >>> 0) % 10000
    const shadowEligible = shadowFraction > 0
      && Boolean(process.env.MISTRAL_API_KEY)
      && !isUniversityLevel
      && !continueSessionId
      && !(fileContent && fileContent.trim())
      && !useMistralLive // bu istek zaten canlıda Mistral kullandıysa gölge karşılaştırma tekrar Mistral'e ikinci bir çağrı yaptırmasın (boşa maliyet)
      && !isForcedProviderTest // admin zorlamalı test istekleri gölge karşılaştırmayı da tetiklemesin (boşa maliyet, A/B dışı istek)
      && shadowBucket < Math.round(shadowFraction * 10000)

    if (shadowEligible && sessionId) {
      const shadowSystemPrompt = 'Sen Türkiye Milli Eğitim Bakanlığı (MEB) müfredatına göre soru üreten bir eğitim asistanısın. Yalnızca geçerli JSON üret.\n\n'
        + getStaticSystemBlock(questionType, effectiveLang)
      after(async () => {
        const metrics = await runMistralShadowComparison({
          systemPrompt: shadowSystemPrompt,
          userPrompt: prompt,
          expectedCount: aiQuestionCount,
          userId: user.id,
          sessionId,
          requestId: usageRequestId,
        })
        const { error } = await supabase.from('ai_shadow_evaluations').insert({
          request_id: usageRequestId,
          quiz_session_id: sessionId,
          user_id: user.id,
          policy_version: 'multi-ai-gateway-v3-p0',
          task: 'quiz_generation',
          control_provider: genEngineUsed.startsWith('gpt') ? 'openai' : 'anthropic',
          control_model: genEngineUsed,
          shadow_provider: metrics.provider,
          shadow_model: metrics.model,
          expected_count: metrics.expectedCount,
          delivered_count: metrics.deliveredCount,
          structurally_valid_count: metrics.structurallyValidCount,
          duplicate_count: metrics.duplicateCount,
          duration_ms: metrics.durationMs,
          input_tokens: metrics.inputTokens,
          output_tokens: metrics.outputTokens,
          error_code: metrics.errorCode || null,
        })
        if (error) console.warn(`[ai-shadow] metric insert failed code=${error.code || 'unknown'}`)
      })
    }

    if (bankEligible && sessionId) {
      after(async () => {
        const promoted = await promoteQuestionsToBank(supabase, {
          subject, topic, grade, language: effectiveLang,
          questionType, difficulty: resolvedDifficulty,
        }, validatedQuestionsForBank, { sessionId, engine: genEngineUsed })
        console.log(`[question-bank] promoted=${promoted} topic=${topic}`)
      })
    }

    return NextResponse.json({
      questions, sessionId, resolvedDifficulty,
      source: bankQuestions.length > 0 ? 'hybrid' : 'ai',
      bankQuestionCount: bankQuestions.length,
      aiQuestionCount: Math.max(0, questions.length - bankQuestions.length),
      qualitySummary: rigorSummary,
      adaptivePolicy: adaptivePolicy || undefined,
      diagnosticStrategy,
      // 21 Eylül 2026 — admin zorlamalı sağlayıcı testinde, sorular gerçekten
      // istenen sağlayıcıdan mı geldi yoksa soru bankası fallback'i mi devreye
      // girdi görünsün diye (önceki sorun: sayfa "Mistral ile üret" dese de
      // fallback sessizce bank sorularını döndürebiliyordu, admin bunu asla
      // göremiyordu). Normal öğrenci trafiğinde bu alan hiç eklenmiyor.
      ...(isForcedProviderTest ? { debugGenEngine: genEngineUsed, debugBankFallback: bankQuestions.length > 0 } : {}),
    })
  } catch (error: any) {
    console.error('Generate quiz error, trying OpenAI fallback:', error?.message)
    // GPT-4o yedek model
    try {
      if (!promptStr) throw new Error('No prompt')
      const fallbackText = await generateQuizFallback(promptStr, countRef, {
        userId: usageUserId,
        quizSessionId: usageSessionId,
        requestId: usageRequestId,
      })
      const clean = fallbackText.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      const fbQuestions = parsed.questions || parsed
      if (Array.isArray(fbQuestions) && fbQuestions.length > 0) {
        console.log('[generate-quiz] OpenAI fallback success:', fbQuestions.length, 'questions')
        const fbFinal = balanceAnswerPositions(sourcePassage
          ? fbQuestions.map((q: any) => {
              const passageWords = extractMeaningfulWords(sourcePassage)
              return questionReferencesPassage(q, sourcePassage, passageWords) ? { ...q, passage: sourcePassage } : q
            })
          : fbQuestions)
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
