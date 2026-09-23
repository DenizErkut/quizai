import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user }, error: authError } = await db.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const questionText = String(body.questionText || '').trim()
  if (!questionText) return NextResponse.json({ error: 'Question is required' }, { status: 400 })

  const { error: reportError } = await db.from('error_reports').insert({
    user_id: user.id,
    question_text: questionText,
    correct_answer: String(body.correctAnswer || ''),
    user_answer: String(body.userAnswer || ''),
    topic: String(body.topic || ''),
    status: 'pending',
    reporter_role: 'student',
  })
  if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 })

  let lookup = db.from('question_bank').select('id, report_count').limit(10)
  if (body.bankQuestionId) lookup = lookup.eq('id', String(body.bankQuestionId))
  else if (body.bankFingerprint) lookup = lookup.eq('fingerprint', String(body.bankFingerprint))
  else lookup = lookup.eq('question->>q', questionText)
  const { data: matches } = await lookup

  for (const row of matches || []) {
    await db.from('question_bank').update({
      report_count: Number(row.report_count || 0) + 1,
      // Schema'daki inceleme bekleyen durumun adı `candidate`.
      review_status: 'candidate',
      // Öğrenci raporu sonrası bu satır ASLA gölge-süresi otomatik
      // yükseltmesine (bkz. 20260923090000_question_bank_shadow_review.sql)
      // girmemeli — yalnızca bir insan approved/rejected kararı verebilir.
      awaiting_expert_review: true,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
  }
  return NextResponse.json({ ok: true, quarantined: matches?.length || 0 })
}
