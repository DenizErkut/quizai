// app/api/admin/meb-upload/route.ts
// MEB kaynağı yükle — PDF parse + chunk + embed + Supabase kaydet
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

// Embedding üret — Anthropic'te embedding yok, Gemini kullan
async function embedText(text: string): Promise<{ values: number[] | null; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { values: null, error: 'GEMINI_API_KEY eksik — embedding atlandı, metin yine de kaydedildi' }
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text: text.slice(0, 2000) }] } })
      }
    )
    if (!res.ok) {
      const err = await res.text()
      console.error('[meb-upload] Gemini API error:', res.status, err)
      return { values: null, error: `Gemini ${res.status}: ${err.slice(0, 100)}` }
    }
    const data = await res.json()
    return { values: data?.embedding?.values || null }
  } catch (e: any) {
    console.error('[meb-upload] embed error:', e)
    return { values: null, error: e.message }
  }
}


// Storage'dan PDF oku ve işle (büyük dosyalar için)
async function processFromStorage(body: {
  storage_path: string; file_url: string;
  title: string; grade: string; subject: string; unit: string; level: string
}) {
  const { storage_path, file_url, title, grade, subject, unit, level } = body

  // Storage'dan dosyayı indir
  const { data: fileData, error: dlErr } = await adminDb.storage
    .from('meb-resources')
    .download(storage_path)

  if (dlErr || !fileData) {
    return NextResponse.json({ error: `Storage indirme hatası: ${dlErr?.message}` }, { status: 500 })
  }

  let rawText = ''
  try {
    const pdfParse = require('pdf-parse')
    const bytes = await fileData.arrayBuffer()
    const parsed = await pdfParse(Buffer.from(bytes))
    rawText = parsed.text || ''
    console.log(`[meb-upload] Storage PDF parsed: ${rawText.length} chars`)
  } catch (e: any) {
    console.warn('[meb-upload] pdf-parse failed:', e.message)
    rawText = `[PDF yüklendi: ${file_url}]`
  }

  const { data: resource, error: resErr } = await adminDb
    .from('meb_resources')
    .insert({ title, grade, subject, unit, level, source_type: 'pdf', file_url, raw_text: rawText })
    .select('id').single()

  if (resErr || !resource) {
    return NextResponse.json({ error: `DB kayıt hatası: ${resErr?.message}` }, { status: 500 })
  }

  const chunks = chunkText(rawText)
  let embeddedCount = 0, embedError = ''

  for (let i = 0; i < chunks.length; i++) {
    const { values: embedding, error: embedErr } = await embedText(chunks[i])
    if (embedErr && !embedError) embedError = embedErr

    await adminDb.from('meb_chunks').insert({
      resource_id: resource.id, chunk_index: i,
      content: chunks[i], embedding: embedding ? JSON.stringify(embedding) : null,
      grade, subject, unit, level,
    })
    if (embedding) embeddedCount++
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 200))
  }

  return NextResponse.json({
    success: true, resource_id: resource.id,
    chunks: chunks.length, embedded: embeddedCount,
    chars: rawText.length, warning: embedError || undefined,
  })
}

export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json().catch(() => null)

    // JSON body: storage-path mode (büyük PDF'ler için)
    if (body && body.storage_path) {
      return await processFromStorage(body)
    }

    // FormData mode (küçük dosyalar / metin için)
    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })

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

    if (file && file.size > 0) {
      const ext = file.name.split('.').pop()
      const path = `${level}/${subject}/${unit.replace(/\s+/g, '_')}_${Date.now()}.${ext}`
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

      if (ext === 'pdf' && !rawText) {
        try {
          const pdfParse = require('pdf-parse')
          const parsed = await pdfParse(Buffer.from(bytes))
          rawText = parsed.text || ''
          console.log(`[meb-upload] PDF parsed: ${rawText.length} chars`)
        } catch (e) {
          console.warn('[meb-upload] pdf-parse failed')
        }
      }
    }

    if (!rawText && !fileUrl) {
      return NextResponse.json({ error: 'Dosya veya metin içeriği gerekli' }, { status: 400 })
    }

    // rawText tamamen boşsa dosya yüklendi ama metin çıkarılamadı — yine kaydet
    if (!rawText && fileUrl) {
      rawText = `[Dosya yüklendi: ${fileUrl}]`
    }

    // meb_resources tablosuna kaydet
    const { data: resource, error: resErr } = await adminDb
      .from('meb_resources')
      .insert({ title, grade, subject, unit, level, source_type: file ? 'pdf' : 'text', file_url: fileUrl, raw_text: rawText })
      .select('id')
      .single()

    if (resErr || !resource) {
      return NextResponse.json({ error: `DB kayıt hatası: ${resErr?.message}` }, { status: 500 })
    }

    // Chunk'lara böl ve embed et
    const chunks = chunkText(rawText)
    console.log(`[meb-upload] ${chunks.length} chunks created`)

    let embeddedCount = 0
    let embedError = ''

    // Chunk'ları batch halinde kaydet (tek tek değil — rate limit için)
    for (let i = 0; i < chunks.length; i++) {
      const { values: embedding, error: embedErr } = await embedText(chunks[i])
      if (embedErr && !embedError) embedError = embedErr

      const { error: insertErr } = await adminDb.from('meb_chunks').insert({
        resource_id: resource.id,
        chunk_index: i,
        content: chunks[i],
        embedding: embedding ? JSON.stringify(embedding) : null,
        grade, subject, unit, level,
      })

      if (insertErr) {
        console.error(`[meb-upload] chunk ${i} insert error:`, insertErr.message)
      } else {
        if (embedding) embeddedCount++
      }

      // Rate limit için kısa bekleme
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 200))
    }

    console.log(`[meb-upload] SUCCESS: ${chunks.length} chunks, ${embeddedCount} embedded`)
    return NextResponse.json({
      success: true,
      resource_id: resource.id,
      chunks: chunks.length,
      embedded: embeddedCount,
      chars: rawText.length,
      warning: embedError || undefined,
    })
  } catch (e: any) {
    console.error('[meb-upload] error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// Kaynakları listele
export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const level = searchParams.get('level')
  const subject = searchParams.get('subject')

  let query = adminDb
    .from('meb_resources')
    .select('id, title, grade, subject, unit, level, source_type, created_at, raw_text')
    .order('created_at', { ascending: false })

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
