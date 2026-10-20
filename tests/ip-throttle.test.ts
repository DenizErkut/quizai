import test from 'node:test'
import assert from 'node:assert/strict'
import { allowByIp } from '../lib/ip-throttle'

const req = (ip: string) => new Request('https://x.test/', { headers: { 'x-forwarded-for': ip } })

test('sınır aşılınca reddeder, pencere dolunca yeniden izin verir', () => {
  const now = 1_000_000
  for (let i = 0; i < 3; i++) assert.equal(allowByIp(req('1.1.1.1'), 't1', 3, 1000, now + i), true)
  assert.equal(allowByIp(req('1.1.1.1'), 't1', 3, 1000, now + 10), false)
  assert.equal(allowByIp(req('2.2.2.2'), 't1', 3, 1000, now + 10), true) // başka IP etkilenmez
  assert.equal(allowByIp(req('1.1.1.1'), 't1', 3, 1000, now + 2000), true) // pencere geçti
})
