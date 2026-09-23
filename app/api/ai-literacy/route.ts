// app/api/ai-literacy/route.ts — AI Literacy Mode API.
//
// 23 Eylül 2026 — bkz. lib/ai-literacy-generation.ts başlık yorumu.
// POST   → yeni bir "hangisi doğru?" mücadelesi üretir (doğru cevabı
//          öğrenciye GÖNDERMEDEN önce veritabanına yazar).
// PATCH  → öğrencinin seçimini + gerekçesini kaydeder, doğruluğu
//          otomatik değerlendirir ve geri bildirimi (flaw_explanation/
//          correct_reasoning) döner.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { generateAILiteracyChallenge } from '@/lib/ai-literacy-generation'

export const maxDuration = 60
export const runtime = 'nodejs'

function authClient(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any
}

export async function POST(req: NextRequest) {
  const supabase = authClient(req)
  if (!supabase) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
  if (!subject || !topic) return NextResponse.json({ error: 'Ders ve konu gerekli.' }, { status: 400 })

  try {
    const { data: profile } = await supabase.from('profiles').select('grade').eq('id', user.id).maybeSingle()
    const challenge = await generateAILiteracyChallenge(subject, topic, profile?.grade || undefined, user.id)

    const { data: inserted, error } = await supabase
      .from('ai_literacy_challenges')
      .insert({
        student_id: user.id,
        subject, topic, grade: profile?.grade || null,
        question: challenge.question,
        answer_a: challenge.answerA,
        answer_b: challenge.answerB,
        correct_choice: challenge.correctChoice,
        flaw_type: challenge.flawType,
        flaw_explanation: challenge.flawExplanation,
        correct_reasoning: challenge.correctReasoning,
      })
      .select('id, question, answer_a, answer_b, created_at')
      .single()
    if (error || !inserted) throw error || new Error('insert_failed')

    // Doğru cevabı ASLA bu yanıtta göndermiyoruz — öğrenci PATCH'e kadar
    // hangisinin doğru olduğunu bilmemeli.
    return NextResponse.json({
      id: inserted.id,
      question: inserted.question,
      answerA: inserted.answer_a,
      answerB: inserted.answer_b,
      createdAt: inserted.created_at,
    })
  } catch (err) {
    console.error('[ai-literacy] POST error:', err)
    return NextResponse.json({ error: 'Mücadele üretilemedi, lütfen tekrar dene.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = authClient(req)
  if (!supabase) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  const choice = body.choice === 'A' || body.choice === 'B' ? body.choice : null
  const reasoning = typeof body.reasoning === 'string' ? body.reasoning.trim().slice(0, 2000) : ''
  if (!id || !choice) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })

  try {
    const { data: existing } = await supabase
      .from('ai_literacy_challenges')
      .select('id, student_id, correct_choice, flaw_explanation, correct_reasoning, answered_at')
      .eq('id', id)
      .eq('student_id', user.id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 })
    if (existing.answered_at) return NextResponse.json({ error: 'Bu mücadele zaten cevaplanmış.' }, { status: 409 })

    const isCorrect = choice === existing.correct_choice
    const { error } = await supabase
      .from('ai_literacy_challenges')
      .update({ student_choice: choice, student_reasoning: reasoning || null, is_correct: isCorrect, answered_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    return NextResponse.json({
      isCorrect,
      correctChoice: existing.correct_choice,
      flawExplanation: existing.flaw_explanation,
      correctReasoning: existing.correct_reasoning,
    })
  } catch (err) {
    console.error('[ai-literacy] PATCH error:', err)
    return NextResponse.json({ error: 'Cevap kaydedilemedi.' }, { status: 500 })
  }
}
