// "Yazılıya Hazırlanıyorum": basılı kâğıda elle yazılan cevapların yüklenmesi (Açık Uçlu kâğıt aktarımıyla aynı akış).
//   transcribe → görsel modeli el yazısını AYNEN kopyalar (puanlama yok); öğrenci inceleyip düzeltir
//   save       → her cevap, sorunun rubriğiyle çevrim içi cevaplarla AYNI puanlayıcıyla değerlendirilir ve yeni bir deneme olarak kaydedilir
// Fotoğraflar yalnızca transkripsiyon için modele gönderilir; saklanmaz.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server-create-client'
import { getAuthedUser } from '@/lib/report-context'
import { CLAUDE_SONNET, SONNET_PARAMS, responseText, sonnetTokens } from '@/lib/claude-models'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { gradeOpenEndedAnswer, stripForeignScripts } from '@/lib/open-ended-grading'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { errorResponse } from '@/lib/api-error'
import { accessibleSet, loadProfile } from '@/lib/written-exam-server'
import { writtenSheetCode } from '@/lib/written-exam-print'
import { summarizeResults, type RubricCriterion } from '@/lib/written-exam'

export const runtime = 'nodejs'
export const maxDuration = 300

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const anthropic = new Anthropic()
const MAX_IMAGES = 8
const MAX_BASE64_CHARS = 5_000_000
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const GRADE_CHUNK = 4

