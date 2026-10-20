import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedPushEndpoint, parsePushSubscription } from '../lib/push-endpoint'

test('bilinen push servisleri kabul edilir', () => {
  for (const url of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/Qx', 'https://wns2-par02p.notify.windows.com/w/?token=1'])
    assert.equal(isAllowedPushEndpoint(url), true, url)
})

test('SSRF denemeleri reddedilir', () => {
  for (const url of ['http://fcm.googleapis.com/x', 'https://169.254.169.254/latest/meta-data', 'https://localhost/x', 'https://evil.com/fcm.googleapis.com', 'https://fcm.googleapis.com.evil.com/x', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://10.0.0.1/x', 'file:///etc/passwd', '', 'x'])
    assert.equal(isAllowedPushEndpoint(url), false, url)
  assert.equal(isAllowedPushEndpoint(undefined), false)
})

test('abonelik biçimi doğrulanır', () => {
  const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/a', keys: { p256dh: 'k', auth: 'a' } }
  assert.deepEqual(parsePushSubscription(good)?.endpoint, good.endpoint)
  assert.ok(parsePushSubscription(JSON.stringify(good)))
  assert.equal(parsePushSubscription({ ...good, keys: {} }), null)
  assert.equal(parsePushSubscription({ endpoint: 'https://evil.com/x', keys: good.keys }), null)
  assert.equal(parsePushSubscription('{bozuk'), null)
})
