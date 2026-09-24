import { expect, test } from '@playwright/test'

test('KPSS is not offered as an exam simulation format', async ({ request }) => {
  const response = await request.get('/api/generate-exam')

  expect(response.ok()).toBeTruthy()
  const body = await response.json() as { formats?: Record<string, unknown> }

  expect(body.formats).toBeDefined()
  expect(body.formats).not.toHaveProperty('KPSS_GENEL')
  expect(Object.keys(body.formats || {})).toEqual(expect.arrayContaining(['LGS', 'TYT', 'AYT', 'YDT']))
})
