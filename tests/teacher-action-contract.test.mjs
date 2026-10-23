import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8')
test('decision is scoped, conditional and cannot execute an assignment or overwrite results',()=>{
  const code=source('app/api/teacher/agent-approvals/route.ts')
  const patch=code.slice(code.indexOf('export async function PATCH'),code.indexOf('export async function POST'))
  assert.ok(patch.includes('scopedProposal(body.id, ctx.user.id, ctx.teacher.id)'))
  assert.ok(patch.includes(".eq('status', 'pending')"))
  assert.ok(patch.includes('note.length < 10 || note.length > 500'))
  assert.ok(patch.includes("executionStatus: 'not_executed'"))
  assert.equal(/from\('(verified_learning_cycles|student_mastery|quiz_sessions)'\)/.test(patch),false)
  assert.ok(code.includes("authorizedReviewTeacher(db, userId, data.classroom_id, data.student_id)"))
  assert.ok(code.includes('scope.has(`${row.classroom_id}:${row.student_id}`)'))
  assert.ok(code.includes("'Cache-Control': 'private, no-store'"))
})
test('execution followup requires an explicit scoped association and authentic outcome records',()=>{
  const code=source('app/api/teacher/agent-approvals/route.ts')
  const post=code.slice(code.indexOf('export async function POST'))
  assert.ok(post.indexOf('canLinkActionCycle')<post.indexOf(".from('agent_decision_audit').insert"))
  assert.ok(post.includes("decision: 'linked_existing_cycle'"))
  assert.equal(/from\('(student_mastery|learning_gain_measurements|verified_learning_attempts)'\)/.test(post),false)
  assert.ok(code.includes('loadCyclesMetrics(db, uniqueCycles)'))
  const ui=source('components/teacher/AgentApprovalQueue.tsx')
  assert.ok(ui.includes('Bağlı uygulama kaydı yok; bu öneri uygulanmış sayılmıyor.'))
  assert.ok(ui.includes('role="alert"'))
  assert.ok(ui.includes('controller.abort()'))
})
