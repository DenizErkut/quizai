import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

export const runtime = 'nodejs'

async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const authDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: { user } } = await authDb.auth.getUser(authHeader.slice(7))
  return user ?? null
}

/** Returns due transfer checks without exposing the answer to the client. */
export async function GET(req: NextRequest) {
  const user = await authenticate(req)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const [{ count: eventCount }, { data, error }] = await Promise.all([
    db.from('learning_events').select('id', { count: 'exact', head: true }).eq('student_id', user.id),
    db.from('learning_transfer_checks')
      .select('id,subject,grade,topic,learning_objective_id,learning_objective_code,due_after_event_count,status,prompt_context,created_at')
      .eq('student_id', user.id).eq('status', 'pending')
      .order('created_at', { ascending: true }).limit(20),
  ])
  if (error) return NextResponse.json({ error: 'Transfer kontrolleri alınamadı.' }, { status: 500 })
  const due = (data ?? []).filter(check => Number(check.due_after_event_count) <= Number(eventCount ?? 0))
    .map(check => ({ ...check, prompt_context: { sourceQuestionType: check.prompt_context?.sourceQuestionType, sourceDifficulty: check.prompt_context?.sourceDifficulty } }))
  return NextResponse.json({ eventCount: eventCount ?? 0, due })
}

/** Claims one due check or records its student-facing result. Answers are never returned. */
export async function POST(req: NextRequest) {
  const user = await authenticate(req)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  let body: { action?: string; checkId?: string; result?: string; usedHint?: boolean; responseTimeMs?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 }) }
  if (!body.checkId || !['claim', 'complete'].includes(body.action ?? '')) {
    return NextResponse.json({ error: 'Geçersiz transfer kontrolü işlemi.' }, { status: 400 })
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const allowed = ['independent_success', 'assisted_success', 'not_transferred', 'unanswered']

  if (body.action === 'claim') {
    const { data: check, error } = await db.from('learning_transfer_checks')
      .select('id,subject,grade,topic,learning_objective_id,learning_objective_code,due_after_event_count,status,prompt_context')
      .eq('id', body.checkId).eq('student_id', user.id).eq('status', 'pending').single()
    if (error || !check) return NextResponse.json({ error: 'Transfer kontrolü artık uygun değil.' }, { status: 409 })
    const { data: claimed, error: updateError } = await db.from('learning_transfer_checks').update({ status: 'served', served_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', check.id).eq('student_id', user.id).eq('status', 'pending').select('id').single()
    if (updateError || !claimed) return NextResponse.json({ error: 'Transfer kontrolü alınamadı.' }, { status: 409 })
    return NextResponse.json({ check: { ...check, status: 'served', prompt_context: { sourceQuestionType: check.prompt_context?.sourceQuestionType, sourceDifficulty: check.prompt_context?.sourceDifficulty } } })
  }

  if (!allowed.includes(body.result ?? '')) return NextResponse.json({ error: 'Geçersiz transfer sonucu.' }, { status: 400 })
  const { data: completed, error } = await db.from('learning_transfer_checks').update({
    status: 'completed', transfer_result: body.result, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    result_metadata: { usedHint: body.usedHint === true, responseTimeMs: Number.isFinite(body.responseTimeMs) ? body.responseTimeMs : null },
  }).eq('id', body.checkId).eq('student_id', user.id).eq('status', 'served').select('id,status,transfer_result,completed_at').single()
  if (error || !completed) return NextResponse.json({ error: 'Transfer sonucu kaydedilemedi.' }, { status: 409 })
  return NextResponse.json({ check: completed })
}
