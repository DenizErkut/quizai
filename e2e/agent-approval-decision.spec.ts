import { expect, test } from '@playwright/test'

test('agent approval queue refuses anonymous reads and decision writes', async ({ request }) => {
  const read = await request.get('/api/teacher/agent-approvals')
  const decision = await request.patch('/api/teacher/agent-approvals', {
    data: { id: '00000000-0000-0000-0000-000000000001', status: 'approved' },
  })

  expect(read.status()).toBe(403)
  expect(decision.status()).toBe(403)
})
