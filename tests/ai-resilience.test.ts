import test from 'node:test'
import assert from 'node:assert/strict'
import { CircuitBreaker, CircuitOpenError, isTransientError, withResilience, withRetry } from '../lib/ai-gateway/resilience'

const noSleep = async () => {}

test('geçici hata yeniden denenir, 4xx denenmez', async () => {
  let calls = 0
  const value = await withRetry(async () => { if (++calls < 2) throw { status: 503 }; return 'ok' }, { retries: 2, sleep: noSleep })
  assert.equal(value, 'ok'); assert.equal(calls, 2)
  calls = 0
  await assert.rejects(withRetry(async () => { calls++; throw { status: 400 } }, { retries: 3, sleep: noSleep }))
  assert.equal(calls, 1)
  assert.equal(isTransientError({ status: 429 }), true)
  assert.equal(isTransientError({ status: 404 }), false)
})

test('devre kesici eşikte açılır, süre sonunda tek deneme ile kapanır', async () => {
  let now = 0
  const breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 1000, now: () => now })
  let upstreamCalls = 0
  const fail = async () => { upstreamCalls++; throw { status: 500 } }
  for (let i = 0; i < 3; i++) await assert.rejects(breaker.run('gemini', fail))
  assert.equal(breaker.status('gemini'), 'open')
  await assert.rejects(breaker.run('gemini', fail), CircuitOpenError)
  assert.equal(upstreamCalls, 3) // açıkken ücretli çağrı yapılmadı
  now = 1500
  assert.equal(breaker.status('gemini'), 'half-open')
  assert.equal(await breaker.run('gemini', async () => 'up'), 'up')
  assert.equal(breaker.status('gemini'), 'closed')
})

test('yarı açıkta hata kesiciyi yeniden açar; başka anahtar etkilenmez', async () => {
  let now = 0
  const breaker = new CircuitBreaker({ failureThreshold: 1, openMs: 100, now: () => now })
  await assert.rejects(breaker.run('a', async () => { throw { status: 500 } }))
  now = 200
  await assert.rejects(breaker.run('a', async () => { throw { status: 500 } }))
  assert.equal(breaker.status('a'), 'open')
  assert.equal(breaker.status('b'), 'closed')
})

test('doğrulama hatası (4xx) kesiciyi açmaz; kesici açıkken yeniden deneme yapılmaz', async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 1 })
  await assert.rejects(breaker.run('x', async () => { throw { status: 400 } }))
  assert.equal(breaker.status('x'), 'closed')
  await assert.rejects(breaker.run('y', async () => { throw { status: 500 } }))
  let calls = 0
  await assert.rejects(withResilience(breaker, 'y', async () => { calls++; return 1 }, { retries: 3, sleep: noSleep }), CircuitOpenError)
  assert.equal(calls, 0)
})
