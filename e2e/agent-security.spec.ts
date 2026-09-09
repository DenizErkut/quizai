import { test, expect } from '@playwright/test'

test.describe('bounded agent security', () => {
  for (const endpoint of ['/api/agents/study-plan', '/api/agents/review-plan', '/api/agents/progress-summary']) {
    test(`${endpoint} rejects anonymous access`, async ({ request }) => {
      const response = endpoint === '/api/agents/study-plan' ? await request.post(endpoint, { data: {} }) : await request.get(endpoint)
      expect(response.status()).toBe(401)
    })
  }

  test('tutor rejects anonymous access', async ({ request }) => {
    const response = await request.post('/api/chat', { data: { messages: [], topic: 'Matematik', language: 'Türkçe' } })
    expect(response.status()).toBe(401)
  })
})
