import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getIdentityBySupabaseId } from '@/lib/identity/client'
import { buildCoachContext, type CoachContext } from '@/lib/coach-context'
import { generateCoachReply, type CoachTurn } from '@/lib/coach-generation'
import { isPaidCoachPlan } from '@/lib/coach-access'

export const maxDuration = 120
export const runtime = 'nodejs'
const MIN_DAYS_BETWEEN_NUDGES = 4
const MAX_ATTEMPTS = 3
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
type NudgeReason = 'disengagement' | 'recommendation'
type Job = { id: string; user_id: string; attempts: number }

function decideNudgeReason(ctx: CoachContext): NudgeReason | null {
  if (ctx.disengagement.isDisengaging) return 'disengagement'
  return ctx.goals.length ? 'recommendation' : null
}
const title = (reason: NudgeReason) => reason === 'disengagement' ? '👋 Pratium Koç seni bekliyor' : '✦ Pratium Koç\'tan bir öneri'

async function conversation(userId: string): Promise<string> {
  const { data } = await db.from('coach_conversations').select('id').eq('user_id', userId).order('last_message_at', { ascending: false }).limit(1).maybeSingle()
  if (data?.id) return data.id
  const { data: created, error } = await db.from('coach_conversations').insert({ user_id: userId }).select('id').single()
  if (error || !created) throw new Error('conversation_create_failed')
  return created.id
}

async function generate(ctx: CoachContext, reason: NudgeReason, userId: string): Promise<CoachTurn> {
  const instruction = reason === 'disengagement'
    ? 'Öğrenciyi yargılamadan geri çağır ve gerçek geçmiş verisine dayanan tek bir ilk adım öner. En fazla 2 cümle yaz.'
    : 'Hesaplanan en öncelikli çalışma önerisini, geçmiş eğilimiyle ilişkilendir. En fazla 2 cümle yaz ve suggest_practice aracını çağır.'
  return generateCoachReply(ctx, [{ role: 'user', content: instruction }], userId, 'coach-proactive-nudge')
}

async function finish(id: string, workerId: string, status: 'completed' | 'skipped' | 'failed' | 'pending', fields: Record<string, unknown> = {}) {
  const { error } = await db.from('coach_nudge_jobs').update({
    status,
    updated_at: new Date().toISOString(),
    locked_at: null,
    worker_id: null,
    ...fields,
  }).eq('id', id).eq('worker_id', workerId)
  if (error) throw error
}

async function processJob(job: Job, workerId: string) {
  try {
    const [{ data: profile }, { data: pref }] = await Promise.all([
      db.from('profiles').select('grade,language,plan').eq('id', job.user_id).maybeSingle(),
      db.from('notification_preferences').select('coach_nudge').eq('user_id', job.user_id).maybeSingle(),
    ])
    if (!isPaidCoachPlan(profile?.plan) || pref?.coach_nudge === false) return finish(job.id, workerId, 'skipped', { reason: 'not_eligible' })
    const since = new Date(Date.now() - MIN_DAYS_BETWEEN_NUDGES * 86_400_000).toISOString()
    const { count } = await db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', job.user_id).eq('type', 'coach_nudge').gte('created_at', since)
    if ((count ?? 0) > 0) return finish(job.id, workerId, 'skipped', { reason: 'recent_nudge' })
    const identity = await getIdentityBySupabaseId(job.user_id)
    const ctx = await buildCoachContext(db, job.user_id, { displayName: identity?.full_name ?? 'Öğrenci', grade: profile?.grade, language: profile?.language })
    const reason = decideNudgeReason(ctx)
    if (!reason) return finish(job.id, workerId, 'skipped', { reason: 'no_signal' })
    const nudge = await generate(ctx, reason, job.user_id)
    if (!nudge.text) throw new Error('empty_nudge')
    const conversationId = await conversation(job.user_id)
    const { error: messageError } = await db.from('coach_messages').insert({ conversation_id: conversationId, role: 'assistant', content: nudge.text, action: nudge.action })
    if (messageError) throw messageError
    const [{ error: conversationError }, { error: notificationError }] = await Promise.all([
      db.from('coach_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId),
      db.from('notifications').insert({ user_id: job.user_id, type: 'coach_nudge', title: title(reason), body: nudge.text, read: false, action_url: '/koc' }),
    ])
    // The coach message is the primary result; notification delivery is
    // best-effort so a transient push/inbox failure cannot duplicate replies.
    if (conversationError) console.error('[coach nudge] conversation timestamp update failed:', conversationError.message)
    if (notificationError) console.error('[coach nudge] notification delivery failed:', notificationError.message)
    await finish(job.id, workerId, 'completed', { reason })
  } catch (error: unknown) {
    const retry = job.attempts < MAX_ATTEMPTS
    await finish(job.id, workerId, retry ? 'pending' : 'failed', {
      last_error: String(error instanceof Error ? error.message : error).slice(0, 500),
      available_at: retry ? new Date(Date.now() + 15 * 60_000).toISOString() : new Date().toISOString(),
    })
  }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const workerId = randomUUID()
  // Keep discovery bounded; the durable DB cursor advances in small batches.
  let candidatesQueued = 0
  let enqueueComplete = false
  for (let batch = 0; batch < 10 && !enqueueComplete; batch += 1) {
    const { data: enqueueData, error: enqueueError } = await db.rpc('enqueue_coach_nudge_jobs', { p_batch_size: 500 })
    if (enqueueError) return NextResponse.json({ error: 'Kuyruk hazırlanamadı.' }, { status: 500 })
    candidatesQueued += enqueueData?.[0]?.queued ?? 0
    enqueueComplete = enqueueData?.[0]?.complete ?? false
  }
  const { data, error } = await db.rpc('claim_coach_nudge_jobs', { p_limit: 5, p_worker_id: workerId })
  if (error) return NextResponse.json({ error: 'Kuyruk alınamadı.' }, { status: 500 })
  const jobs = (data ?? []) as Job[]
  const results = await Promise.allSettled(jobs.map(job => processJob(job, workerId)))
  const rejected = results.filter(result => result.status === 'rejected').length
  return NextResponse.json({ ok: rejected === 0, workerId, enqueued: candidatesQueued, enqueueComplete, claimed: jobs.length, failed: rejected }, { status: rejected ? 500 : 200 })
}
