import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { storedInterventionPlan,publicInterventionPlan } from './objective-intervention'

export const INTERVENTION_REVIEW_POLICY='teacher-intervention-review-v1'
export type ReviewDecision='continue'|'needs_followup'
export type ReviewScope={studentId:string;classroomId:string;teacherId:string;teacherUserId:string;cycleId:string;objectiveId:string}
export type ReviewPractice={id:string;cycle_id:string;student_id:string;question:Record<string,unknown>;status:string;first_choice:number|null;retry_choice:number|null;student_explanation:string|null}
export type ReviewAudit={id:string;actor_id:string;created_at:string;input_summary:Record<string,unknown>;decision_summary:Record<string,unknown>}

export function practiceReviewFingerprint(practice:ReviewPractice) {
  return createHash('sha256').update(JSON.stringify({id:practice.id,cycleId:practice.cycle_id,
    objectiveId:practice.question.learningObjectiveId,bankQuestionId:practice.question.bankQuestionId,
    q:practice.question.q,opts:practice.question.opts,ans:practice.question.ans,
    intervention:storedInterventionPlan(practice.question)})).digest('hex')
}
export function matchingPracticeReview(practice:ReviewPractice,scope:ReviewScope,audits:ReviewAudit[]) {
  if(practice.student_id!==scope.studentId||practice.cycle_id!==scope.cycleId||practice.question.learningObjectiveId!==scope.objectiveId)return null
  const fingerprint=practiceReviewFingerprint(practice)
  const matches=audits.filter(a=>a.actor_id===scope.teacherUserId
    &&a.input_summary.student_id===scope.studentId&&a.input_summary.classroom_id===scope.classroomId
    &&a.input_summary.teacher_id===scope.teacherId&&a.input_summary.cycle_id===scope.cycleId
    &&a.input_summary.objective_id===scope.objectiveId&&a.input_summary.practice_id===practice.id
    &&a.input_summary.fingerprint===fingerprint&&['continue','needs_followup'].includes(String(a.decision_summary.decision))
    &&typeof a.decision_summary.note==='string'&&a.decision_summary.note.trim().length>=10
    &&Number.isFinite(Date.parse(a.created_at)))
  matches.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id.localeCompare(a.id))
  const latest=matches[0]
  return latest?{id:latest.id,decision:latest.decision_summary.decision as ReviewDecision,
    note:latest.decision_summary.note as string,reviewedAt:latest.created_at}:null
}

export async function authorizedReviewTeacher(db:SupabaseClient,userId:string,classroomId:string,studentId:string) {
  const {data:teacher,error}=await db.from('teachers').select('id').eq('user_id',userId).eq('approved',true).maybeSingle()
  if(error)throw new Error('Öğretmen yetkisi alınamadı.')
  if(!teacher)return null
  const [classroom,member]=await Promise.all([
    db.from('classrooms').select('id').eq('id',classroomId).eq('teacher_id',teacher.id).maybeSingle(),
    db.from('classroom_students').select('student_id').eq('classroom_id',classroomId).eq('student_id',studentId).maybeSingle(),
  ])
  if(classroom.error||member.error)throw new Error('Sınıf yetkisi alınamadı.')
  return classroom.data&&member.data?teacher.id:null
}

