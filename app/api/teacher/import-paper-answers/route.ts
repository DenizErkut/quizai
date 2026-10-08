// app/api/teacher/import-paper-answers/route.ts
//
// Printed open-ended sheets come back as paper. The teacher photographs/scans ONE student's sheet and
// imports it per student in three steps:
//   transcribe → vision model copies the handwriting verbatim (no grading); the teacher reviews/edits
//   save       → each answer is graded with the assignment's rubric (same grader as online answers)
//                and stored as an ordinary open_ended_sessions row (source: 'paper')
//   adjust     → the teacher can correct any criterion score afterwards
// Scan images are only sent to the model for transcription; they are NOT stored.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server-create-client'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { gradeOpenEndedAnswer, stripForeignScripts } from '@/lib/open-ended-grading'
import { shortSheetCode } from '@/lib/open-ended-print'

export const maxDuration = 120
export const runtime = 'nodejs'

const anthropic = new Anthropic()
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const MAX_IMAGES = 6
const MAX_BASE64_CHARS = 4_200_000
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

async function authorize(req: NextRequest, assignmentIds: unknown, studentId: unknown) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return { error: NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 }) }
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { error: NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 }) }
  const { data: teacher } = await supabase.from('teachers').select('id, approved').eq('user_id', user.id).maybeSingle()
  if (!teacher?.approved) return { error: NextResponse.json({ error: 'Onaylı öğretmen hesabı gerekir.' }, { status: 403 }) }
  const ids = Array.isArray(assignmentIds) ? [...new Set(assignmentIds.filter((id): id is string => typeof id === 'string'))] : []
  if (!ids.length || ids.length > 10 || typeof studentId !== 'string' || !studentId) {
    return { error: NextResponse.json({ error: 'Ödev ve öğrenci seçin.' }, { status: 400 }) }
  }
  const { data: rows } = await supabase.from('open_ended_assignments').select('*').in('id', ids)
  const byId = new Map((rows || []).map(row => [row.id as string, row]))
  const assignments = ids.map(id => byId.get(id))
  if (assignments.some(row => !row || row.teacher_id !== teacher.id)) {
    return { error: NextResponse.json({ error: 'Bu ödevler size ait değil.' }, { status: 403 }) }
  }
  const list = assignments as any[]
  if (new Set(list.map(row => row.classroom_id)).size !== 1) {
    return { error: NextResponse.json({ error: 'Seçilen ödevler aynı sınıfa ait olmalı.' }, { status: 400 }) }
  }
  const { data: membership } = await supabase.from('classroom_students').select('student_id')
    .eq('classroom_id', list[0].classroom_id).eq('student_id', studentId).maybeSingle()
  if (!membership) return { error: NextResponse.json({ error: 'Bu öğrenci ödevin atandığı sınıfta değil.' }, { status: 403 }) }
  return { user, teacher, assignments: list.sort((a, b) => (a.batch_index ?? 0) - (b.batch_index ?? 0)) }
}

