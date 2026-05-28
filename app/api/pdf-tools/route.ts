// app/api/pdf-tools/route.ts
// PDF → Word ve PDF Küçültme işlemleri
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60 // Vercel timeout: 60sn

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
    }
    const token = authHeader.slice(7)
    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File
    const action = formData.get('action') as string // 'to-word' | 'compress'

    if (!file) return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 })
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'Dosya 20MB\'den küçük olmalı.' }, { status: 400 })

    console.log(`[pdf-tools] action=${action} file=${file.name} size=${file.size}`)

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    if (action === 'to-word') {
      // PDF → Word: pdf-parse/lib ile text çek (Vercel uyumlu), docx ile Word yap
      // NOT: `import('pdf-parse')` Vercel'de test dosyası arayıp crash eder.
      // Doğru yol: pdf-parse/lib/pdf-parse.js direkt import
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
      const data = await pdfParse(buffer, { max: 0 })

      console.log(`[pdf-tools] extracted text length: ${data.text?.length || 0}`)

      if (!data.text?.trim()) {
        return NextResponse.json({ error: 'pdf_image_only', message: 'Bu PDF taranmış görsel içeriyor, metin çıkarılamadı.' }, { status: 400 })
      }

      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')

      // Metni paragraflara böl
      const lines = data.text.split('\n').filter((l: string) => l.trim())
      const children: any[] = []

      // Başlık
      children.push(new Paragraph({
        text: file.name.replace('.pdf', ''),
        heading: HeadingLevel.HEADING_1,
      }))

      // İçerik
      let prevWasEmpty = false
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          if (!prevWasEmpty) children.push(new Paragraph({ text: '' }))
          prevWasEmpty = true
          continue
        }
        prevWasEmpty = false

        // Başlık olabilecek kısa satırlar (tamamen büyük harf, 3-80 karakter)
        const isHeading = trimmed.length < 80 && trimmed === trimmed.toUpperCase() && trimmed.length > 3
        if (isHeading) {
          children.push(new Paragraph({
            children: [new TextRun({ text: trimmed, bold: true, size: 28 })],
            spacing: { before: 200, after: 100 },
          }))
        } else {
          children.push(new Paragraph({
            children: [new TextRun({ text: trimmed, size: 24 })],
            spacing: { after: 80 },
          }))
        }
      }

      const doc = new Document({
        sections: [{ properties: {}, children }],
      })

      const docBuffer = await Packer.toBuffer(doc)
      const fileName = file.name.replace('.pdf', '') + '.docx'

      console.log(`[pdf-tools] docx created: ${docBuffer.length} bytes`)

      return new NextResponse(new Uint8Array(docBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
          'Content-Length': String(docBuffer.length),
        },
      })

    } else if (action === 'compress') {
      const { PDFDocument } = await import('pdf-lib')

      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })

      const compressedBytes = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 50,
      })

      const originalSize = buffer.length
      const compressedSize = compressedBytes.length
      const reduction = Math.round((1 - compressedSize / originalSize) * 100)

      const fileName = file.name.replace('.pdf', '') + '-kucuk.pdf'

      console.log(`[pdf-tools] compress: ${originalSize} → ${compressedSize} (${reduction}% azaldı)`)

      return new NextResponse(new Uint8Array(compressedBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
          'Content-Length': String(compressedSize),
          'X-Original-Size': String(originalSize),
          'X-Compressed-Size': String(compressedSize),
          'X-Reduction-Percent': String(reduction),
        },
      })
    }

    return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 })

  } catch (error: any) {
    console.error('[pdf-tools] error:', error?.message, error?.stack)
    return NextResponse.json({
      error: error?.message || 'İşlem başarısız.',
      detail: String(error),
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    }, { status: 500 })
  }
}
