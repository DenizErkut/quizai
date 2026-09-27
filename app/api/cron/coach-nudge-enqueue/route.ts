import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

export const runtime = 'nodejs'
export const maxDuration = 60

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  let candidates = 0
  let queued = 0
  let complete = false
  // Bound each invocation while allowing large populations to resume next run.
  for (let batch = 0; batch < 10 && !complete; batch += 1) {
    const { data, error } = await db.rpc('enqueue_coach_nudge_jobs', { p_batch_size: 500 })
    if (error) return NextResponse.json({ error: 'Kuyruk oluşturulamadı.' }, { status: 500 })
    const result = data?.[0]
    candidates += result?.batch_candidates ?? 0
    queued += result?.queued ?? 0
    complete = result?.complete ?? false
  }
  return NextResponse.json({
    ok: true,
    candidates,
    queued,
    complete,
  })
}
