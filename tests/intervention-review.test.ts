import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import {practiceReviewFingerprint,matchingPracticeReview,authorizedReviewTeacher,interventionReviewGate,type ReviewPractice,type ReviewScope,type ReviewAudit} from '../lib/intervention-review'
const scope:ReviewScope={studentId:'student',classroomId:'class',teacherId:'teacher',teacherUserId:'teacher-user',cycleId:'cycle',objectiveId:'objective'}
const practice:ReviewPractice={id:'practice',student_id:'student',cycle_id:'cycle',question:{q:'Soru',opts:['A','B','C'],ans:1,bankQuestionId:'bank',learningObjectiveId:'objective'},status:'completed',first_choice:0,retry_choice:1,student_explanation:'Gerekçemi açıklıyorum'}
const audit=(decision='needs_followup',time='2026-10-06T10:00:00Z'):ReviewAudit=>({
  id:decision,actor_id:'teacher-user',created_at:time,
  input_summary:{student_id:'student',classroom_id:'class',teacher_id:'teacher',cycle_id:'cycle',objective_id:'objective',practice_id:'practice',fingerprint:practiceReviewFingerprint(practice)},
  decision_summary:{decision,note:'Öğrenci gerekçesini birlikte incelemeliyiz.'},
})
test('review fingerprints bind the actual question/plan but survive learner response changes',()=>{
  assert.equal(practiceReviewFingerprint(practice),practiceReviewFingerprint({...practice,retry_choice:0,student_explanation:'Başka bir yanıt açıklaması'}))
  assert.notEqual(practiceReviewFingerprint(practice),practiceReviewFingerprint({...practice,question:{...practice.question,q:'Başka soru'}}))
  assert.notEqual(practiceReviewFingerprint(practice),practiceReviewFingerprint({...practice,question:{...practice.question,ans:0}}))
})
test('foreign teachers, students, classes, cycles and objectives cannot approve a practice',()=>{
  for(const patch of [{teacherUserId:'other'},{studentId:'other'},{classroomId:'other'},{teacherId:'other'},{cycleId:'other'},{objectiveId:'other'}]){
    assert.equal(matchingPracticeReview(practice,{...scope,...patch},[audit()]),null)
  }
  assert.equal(matchingPracticeReview({...practice,question:{...practice.question,q:'Changed'}},scope,[audit()]),null)
})
test('latest scoped decision controls follow-up; it never establishes mastery',()=>{
  const result=matchingPracticeReview(practice,scope,[audit(),audit('continue','2026-10-06T11:00:00Z')])!
  assert.equal(result.decision,'continue')
  assert.equal('verifiedMastery' in result,false)
  assert.equal(matchingPracticeReview(practice,scope,[{...audit(),decision_summary:{decision:'mastery_approved',note:'Bu öğrenme sonucu doğrulandı.'}}]),null)
  assert.equal(matchingPracticeReview(practice,scope,[{...audit(),decision_summary:{decision:'continue',note:'ok'}}]),null)
})
function fakeDatabase(rows:Record<string,unknown[]>,failedTable?:string){
  const calls:Array<{table:string;method:string;args:unknown[]}>=[]
  const db={from(table:string){
    const query:Record<string,unknown>={}
    let single=false
    for(const method of ['select','eq','order','limit']){
      query[method]=(...args:unknown[])=>{calls.push({table,method,args});return query}
    }
    query.maybeSingle=()=>{single=true;return query}
    query.then=(resolve:(value:unknown)=>unknown)=>resolve({data:single?(rows[table]?.[0]||null):(rows[table]||[]),error:table===failedTable?{message:'offline'}:null})
    return query
  }} as unknown as SupabaseClient
  return {db,calls}
}
test('teacher access requires approved identity, owned class and exact student membership',async()=>{
  const rows={teachers:[{id:'teacher'}],classrooms:[{id:'class'}],classroom_students:[{student_id:'student'}]}
  const fixture=fakeDatabase(rows)
  assert.equal(await authorizedReviewTeacher(fixture.db,'teacher-user','class','student'),'teacher')
  for(const [table,key,value] of [['teachers','approved',true],['teachers','user_id','teacher-user'],['classrooms','teacher_id','teacher'],['classroom_students','classroom_id','class'],['classroom_students','student_id','student']]){
    assert.ok(fixture.calls.some(c=>c.table===table&&c.method==='eq'&&c.args[0]===key&&c.args[1]===value))
  }
  for(const missing of ['teachers','classrooms','classroom_students'])assert.equal(await authorizedReviewTeacher(fakeDatabase({...rows,[missing]:[]}).db,'teacher-user','class','student'),null)
})
test('pause is enforced from the exact scoped audit; failed reads cannot release it',async()=>{
  const rows={verified_learning_cycles:[{id:'cycle',student_id:'student',teacher_id:'teacher',classroom_id:'class',learning_objective_id:'objective'}],
    teachers:[{user_id:'teacher-user'}],coach_guided_practice_attempts:[practice],agent_decision_audit:[audit()]}
  const fixture=fakeDatabase(rows)
  assert.ok(await interventionReviewGate(fixture.db,'student','cycle'))
  assert.ok(fixture.calls.some(c=>c.table==='agent_decision_audit'&&c.method==='eq'&&c.args[0]==='input_summary->>fingerprint'))
  assert.equal(await interventionReviewGate(fakeDatabase({...rows,agent_decision_audit:[audit('continue')]}).db,'student','cycle'),null)
  await assert.rejects(interventionReviewGate(fakeDatabase(rows,'agent_decision_audit').db,'student','cycle'))
  await assert.rejects(interventionReviewGate(fakeDatabase({...rows,agent_decision_audit:[{...audit(),actor_id:'other'}]}).db,'student','cycle'))
})
