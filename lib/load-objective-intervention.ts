import type { SupabaseClient } from '@supabase/supabase-js'
import { observationsFromQuestion,selectObjectiveIntervention,type ObjectiveScope,type ErrorObservation } from './objective-intervention'
import { questionBankKey } from './question-bank'

export async function loadObjectiveIntervention(db:SupabaseClient,studentId:string,objective:ObjectiveScope,baselineScore:number|null,now=Date.now()) {
  const [overrides,pilot]=await Promise.all([
    db.from('adaptive_teacher_overrides').select('subject,topic').eq('student_id',studentId)
      .eq('mode','standard').gt('expires_at',new Date(now).toISOString()).limit(100),
    db.from('adaptive_learning_evaluations').select('id').eq('student_id',studentId).eq('cohort','standard')
      .eq('sample_version','adaptive-learning-v3-pilot').gt('observation_started_at',new Date(now-7*86400000).toISOString())
      .lte('observation_started_at',new Date(now).toISOString()).limit(1),
  ])
  if(overrides.error||pilot.error||overrides.data?.length===100)throw new Error('Öğretmen veya pilot çalışma politikası alınamadı.')
  if(pilot.data?.length||overrides.data?.some(row=>questionBankKey(row.subject)===questionBankKey(objective.subject)&&questionBankKey(row.topic)===questionBankKey(objective.topic))){
    const plan=selectObjectiveIntervention({objective,observations:[],catalog:[],baselineScore:null,now})
    return {...plan,reason:'Öğretmenin standart çalışma tercihi veya aktif standart pilot grubu korunuyor; hata sinyaline göre kişiselleştirme uygulanmadı.'}
  }
  const {data:events,error}=await db.from('learning_events')
    .select('id,source_id,question_index,occurred_at')
    .eq('student_id',studentId).eq('learning_objective_id',objective.id)
    .eq('source_type','quiz_session').eq('hint_used',false)
    .gte('occurred_at',new Date(now-30*86400000).toISOString()).lte('occurred_at',new Date(now).toISOString())
    .order('occurred_at',{ascending:false}).limit(200)
  if(error)throw new Error('Müdahale kanıtları alınamadı.')
  // A capped window cannot silently omit counter evidence and establish a repeated signal.
  if(events?.length===200)throw new Error('Müdahale kanıt penceresi inceleme gerektiriyor.')
  const ids=[...new Set((events||[]).map(e=>e.source_id))]
  const observations:ErrorObservation[]=[]
  if(ids.length) {
    const {data:sessions,error:sessionError}=await db.from('quiz_sessions').select('id,grade,topic,questions,answers')
      .eq('user_id',studentId).eq('completed',true).in('id',ids).limit(200)
    if(sessionError)throw new Error('Müdahale kaynakları alınamadı.')
    for(const event of events||[]){
      const session=sessions?.find(s=>s.id===event.source_id),index=event.question_index
      if(!session||!Number.isInteger(index)||index<0||!Array.isArray(session.questions)||!Array.isArray(session.answers))throw new Error('Müdahale kanıtının kaynak kaydı eksik.')
      const question=session.questions[index],answer=session.answers[index]
      if(!question||!answer||typeof question!=='object'||typeof answer!=='object')throw new Error('Müdahale kanıtının soru kaydı eksik.')
      observations.push(...observationsFromQuestion({objective,eventId:event.id,sessionId:session.id,occurredAt:event.occurred_at,
        question,answer,grade:session.grade,topic:session.topic}))
    }
  }
  const labels=[...new Set(observations.map(o=>o.misconceptionId))]
  const {data:catalog,error:catalogError}=labels.length?await db.from('misconception_catalog')
    .select('id,subject,topic,label,verification_status').eq('verification_status','verified').in('id',labels):{data:[],error:null}
  if(catalogError)throw new Error('Yanılgı katalog incelemesi alınamadı.')
  return selectObjectiveIntervention({objective,observations,catalog:catalog||[],baselineScore,now})
}
