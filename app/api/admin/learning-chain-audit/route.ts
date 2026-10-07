import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fetchAllRows } from '@/lib/paginate'
import {
  auditChains, type ChainAttempt, type ChainCycle, type ChainDelayedCheck, type ChainGuided, type ChainReview,
} from '@/lib/learning-chain-audit'

export const runtime = 'nodejs'
export const maxDuration = 60

const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies()
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: name => cookieStore.get(name)?.value } })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return false
  const { data } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return data?.is_admin === true
}

/** Which links of the verified learning chain exist for each cycle, and which is the first one missing. */
export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const [cycles, attempts, guided, reviews, delayed] = await Promise.all([
      fetchAllRows<ChainCycle>((from, to) => adminDb.from('verified_learning_cycles').select('id,student_id,learning_objective_id,status,created_at').order('id').range(from, to)),
      fetchAllRows<ChainAttempt>((from, to) => adminDb.from('verified_learning_attempts').select('cycle_id,stage,status,completed_at,score_pct,quiz_session_id').order('id').range(from, to)),
      fetchAllRows<ChainGuided>((from, to) => adminDb.from('coach_guided_practice_attempts').select('cycle_id,status,completed_at').order('id').range(from, to)),
      fetchAllRows<ChainReview>((from, to) => adminDb.from('learning_gain_measurements')
        .select('pre_session_id,post_session_id,transfer_session_id,reviewed_at,transfer_reviewed_by,transfer_reviewed_at').order('id').range(from, to)),
      fetchAllRows<ChainDelayedCheck>((from, to) => adminDb.from('learning_transfer_checks').select('student_id,learning_objective_id,status').order('id').range(from, to)),
    ])
    const objectiveIds = [...new Set(cycles.map(cycle => cycle.learning_objective_id))]
    const { data: objectives } = objectiveIds.length
      ? await adminDb.from('learning_objective_catalog').select('id,objective_code,subject,grade,topic').in('id', objectiveIds) : { data: [] }
    const objectiveById = new Map((objectives ?? []).map(o => [o.id as string, o]))
    const audit = auditChains({ cycles, attempts, guided, reviews, delayed: delayed.map(d => ({ ...d, learning_objective_id: String(d.learning_objective_id) })) })
    return NextResponse.json({
      generatedAt: new Date().toISOString(), totals: audit.totals,
      rows: audit.rows.map(row => ({
        ...row,
        studentId: row.studentId.slice(0, 8), // short id only; this report is not a roster
        objective: objectiveById.get(row.objectiveId) ?? null,
      })),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Zincir denetimi üretilemedi.' }, { status: 500 })
  }
}