export async function loadInterventionReviewQueue(db:SupabaseClient,teacherUserId:string,teacherId:string,classroomId:string,studentId:string) {
  const {data:cycles,error}=await db.from('verified_learning_cycles').select('id,learning_objective_id,status')
    .eq('teacher_id',teacherId).eq('classroom_id',classroomId).eq('student_id',studentId)
    .order('created_at',{ascending:false}).limit(30)
  if(error)throw new Error('İnceleme döngüleri alınamadı.')
  if(!cycles?.length)return []
  const {data:rows,error:practiceError}=await db.from('coach_guided_practice_attempts')
    .select('id,cycle_id,student_id,question,status,first_choice,retry_choice,student_explanation')
    .eq('student_id',studentId).in('cycle_id',cycles.map(c=>c.id)).limit(30)
  if(practiceError)throw new Error('İnceleme çalışmaları alınamadı.')
  const practices=(rows||[]) as ReviewPractice[]
  if(!practices.length)return []
  const {data:audits,error:auditError}=await db.from('agent_decision_audit')
    .select('id,actor_id,created_at,input_summary,decision_summary').eq('actor_id',teacherUserId)
    .eq('agent_name',INTERVENTION_REVIEW_POLICY).eq('policy_version',INTERVENTION_REVIEW_POLICY)
    .eq('input_summary->>student_id',studentId).eq('input_summary->>classroom_id',classroomId)
    .in('input_summary->>practice_id',practices.map(p=>p.id)).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(300)
  if(auditError||audits?.length===300)throw new Error('İnceleme kararları alınamadı veya liste sınırı aşıldı.')
  return practices.flatMap(practice=>{
    const cycle=cycles.find(c=>c.id===practice.cycle_id)!
    const scope={studentId,classroomId,teacherId,teacherUserId,cycleId:cycle.id,objectiveId:cycle.learning_objective_id}
    const plan=storedInterventionPlan(practice.question)
    const review=matchingPracticeReview(practice,scope,(audits||[]) as ReviewAudit[])
    if(!plan?.teacherReviewRecommended&&!review)return []
    return [{practiceId:practice.id,cycleId:cycle.id,objectiveId:cycle.learning_objective_id,
      fingerprint:practiceReviewFingerprint(practice),status:review?.decision==='continue'?'reviewed':review?.decision==='needs_followup'?'needs_followup':'pending',
      intervention:publicInterventionPlan(plan),question:practice.question.q,options:practice.question.opts,
      firstChoice:practice.first_choice,retryChoice:practice.retry_choice,studentExplanation:practice.student_explanation,
      practiceStatus:practice.status,cycleStatus:cycle.status,review}]
  })
}

/** Review is a workflow decision, never an assessment score or verified-mastery approval. */
export async function interventionReviewGate(db:SupabaseClient,studentId:string,cycleId:string):Promise<string|null> {
  const {data:cycle,error}=await db.from('verified_learning_cycles').select('id,student_id,teacher_id,classroom_id,learning_objective_id')
    .eq('id',cycleId).eq('student_id',studentId).maybeSingle()
  if(error||!cycle)throw new Error('Çalışma inceleme kapsamı alınamadı.')
  const {data:teacher,error:teacherError}=await db.from('teachers').select('user_id').eq('id',cycle.teacher_id).maybeSingle()
  if(teacherError||!teacher)throw new Error('Çalışma inceleyen öğretmen alınamadı.')
  const {data:practice,error:practiceError}=await db.from('coach_guided_practice_attempts')
    .select('id,cycle_id,student_id,question,status,first_choice,retry_choice,student_explanation')
    .eq('cycle_id',cycleId).eq('student_id',studentId).maybeSingle()
  if(practiceError)throw new Error('Çalışma inceleme kaydı alınamadı.')
  if(!practice)return null
  const scope={studentId,cycleId,classroomId:cycle.classroom_id,teacherId:cycle.teacher_id,teacherUserId:teacher.user_id,objectiveId:cycle.learning_objective_id}
  const {data:audits,error:auditError}=await db.from('agent_decision_audit')
    .select('id,actor_id,created_at,input_summary,decision_summary').eq('actor_id',teacher.user_id)
    .eq('agent_name',INTERVENTION_REVIEW_POLICY).eq('policy_version',INTERVENTION_REVIEW_POLICY)
    .eq('input_summary->>student_id',studentId).eq('input_summary->>classroom_id',cycle.classroom_id)
    .eq('input_summary->>teacher_id',cycle.teacher_id).eq('input_summary->>cycle_id',cycleId)
    .eq('input_summary->>objective_id',cycle.learning_objective_id).eq('input_summary->>practice_id',practice.id)
    .eq('input_summary->>fingerprint',practiceReviewFingerprint(practice))
    .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1)
  if(auditError)throw new Error('Çalışma inceleme kararı alınamadı.')
  const review=matchingPracticeReview(practice,scope,(audits||[]) as ReviewAudit[])
  if(audits?.length&&!review)throw new Error('Çalışma inceleme kararının kanıtı geçersiz.')
  if(review?.decision==='needs_followup')return 'Öğretmenin çalışma için ek inceleme istedi. Devam etmeden önce öğretmeninin planı gözden geçirmesi gerekiyor.'
  return null
}
