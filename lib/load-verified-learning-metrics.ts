import type { SupabaseClient } from '@supabase/supabase-js'
import { verifiedLearningMetrics } from './verified-learning-metrics'
import type { EvidenceReview } from './verified-learning-metrics'

type MetricCycle = { id: string; student_id: string; learning_objective_id: string; teacher_id: string; classroom_id: string }

/** Bounded batches avoid one database round trip per student/cycle in administrative reports. */
export async function loadCyclesMetrics(db: SupabaseClient, cycles: MetricCycle[]) {
  if (!cycles.length) return []
  if (cycles.length > 100) throw new Error('Ölçüm örneklemi sınırı aşıldı.')
  const ids = cycles.map(c => c.id)
  const [attempts, practices] = await Promise.all([
    db.from('verified_learning_attempts').select('cycle_id,stage,status,quiz_session_id,score_pct,completed_at').in('cycle_id', ids).limit(400),
    db.from('coach_guided_practice_attempts').select('cycle_id,status,hint_count,first_choice,retry_choice,question').in('cycle_id', ids).limit(100),
  ])
  if (attempts.error || practices.error) throw new Error('Öğrenme ölçümleri alınamadı.')
  const reviews: (EvidenceReview & { student_id: string; learning_objective_id: string; teacher_id: string; classroom_id: string })[] = []
  for (let offset=0;;offset+=500) {
    const result = await db.from('learning_gain_measurements').select('id,student_id,learning_objective_id,teacher_id,classroom_id,pre_session_id,post_session_id,transfer_session_id,reviewed_at,transfer_reviewed_at,transfer_score_pct')
      .in('student_id',[...new Set(cycles.map(c=>c.student_id))]).in('learning_objective_id',[...new Set(cycles.map(c=>c.learning_objective_id))])
      .order('id').range(offset,offset+499)
    if (result.error) throw new Error('Öğretmen incelemeleri alınamadı.')
    reviews.push(...(result.data || []))
    if ((result.data || []).length<500) break
  }
  return cycles.map(c=>verifiedLearningMetrics((attempts.data || []).filter(a=>a.cycle_id===c.id),
    reviews.filter(r=>r.student_id===c.student_id && r.learning_objective_id===c.learning_objective_id && r.teacher_id===c.teacher_id && r.classroom_id===c.classroom_id),
    practices.data?.find(p=>p.cycle_id===c.id)))
}

export async function loadCycleMetrics(db: SupabaseClient, cycle: { id: string; student_id: string; learning_objective_id: string; teacher_id: string; classroom_id: string }) {
  const [attempts, reviews, practice] = await Promise.all([
    db.from('verified_learning_attempts').select('stage,status,quiz_session_id,score_pct,completed_at').eq('cycle_id', cycle.id).eq('student_id', cycle.student_id),
    db.from('learning_gain_measurements').select('pre_session_id,post_session_id,transfer_session_id,reviewed_at,transfer_reviewed_at,transfer_score_pct')
      .eq('student_id', cycle.student_id).eq('learning_objective_id', cycle.learning_objective_id).eq('teacher_id', cycle.teacher_id).eq('classroom_id', cycle.classroom_id),
    db.from('coach_guided_practice_attempts').select('status,hint_count,first_choice,retry_choice,question').eq('cycle_id', cycle.id).eq('student_id', cycle.student_id).maybeSingle(),
  ])
  if (attempts.error || reviews.error || practice.error) throw new Error('Öğrenme ölçümleri alınamadı.')
  return verifiedLearningMetrics(attempts.data || [], reviews.data || [], practice.data)
}
