import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { isPaidCoachPlan } from '@/lib/coach-access'

export const runtime = 'nodejs'
export const maxDuration = 60

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: sessions, error } = await db.from('quiz_sessions').select('user_id').eq('completed', true).limit(50_000)
  if (error) return NextResponse.json({ error: 'Adaylar alınamadı.' }, { status: 500 })
  const ids = [...new Set((sessions ?? []).map((row: any) => row.user_id).filter(Boolean))] as string[]
  if (!ids.length) return NextResponse.json({ ok: true, candidates: 0, queued: 0 })
  const [{ data: profiles }, { data: prefs }] = await Promise.all([
    db.from('profiles').select('id,plan').in('id', ids),
    db.from('notification_preferences').select('user_id,coach_nudge').in('user_id', ids),
  ])
  const plans = new Map<string, string | null>((profiles ?? []).map((p: any) => [p.id, p.plan]))
  const optedOut = new Set<string>((prefs ?? []).filter((p: any) => p.coach_nudge === false).map((p: any) => p.user_id))
  const today = new Date().toISOString().slice(0, 10)
  const jobs = ids.filter(id => isPaidCoachPlan(plans.get(id)) && !optedOut.has(id)).map(user_id => ({ user_id, scheduled_for: today }))
  if (!jobs.length) return NextResponse.json({ ok: true, candidates: ids.length, queued: 0 })
  const { error: insertError } = await db.from('coach_nudge_jobs').upsert(jobs, { onConflict: 'user_id,scheduled_for', ignoreDuplicates: true })
  if (insertError) return NextResponse.json({ error: 'Kuyruk oluşturulamadı.' }, { status: 500 })
  return NextResponse.json({ ok: true, candidates: ids.length, queued: jobs.length })
}
