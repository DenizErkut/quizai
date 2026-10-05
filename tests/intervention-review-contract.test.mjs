import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8')
test('teacher endpoint authenticates and authorizes before writing immutable reviews',()=>{
  const route=source('app/api/teacher/intervention-review/route.ts')
  const post=route.slice(route.indexOf('export async function POST'))
  assert.ok(post.indexOf('getAuthedUser')<post.indexOf("db.from('agent_decision_audit').insert"))
  assert.ok(post.indexOf('authorizedReviewTeacher')<post.indexOf("db.from('agent_decision_audit').insert"))
  assert.ok(post.includes('item.fingerprint!==body.fingerprint'))
  assert.equal(/\.from\('(student_mastery|learning_gain_measurements|verified_learning_attempts)'\)/.test(post),false)
})
test('pause gates resume and submission, not only the recommendation card',()=>{
  const measurement=source('app/api/student/verified-learning/route.ts')
  assert.ok(measurement.indexOf('const gate = await stageGate(detail.cycle')<measurement.indexOf("existing?.status === 'started'"))
  const submit=measurement.slice(measurement.indexOf("if (!UUID.test(body.attemptId"))
  assert.ok(submit.indexOf('interventionReviewGate')<submit.indexOf("status: 'processing'"))
  const practice=source('app/api/coach/guided-practice/route.ts').split('export async function POST')[1]
  assert.ok(practice.indexOf('interventionReviewGate')<practice.indexOf("body.action === 'start'"))
  assert.ok(source('app/koc/pratik/page.tsx').includes('disabled={busy||Boolean(reviewGate)}'))
})