function totalPossible(rubric: any[]): number {
  return (Array.isArray(rubric) ? rubric : []).reduce((sum, r) => sum + (Number(r.maxPoints) || 0), 0)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.action !== 'string') return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
    const auth = await authorize(req, body.assignment_ids ?? (body.assignment_id ? [body.assignment_id] : []), body.student_id)
    if ('error' in auth) return auth.error
    const { user, assignments } = auth

    if (body.action === 'transcribe') {
      const images = Array.isArray(body.images) ? body.images : []
      if (!images.length || images.length > MAX_IMAGES
        || images.some((image: any) => !MEDIA_TYPES.has(image?.mediaType) || typeof image?.data !== 'string')
        || images.reduce((sum: number, image: any) => sum + image.data.length, 0) > MAX_BASE64_CHARS) {
        return NextResponse.json({ error: `1-${MAX_IMAGES} adet JPEG/PNG görsel yükleyin (toplam en fazla ~3 MB; fotoğraflar otomatik küçültülür).` }, { status: 400 })
      }
      const questionList = assignments.map((a, index) => `Soru ${index + 1}: ${String(a.question).slice(0, 220)}`).join('\n')
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5', max_tokens: 3500,
        messages: [{ role: 'user', content: [
          ...images.map((image: any) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: image.mediaType, data: image.data } })),
          { type: 'text' as const, text: `Bu görseller bir öğrencinin ELLE doldurduğu açık uçlu soru kâğıdıdır. Kâğıtta ${assignments.length} soru var:\n${questionList}\n\nGÖREVİN YALNIZCA TRANSKRİPSİYON: her sorunun cevap alanına yazılanı AYNEN, öğrencinin yazdığı gibi kopyala. Yazım hatalarını düzeltme, eksik cümleyi tamamlama, yorum yapma, puanlama yapma. Okunamayan sözcüğü [okunamadı] yaz. Cevabı soru numarasına/alanına göre eşle; cevap yazılmamışsa text boş olsun. Kâğıtta yazan öğrenci adını ve "Ödev kodu" varsa onu da oku (yoksa null).\nSADECE JSON: {"studentName":null,"sheetCode":null,"answers":[{"question":1,"text":"...","legible":true,"note":""}]}` },
        ] }],
      })
      await logAnthropicUsage('import-paper-transcribe', 'claude-sonnet-4-5', response, { userId: user.id })
      const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
      let parsed: any
      try { parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) } catch { parsed = null }
      if (!parsed || !Array.isArray(parsed.answers)) return NextResponse.json({ error: 'Kâğıt okunamadı. Daha net ve düz bir fotoğrafla tekrar deneyin.' }, { status: 422 })
      const expectedCode = shortSheetCode(assignments[0].batch_id || assignments[0].id)
      const answers = assignments.map((a, index) => {
        const found = parsed.answers.find((item: any) => Number(item?.question) === index + 1)
        return { index, assignmentId: a.id, text: String(found?.text || '').trim().slice(0, 4000), legible: found?.legible !== false, note: String(found?.note || '').slice(0, 200) }
      })
      const sheetCode = typeof parsed.sheetCode === 'string' ? parsed.sheetCode.trim().toUpperCase() : null
      return NextResponse.json({
        answers, expectedCode, sheetCode, codeMatches: sheetCode ? sheetCode === expectedCode : null,
        studentNameOnPaper: typeof parsed.studentName === 'string' ? parsed.studentName.slice(0, 80) : null,
      })
    }

    if (body.action === 'save') {
      const submitted: Array<{ assignmentId: string; text: string }> = Array.isArray(body.answers) ? body.answers : []
      const textById = new Map(submitted.map(item => [String(item.assignmentId), String(item.text || '').trim().slice(0, 4000)]))
      const { data: existingRows } = await supabase.from('open_ended_sessions').select('id, assignment_id, graded_at')
        .eq('user_id', body.student_id).in('assignment_id', assignments.map(a => a.id))
      const existing = new Map((existingRows || []).map(row => [row.assignment_id as string, row]))
      const conflicts = assignments.filter(a => existing.get(a.id)?.graded_at).map(a => a.title)
      if (conflicts.length && body.replace !== true) {
        return NextResponse.json({ error: 'Bu öğrenci bu ödev(ler)i zaten tamamlamış. Üzerine yazmak için onaylayın.', conflicts }, { status: 409 })
      }
      const results = await Promise.all(assignments.map(async (a, index) => {
        const answer = textById.get(a.id) || ''
        const session = { grade: a.grade, subject: a.subject, scenario: a.scenario, question: a.question, rubric: a.rubric, total_possible: totalPossible(a.rubric) }
        const graded = answer
          ? await gradeOpenEndedAnswer(session, answer, user.id, 'import-paper-grade')
          : { criteriaResults: (a.rubric as any[]).map(r => ({ criterion: stripForeignScripts(String(r.criterion || 'Kriter')), maxPoints: Number(r.maxPoints) || 0, earnedPoints: 0, feedback: 'Kâğıtta bu soru için cevap bulunamadı.' })), overallFeedback: 'Bu soru cevaplanmamış.', totalEarned: 0 }
        const row = {
          user_id: body.student_id, assignment_id: a.id, grade: a.grade, subject: a.subject, topic: a.topic, scenario: a.scenario, question: a.question,
          rubric: a.rubric, total_possible: session.total_possible, student_answer: answer, criteria_results: graded.criteriaResults,
          total_earned: graded.totalEarned, overall_feedback: graded.overallFeedback, graded_at: new Date().toISOString(),
          source: 'paper', imported_by: user.id, teacher_adjusted: false,
        }
        const old = existing.get(a.id)
        const write = old
          ? await supabase.from('open_ended_sessions').update(row).eq('id', old.id)
          : await supabase.from('open_ended_sessions').insert(row)
        if (write.error) throw new Error(`Soru ${index + 1} kaydedilemedi.`)
        return { assignmentId: a.id, index, answered: Boolean(answer), totalEarned: graded.totalEarned, totalPossible: session.total_possible, criteriaResults: graded.criteriaResults, overallFeedback: graded.overallFeedback }
      }))
      return NextResponse.json({ results })
    }

    if (body.action === 'adjust') {
      const assignment = assignments[0]
      const { data: session } = await supabase.from('open_ended_sessions').select('id, criteria_results, rubric')
        .eq('assignment_id', assignment.id).eq('user_id', body.student_id).not('graded_at', 'is', null).maybeSingle()
      if (!session) return NextResponse.json({ error: 'Puanlanmış kayıt bulunamadı.' }, { status: 404 })
      const scores: unknown[] = Array.isArray(body.scores) ? body.scores : []
      const criteria = (session.criteria_results as any[]).map((criterion, index) => {
        const requested = Number(scores[index])
        const earnedPoints = Number.isFinite(requested) ? Math.min(Number(criterion.maxPoints) || 0, Math.max(0, Math.round(requested))) : criterion.earnedPoints
        return { ...criterion, earnedPoints }
      })
      const totalEarned = criteria.reduce((sum, criterion) => sum + (Number(criterion.earnedPoints) || 0), 0)
      const { error } = await supabase.from('open_ended_sessions').update({ criteria_results: criteria, total_earned: totalEarned, teacher_adjusted: true }).eq('id', session.id)
      if (error) return NextResponse.json({ error: 'Puan kaydedilemedi.' }, { status: 500 })
      return NextResponse.json({ criteriaResults: criteria, totalEarned })
    }

    return NextResponse.json({ error: 'Bilinmeyen işlem.' }, { status: 400 })
  } catch (e: any) {
    console.error('[teacher/import-paper-answers]', e?.message)
    return NextResponse.json({ error: e?.message || 'Bir hata oluştu, tekrar dene.' }, { status: 500 })
  }
}
