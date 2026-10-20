import test from 'node:test'
import assert from 'node:assert/strict'
import { isCronAuthorized } from '../lib/cron-auth'

const req = (authorization?: string) => new Request('https://x.test/api/cron/x', { headers: authorization ? { authorization } : {} })

test('CRON_SECRET tanımsız ya da boşsa her istek reddedilir', () => {
  assert.equal(isCronAuthorized(req('Bearer undefined'), undefined), false)
  assert.equal(isCronAuthorized(req('Bearer '), ''), false)
  assert.equal(isCronAuthorized(req(), undefined), false)
})

test('yalnızca doğru gizli anahtar kabul edilir', () => {
  assert.equal(isCronAuthorized(req('Bearer s3cret'), 's3cret'), true)
  assert.equal(isCronAuthorized(req('Bearer s3cret2'), 's3cret'), false)
  assert.equal(isCronAuthorized(req('Bearer other'), 's3cret'), false)
  assert.equal(isCronAuthorized(req(), 's3cret'), false)
})
