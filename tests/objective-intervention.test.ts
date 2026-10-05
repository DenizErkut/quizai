import test from 'node:test'
import assert from 'node:assert/strict'
import { observationsFromQuestion,selectObjectiveIntervention,contrastiveCandidate,interventionHint,publicInterventionPlan,type ErrorObservation } from '../lib/objective-intervention'
import { misconceptionId } from '../lib/misconceptions'
import { loadObjectiveIntervention } from '../lib/load-objective-intervention'
import type { SupabaseClient } from '@supabase/supabase-js'
const now=Date.parse('2026-10-06T12:00:00Z')
const objective={id:'objective',subject:'Matematik',topic:'Kesirler',grade:'6'}
const label='Pay ile paydayı birbiriyle karıştırıyor',id=misconceptionId(objective.subject,objective.topic,label)
const catalog=[{id,subject:objective.subject,topic:objective.topic,label,verification_status:'verified'}]
const observation=(n:number,correct=false):ErrorObservation=>({eventId:`e${n}`,objectiveId:objective.id,questionKey:`q${n}`,sessionId:`s${n}`,misconceptionId:id,correct,occurredAt:new Date(now-(4-n)*3600000).toISOString()})
const select=(observations:ErrorObservation[],score:number|null=null)=>selectObjectiveIntervention({objective,observations,catalog,baselineScore:score,now})
const question={q:'Verilen kesirde pay hangisidir?',opts:['1','2','3'],ans:1,subject:objective.subject,learningObjectiveId:objective.id,objectiveVerified:true,objectiveMappingStatus:'human_approved',distractorMisconceptions:[label,null,'Kesirleri ondalık sayıya dönüştürmeyi karıştırıyor']}

test('a single error, duplicate text or duplicate session cannot diagnose a misconception',()=>{
  assert.equal(select([observation(1)]).mode,'diagnostic_reflection')
  assert.equal(select([observation(1),{...observation(2),questionKey:'q1'}]).mode,'diagnostic_reflection')
  assert.equal(select([observation(1),{...observation(2),sessionId:'s1'}]).mode,'diagnostic_reflection')
})
test('two distinct questions and sessions select contrast only with a reviewed matching catalog',()=>{
  const plan=select([observation(1),observation(2)])
  assert.equal(plan.mode,'contrastive_practice')
  assert.equal(plan.signal?.status,'repeated_signal')
  assert.equal(contrastiveCandidate(question,plan),true)
  assert.equal(contrastiveCandidate({...question,distractorMisconceptions:[]},plan),false)
  for(const entry of [{...catalog[0],verification_status:'candidate'},{...catalog[0],subject:'Fen Bilimleri'},{...catalog[0],topic:'Geometri'}]){
    assert.equal(selectObjectiveIntervention({objective,observations:[observation(1),observation(2)],catalog:[entry],baselineScore:0,now}).mode,'diagnostic_reflection')
  }
})
test('newer counter evidence and competing signals request teacher review rather than certainty',()=>{
  const plan=select([observation(1),observation(2),observation(3,true)])
  assert.equal(plan.mode,'diagnostic_reflection')
  assert.equal(plan.teacherReviewRecommended,true)
  assert.equal(plan.signal,null)
  const second={...catalog[0],id:'other'}
  const competing=selectObjectiveIntervention({objective,catalog:[...catalog,second],baselineScore:0,now,
    observations:[observation(1),observation(2),{...observation(1),misconceptionId:'other'},{...observation(2),misconceptionId:'other'}]})
  assert.equal(competing.teacherReviewRecommended,true)
})
test('different objectives and expired or future evidence never support targeted work',()=>{
  for(const change of [{objectiveId:'other'},{occurredAt:new Date(now+1).toISOString()},{occurredAt:new Date(now-31*86400000).toISOString()}]){
    assert.equal(select([observation(1),{...observation(2),...change}]).mode,'diagnostic_reflection')
  }
})
test('source choices are rescored and assisted, unverified or wrong-scope questions are excluded',()=>{
  const input={objective,eventId:'e',sessionId:'s',occurredAt:new Date(now).toISOString(),question,answer:{userAns:0,correct:true},grade:'6',topic:'Kesirler'}
  assert.equal(observationsFromQuestion(input)[0].correct,false)
  assert.equal(observationsFromQuestion({...input,answer:{userAns:1,correct:false}})[0].correct,true)
  for(const q of [{...question,coachedPractice:true},{...question,learningObjectiveId:'other'},{...question,objectiveVerified:false},{...question,subject:'Fen Bilimleri'}]){
    assert.deepEqual(observationsFromQuestion({...input,question:q}),[])
  }
  assert.deepEqual(observationsFromQuestion({...input,answer:{userAns:0,hintUsed:true}}),[])
  assert.deepEqual(observationsFromQuestion({...input,grade:'7'}),[])
})
test('success chooses application, never verified mastery; public plan contains no answer or raw evidence IDs',()=>{
  const plan=select([],80)
  assert.equal(plan.mode,'guided_application')
  assert.equal('verifiedMastery' in plan,false)
  const publicPlan=publicInterventionPlan(select([observation(1),observation(2)]))!
  assert.equal('evidenceIds' in publicPlan,false)
  assert.equal('signal' in publicPlan,false)
  assert.ok(interventionHint(plan).includes('yeni durumda'))
})

