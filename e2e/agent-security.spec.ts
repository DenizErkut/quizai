import { test, expect } from '@playwright/test'
import { agentCan, requireAssignedStudentScope, requireOwnStudentScope } from '../lib/agent-security-policy'

test.describe('bounded agent security', () => {
  test('least-privilege matrix denies every state-changing or approval capability', () => {
    const agents = [
      'study-plan-v1', 'review-plan-v1', 'progress-summary-v1', 'ai-tutor-v1',
      'student-coach-v1', 'teacher-student-analysis-v1', 'learning-graph-proposer-v1', 'question-verifier-v1',
    ]
    const forbidden = ['change_mastery', 'change_grade', 'assign_work', 'send_message', 'change_access', 'publish_content', 'approve_content', 'execute_approved_action']
    for (const agent of agents) for (const action of forbidden) expect(agentCan(agent, action), `${agent} must not ${action}`).toBe(false)
    for (const agent of agents.filter(name => name !== 'student-coach-v1')) expect(agentCan(agent, 'send_preference_enabled_in_app_nudge')).toBe(false)
    expect(agentCan('student-coach-v1', 'send_preference_enabled_in_app_nudge')).toBe(true)
    expect(agentCan('unknown-agent', 'read_own_learning_history')).toBe(false)
    expect(agentCan('review-plan-v1', 'read_approved_content')).toBe(true)
  })

  test('student agents reject cross-student scope, including a validly authenticated actor', () => {
    expect(() => requireOwnStudentScope('progress-summary-v1', 'student-a', 'student-b')).toThrow('agent_subject_scope_denied')
    expect(() => requireOwnStudentScope('progress-summary-v1', 'student-a', 'student-a')).not.toThrow()
  })

  test('teacher analysis requires both classroom ownership and student membership', () => {
    expect(() => requireAssignedStudentScope('teacher-student-analysis-v1', 'teacher-a', 'teacher-a', 'student-a', 'student-a')).not.toThrow()
    expect(() => requireAssignedStudentScope('teacher-student-analysis-v1', 'teacher-b', 'teacher-a', 'student-a', 'student-a')).toThrow('agent_assigned_student_scope_denied')
    expect(() => requireAssignedStudentScope('teacher-student-analysis-v1', 'teacher-a', 'teacher-a', 'student-b', 'student-a')).toThrow('agent_assigned_student_scope_denied')
  })

  for (const endpoint of ['/api/agents/study-plan', '/api/agents/review-plan', '/api/agents/progress-summary', '/api/verify-questions', '/api/meb-search']) {
    test(`${endpoint} rejects anonymous access`, async ({ request }) => {
      const response = endpoint === '/api/agents/study-plan' || endpoint === '/api/verify-questions' || endpoint === '/api/meb-search'
        ? await request.post(endpoint, { data: {} })
        : await request.get(endpoint)
      expect(response.status()).toBe(401)
    })
  }

  test('tutor rejects anonymous access', async ({ request }) => {
    const response = await request.post('/api/chat', { data: { messages: [], topic: 'Matematik', language: 'Türkçe' } })
    expect(response.status()).toBe(401)
  })
})
