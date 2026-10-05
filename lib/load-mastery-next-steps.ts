import type { SupabaseClient } from '@supabase/supabase-js'
import { masteryNextStep, type LearningStep } from './mastery-next-step'
import { sameLearningScope } from './learning-evidence-scope'
import { loadObjectiveIntervention } from './load-objective-intervention'
import { storedInterventionPlan,publicInterventionPlan } from './objective-intervention'
import { interventionReviewGate } from './intervention-review'
import { planNextObjective } from './next-objective'

/** Server-only caller supplies its authenticated student, never a requested peer ID. */
export async function loadMasteryNextSteps(db: SupabaseClient, studentId: string): Promise<LearningStep[]> {
  const [cycles, profile] = await Promise.all([
    db.from('verified_learning_cycles').select('id,student_id,learning_objective_id,teacher_id,classroom_id,status,created_at')
      .eq('student_id',studentId).in('status',['active','completed']).order('created_at',{ascending:false}).limit(20),
    db.from('profiles').select('grade').eq('id',studentId).maybeSingle(),
  ])
  if (cycles.error || profile.error) throw new Error('Kazanım kararları alınamadı.')
  if (!cycles.data?.length) return []
  const ids = cycles.data.map(c=>c.id), objectives = [...new Set(cycles.data.map(c=>c.learning_objective_id))]
  const [catalog, mastery, attempts, practices, reviews] = await Promise.all([
    db.from('learning_objective_catalog').select('id,objective_code,title,grade,subject,topic,is_active,verification_status,graph_node_id,curriculum_version_id')
      .in('id',objectives),
    db.from('student_mastery').select('learning_objective_id,mastery_score,confidence_score,primary_misconception_id,last_mastery_update')
      .eq('student_id',studentId).in('learning_objective_id',objectives).order('last_mastery_update',{ascending:false}).limit(200),
    db.from('verified_learning_attempts').select('cycle_id,stage,status,quiz_session_id,score_pct,completed_at')
      .eq('student_id',studentId).in('cycle_id',ids).limit(100),
    db.from('coach_guided_practice_attempts').select('cycle_id,status,quiz_session_id,hint_count,first_choice,retry_choice,question')
      .eq('student_id',studentId).in('cycle_id',ids).limit(20),
    db.from('learning_gain_measurements').select('student_id,learning_objective_id,teacher_id,classroom_id,pre_session_id,post_session_id,transfer_session_id,reviewed_at,transfer_reviewed_at,transfer_score_pct')
      .eq('student_id',studentId).in('learning_objective_id',objectives).order('reviewed_at',{ascending:false}).limit(500),
  ])
  if ([catalog,mastery,attempts,practices,reviews].some(r=>r.error)) throw new Error('Kazanım kanıtları alınamadı.')
  const seen = new Set<string>(), decisions: LearningStep[] = []
  for (const cycle of cycles.data) {
    if (seen.has(cycle.learning_objective_id)) continue
    seen.add(cycle.learning_objective_id)
    const objective = catalog.data?.find(o=>o.id===cycle.learning_objective_id)
    if (!objective?.is_active || objective.verification_status!=='verified'
      || !sameLearningScope({grade:profile.data?.grade,subject:objective.subject},objective)) throw new Error('Atanmış döngünün kazanım kapsamı doğrulanamadı.')
    const state = mastery.data?.find(m=>m.learning_objective_id===objective.id)
    const practice = practices.data?.find(p=>p.cycle_id===cycle.id)
    decisions.push(masteryNextStep({cycleId:cycle.id,objectiveId:objective.id,objectiveCode:objective.objective_code,
      subject:objective.subject,topic:objective.title,
      attempts:(attempts.data||[]).filter(a=>a.cycle_id===cycle.id),
      reviews:(reviews.data||[]).filter(r=>r.teacher_id===cycle.teacher_id && r.classroom_id===cycle.classroom_id && r.learning_objective_id===objective.id),
      practice:practice?{...practice,status:practice.status==='completed'&&!practice.quiz_session_id?'started':practice.status}:null,
      estimate:state?.mastery_score==null?null:Number(state.mastery_score),
      confidence:state?.confidence_score==null?null:Number(state.confidence_score),
      misconceptionId:state?.primary_misconception_id||null,
    }))
  }
  decisions.sort((a,b)=>Number(b.actionable)-Number(a.actionable))
  const focus=decisions[0]
  if(focus){
    const gate=await interventionReviewGate(db,studentId,focus.cycleId)
    if(gate){focus.action='teacher_review';focus.label='Öğretmen takibini bekle';focus.reason=gate;focus.actionable=false}
  }
  if(focus?.action==='guided_practice'){
    const objective=catalog.data!.find(o=>o.id===focus.objectiveId)!
    const practice=practices.data?.find(p=>p.cycle_id===focus.cycleId)
    const baseline=attempts.data?.find(a=>a.cycle_id===focus.cycleId&&a.stage==='baseline'&&a.status==='completed')
    const plan=practice?storedInterventionPlan(practice.question)
      :await loadObjectiveIntervention(db,studentId,objective,baseline?.score_pct??null)
    focus.intervention=publicInterventionPlan(plan)
  }
  if (focus?.action === 'verified') {
    const currentObjective = catalog.data!.find(o => o.id === focus.objectiveId)
    if (currentObjective?.graph_node_id) {
      const edgeResult = await db.from('learning_graph_edges').select('id,source_node_id,target_node_id,edge_type,is_verified,reviewed_by,valid_from,valid_to,curriculum_version_id')
        .eq('source_node_id', currentObjective.graph_node_id).eq('edge_type','prerequisite_of').eq('is_verified',true)
      if (edgeResult.error) throw new Error('Sonraki kazanım ilişkileri alınamadı.')
      const targetIds = [...new Set((edgeResult.data || []).map(edge => edge.target_node_id))]
      const candidateResult = targetIds.length ? await db.from('learning_objective_catalog')
        .select('id,objective_code,title,grade,subject,topic,is_active,verification_status,graph_node_id,curriculum_version_id').in('graph_node_id',targetIds) : { data: [], error: null }
      if (candidateResult.error) throw new Error('Sonraki kazanım adayları alınamadı.')
      focus.nextObjective = planNextObjective({ currentObjective, candidates: candidateResult.data || [], edges: edgeResult.data || [], verifiedMastery: focus.mastery.verified })
    } else {
      focus.nextObjective = planNextObjective({ currentObjective: {...currentObjective, graph_node_id: null}, candidates: [], edges: [], verifiedMastery: focus.mastery.verified })
    }
  }
  return decisions
}
