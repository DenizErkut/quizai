// Açık Uçlu senaryo sorusu için kâğıttan cevap: fotoğraf/tarama → el yazısı AYNEN metne (puanlama yok) → öğrenci kontrol eder → puanlanır.
// Fotoğraflar yalnızca transkripsiyon için modele gönderilir; saklanmaz. Yalnızca henüz puanlanmamış kendi soruna yüklenir.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server-create-client'
import { getAuthedUser } from '@/lib/report-context'
import { CLAUDE_SONNET, SONNET_PARAMS, responseText, sonnetTokens } from '@/lib/claude-models'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { gradeOpenEndedAnswer } from '@/lib/open-ended-grading'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { errorResponse } from '@/lib/api-error'
import { parseAnswerTable } from '@/lib/open-ended-scenarios'

export const runtime = 'nodejs'
export const maxDuration = 120

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const anthropic = new Anthropic()
const MAX_IMAGES = 6
const MAX_BASE64_CHARS = 5_000_000
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
    const body = await req.json().catch(() => null) as { action?: string; sessionId?: string; images?: Array<{ mediaType?: string; data?: string }>; text?: string } | null
    if (!body?.action || !body.sessionId || !/^[0-9a-f-]{36}$/i.test(body.sessionId)) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
    const limit = await checkRateLimit(user.id, { endpoint: `open-ended-paper-${body.action}`, limit: 30 })
    if (!limit.allowed) return rateLimitExceeded(limit)
    const { data: session } = await db.from('open_ended_sessions').select('*').eq('id', body.sessionId).eq('user_id', user.id).maybeSingle()
    if (!session) return NextResponse.json({ error: 'Soru bulunamadı.' }, { status: 404 })
    if (session.graded_at) return NextResponse.json({ error: 'Bu soru zaten puanlanmış.' }, { status: 409 })

    if (body.action === 'transcribe') {
      const images = Array.isArray(body.images) ? body.images : []
      if (!images.length || images.length > MAX_IMAGES
        || images.some(image => !MEDIA_TYPES.has(String(image?.mediaType)) || typeof image?.data !== 'string')
        || images.reduce((sum, image) => sum + (image.data?.length || 0), 0) > MAX_BASE64_CHARS) {
        return NextResponse.json({ error: `1-${MAX_IMAGES} adet JPEG/PNG görsel yükleyin (fotoğraflar otomatik küçültülür).` }, { status: 400 })
      }
      const table = parseAnswerTable(session.answer_table)
      const response = await anthropic.messages.create({
        model: CLAUDE_SONNET, ...SONNET_PARAMS, max_tokens: sonnetTokens(3000),
        messages: [{ role: 'user', content: [
          ...images.map(image => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: image.mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data: image.data as string } })),
          { type: 'text' as const, text: `Bu görseller bir öğrencinin ELLE yazdığı açık uçlu soru cevabıdır.\nSoru: ${String(session.question).replace(/\s+/g, ' ').slice(0, 400)}\n${table ? 'Cevap bir tabloyu doldurmayı içeriyor; her satır için hücre değerlerini "Satır → Sütun: değer; Sütun: değer" biçiminde yaz.\n' : ''}GÖREVİN YALNIZCA TRANSKRİPSİYON: yazılanı AYNEN kopyala. Yazım hatalarını düzeltme, eksik cümleyi tamamlama, yorum yapma, puanlama yapma. Okunamayan sözcüğü [okunamadı] yaz. Cevap yoksa text boş olsun.\nSADECE JSON: {"text":"...","legible":true,"note":""}` },
        ] }],
      })
      await logAnthropicUsage('open-ended-paper-transcribe', CLAUDE_SONNET, response, { userId: user.id })
      const raw = responseText(response)
      let parsed: { text?: unknown; legible?: unknown; note?: unknown } | null = null
      try { parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) } catch { parsed = null }
      if (!parsed) return NextResponse.json({ error: 'Kâğıt okunamadı. Daha net ve düz bir fotoğrafla tekrar deneyin.' }, { status: 422 })
      return NextResponse.json({ text: String(parsed.text || '').trim().slice(0, 4000), legible: parsed.legible !== false, note: String(parsed.note || '').slice(0, 200) })
    }

    if (body.action === 'save') {
      const text = String(body.text || '').trim().slice(0, 4000)
      if (text.length < 3) return NextResponse.json({ error: 'Cevap boş olamaz.' }, { status: 400 })
      const graded = await gradeOpenEndedAnswer(session, text, user.id, 'open-ended-paper-grade')
      await db.from('open_ended_sessions').update({
        student_answer: text, criteria_results: graded.criteriaResults, total_earned: graded.totalEarned,
        overall_feedback: graded.overallFeedback, graded_at: new Date().toISOString(), source: 'paper',
      }).eq('id', session.id)
      return NextResponse.json({ criteriaResults: graded.criteriaResults, overallFeedback: graded.overallFeedback, totalEarned: graded.totalEarned, totalPossible: session.total_possible })
    }
    return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 })
  } catch (error) {
    return errorResponse('open-ended/paper', error, 'Bir hata oluştu, tekrar dene.')
  }
}
