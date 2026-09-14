import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runQuestionBankBackfill } from '@/scripts/backfill-question-bank.mjs'

export const runtime = 'nodejs'
export const maxDuration = 300

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!token || !url || !serviceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const hash = tokenHash(token)
  const { data: job } = await db
    .from('question_bank_backfill_jobs')
    .select('id,limit_count,status,expires_at')
    .eq('token_hash', hash)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (!job) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: claimed } = await db
    .from('question_bank_backfill_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (!claimed) return NextResponse.json({ error: 'Job already claimed' }, { status: 409 })

  try {
    const result = await runQuestionBankBackfill(job.limit_count)
    await db.from('question_bank_backfill_jobs').update({
      status: 'complete', result, completed_at: new Date().toISOString(), token_hash: `used:${job.id}`,
    }).eq('id', job.id)
    return NextResponse.json(result)
  } catch (error) {
    await db.from('question_bank_backfill_jobs').update({
      status: 'failed', result: { error: String(error instanceof Error ? error.message : error) }, completed_at: new Date().toISOString(), token_hash: `used:${job.id}`,
    }).eq('id', job.id)
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 })
  }
}
