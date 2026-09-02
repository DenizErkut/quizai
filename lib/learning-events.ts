import { SupabaseClient } from '@supabase/supabase-js'

export interface LearningEventProjectionResult {
  insertedEvents: number
  updatedMasteryRows: number
}

/**
 * Projects a completed quiz into the Learning Data Standard.
 *
 * The database function owns normalization, deduplication and mastery updates
 * so retries and multiple API save paths cannot duplicate learning evidence.
 * This is best-effort during the compatibility rollout: quiz completion and
 * weak_topics keep their existing behavior even if migration 012 is not live.
 */
export async function recordQuizLearningEvents(
  supabase: SupabaseClient,
  studentId: string,
  sessionId: string
): Promise<LearningEventProjectionResult | null> {
  const { data, error } = await supabase.rpc('record_quiz_learning_events', {
    p_student_id: studentId,
    p_session_id: sessionId,
  })

  if (error) {
    console.error('[learning-events] projection failed:', error.message)
    return null
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    insertedEvents: Number(row?.inserted_events ?? 0),
    updatedMasteryRows: Number(row?.updated_mastery_rows ?? 0),
  }
}
