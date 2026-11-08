// Basılı Test/Quiz cevap kâğıtlarını içe aktarır (QR ile eşlenen optik cevap kâğıdı).
//   read → görsellerdeki işaretli şıklar okunur (yapay zekâ görüntü okuma; yalnızca işaretleri okur, puanlamaz)
//   save → öğretmenin kontrol ettiği şıklar dondurulmuş soru setine göre puanlanır; quiz_sessions + assignment_completions yazılır
// Fotoğraflar yalnızca okunmak için işlenir, saklanmaz.
import { CLAUDE_SONNET, SONNET_PARAMS, responseText, sonnetTokens } from '@/lib/claude-models'
import { NextRequest, NextResponse } from 'next/server'
import { gateTeacherFeature } from '@/lib/teacher-access'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server-create-client'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { hasOptions } from '@/lib/quiz-print'

export const maxDuration = 120
export const runtime = 'nodejs'
const anthropic = new Anthropic()
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BASE64_CHARS = 4_200_000
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

type Q = { q?: string; opts?: string[]; ans?: number; exp?: string; blank?: string }
type Img = { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.action !== 'string' || typeof body.assignment_id !== 'string') return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
    const { data: teacher } = await supabase.from('teachers').select('id, approved').eq('user_id', user.id).maybeSingle()
    if (!teacher?.approved) return NextResponse.json({ error: 'Onaylı öğretmen hesabı gerekir.' }, { status: 403 })
    const blocked = await gateTeacherFeature(user.id, 'export_import')
    if (blocked) return blocked

    const { data: assignment } = await supabase.from('assignments').select('id, teacher_id, classroom_id, title, topic, grade, question_type, pool_questions').eq('id', body.assignment_id).maybeSingle()
    if (!assignment || assignment.teacher_id !== teacher.id) return NextResponse.json({ error: 'Bu ödev size ait değil.' }, { status: 403 })
    const questions = (Array.isArray(assignment.pool_questions) ? assignment.pool_questions : []) as Q[]
    if (!questions.length) return NextResponse.json({ error: 'Bu ödevin sabit soru seti yok; kâğıt aktarımı yalnızca "havuzdan çek" ile oluşturulan ödevlerde çalışır.' }, { status: 400 })

    if (body.action === 'read') {
      const images: Img[] = Array.isArray(body.images) ? body.images : []
      if (!images.length || images.length > 3 || images.some(image => !MEDIA_TYPES.has(String(image?.mediaType)) || typeof image?.data !== 'string')
        || images.reduce((sum, image) => sum + image.data.length, 0) > MAX_BASE64_CHARS) {
        return NextResponse.json({ error: '1-3 adet JPEG/PNG görsel yükleyin.' }, { status: 400 })
      }
      const optionCounts = questions.map((question, index) => `${index + 1}: ${hasOptions(question) ? Math.min((question.opts as string[]).length, LETTERS.length) : 0} şık`).join(', ')
      const response = await anthropic.messages.create({
        model: CLAUDE_SONNET, ...SONNET_PARAMS, max_tokens: sonnetTokens(2000),
        messages: [{ role: 'user', content: [
          ...images.map(image => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: image.mediaType, data: image.data } })),
          { type: 'text' as const, text: `Bu görsel bir öğrencinin doldurduğu optik cevap kâğıdıdır (${questions.length} soru; şık sayıları — ${optionCounts}). Her soru satırında A, B, C... harfli balonlar var; öğrenci doğru şıkkın balonunu doldurmuştur. GÖREVİN YALNIZCA İŞARETLENEN ŞIKKI OKUMAK (puanlama yapma). Bir soruda hiçbir balon dolu değilse choice null; birden fazla balon dolu veya silinti/belirsizlik varsa choice en olası harf (belirsizse null) ve uncertain true olsun. Soru numarasını satırın başındaki sayıdan al.\nSADECE JSON: {"answers":[{"question":1,"choice":"B","uncertain":false}]}` },
        ] }],
      })
      await logAnthropicUsage('import-quiz-paper-read', CLAUDE_SONNET, response, { userId: user.id })
      const text = responseText(response)
      let parsed: { answers?: Array<{ question?: number; choice?: string | null; uncertain?: boolean }> } | null = null
      try { parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) } catch { parsed = null }
      const found = parsed?.answers
      if (!Array.isArray(found)) return NextResponse.json({ error: 'Kâğıt okunamadı. Daha net ve düz bir fotoğrafla tekrar deneyin.' }, { status: 422 })
      const answers = questions.map((question, index) => {
        const item = found.find(entry => Number(entry?.question) === index + 1)
        const letter = typeof item?.choice === 'string' ? item.choice.trim().toUpperCase() : ''
        const choice = LETTERS.indexOf(letter)
        const max = hasOptions(question) ? Math.min((question.opts as string[]).length, LETTERS.length) : 0
        return { index, choice: choice >= 0 && choice < max ? choice : -1, uncertain: item?.uncertain === true || (letter !== '' && (choice < 0 || choice >= max)) }
      })
      return NextResponse.json({ answers })
    }

    if (body.action === 'save') {
      if (typeof body.student_id !== 'string') return NextResponse.json({ error: 'Öğrenci seçin.' }, { status: 400 })
      const { data: membership } = await supabase.from('classroom_students').select('student_id').eq('classroom_id', assignment.classroom_id).eq('student_id', body.student_id).maybeSingle()
      if (!membership) return NextResponse.json({ error: 'Bu öğrenci ödevin atandığı sınıfta değil.' }, { status: 403 })
      const { data: existing } = await supabase.from('assignment_completions').select('assignment_id').eq('assignment_id', assignment.id).eq('student_id', body.student_id).maybeSingle()
      if (existing && body.replace !== true) return NextResponse.json({ error: 'Bu öğrenci bu ödevi zaten tamamlamış. Üzerine yazmak için onaylayın.' }, { status: 409 })
      const choices: number[] = Array.isArray(body.choices) ? body.choices.map((value: unknown) => Number.isInteger(value) ? Number(value) : -1) : []
      const answers = questions.map((question, index) => {
        const userAns = choices[index] ?? -1
        const scoreable = hasOptions(question) && typeof question.ans === 'number'
        return { userAns, correct: scoreable && userAns === question.ans }
      })
      const score = answers.filter(answer => answer.correct).length
      const scoreableCount = Math.max(1, questions.filter(question => hasOptions(question) && typeof question.ans === 'number').length)
      const pct = Math.round((score / scoreableCount) * 100)
      const sessionId = crypto.randomUUID()
      const { error: sessionError } = await supabase.from('quiz_sessions').insert({
        id: sessionId, user_id: body.student_id, topic: assignment.topic, grade: assignment.grade || null, language: 'tr',
        question_count: questions.length, questions, answers, score, pct, completed: true,
        question_type: assignment.question_type || 'mixed', gen_engine: 'paper-import-v1',
      })
      if (sessionError) { console.error('[import-quiz-paper] oturum', sessionError.message); return NextResponse.json({ error: 'Kayıt oluşturulamadı.' }, { status: 500 }) }
      const enriched = answers.map((answer, index) => {
        const question = questions[index]
        return {
          correct: answer.correct, question: question.q, student_answer: answer.userAns >= 0 ? (question.opts?.[answer.userAns] ?? '') : '(Boş)',
          correct_answer: question.opts?.[question.ans ?? -1] ?? question.blank ?? '', explanation: question.exp ?? '',
        }
      })
      const { error: completionError } = await supabase.from('assignment_completions').upsert({
        assignment_id: assignment.id, student_id: body.student_id, session_id: sessionId, score, pct, partial_score: score, partial_pct: pct,
        answers: enriched, completed_at: new Date().toISOString(),
      }, { onConflict: 'assignment_id,student_id' })
      if (completionError) { console.error('[import-quiz-paper] tamamlama', completionError.message); return NextResponse.json({ error: 'Ödev tamamlama kaydı yazılamadı.' }, { status: 500 }) }
      return NextResponse.json({ score, total: scoreableCount, pct })
    }

    return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 })
  } catch (error) {
    console.error('[import-quiz-paper]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Bir hata oluştu, tekrar dene.' }, { status: 500 })
  }
}
