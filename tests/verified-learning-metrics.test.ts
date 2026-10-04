import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifiedLearningMetrics } from '../lib/verified-learning-metrics'

const attempts = ['baseline','post','transfer'].map((stage, index) => ({ stage, status:'completed', quiz_session_id:stage,
  score_pct:[54,86,78][index], completed_at:new Date(Date.UTC(2026,9,1 + index * 2)).toISOString() }))
const review = { pre_session_id:'baseline', post_session_id:'post', transfer_session_id:'transfer', reviewed_at:'2026-10-03', transfer_reviewed_at:'2026-10-05', transfer_score_pct:78 }
test('assisted and post-test scores never replace reviewed delayed transfer', () => {
  const result = verifiedLearningMetrics(attempts,[review])
  assert.equal(result.verifiedTransferScorePct,78)
  assert.equal(result.verifiedMastery,false)
  assert.equal(result.postScorePct,86)
})
test('missing review, mismatched session, early or inconsistent transfer cannot establish mastery', () => {
  assert.equal(verifiedLearningMetrics(attempts,[]).verifiedMastery,null)
  assert.equal(verifiedLearningMetrics(attempts,[{...review,transfer_session_id:'other'}]).verifiedMastery,null)
  assert.equal(verifiedLearningMetrics(attempts,[{...review,transfer_score_pct:90}]).verifiedMastery,null)
  assert.equal(verifiedLearningMetrics(attempts.map(a=>a.stage==='transfer'? {...a,completed_at:attempts[1].completed_at}:a),[review]).verifiedMastery,null)
})
