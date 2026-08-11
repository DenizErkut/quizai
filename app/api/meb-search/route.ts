// app/api/meb-search/route.ts
// Quiz üretimi sırasında ilgili MEB chunk'larını semantic search ile getir
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function embedQuery(text: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] } })
      }
    )
    const data = await res.json()
    return data?.embedding?.values || null
  } catch { return null }
}

// Ders kitaplarının ilk birkaç bin karakteri neredeyse HER ZAMAN gerçek
// ders içeriği DEĞİLDİR: yazar listesi, "Her hakkı saklıdır" telif notu,
// ISBN, İstiklal Marşı/Gençliğe Hitabe, İçindekiler, "Kitabımızı
// Tanıyalım" gibi kullanım kılavuzu sayfaları. Bu bölümlerden AI'a
// bağlam verilirse "kaç yazar tarafından hazırlanmıştır", "ISBN numarası
// nedir" gibi konuyla hiç ilgisi olmayan, anlamsız sorular üretiliyor
// (gerçek bir örnekte tespit edildi: Fen Bilimleri 6. sınıf "Güneş
// Sistemi ve Tutulmalar" ünitesi istenirken kitabın telif sayfasından
// soru üretilmişti). Bu, isKazanimListesi'ne benzer ama FARKLI bir kaynak
// kirliliği türü — kazanım kod listesi öğretmene yönelik özet, bu ise
// kitabın idari/ön sayfalarıdır.
function isFrontMatter(text: string): boolean {
  const t = text.toLowerCase()
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
  ]
  const hitCount = signals.filter(s => t.includes(s)).length
  // Tek bir sinyal yanlış pozitif olabilir (ör. normal bir cümle içinde
  // geçen "içindekiler" kelimesi) — en az 2 sinyal aranır.
  return hitCount >= 2
}

// İçindekiler bölümleri, gerçek ünite başlıklarını da içerdiği için (ör.
// "GÜNEŞ SİSTEMİ VE TUTULMALAR" hem İçindekiler'de hem gerçek ünite
// başlığında geçer) isFrontMatter'ın anahtar kelime taraması tek başına
// yetersiz kalabiliyor. Bu yüzden yapısal bir sinyal eklendi: İçindekiler
// satırları "nokta dizisi + sayfa numarası + SATIR SONU" kalıbındadır
// (ör. "....................18\n") — bu, ders içindeki eşleştirme/dolgu
// sorularından (ör. "......1. Güneş sisteminin en büyük gezegenidir.")
// FARKLIDIR, çünkü onlarda rakamdan sonra satır bitmez, metin devam eder.
function looksLikeTableOfContents(text: string): boolean {
  const tocLineMatches = text.match(/\.{4,}\s*\d{1,4}\s*(?:\r?\n|$)/g)
  if (tocLineMatches && tocLineMatches.length >= 3) return true
  const uniteBolumCount = (text.match(/\b(ÜNİTE|BÖLÜM)\b/g) || []).length
  return uniteBolumCount >= 6 // yoğun başlık tekrarı = İçindekiler
}

function isNonContent(text: string): boolean {
  return isFrontMatter(text) || looksLikeTableOfContents(text)
}

// meb_resources.raw_text içinde GERÇEK konu anlatımının başladığı noktayı
// bulmaya çalışır — dosyanın en başından blind slice almak yerine.
function findContentStart(rawText: string, unitOrTopic: string): number {
  const FRONTMATTER_SKIP_MIN = 3000 // gözlemlenen ön sayfa bloklarının tipik uzunluğu

  // meb_resources.unit alanı "1. Ünite: Güneş Sistemi ve Tutulmalar" gibi
  // bir önek taşıyor ama ham metinde konu adı "GÜNEŞ SİSTEMİ VE TUTULMALAR"
  // (büyük harf, önek yok) şeklinde geçiyor — hem büyük/küçük harf duyarsız
  // arama hem önek temizliği olmadan eşleşme bulunamıyordu.
  const cleanedTopic = (unitOrTopic || '').replace(/^\d+\s*\.?\s*ünite\s*:?\s*/i, '').trim()
  const rawLower = rawText.toLowerCase()

  if (cleanedTopic) {
    const needle = cleanedTopic.toLowerCase()
    let searchFrom = 0
    while (true) {
      const idx = rawLower.indexOf(needle, searchFrom)
      if (idx === -1) break
      const window = rawText.slice(Math.max(0, idx - 200), idx + 1500)
      if (idx > 500 && !isNonContent(window)) return idx // idx>500: dosya basindaki kapak basligini atla
      searchFrom = idx + needle.length
    }
  }

  // Konu adı bulunamadıysa (ya da hep ön sayfa/İçindekiler bölgesindeyse):
  // ilk FRONTMATTER_SKIP_MIN karakteri atlayıp, ön-sayfa paterni taşımayan
  // ilk pencereyi ara. Bazı kitaplarda ön sayfa bloğu çok uzun olabildiği
  // için (gözlemlenen örnekte >12000 karakter) arama aralığı geniş tutuldu.
  for (let offset = FRONTMATTER_SKIP_MIN; offset < Math.min(rawText.length, 25000); offset += 2000) {
    if (!isNonContent(rawText.slice(offset, offset + 3000))) return offset
  }
  return 0
}

