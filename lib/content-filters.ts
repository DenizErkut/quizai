// lib/content-filters.ts
//
// 18 Ağustos 2026 — Madde 4 ve Madde 8 (pratium-bekleyen-isler-uygulama-plani.md).
// app/api/meb-search/route.ts içinde SADECE MEB kaynakları (meb_resources/
// meb_chunks) için geliştirilmiş içerik-kalite filtreleri (isFrontMatter,
// looksLikeTableOfContents, isKazanimListesi, findContentStart) buraya
// paylaşılan bir modüle taşındı — mantık DEĞİŞMEDİ, sadece artık hem
// meb-search hem exam_chunks sorgusu (Madde 4) hem meb-upload'daki yükleme
// sağlık kontrolü (Madde 8) AYNI fonksiyonları kullanabiliyor. Önceden
// exam_chunks bu filtrelerin HİÇBİRİNDEN faydalanmıyordu — bare bir
// `.ilike('content', ...)` sorgusuydu.

// Ders kitaplarının ilk birkaç bin karakteri neredeyse HER ZAMAN gerçek
// ders içeriği DEĞİLDİR: yazar listesi, "Her hakkı saklıdır" telif notu,
// ISBN, İstiklal Marşı/Gençliğe Hitabe, İçindekiler, "Kitabımızı
// Tanıyalım" gibi kullanım kılavuzu sayfaları. Bu bölümlerden AI'a
// bağlam verilirse "kaç yazar tarafından hazırlanmıştır", "ISBN numarası
// nedir" gibi konuyla hiç ilgisi olmayan, anlamsız sorular üretiliyor.
export function isFrontMatter(text: string): boolean {
  const t = text.toLocaleLowerCase('tr')
  const signals = [
    'her hakkı saklıdır',
    'yayın hakları',
    'isbn',
    'gençliğe hitabe',
    'ey türk gençliği',
    'içindekiler',
    'imam hatip ortaokulu',
    'talim ve terbiye kurulu',
    'kitabımızı tanıyalım',
    'güvenlik sembolleri',
    // 28 Ağustos 2026 — Deniz'in bildirdiği hata: exam_chunks'taki LGS/
    // merkezi sınav KAPAK SAYFASI ("SINAVLA ÖĞRENCİ ALACAK ORTAÖĞRETİM
    // KURUMLARINA İLİŞKİN MERKEZÎ SINAV" gibi) hiçbir sinyale uymadığı için
    // isNonContent() bunu YAKALAMIYORDU — öğrenciye "Kaynak Metin" olarak
    // gösterilen mebContext'e sızıp, tamamen alakasız (Din Kültürü sorusu
    // için LGS Türkçe/Tarih kapak sayfası gibi) devasa bir blok ekliyordu.
    'sınavla öğrenci alacak',
    'öğrencilerin dikkatine',
    'ölçme, değerlendirme ve sınav hizmetleri',
    'kitapçık türü',
    'cevap kâğıdı',
  ]
  const hitCount = signals.filter(s => t.includes(s)).length
  // Tek bir sinyal yanlış pozitif olabilir (ör. normal bir cümle içinde
  // geçen "içindekiler" kelimesi) — en az 2 sinyal aranır.
  return hitCount >= 2
}

// İçindekiler bölümleri, gerçek ünite başlıklarını da içerdiği için
// isFrontMatter'ın anahtar kelime taraması tek başına yetersiz kalabiliyor.
// Yapısal bir sinyal: İçindekiler satırları "nokta dizisi + sayfa numarası +
// SATIR SONU" kalıbındadır (ör. "....................18\n").
export function looksLikeTableOfContents(text: string): boolean {
  const tocLineMatches = text.match(/\.{4,}\s*\d{1,4}\s*(?:\r?\n|$)/g)
  if (tocLineMatches && tocLineMatches.length >= 3) return true
  const uniteBolumCount = (text.match(/\b(ÜNİTE|BÖLÜM)\b/g) || []).length
  return uniteBolumCount >= 6 // yoğun başlık tekrarı = İçindekiler
}

export function isNonContent(text: string): boolean {
  return isFrontMatter(text) || looksLikeTableOfContents(text)
}

// Bazı yüklenen kaynaklar sadece MÜFREDAT KAZANIM KODU LİSTESİ (örn.
// "SB.6.4.1. ... a) ... b) ...") — bunlar öğretmene yönelik öğrenme çıktısı
// tanımlarıdır, öğrenciye sorulacak GERÇEK ders içeriği değildir.
const KAZANIM_PATTERN = /[A-ZÇĞİÖŞÜ]{1,4}\.\d+\.\d+\.\d+\./g
export function isKazanimListesi(text: string): boolean {
  const matches = text.match(KAZANIM_PATTERN)
  return !!matches && matches.length >= 2 && text.length < 4000
}

// meb_resources.raw_text içinde GERÇEK konu anlatımının başladığı noktayı
// bulmaya çalışır — dosyanın en başından blind slice almak yerine.
export function findContentStart(rawText: string, unitOrTopic: string): number {
  const FRONTMATTER_SKIP_MIN = 3000 // gözlemlenen ön sayfa bloklarının tipik uzunluğu

  const cleanedTopic = (unitOrTopic || '').replace(/^\d+\s*\.?\s*ünite\s*:?\s*/i, '').trim()
  const rawLower = rawText.toLocaleLowerCase('tr')

  if (cleanedTopic) {
    const needle = cleanedTopic.toLocaleLowerCase('tr')
    let searchFrom = 0
    while (true) {
      const idx = rawLower.indexOf(needle, searchFrom)
      if (idx === -1) break
      const window = rawText.slice(Math.max(0, idx - 200), idx + 1500)
      if (idx > 500 && !isNonContent(window)) return idx
      searchFrom = idx + needle.length
    }
  }

  for (let offset = FRONTMATTER_SKIP_MIN; offset < Math.min(rawText.length, 25000); offset += 2000) {
    if (!isNonContent(rawText.slice(offset, offset + 3000))) return offset
  }
  return 0
}

