// app/api/reading/summarize/route.ts
//
// 18 Ağustos 2026 — "Sesli Kitap: uzun metinler için özet/tam-metin dinleme
// seçimi" özelliği. app/reading/page.tsx, yükleme tamamlandığında metin
// "birkaç sayfa üzerinde" ise (bkz. SUMMARY_CHOICE_THRESHOLD_CHARS) kullanıcıya
// "Tam Metin" / "Özetini Dinle" seçimini otomatik gösterir. "Özetini Dinle"
// seçilirse istemci, zaten elindeki chunk'ları birleştirip (chunks.join(' '))
// tam metni BURAYA gönderir, biz Claude ile bir özet ürettirip AYNI
// chunkForReading mantığıyla (app/api/reading/upload/route.ts'teki fonksiyonla
// birebir aynı — kasıtlı olarak buraya kopyalandı, o dosyayı değiştirmeden
// izole bir özellik eklemek için) sesli okumaya hazır parçalara bölüp döneriz.
//
// GİZLİLİK: upload/route.ts'teki AYNI politika burada da geçerli — gönderilen
// metin veritabanında SAKLANMAZ, sadece bu istek/yanıt sırasında bellekte
// işlenir. Sadece üretilen ÖZET metni (parçalanmış haliyle) istemciye döner.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/auth-middleware'

export const runtime = 'nodejs'
export const maxDuration = 120

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Çok uzun bir romanın TAMAMINI (400.000 karaktere kadar, bkz. upload/route.ts
// MAX_CHARS) tek istekte özetletmek hem yavaş hem pahalı olurdu — 300.000
// karakter (~75.000 token) sınırı, çoğu kitabı eksiksiz kapsarken makul bir
// yanıt süresi/maliyeti korur. Bu sınırı aşan (çok nadir, çok uzun) metinlerde
// özet SADECE metnin başından bu kadarına dayanır — tam metin seçeneği zaten
// her zaman eksiksiz kalır, özet sadece "hızlı bakış" amaçlıdır.
const MAX_SUMMARIZE_INPUT_CHARS = 300_000
const WORDS_PER_CHUNK = 120       // upload/route.ts ile AYNI — TTS parça boyutu tutarlı kalsın
const MAX_READING_CHUNKS = 800

function chunkForReading(text: string, wordsPerChunk = WORDS_PER_CHUNK): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
  const sentences = clean.split(/(?<=[.!?…])\s+/).filter(s => s.trim().length > 0)
  const chunks: string[] = []
  let current: string[] = []
  let wordCount = 0

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).length
    if (wordCount + words > wordsPerChunk && current.length > 0) {
      chunks.push(current.join(' ').trim())
      current = []
      wordCount = 0
    }
    current.push(sentence.trim())
    wordCount += words
  }
  if (current.length) chunks.push(current.join(' ').trim())

  const filtered = chunks.filter(c => c.length > 0)
  if (filtered.length > MAX_READING_CHUNKS) {
    return filtered.slice(0, MAX_READING_CHUNKS)
  }
  return filtered.length > 0 ? filtered : [text.slice(0, 2000)]
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  try {
    const body = await req.json()
    const fullText = ((body?.text as string) || '').trim()
    const title = ((body?.title as string) || 'Kitap').slice(0, 200)

    if (fullText.length < 200) {
      return NextResponse.json({ error: 'Özetlemek için metin çok kısa.' }, { status: 400 })
    }

    const truncated = fullText.length > MAX_SUMMARIZE_INPUT_CHARS
    const sourceText = truncated ? fullText.slice(0, MAX_SUMMARIZE_INPUT_CHARS) : fullText

    // Hedef özet uzunluğu, orijinalle orantılı ama üst sınırlı — amaç "hızlı
    // dinlenebilir" bir özet, ikinci bir uzun kitap değil. ~120 kelime/dk
    // konuşma hızıyla 4000 token (~3000 kelime) ~20 dakikalık bir dinlemeye
    // denk gelir, en uzun kitaplar için bile makul bir tavan.
    const prompt = `Aşağıda "${title}" adlı bir metnin ${truncated ? '(çok uzun olduğu için başlangıç kısmının)' : 'tamamının'} ham içeriği var. Bu metnin SESLİ OKUMA için bir ÖZETİNİ hazırla.

KURALLAR:
1. Özet, KAYNAK METİNLE AYNI DİLDE yazılmalı (metin Türkçeyse Türkçe, İngilizceyse İngilizce, vb. — çeviri yapma).
2. Ana olay örgüsünü/konuyu, önemli karakterleri/kavramları, kronolojik akışı ve sona (varsa) eksiksiz koru — bir öğrenci bu özeti dinleyerek kitabın tamamını okumuş gibi ana hatlarıyla bilgi sahibi olabilmeli.
3. Akıcı, sesli okumaya uygun DÜZ YAZI (anlatım) formatında yaz — madde işareti, başlık, alt başlık KULLANMA. Sanki birisi kitabı özetleyerek anlatıyormuş gibi doğal bir anlatım akışı olsun.
4. Hedef uzunluk: orijinal metnin yaklaşık %15-25'i kadar, ama en fazla ~3000 kelime (çok kısa metinlerde daha da kısa olabilir, zorlama).
5. Gereksiz tekrar, diyalog alıntısı veya küçük ayrıntılara girme — özün özünü ver.

METİN:
"""
${sourceText}
"""

SADECE özet metnini döndür — başlık, açıklama, markdown veya "İşte özet:" gibi giriş cümlesi EKLEME.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })

    const summary = (response.content[0].type === 'text' ? response.content[0].text : '').trim()
    if (summary.length < 100) {
      return NextResponse.json({ error: 'Özet üretilemedi, tekrar dene.' }, { status: 500 })
    }

    const chunks = chunkForReading(summary)

    return NextResponse.json({
      summary_chunks: chunks,
      chunk_count: chunks.length,
      char_count: summary.length,
      truncated, // istemci isterse "sadece kitabın başından özetlendi" notu gösterebilir
    })
  } catch (e: any) {
    console.error('[reading/summarize]', e)
    return NextResponse.json({ error: e?.message || 'Özet üretilemedi.' }, { status: 500 })
  }
}
