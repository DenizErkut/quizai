import { SupabaseClient } from '@supabase/supabase-js'

export interface LearningEventProjectionResult {
  insertedEvents: number
  updatedMasteryRows: number
  updatedObjectiveMasteryRows?: number
  updatedMisconceptionRows?: number
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
  const { data: objectiveMasteryData, error: objectiveMasteryError } = await supabase.rpc(
    'refresh_student_objective_mastery_v1',
    { p_student_id: studentId, p_session_id: sessionId }
  )
  if (objectiveMasteryError && objectiveMasteryError.code !== 'PGRST202') {
    console.error('[objective-mastery] refresh failed:', objectiveMasteryError.message)
  }
  const { data: misconceptionData, error: misconceptionError } = await supabase.rpc(
    'refresh_quiz_misconceptions',
    { p_student_id: studentId, p_session_id: sessionId }
  )
  if (misconceptionError && misconceptionError.code !== 'PGRST202') {
    console.error('[misconceptions] projection failed:', misconceptionError.message)
  }
  const misconceptionRow = Array.isArray(misconceptionData) ? misconceptionData[0] : misconceptionData

  const { error: resolutionError } = await supabase.rpc('refresh_misconception_resolution', {
    p_student_id: studentId,
    p_session_id: sessionId,
  })
  if (resolutionError && resolutionError.code !== 'PGRST202') {
    console.error('[misconception-resolution] refresh failed:', resolutionError.message)
  }

  const { error: recommendationError } = await supabase.rpc(
    'refresh_student_recommendations',
    { p_student_id: studentId }
  )
  if (recommendationError && recommendationError.code !== 'PGRST202') {
    console.error('[recommendations] refresh failed:', recommendationError.message)
  }

  // A completed quiz should close the accepted/active recommendation that it
  // actually addressed. The refresh function intentionally preserves accepted
  // recommendations, so reconcile them explicitly after projecting the quiz.
  const { data: session } = await supabase
    .from('quiz_sessions')
    .select('topic')
    .eq('id', sessionId)
    .eq('user_id', studentId)
    .maybeSingle()
  if (session?.topic) {
    const { data: addressed } = await supabase
      .from('student_recommendations')
      .select('id, topic, status')
      .eq('student_id', studentId)
      .in('status', ['active', 'accepted'])
    for (const recommendation of addressed ?? []) {
      if (String(recommendation.topic).trim().toLocaleLowerCase('tr-TR') !== String(session.topic).trim().toLocaleLowerCase('tr-TR')) continue
      const { error } = await supabase.rpc('transition_student_recommendation_v2', {
        p_recommendation_id: recommendation.id,
        p_student_id: studentId,
        p_action: 'complete',
        p_reason: 'QUIZ_COMPLETED_RECONCILIATION',
        p_deferred_until: null,
      })
      if (error) console.error('[recommendations] completion reconciliation failed:', error.message)
    }
  }

  return {
    insertedEvents: Number(row?.inserted_events ?? 0),
    updatedMasteryRows: Number(row?.updated_mastery_rows ?? 0),
    updatedObjectiveMasteryRows: Number(objectiveMasteryData ?? 0),
    updatedMisconceptionRows: Number(misconceptionRow?.updated_rows ?? 0),
  }
}
