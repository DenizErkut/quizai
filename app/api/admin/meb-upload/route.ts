// app/api/admin/meb-upload/route.ts
// MEB kaynağı yükle — PDF parse (+ taranmış PDF'ler için OCR fallback) + chunk + embed + Supabase kaydet
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { extractPdfText } from '@/lib/pdf-extract'

// OCR fallback'i (Gemini Vision / Claude) birkaç saniye sürebilir,
// varsayılan süre yetersiz kalabilir. 90sn'de gerçek bir zaman aşımı
// yaşandı (Gemini başarısız olup Claude'a düşen senaryoda) — 180'e
// çıkarıldı (Vercel Pro planında fonksiyon başına izin verilen üst
// sınırın altında, güvenli bir marj).
export const maxDuration = 180

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: p } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).single()
  return p?.is_admin ? user : null
}

// Metni chunk'lara böl (yaklaşık 800 token = ~3200 karakter)
function chunkText(text: string, chunkSize = 3000, overlap = 300): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    const chunk = text.slice(start, end).trim()
    if (chunk.length > 100) chunks.push(chunk)
    start += chunkSize - overlap
  }
  return chunks
}

// Embedding devre dışı — keyword bazlı arama yeterli
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function embedText(_text: string): Promise<{ values: number[] | null }> {
  return { values: null }
}


// Ortak çekirdek: metni (gerekirse PDF'ten OCR fallback'iyle) çıkar,
// chunk'la, veritabanına kaydet. Hem processFromStorage (büyük dosyalar,
// JSON body) hem POST'un FormData dalı (küçük dosyalar, doğrudan yükleme)
// BU TEK fonksiyonu çağırır — önceki halde ikisi birbirinden habersiz,
// KOPYA mantık içeriyordu (processFromStorage düzeltilmiş, FormData dalı
// hâlâ eski bare pdf-parse'ta kalmıştı; 13 Ağustos 2026'da bir öğretmen
// "Yükle ve Chunkla" butonuyla — yani FormData dalıyla — test edip hâlâ
// "0.0K karakter" gördü, çalışma zamanı logları bunu doğruladı).
async function extractChunkAndSave(params: {
  fileBytes: Buffer | null
  rawTextInput: string
  ext: string | undefined
  fileUrl: string | null
  sourceType: string
  title: string; grade: string; subject: string; unit: string; level: string
}) {
  const { fileBytes, ext, fileUrl, sourceType, title, grade, subject, unit, level } = params
  let rawText = params.rawTextInput || ''
  let extractEngine = 'none'

  if (!rawText && fileBytes && ext === 'pdf') {
    const result = await extractPdfText(fileBytes)
    rawText = result.text
    extractEngine = result.engine
    console.log(`[meb-upload] PDF çıkarma motoru: ${extractEngine}, ${rawText.length} karakter, ${result.pageCount} sayfa`)
  }
  if (!rawText) rawText = fileUrl ? `[Dosya: ${fileUrl}]` : ''

  const { data: resource, error: resErr } = await adminDb
    .from('meb_resources')
    .insert({ title, grade, subject, unit, level, source_type: sourceType, file_url: fileUrl, raw_text: rawText })
    .select('id').single()

  if (resErr || !resource) {
    return NextResponse.json({ error: `DB kayıt hatası: ${resErr?.message}` }, { status: 500 })
  }

  const chunks = chunkText(rawText)
  let embeddedCount = 0
  for (let i = 0; i < chunks.length; i++) {
    const { values: embedding } = await embedText(chunks[i])
    const { error: insertErr } = await adminDb.from('meb_chunks').insert({
      resource_id: resource.id, chunk_index: i,
      content: chunks[i], embedding: embedding ? JSON.stringify(embedding) : null,
      grade, subject, unit, level,
    })
    if (insertErr) console.error(`[meb-upload] chunk ${i} insert hatası:`, insertErr.message)
    else if (embedding) embeddedCount++
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 200))
  }

  console.log(`[meb-upload] SUCCESS: ${chunks.length} chunk, ${embeddedCount} embed, motor=${extractEngine}, ${rawText.length} karakter`)
  return NextResponse.json({
    success: true, resource_id: resource.id,
    chunks: chunks.length, embedded: embeddedCount,
    chars: rawText.length,
  })
}

// Base64 PDF'i service role key ile Storage'a yükle ve işle
async function processFromStorage(body: {
  storage_path: string; file_url: string;
  title: string; grade: string; subject: string; unit: string; level: string
}) {
  const { storage_path, file_url, title, grade, subject, unit, level } = body

  // Storage'dan dosyayı service role ile indir
  const { data: fileData, error: dlErr } = await adminDb.storage
    .from('meb-resources')
    .download(storage_path)

  if (dlErr || !fileData) {
    return NextResponse.json({ error: `Storage indirme hatasi: ${dlErr?.message}` }, { status: 500 })
  }

  const ext = storage_path.split('.').pop()
  const bytes = Buffer.from(await fileData.arrayBuffer())

  return extractChunkAndSave({
    fileBytes: bytes, rawTextInput: '', ext, fileUrl: file_url, sourceType: 'pdf',
    title, grade, subject, unit, level,
  })
}

