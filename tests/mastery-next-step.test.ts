import test from 'node:test'
import assert from 'node:assert/strict'
import { masteryNextStep } from '../lib/mastery-next-step'
import type { EvidenceAttempt, EvidenceReview } from '../lib/verified-learning-metrics'

const now=Date.parse('2026-10-06T12:00:00Z'), day=86400000
const attempt=(stage:string,days:number,score=80):EvidenceAttempt=>({stage,status:'completed',quiz_session_id:stage,score_pct:score,completed_at:new Date(now-days*day).toISOString()})
const practice={status:'completed',hint_count:1,first_choice:0,retry_choice:1,question:{ans:1}}
const review:EvidenceReview={pre_session_id:'baseline',post_session_id:'post',transfer_session_id:'transfer',reviewed_at:new Date(now).toISOString(),transfer_reviewed_at:new Date(now).toISOString(),transfer_score_pct:80}
const base={cycleId:'cycle',objectiveId:'objective',objectiveCode:'MAT.5.1.1',subject:'Matematik',topic:'Doğal sayılar',now,estimate:95,confidence:90,misconceptionId:'signal'}
const decide=(attempts:EvidenceAttempt[]=[],reviews:EvidenceReview[]=[],work:typeof practice|null=practice)=>masteryNextStep({...base,attempts,reviews,practice:work})

test('a high estimate is not verification or a confirmed diagnosis',()=>{
  const result=decide()
  assert.equal(result.action,'baseline')
  assert.equal(result.mastery.verified,null)
  assert.equal(result.misconception?.status,'suspected')
})
test('baseline routes to guided practice, then waits 24 hours before post',()=>{
  assert.equal(decide([attempt('baseline',2)],[],null).action,'guided_practice')
  assert.equal(decide([attempt('baseline',0.5)]).action,'wait')
  assert.equal(decide([attempt('baseline',2)]).action,'post')
})
test('post requires exact pre/post review before transfer',()=>{
  const attempts=[attempt('baseline',4),attempt('post',2)]
  assert.equal(decide(attempts).action,'teacher_review')
  assert.equal(decide(attempts,[{...review,pre_session_id:'another'}]).action,'teacher_review')
  assert.equal(decide(attempts,[review]).action,'transfer')
  assert.equal(decide([attempt('baseline',2),attempt('post',0.5)],[review]).action,'wait')
})
test('raw transfer success cannot substitute for teacher review',()=>{
  const attempts=[attempt('baseline',4),attempt('post',2),attempt('transfer',0)]
  assert.equal(decide(attempts).mastery.verified,null)
  assert.equal(decide(attempts,[{...review,transfer_session_id:'another'}]).action,'teacher_review')
  assert.equal(decide(attempts,[{...review,transfer_score_pct:99}]).mastery.verified,null)
})
test('reviewed threshold separates replanning from verified state without inventing next objective',()=>{
  const attempts=[attempt('baseline',4),attempt('post',2),attempt('transfer',0)]
  assert.equal(decide(attempts,[review]).action,'verified')
  assert.equal(decide(attempts,[review]).actionable,false)
  const failed=decide([...attempts.slice(0,2),attempt('transfer',0,79)],[{...review,transfer_score_pct:79}])
  assert.equal(failed.action,'replan')
  assert.equal(failed.mastery.verified,false)
})
test('future, stale and incomplete support records fail closed',()=>{
  assert.equal(decide([attempt('baseline',-1)]).action,'teacher_review')
  assert.equal(decide([attempt('baseline',91)]).action,'replan')
  const invalid=[attempt('baseline',2),attempt('post',1.5),attempt('transfer',-1)]
  assert.equal(decide(invalid,[review]).mastery.verified,null)
  assert.equal(decide([attempt('baseline',4),attempt('post',2)],[review],null).action,'teacher_review')
})
