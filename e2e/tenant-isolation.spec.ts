import { test, expect } from '@playwright/test'

test.describe('tenant isolation security contract', () => {
  const protectedRoutes = [
    ['/api/teacher/learning-insights', 'get'],
    ['/api/parent/reports?userId=another-user', 'get'],
    ['/api/admin/agent-quality', 'get'],
    ['/api/teacher/learning-risk', 'get'],
    ['/api/admin/learning-risk', 'get'],
    ['/api/admin/predictive-risk-calibration', 'get'],
    ['/api/teacher/learning-risk/actions', 'get'],
    ['/api/institution/learning-risk', 'get'],
    ['/api/institution/comparisons', 'get'],
    ['/api/admin/pipeline-health', 'get'],
    ['/api/admin/profile-actions', 'post'],
    ['/api/admin/verified-learning-metrics', 'get'],
    ['/api/admin/booklet-visuals?resourceId=another-resource', 'get'],
    ['/api/admin/booklet-visuals', 'post'],
    ['/api/parent/link-child', 'post'],
    ['/api/parent/unlink-child', 'post'],
    ['/api/teacher/agent-approvals', 'get'],
    ['/api/admin/learning-evidence-readiness', 'get'],
    ['/api/student/verified-learning', 'get'],
    ['/api/coach/guided-practice', 'get'],
    ['/api/transfer-check', 'get'],
  ] as const

  for (const [route, method] of protectedRoutes) {
    test(`${route} rejects a forged bearer token`, async ({ request }) => {
      const response = method === 'get'
        ? await request.get(route, { headers: { Authorization: 'Bearer forged-token' } })
        : await request.post(route, { headers: { Authorization: 'Bearer forged-token' }, data: {} })
      expect([401, 403]).toContain(response.status())
    })
  }

  test('admin quality endpoint rejects client supplied identity fields', async ({ request }) => {
    const response = await request.get('/api/admin/agent-quality?userId=other-tenant', { headers: { Authorization: 'Bearer forged-token' } })
    expect([401, 403]).toContain(response.status())
  })

  test('booklet processing cannot be started with a forged identity', async ({ request }) => {
    const response = await request.patch('/api/admin/exam-upload', {
      headers: { Authorization: 'Bearer forged-token' }, data: { action: 'process-next', id: 'another-resource' },
    })
    expect([401, 403]).toContain(response.status())
  })

  test('partner institution endpoint rejects malformed integration credentials', async ({ request }) => {
    const response = await request.get('/api/integrations/v1/institution', {
      headers: { Authorization: 'Bearer forged-token' },
    })
    expect(response.status()).toBe(401)
  })

  test('partner students endpoint rejects malformed integration credentials', async ({ request }) => {
    const response = await request.get('/api/integrations/v1/students?limit=3', {
      headers: { Authorization: 'Bearer forged-token' },
    })
    expect(response.status()).toBe(401)
  })
  for (const path of ['students/identified', 'classrooms', 'quizzes', 'open-ended', 'mastery', 'grades', 'links']) {
    test(`partner ${path} export rejects malformed integration credentials`, async ({ request }) => {
      const response = await request.get(`/api/integrations/v1/${path}?limit=3`, { headers: { Authorization: 'Bearer forged-token' } })
      expect(response.status()).toBe(401)
    })
  }

  test('partner import endpoints reject malformed integration credentials', async ({ request }) => {
    for (const path of ['grades', 'links']) {
      const response = await request.post(`/api/integrations/v1/${path}`, { headers: { Authorization: 'Bearer forged-token' }, data: {} })
      expect(response.status()).toBe(401)
    }
  })

  test('partner openapi description is public and lists the import endpoints', async ({ request }) => {
    const response = await request.get('/api/integrations/v1/openapi')
    expect(response.status()).toBe(200)
    const spec = await response.json()
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/grades', '/links', '/students/identified']))
  })
  test('teacher cannot leave an institution without a session', async ({ request }) => {
    const response = await request.delete('/api/teacher/institutions', { data: { institution_id: '00000000-0000-4000-8000-000000000000' } })
    expect(response.status()).toBe(401)
  })
  test('teacher AI quiz requires a teacher session', async ({ request }) => {
    expect((await request.get('/api/teacher/ai-quiz')).status()).toBe(403)
    expect((await request.post('/api/teacher/ai-quiz', { data: { action: 'start' } })).status()).toBe(403)
  })
})
