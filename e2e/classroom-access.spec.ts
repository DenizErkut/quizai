import { expect, test } from '@playwright/test'

test('classroom membership endpoints require an authenticated session', async ({ request }) => {
  const membership = await request.get('/api/classrooms/membership')
  expect(membership.status()).toBe(401)
  expect(membership.headers()['cache-control']).toContain('no-store')

  const roster = await request.get('/api/classrooms/membership?includeRoster=1')
  expect(roster.status()).toBe(401)
  expect(roster.headers()['cache-control']).toContain('no-store')

  const join = await request.post('/api/classrooms/join', { data: { code: 'A1B2C3' } })
  expect(join.status()).toBe(401)
})
