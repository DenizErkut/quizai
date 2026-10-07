// The coach and the recommendation list must only suggest topics a quiz can
// actually start for the student's grade. /api/generate-quiz refuses K12 topics
// that match no verified catalog objective ("Kazanım bulunamadı"), so a
// suggestion outside the grade's catalog (another grade's unit, free text) is a
// button that is guaranteed to fail.
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCanonicalObjectiveCandidates } from './learning-objective-mapping'

type Fetcher = (supabase: SupabaseClient, ctx: { subject?: string | null; grade?: string | null; topic?: string | null }, max?: number) => Promise<unknown[]>

/** Keeps items whose subject+topic resolve to catalog objectives for `grade`. Fails open when the check itself cannot run. */
export async function keepQuizReadyTopics<T extends { topic?: string | null; subject?: string | null }>(
  supabase: SupabaseClient,
  grade: string | null | undefined,
  items: T[],
  fetchCandidates: Fetcher = loadCanonicalObjectiveCandidates,
): Promise<T[]> {
  if (!grade || /üniversite|universite/i.test(grade) || !items.length) return items
  const verdict = new Map<string, boolean>()
  const out: T[] = []
  for (const item of items) {
    const key = `${item.subject ?? ''}\u0000${item.topic ?? ''}`
    if (!verdict.has(key)) {
      try {
        verdict.set(key, (await fetchCandidates(supabase, { subject: item.subject, grade, topic: item.topic }, 1)).length > 0)
      } catch { verdict.set(key, true) }
    }
    if (verdict.get(key)) out.push(item)
  }
  return out
}