export async function POST(req: NextRequest) {
  // Ic route'lardan (orn. generate-quiz) x-internal-secret ile gelen
  // sunucu-sunucu cagrilari icin bypass - diger ic route'larla (verify-
  // questions, verify-math) ayni desen. Bu kontrol OLMADIGI icin generate-
  // quiz'in bu route'a yaptigi TUM ic cagrilar 401 ile basarisiz oluyordu -
  // MEB mufredat baglami hicbir zaman soru uretimine eklenemiyordu.
  const internalSecret = req.headers.get('x-internal-secret')
  const isInternal = internalSecret && internalSecret === (process.env.CRON_SECRET || 'internal')

  if (!isInternal) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
    const token = authHeader.slice(7)
    const sbAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { data: { user } } = await sbAuth.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Oturum gecersiz.' }, { status: 401 })
  }

  try {
    const { topic, grade, subject, unit, level, limit = 4 } = await req.json()

    // Embedding üret
    const embedding = await embedQuery(topic)

    let context = ''

    if (embedding) {
      // Semantic search
      const { data: chunks } = await adminDb.rpc('search_meb_chunks', {
        query_embedding: JSON.stringify(embedding),
        filter_grade: grade || null,
        filter_subject: subject || null,
        filter_unit: unit || null,
        match_count: limit,
      })

      if (chunks?.length) {
        // Semantic search bazen ön sayfa chunk'larını da (embedding'i
        // yanlışlıkla konuya yakın çıkabiliyor) döndürebiliyor — filtrele.
        const cleanChunks = chunks.filter((c: any) => !isNonContent(c.content || ''))
        if (cleanChunks.length > 0) {
          context = cleanChunks.map((c: any, i: number) =>
            `[MEB Kaynak ${i + 1} - ${c.subject}/${c.unit}]\n${c.content}`
          ).join('\n\n---\n\n')
          console.log(`[meb-search] semantic: ${cleanChunks.length}/${chunks.length} chunks found for "${topic}" (${chunks.length - cleanChunks.length} ön sayfa olarak elendi)`)
        }
      }
    }

    // meb_resources.raw_text'ten direkt ara (chunk'sız — disk IO tasarrufu)
    if (!context) {
      let q = adminDb
        .from('meb_resources')
        .select('title, subject, unit, grade, raw_text')
        .limit(5) // birkaç fazla cek, asagida en zengin olanlari secelim

      // Önce unit eşleştir
      if (unit) q = q.ilike('unit', `%${unit}%`)
      else if (subject) q = q.ilike('subject', `%${subject}%`)
      else if (grade) q = q.eq('grade', grade)

      const { data: allResources } = await q

      if (allResources?.length) {
        // Bazı yüklenen kaynaklar sadece MÜFREDAT KAZANIM KODU LİSTESİ
        // (örn. "SB.6.4.1. ... a) ... b) ...") - bunlar ogretmene yonelik
        // ogrenme ciktisi tanimlaridir, ogrenciye sorulacak GERCEK ders
        // icerigi degildir. Boyle bir kaynaktan soru uretilirse "hangi
        // kazanimin 'c' alt maddesi X der" gibi anlamsiz, ogrenciye
        // hicbir sey ifade etmeyen sorular ortaya cikar. Bu paternde
        // olan kaynaklari, gercek anlatisal/orneklerle dolu icerik
        // varsa ELE. Yoksa (tek secenek buysa) yine kullan.
        const kazanimPattern = /[A-ZÇĞİÖŞÜ]{1,4}\.\d+\.\d+\.\d+\./g
        const isKazanimListesi = (text: string) => {
          const matches = text.match(kazanimPattern)
          return !!matches && matches.length >= 2 && text.length < 4000
        }

        const narrative = allResources.filter((r: any) => !isKazanimListesi(r.raw_text || ''))
        const pool = narrative.length > 0 ? narrative : allResources

        // En zengin (en uzun) icerigi one al - daha cok ornek/hikaye/haber
        // demek, sorulari cesitlendirmek icin daha fazla malzeme demek
        const resources = pool
          .sort((a: any, b: any) => (b.raw_text?.length || 0) - (a.raw_text?.length || 0))
          .slice(0, 3)

        context = resources.map((r: any, i: number) => {
          const raw = r.raw_text || ''
          // Dosyanın en başından (yazar listesi, telif, İçindekiler vb.
          // ön sayfalardan) değil, gerçek konu anlatımının başladığı
          // noktadan itibaren al.
          const startIdx = findContentStart(raw, unit || subject || topic || '')
          return `[MEB Kaynak ${i + 1} - ${r.subject || ''}/${r.unit || ''}]\n${raw.slice(startIdx, startIdx + 3000)}`
        }).join('\n\n---\n\n')
        console.log(`[meb-search] resources: ${resources.length} found (${allResources.length} aday, ${narrative.length} anlatisal)`)
      }
    }

    // Sınav kitapçığı chunk'larını da ekle
    if (subject || topic) {
      let examQ = adminDb
        .from('exam_chunks')
        .select('content, subject, exam_type, year')
        .limit(3)

      if (subject) examQ = examQ.ilike('subject', `%${subject}%`)
      else if (topic) {
        const words = topic.split(' ').filter((w: string) => w.length > 3)
        if (words.length > 0) examQ = examQ.ilike('content', `%${words[0]}%`)
      }

      const { data: examChunks } = await examQ
      if (examChunks?.length) {
        const examContext = examChunks.map((c: any, i: number) =>
          `[Sınav Sorusu ${i + 1} - ${c.subject || ''} ${c.exam_type || ''} ${c.year || ''}]\n${c.content}`
        ).join('\n\n---\n\n')
        context = context ? context + '\n\n' + examContext : examContext
        console.log(`[meb-search] exam chunks: ${examChunks.length} found`)
      }
    }

    return NextResponse.json({ context, found: context.length > 0 })
  } catch (e: any) {
    console.error('[meb-search] error:', e.message)
    return NextResponse.json({ context: '', found: false })
  }
}
