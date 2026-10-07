import type { SupabaseClient } from '@supabase/supabase-js'
import { seenQuestionTexts } from './verified-learning-cycle'

/** For one student: objective id → texts of every question already served to them in a verified cycle. */
export async function loadSeenTextsByObjective(db: SupabaseClient, studentId: string): Promise<Map<string, Set<string>>> {
  const { data: cycles, error } = await db.from('verified_learning_cycles').select('id,learning_objective_id').eq('student_id', studentId)
  if (error) throw new Error(error.message)
  const result = new Map<string, Set<string>>()
  if (!cycles?.length) return result
  const ids = cycles.map(cycle => cycle.id)
  const [{ data: attempts, error: attemptError }, { data: guided, error: guidedError }] = await Promise.all([
    db.from('verified_learning_attempts').select('cycle_id,questions').in('cycle_id', ids),
    db.from('coach_guided_practice_attempts').select('cycle_id,question').in('cycle_id', ids),
  ])
  if (attemptError || guidedError) throw new Error((attemptError || guidedError)!.message)
  for (const cycle of cycles) {
    const texts = seenQuestionTexts((attempts ?? []).filter(a => a.cycle_id === cycle.id), (guided ?? []).filter(g => g.cycle_id === cycle.id))
    const merged = result.get(cycle.learning_objective_id) ?? new Set<string>()
    texts.forEach(text => merged.add(text))
    result.set(cycle.learning_objective_id, merged)
  }
  return result
}
