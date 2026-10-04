import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agentCan, requireOwnStudentScope, requireAssignedStudentScope } from '../lib/agent-security-policy'
test('student agent cannot read a peer or acquire teacher/content privileges', () => {
  assert.throws(()=>requireOwnStudentScope('student-coach-v1','student-a','student-b'))
  assert.equal(agentCan('student-coach-v1','read_assigned_student_data'),false)
  assert.equal(agentCan('student-coach-v1','propose_content_draft'),false)
})
test('teacher scope requires classroom ownership and requested member', () => {
  assert.throws(()=>requireAssignedStudentScope('teacher-student-analysis-v1','other-teacher','teacher','child','child'))
  assert.throws(()=>requireAssignedStudentScope('teacher-student-analysis-v1','teacher','teacher','other-child','child'))
  assert.doesNotThrow(()=>requireAssignedStudentScope('teacher-student-analysis-v1','teacher','teacher','child','child'))
})
test('content verifier and unknown agents cannot access student records', () => {
  assert.equal(agentCan('question-verifier-v1','read_own_learning_history'),false)
  assert.equal(agentCan('question-verifier-v1','read_assigned_student_data'),false)
  assert.equal(agentCan('unknown','verify_content'),false)
})