// ⚠️ 18 Ağustos 2026 (aynı gün, ileriki bir kontrol) — GÜVENLİ DEĞİL,
// KULLANILMIYOR. Bu fonksiyon "ardışık 12+ kısa satır = dekoratif harf-
// harf-ayrılmış başlık gürültüsü" varsayımıyla yazılmıştı. Gerçek veriye
// (exam_chunks) karşı ÇALIŞTIRILMADAN ÖNCE bir dry-run ile doğrulandığında
// (Supabase MCP ile doğrudan sorgulanarak, hiçbir satır silinmeden) ortaya
// çıktı ki bu kalıp exam_chunks'ta neredeyse HİÇ dekoratif başlık
// yakalamıyor — bunun yerine GERÇEK sınav içeriğini yanlış işaretliyor:
// kimya formülleri (CH2OHCCH3...), DNA dizileri (ATTAATCTCTTAGAGA...),
// çoktan seçmeli şık listeleri (A)317 B)319 C)320...), açı/derece
// listeleri (15°15°15°30°...), matematik üs kuralları (an.am=an+m...).
// meb_resources.raw_text üzerinde de aday oranı %39 (53/137) çıktı — aynı
// şüpheli genişlik, örnek eşleşmelerden biri DKAB kitaplarındaki gerçek
// Kur'an alıntıları (Arapça diakritik karakterler) idi.
//
// Bu bulgu üzerine: (1) scripts/clean_exam_chunks_ocr_noise.py'nin
// --apply modu ÇALIŞTIRILMADI (Python o an kullanıcının makinesinde kurulu
// değildi — kazara veri kaybı önlendi), (2) bu fonksiyonun app/api/meb-
// search/route.ts ve app/api/cron/content-quality-scan/route.ts'teki
// çağrıları KALDIRILDI (aşağıya bakın, fonksiyon artık hiçbir yerden
// çağrılmıyor). Fonksiyonun kendisi ileride daha temkinli bir tasarımla
// (ör. sadece metnin ilk ~500 karakterinde, VE run'daki tüm karakterler
// harf — rakam/sembol YOK, VE ideal olarak birleştirildiğinde tanınabilir
// bir kelime oluşturuyor) yeniden değerlendirilebilir — ama önce yine
// gerçek veriye karşı dry-run ile doğrulanmadan HİÇBİR yerde
// kullanılmamalı.
export function hasOcrLetterSplitNoise(text: string): boolean {
  const lines = text.split(/\r?\n/)
  let run = 0
  let maxRun = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 0 && trimmed.length <= 3) {
      run++
      if (run > maxRun) maxRun = run
    } else {
      run = 0
    }
  }
  return maxRun >= 12
}

// YENİ (Madde 8) — MEB kaynak yükleme "sağlık kontrolü": bir kaynağın
// şüpheli olup olmadığını üç bağımsız sinyalle puanlar. HİÇBİR sinyal
// yüklemeyi ENGELLEMEZ — sadece işaretler (meb_resources.health_flag),
// admin panelinde görünür olur, karar admin'e kalır. Aynı "sonradan bulma"
// döngüsünü (ör. Din Kültürü/Türkçe kaynaklarındaki kesme sorunları) baştan
// yakalamak için tasarlandı.
const ROUND_CUTOFF_POINTS = [50000, 40000, 30000, 20000, 10000, 5000]

export interface HealthCheckResult {
  suspiciousCutoff: boolean
  frontMatterHeavy: boolean
  kazanimListesiOnly: boolean
  flags: string[]
}

export function runHealthCheck(rawText: string): HealthCheckResult {
  const len = rawText.length

  // (a) karakter sayısı şüpheli bir yuvarlak kesme noktasında mı bitiyor
  // (±%1 tolerans — tam 50.000'de kesilen bir kaynak muhtemelen yükleme/
  // extraction sırasında kesilmiş, gerçek bir kitabın tam o sayıda
  // karakterle bitmesi istatistiksel olarak çok düşük olasılık).
  const suspiciousCutoff = len > 0 && ROUND_CUTOFF_POINTS.some(p => Math.abs(len - p) <= p * 0.01)

  // (b) ön sayfa/kapak/İçindekiler oranı anormal yüksek mi — ilk 3000
  // karakter zaten front-matter/ToC paterni taşıyorsa şüpheli.
  const frontMatterHeavy = len > 0 && isNonContent(rawText.slice(0, 3000))

  // (c) kaynağın tamamı (ya da başı) sadece kazanım kod listesi mi.
  const kazanimListesiOnly = isKazanimListesi(rawText.slice(0, 4000))

  const flags: string[] = []
  if (suspiciousCutoff) flags.push('suspicious_cutoff')
  if (frontMatterHeavy) flags.push('front_matter_heavy')
  if (kazanimListesiOnly) flags.push('kazanim_listesi_only')

  return { suspiciousCutoff, frontMatterHeavy, kazanimListesiOnly, flags }
}
