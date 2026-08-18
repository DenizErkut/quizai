// app/api/meb-search/route.ts
// Quiz üretimi sırasında ilgili MEB chunk'larını semantic search ile getir
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  isNonContent,
  isKazanimListesi,
  findContentStart,
} from '@/lib/content-filters'

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

// isFrontMatter / looksLikeTableOfContents / isNonContent / findContentStart
// artık burada TANIMLANMIYOR — 18 Ağustos 2026'da (Madde 4/8,
// pratium-bekleyen-isler-uygulama-plani.md) lib/content-filters.ts'e
// taşındı, mantık birebir aynı. Neden: exam_chunks sorgusu (aşağıda) ve
// meb-upload'daki yükleme sağlık kontrolü de AYNI filtrelere ihtiyaç
// duyuyordu — önceden bu fonksiyonlar sadece bu dosyaya özeldi.

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
        // Grade formatları veritabanında çok tutarsız ("Ortaokul 6. Sınıf",
        // "ortaokul 6.sınıf", "Ortaokul 6. SInıf" vb.) — tam metin eşleşmesi
        // güvenilir değil. Bunun yerine SINIF NUMARASINI regex ile çıkarıp
        // karşılaştırıyoruz. Bu, 13 Ağustos 2026'da bulunan gerçek bir hatayı
        // düzeltiyor: `unit` parametresi verildiğinde grade HİÇ kontrol
        // edilmiyordu (yukarıdaki if/else if zinciri) — bu yüzden 6. sınıf
        // bir öğrenci, aynı isimli 5. sınıf ünitesinden içerik alabiliyordu.
        const extractGradeNum = (g: string | null | undefined): number | null => {
          const m = (g || '').match(/(\d+)\s*\.?\s*s[ıi]n[ıi]f/i)
          return m ? parseInt(m[1], 10) : null
        }
        const requestedGradeNum = extractGradeNum(grade)
        let gradeFiltered = allResources
        if (requestedGradeNum !== null) {
          const matching = allResources.filter((r: any) => extractGradeNum(r.grade) === requestedGradeNum)
          // Eşleşen varsa SADECE onları kullan; hiç yoksa (ör. o sınıf seviyesi
          // için hiç kaynak yüklenmemiş) tüm adaylara geri dön — hiç içerik
          // dönmemesindense yanlış sınıftan da olsa içerik dönmesi tercih edilir.
          if (matching.length > 0) gradeFiltered = matching
        }

        // Bazı yüklenen kaynaklar sadece MÜFREDAT KAZANIM KODU LİSTESİ
        // (örn. "SB.6.4.1. ... a) ... b) ...") - bunlar ogretmene yonelik
        // ogrenme ciktisi tanimlaridir, ogrenciye sorulacak GERCEK ders
        // icerigi degildir. Boyle bir kaynaktan soru uretilirse "hangi
        // kazanimin 'c' alt maddesi X der" gibi anlamsiz, ogrenciye
        // hicbir sey ifade etmeyen sorular ortaya cikar. Bu paternde
        // olan kaynaklari, gercek anlatisal/orneklerle dolu icerik
        // varsa ELE. Yoksa (tek secenek buysa) yine kullan.
        // (isKazanimListesi artık lib/content-filters.ts'ten import ediliyor.)
        const narrative = gradeFiltered.filter((r: any) => !isKazanimListesi(r.raw_text || ''))
        const pool = narrative.length > 0 ? narrative : gradeFiltered

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
        console.log(`[meb-search] resources: ${resources.length} found (${allResources.length} aday, ${gradeFiltered.length} sinif-uyumlu, ${narrative.length} anlatisal)`)
      }
    }

    // Sınav kitapçığı chunk'larını da ekle
    if (subject || topic) {
      let examQ = adminDb
        .from('exam_chunks')
        .select('content, subject, exam_type, year')
        .limit(12) // Madde 4: filtreden sonra 3'e ineceği için fazladan çek

      if (subject) examQ = examQ.ilike('subject', `%${subject}%`)
      else if (topic) {
        const words = topic.split(' ').filter((w: string) => w.length > 3)
        if (words.length > 0) examQ = examQ.ilike('content', `%${words[0]}%`)
      }

      const { data: examChunksRaw } = await examQ
      if (examChunksRaw?.length) {
        // Madde 4 (pratium-bekleyen-isler-uygulama-plani.md): exam_chunks'a
        // artık MEB kaynaklarıyla AYNI kalite filtreleri uygulanıyor —
        // önceden bu sorgu hiçbir front-matter/kazanım-listesi/OCR-gürültü
        // filtresi içermiyordu (bare .ilike + .limit(3)).
        // NOT: hasOcrLetterSplitNoise() buradan KALDIRILDI (18 Ağustos 2026,
        // aynı gün ikinci kontrol) — gerçek veriye karşı dry-run ile
        // doğrulanınca kimya formülü/DNA dizisi/çoktan seçmeli şık gibi
        // GERÇEK içeriği yanlış eleyerek arama kalitesini düşürdüğü
        // görüldü. Detay: lib/content-filters.ts'teki fonksiyonun başındaki
        // yorum. isNonContent/isKazanimListesi (anahtar kelime/yapısal
        // desenli, daha hedefli) olduğu gibi kalıyor.
        const examChunks = examChunksRaw
          .filter((c: any) => {
            const content = c.content || ''
            return !isNonContent(content) && !isKazanimListesi(content)
          })
          .slice(0, 3)

        if (examChunks.length > 0) {
          const examContext = examChunks.map((c: any, i: number) =>
            `[Sınav Sorusu ${i + 1} - ${c.subject || ''} ${c.exam_type || ''} ${c.year || ''}]\n${c.content}`
          ).join('\n\n---\n\n')
          context = context ? context + '\n\n' + examContext : examContext
        }
        console.log(`[meb-search] exam chunks: ${examChunks.length}/${examChunksRaw.length} found (${examChunksRaw.length - examChunks.length} kalite filtresine takıldı)`)
      }
    }

    return NextResponse.json({ context, found: context.length > 0 })
  } catch (e: any) {
    console.error('[meb-search] error:', e.message)
    return NextResponse.json({ context: '', found: false })
  }
}
