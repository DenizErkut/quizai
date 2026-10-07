import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { questionBankKey } from '@/lib/question-bank'
import { usableTransferQuestion } from '@/lib/transfer-check-scoring'
import { readAll } from '@/lib/paginate'

export const runtime = 'nodejs'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies()
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: name => cookieStore.get(name)?.value } })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return false
  const { data } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return data?.is_admin === true
}

/** Objectives with pending transfer checks but no independently vetted bank item: these can never be served. */
export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: checks, error } = await readAll(() => db.from('learning_transfer_checks')
    .select('learning_objective_id,learning_objective_code,subject,grade').eq('status', 'pending'))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const byObjective = new Map<string, { code: string | null; subject: string; grade: string | null; pending: number }>()
  for (const check of checks ?? []) {
    const id = String(check.learning_objective_id || '')
    if (!id) continue
    const entry = byObjective.get(id) ?? { code: check.learning_objective_code, subject: check.subject, grade: check.grade, pending: 0 }
    entry.pending += 1
    byObjective.set(id, entry)
  }
  const gaps: Array<{ objectiveId: string; code: string | null; subject: string; grade: string | null; pendingChecks: number; approvedItems: number }> = []
  for (const [objectiveId, entry] of byObjective) {
    const { data: bank } = await db.from('question_bank').select('id,question,grade_key,subject_key')
      .eq('review_status', 'approved').eq('report_count', 0).eq('question->>learningObjectiveId', objectiveId).limit(60)
    const usable = (bank ?? []).filter(row => questionBankKey(row.grade_key) === questionBankKey(entry.grade) &&
      questionBankKey(row.subject_key) === questionBankKey(entry.subject) &&
      usableTransferQuestion(row.question as Record<string, unknown>, objectiveId, '', ''))
    if (usable.length === 0) gaps.push({ objectiveId, code: entry.code, subject: entry.subject, grade: entry.grade, pendingChecks: entry.pending, approvedItems: (bank ?? []).length })
  }
  return NextResponse.json({ objectivesWithPending: byObjective.size, gaps: gaps.sort((a, b) => b.pendingChecks - a.pendingChecks) })
}
