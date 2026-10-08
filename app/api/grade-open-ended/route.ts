// app/api/grade-open-ended/route.ts
// Ogrencinin yazdigi cevabi, uretim sirasinda kaydedilen rubrige (dereceli
// puanlama anahtari) gore kriter kriter degerlendirir - MEB'in ogretmenlere
// "puanlar goruş bildiren degil, delillerle desteklenen yanitlara verilir"
// seklinde tarif ettigi yaklasimi AI'a talimat olarak veriyoruz.

import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 60
export const runtime = 'nodejs'
import { gradeOpenEndedAnswer } from '@/lib/open-ended-grading'
import { createClient } from '@/lib/supabase/server-create-client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { sessionId, studentAnswer } = body as { sessionId: string; studentAnswer: string }
    if (!sessionId || !studentAnswer?.trim()) {
      return NextResponse.json({ error: 'Cevap boş olamaz.' }, { status: 400 })
    }
    // Rubrigi ve soruyu SUNUCUDAN oku - istemciden gelen rubrige guvenilmez
    // (aksi halde biri devtools'tan rubrigi degistirip tam puan alabilirdi)
    const { data: session, error: fetchErr } = await supabase
      .from('open_ended_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (fetchErr || !session) return NextResponse.json({ error: 'Soru bulunamadı.' }, { status: 404 })

    // Ortaokul öğrencisinin tek ve doğru bir cümlesini sırf 50 karakteri
    // geçmediği için reddetme. Alt sınır yalnızca boş/anlamsız gönderimleri
    // ayırır; asıl yeterlilik aşağıdaki yaşa uygun rubrikle değerlendirilir.
    const gradeKey = String(session.grade || '').toLocaleLowerCase('tr')
    const minimumAnswerLength = gradeKey.includes('ilkokul') ? 8 : gradeKey.includes('lise') ? 20 : 12
    if (studentAnswer.trim().length < minimumAnswerLength) {
      return NextResponse.json({ error: `Cevabını biraz daha açık yazmalısın — en az ${minimumAnswerLength} karakter olmalı.` }, { status: 400 })
    }

    let graded
    try { graded = await gradeOpenEndedAnswer(session, studentAnswer, user.id) }
    catch (gradingError: any) { return NextResponse.json({ error: gradingError?.message || 'Puanlama başarısız, tekrar dene.' }, { status: 500 }) }
    const { criteriaResults, overallFeedback, totalEarned } = graded

    await supabase.from('open_ended_sessions').update({
      student_answer: studentAnswer.trim(),
      criteria_results: criteriaResults,
      total_earned: totalEarned,
      overall_feedback: overallFeedback,
      graded_at: new Date().toISOString(),
    }).eq('id', sessionId)

    return NextResponse.json({
      criteriaResults,
      overallFeedback,
      totalEarned,
      totalPossible: session.total_possible,
    })
  } catch (e: any) {
    console.error('[grade-open-ended]', e?.message)
    return NextResponse.json({ error: 'Bir hata oluştu, tekrar dene.' }, { status: 500 })
  }
}