type QuestionRow = { id: string; position: number; title: string; scenario: string; question: string; max_points: number; rubric: RubricCriterion[] }

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req)
    if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
    const body = await req.json().catch(() => null) as { action?: string; setId?: string; images?: Array<{ mediaType?: string; data?: string }>; answers?: Array<{ questionId?: string; text?: string }> } | null
    if (!body?.action || !body.setId) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
    const limit = await checkRateLimit(user.id, { endpoint: `written-paper-${body.action}`, limit: body.action === 'transcribe' ? 20 : 20 })
    if (!limit.allowed) return rateLimitExceeded(limit)
    const profile = await loadProfile(db, user.id)
    const set = await accessibleSet(db, body.setId, profile)
    if (!set) return NextResponse.json({ error: 'Bu yazılı sana açık değil.' }, { status: 404 })
    const { data: questionData } = await db.from('written_exam_questions').select('id,position,title,scenario,question,max_points,rubric').eq('set_id', set.id).order('position')
    const questions = (questionData || []) as QuestionRow[]
    if (!questions.length) return NextResponse.json({ error: 'Bu yazılıda soru yok.' }, { status: 404 })

    if (body.action === 'transcribe') {
      const images = Array.isArray(body.images) ? body.images : []
      if (!images.length || images.length > MAX_IMAGES
        || images.some(image => !MEDIA_TYPES.has(String(image?.mediaType)) || typeof image?.data !== 'string')
        || images.reduce((sum, image) => sum + (image.data?.length || 0), 0) > MAX_BASE64_CHARS) {
        return NextResponse.json({ error: `1-${MAX_IMAGES} adet JPEG/PNG görsel yükleyin (fotoğraflar otomatik küçültülür).` }, { status: 400 })
      }
      const list = questions.map(q => `Soru ${q.position}: ${q.question.replace(/\s+/g, ' ').slice(0, 200)}`).join('\n')
      const response = await anthropic.messages.create({
        model: CLAUDE_SONNET, ...SONNET_PARAMS, max_tokens: sonnetTokens(6000),
        messages: [{ role: 'user', content: [
          ...images.map(image => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: image.mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data: image.data as string } })),
          { type: 'text' as const, text: `Bu görseller bir öğrencinin ELLE doldurduğu yazılı sınav kâğıdıdır. Kâğıtta ${questions.length} soru var:\n${list}\n\nGÖREVİN YALNIZCA TRANSKRİPSİYON: her sorunun cevap alanına yazılanı AYNEN, öğrencinin yazdığı gibi kopyala (alt maddeleri a), b), c) ile birlikte). Yazım hatalarını düzeltme, eksik cümleyi tamamlama, yorum yapma, puanlama yapma. Okunamayan sözcüğü [okunamadı] yaz. Sayıları ve rakamları (2/3/7/1 gibi karışabilenleri) tek tek dikkatle oku; emin değilsen yazıp ardına [?] ekle ve note alanında belirt. Soru metnindeki sayılara göre tahmin ETME; kâğıtta gördüğünü yaz. Cevabı soru numarasına göre eşle; cevap yazılmamışsa text boş olsun. Kâğıtta "Kâğıt kodu" yazıyorsa onu da oku (yoksa null).\nSADECE JSON: {"sheetCode":null,"answers":[{"question":1,"text":"...","legible":true,"note":""}]}` },
        ] }],
      })
      await logAnthropicUsage('written-paper-transcribe', CLAUDE_SONNET, response, { userId: user.id })
      const text = responseText(response)
      let parsed: { sheetCode?: unknown; answers?: Array<{ question?: unknown; text?: unknown; legible?: unknown; note?: unknown }> } | null = null
      try { parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) } catch { parsed = null }
      if (!parsed || !Array.isArray(parsed.answers)) return NextResponse.json({ error: 'Kâğıt okunamadı. Daha net ve düz bir fotoğrafla tekrar deneyin.' }, { status: 422 })
      const answers = questions.map(q => {
        const found = parsed!.answers!.find(item => Number(item?.question) === q.position)
        return { questionId: q.id, position: q.position, maxPoints: q.max_points, text: String(found?.text || '').trim().slice(0, 4000), legible: found?.legible !== false, note: String(found?.note || '').slice(0, 200) }
      })
      const expectedCode = writtenSheetCode(set.id)
      const sheetCode = typeof parsed.sheetCode === 'string' ? parsed.sheetCode.trim().toUpperCase() : null
      return NextResponse.json({ answers, expectedCode, sheetCode, codeMatches: sheetCode ? sheetCode === expectedCode : null })
    }

    if (body.action === 'save') {
      const submitted = new Map((Array.isArray(body.answers) ? body.answers : []).map(item => [String(item.questionId), String(item.text || '').trim().slice(0, 4000)]))
      const { data: attempt, error: attemptError } = await db.from('written_exam_attempts').insert({ user_id: user.id, set_id: set.id, total_possible: set.total_points }).select('id').single()
      if (attemptError || !attempt) return NextResponse.json({ error: 'Deneme kaydedilemedi.' }, { status: 500 })
      const results: Array<{ questionId: string; position: number; title: string; maxPoints: number; graded: true; earned: number; studentAnswer: string; criteriaResults: unknown; overallFeedback: string }> = []
      for (let start = 0; start < questions.length; start += GRADE_CHUNK) {
        const chunk = questions.slice(start, start + GRADE_CHUNK)
        results.push(...await Promise.all(chunk.map(async q => {
          const answer = submitted.get(q.id) || ''
          const session = { grade: profile.grade, subject: set.subject, scenario: q.scenario, question: q.question, rubric: q.rubric, total_possible: q.max_points }
          const graded = answer
            ? await gradeOpenEndedAnswer(session, answer, user.id, 'written-paper-grade')
            : { criteriaResults: q.rubric.map(r => ({ criterion: stripForeignScripts(String(r.criterion || 'Kriter')), maxPoints: Number(r.maxPoints) || 0, earnedPoints: 0, feedback: 'Kâğıtta bu soru için cevap bulunamadı.' })), overallFeedback: 'Bu soru cevaplanmamış.', totalEarned: 0 }
          const { data: row, error } = await db.from('open_ended_sessions').insert({
            user_id: user.id, grade: profile.grade, subject: set.subject, topic: q.title || set.title, scenario: q.scenario, question: q.question,
            rubric: q.rubric, total_possible: q.max_points, student_answer: answer, criteria_results: graded.criteriaResults, total_earned: graded.totalEarned,
            overall_feedback: graded.overallFeedback, graded_at: new Date().toISOString(), source: 'paper',
          }).select('id').single()
          if (error || !row) throw new Error(`Soru ${q.position} kaydedilemedi.`)
          const { error: linkError } = await db.from('written_exam_attempt_items').insert({ attempt_id: attempt.id, question_id: q.id, session_id: row.id })
          if (linkError) throw new Error(`Soru ${q.position} bağlanamadı.`)
          return { questionId: q.id, position: q.position, title: q.title, maxPoints: q.max_points, graded: true as const, earned: graded.totalEarned, studentAnswer: answer, criteriaResults: graded.criteriaResults, overallFeedback: graded.overallFeedback }
        })))
      }
      const summary = summarizeResults(results.map(r => ({ questionId: r.questionId, maxPoints: r.maxPoints, earned: r.earned })))
      await db.from('written_exam_attempts').update({ status: 'completed', total_earned: summary.totalEarned, total_possible: summary.totalPossible, completed_at: new Date().toISOString() }).eq('id', attempt.id)
      return NextResponse.json({ attemptId: attempt.id, questions: results, summary })
    }
    return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 })
  } catch (error) {
    return errorResponse('student/written-exams/paper', error, 'Bir hata oluştu, tekrar dene.')
  }
}
