import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { requireAdmin, supabaseAdmin as db } from '@/lib/auth-middleware'
import { bookletImageSvg } from '@/lib/booklet-image'
import { PDFDocument } from 'pdf-lib'
import { bookletQuestionLabels, printedQuestionNumber } from '@/lib/booklet-objective-label'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const resourceId = req.nextUrl.searchParams.get('resourceId')
  if (!resourceId) return NextResponse.json({ error: 'Kitapçık seçin.' }, { status: 400 })
  const { data, error } = await db.from('question_bank').select('id,question,review_status').contains('question', { bookletResourceId: resourceId }).limit(500)
  if (error) return NextResponse.json({ error: 'Sorular alınamadı.' }, { status: 503 })
  const { data: resource, error: resourceError } = await db.from('exam_resources').select('raw_text').eq('id', resourceId).maybeSingle()
  if (resourceError) return NextResponse.json({ error: 'Kaynak soru numaraları alınamadı.' }, { status: 503 })
  const labels = bookletQuestionLabels(resource?.raw_text || '')
  const questions = (data || []).map(item => ({ ...item, sourceQuestionNumber: printedQuestionNumber(String(item.question?.q || ''), labels) }))
    .sort((a, b) => (a.sourceQuestionNumber ?? Infinity) - (b.sourceQuestionNumber ?? Infinity))
  return NextResponse.json({ questions })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const form = await req.formData()
  const file = form.get('image')
  const id = String(form.get('questionId') || '')
  const resourceId = String(form.get('resourceId') || '')
  if (!(file instanceof File) || file.size > 2_000_000 || form.get('confirmed') !== 'true') return NextResponse.json({ error: 'En fazla 2 MB PNG/JPEG yükleyin ve görseli kontrol ettiğinizi onaylayın.' }, { status: 400 })
  const [{ data: row }, { data: resource }] = await Promise.all([
    db.from('question_bank').select('id,question,updated_at,review_status').eq('id', id).maybeSingle(),
    db.from('exam_resources').select('id,source_type,purpose,review_status').eq('id', resourceId).maybeSingle(),
  ])
  if (!row || row.question?.bookletResourceId !== resourceId || !resource || !['teacher','ai'].includes(resource.source_type) || resource.purpose !== 'instant_test' || resource.review_status !== 'approved' || !(row.review_status === 'approved' || (row.review_status === 'candidate' && row.question.requiresBookletVisual))) return NextResponse.json({ error: 'Onaylı kitapçığa ait onaylı veya görseli bekleyen soru gerekli.' }, { status: 409 })
  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    // Native decoding rejects malformed files before anything is stored.
    if (bytes.length > 24 && bytes[0] === 137) bookletImageSvg(bytes, bytes.readUInt32BE(16), bytes.readUInt32BE(20))
    const document = await PDFDocument.create()
    const image = bytes[0] === 137 ? await document.embedPng(bytes) : await document.embedJpg(bytes)
    const svg = bookletImageSvg(bytes, image.width, image.height)
    const question = { ...row.question, svg, qtype: 'svg', hasVisual: true, requiresBookletVisual: false, visualKind: 'booklet_image', visualQuestionText: row.question.q,
      visualSource: 'human_verified_booklet_image', visualReviewedBy: auth.user.id, visualReviewedAt: new Date().toISOString() }
    const fingerprint = createHash('sha256').update(`${question.q}|${question.opts.join('|')}|${svg}`.toLocaleLowerCase('tr')).digest('hex')
    const { data, error } = await db.from('question_bank').update({ question, fingerprint, review_status: 'approved', updated_at: new Date().toISOString() }).eq('id', id).eq('updated_at', row.updated_at).select('id').maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'Soru değişmiş veya kayıt yapılamadı. Yenileyip tekrar deneyin.' }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Görsel okunamadı. Geçerli PNG/JPEG ve en fazla 12 megapiksel kullanın.' }, { status: 400 })
  }
}