export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const contentType = req.headers.get('content-type') || ''

    // JSON body: storage_path mode (büyük PDF'ler — signed URL ile yüklendi)
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => null)
      if (!body) return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 })
      if (body.storage_path) return await processFromStorage(body)
      return NextResponse.json({ error: 'storage_path gerekli' }, { status: 400 })
    }

    // FormData mode (küçük dosyalar / metin için)
    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Geçersiz istek — FormData bekleniyor' }, { status: 400 })

    const file = form.get('file') as File | null
    const title = form.get('title') as string
    const grade = form.get('grade') as string
    const subject = form.get('subject') as string
    const unit = form.get('unit') as string
    const level = form.get('level') as string
    const rawTextInput = form.get('raw_text') as string | null

    if (!title || !grade || !subject || !unit || !level) {
      return NextResponse.json({ error: 'Tüm alanlar zorunlu' }, { status: 400 })
    }

    let rawText = rawTextInput || ''
    let fileUrl: string | null = null
    let fileBytesForExtract: Buffer | null = null
    let fileExt: string | undefined

    if (file && file.size > 0) {
      const ext = file.name.split('.').pop()
      fileExt = ext
      const normTR = (s: string) => s
        .replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's')
        .replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i')
        .replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
        .replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_')
      const path = `${normTR(level)}/${normTR(subject)}/${normTR(unit)}_${Date.now()}.${ext}`
      const bytes = await file.arrayBuffer()

      const { error: uploadErr } = await adminDb.storage
        .from('meb-resources')
        .upload(path, bytes, { contentType: file.type, upsert: true })

      if (uploadErr) {
        console.error('[meb-upload] storage error:', uploadErr.message)
        return NextResponse.json({ error: `Dosya yükleme hatası: ${uploadErr.message}` }, { status: 500 })
      }

      const { data: urlData } = adminDb.storage.from('meb-resources').getPublicUrl(path)
      fileUrl = urlData?.publicUrl || null
      fileBytesForExtract = Buffer.from(bytes)
    }

    if (!rawText && !fileUrl) {
      return NextResponse.json({ error: 'Dosya veya metin içeriği gerekli' }, { status: 400 })
    }

    // extractChunkAndSave — taranmış/görsel PDF'lerde (metin katmanı
    // yoksa) otomatik olarak Gemini Vision → Claude OCR fallback'i
    // devreye girer (bkz. lib/pdf-extract.ts). ÖNCEDEN bu dal, yukarıdaki
    // processFromStorage'dan BAĞIMSIZ, kendi bare pdf-parse'ını
    // kullanıyordu — "Yükle ve Chunkla" butonu (bu dal) taranmış
    // PDF'lerde sessizce "0.0K karakter" üretiyordu, processFromStorage
    // düzeltilmiş olsa bile bu dal düzeltmeden habersiz kalmıştı.
    return extractChunkAndSave({
      fileBytes: fileBytesForExtract, rawTextInput: rawText, ext: fileExt, fileUrl,
      sourceType: file ? 'pdf' : 'text',
      title, grade, subject, unit, level,
    })
  } catch (e: any) {
    console.error('[meb-upload] error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// Kaynakları listele
// NOT: Bu endpoint /quiz sayfasında TÜM öğrenciler tarafından "MEB Müfredatı"
// konu önerilerini göstermek için çağrılıyor (app/quiz/page.tsx, loadMebTopics).
// Önceden is_admin şartı vardı — normal öğrenci/öğretmen hesapları için istek
// her zaman 403 dönüyordu, bu yüzden yüklenen hiçbir kaynak (PDF ya da metin
// fark etmeksizin) öğrenciye konu önerisi olarak hiç görünmüyordu. Listeleme
// hassas veri içermediği için (sadece başlık/ders/ünite), artık herhangi bir
// oturum açmış kullanıcıya açık — yazma (POST/DELETE) hâlâ admin-only.
async function getAuthedUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  return user
}

export async function GET(req: NextRequest) {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const level = searchParams.get('level')
  const subject = searchParams.get('subject')

  const sortAsc = searchParams.get('sort') === 'asc'
  let query = adminDb
    .from('meb_resources')
    .select('id, title, grade, subject, unit, level, source_type, created_at, raw_text')
    .order('created_at', { ascending: sortAsc })

  if (level) query = query.eq('level', level)
  if (subject) query = query.eq('subject', subject)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // raw_text'i kırp — sadece önizleme
  const resources = (data || []).map((r: any) => ({
    ...r,
    preview: r.raw_text?.slice(0, 200) || '',
    raw_text: undefined,
    char_count: r.raw_text?.length || 0,
  }))

  return NextResponse.json({ resources })
}

// Kaynak sil
export async function DELETE(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID gerekli' }, { status: 400 })

  // Chunks cascade ile silinir
  const { error } = await adminDb.from('meb_resources').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
