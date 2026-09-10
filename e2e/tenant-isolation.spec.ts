import { test, expect } from '@playwright/test'

test.describe('tenant isolation security contract', () => {
  const protectedRoutes = [
    ['/api/teacher/learning-insights', 'get'],
    ['/api/parent/reports?userId=another-user', 'get'],
    ['/api/admin/agent-quality', 'get'],
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
})