function fakeDatabase(rows:Record<string,unknown[]>,failedTable?:string) {
  const calls:Array<{table:string;method:string;args:unknown[]}>=[]
  const db={from(table:string){
    const query:Record<string,unknown>={}
    for(const method of ['select','eq','gte','gt','lte','in','order','limit']){
      query[method]=(...args:unknown[])=>{calls.push({table,method,args});return query}
    }
    query.then=(resolve:(result:unknown)=>unknown)=>resolve({data:rows[table]||[],error:table===failedTable?{message:'offline'}:null})
    return query
  }} as unknown as SupabaseClient
  return {db,calls}
}
test('loader scopes every student source and reconstructs a repeated signal from stored choices',async()=>{
  const {db,calls}=fakeDatabase({
    learning_events:[1,2].map(n=>({id:`e${n}`,source_id:`s${n}`,question_index:0,occurred_at:observation(n).occurredAt})),
    quiz_sessions:[1,2].map(n=>({id:`s${n}`,grade:'6',topic:'Kesirler',questions:[{...question,q:`Farklı soru ${n}`}],answers:[{userAns:0}]})),
    misconception_catalog:catalog,
  })
  const plan=await loadObjectiveIntervention(db,'student',objective,20,now)
  assert.equal(plan.mode,'contrastive_practice')
  for(const table of ['learning_events','adaptive_teacher_overrides','adaptive_learning_evaluations']){
    assert.ok(calls.some(c=>c.table===table&&c.method==='eq'&&c.args[0]==='student_id'&&c.args[1]==='student'))
  }
  assert.ok(calls.some(c=>c.table==='quiz_sessions'&&c.method==='eq'&&c.args[0]==='user_id'&&c.args[1]==='student'))
  assert.ok(calls.some(c=>c.table==='learning_events'&&c.method==='eq'&&c.args[0]==='learning_objective_id'&&c.args[1]===objective.id))
})
test('teacher standard mode and control cohort suppress adaptive targeting',async()=>{
  for(const rows of [{adaptive_teacher_overrides:[{subject:'Matematik',topic:'Kesirler'}]},{adaptive_learning_evaluations:[{id:'control'}]}]){
    const {db,calls}=fakeDatabase(rows)
    const plan=await loadObjectiveIntervention(db,'student',objective,100,now)
    assert.equal(plan.mode,'diagnostic_reflection')
    assert.equal(calls.some(c=>c.table==='learning_events'),false)
  }
})
test('failed reads, capped windows and missing source sessions cannot produce a plan',async()=>{
  const missing=[{id:'e',source_id:'missing',question_index:0,occurred_at:observation(1).occurredAt}]
  for(const fixture of [
    fakeDatabase({},'adaptive_teacher_overrides'),
    fakeDatabase({learning_events:Array.from({length:200},()=>missing[0])}),
    fakeDatabase({learning_events:missing}),
  ])await assert.rejects(loadObjectiveIntervention(fixture.db,'student',objective,100,now))
})
