import test from 'node:test'
import assert from 'node:assert/strict'
import { safeNextPath } from '../lib/safe-next'

test('aynı site yolları kabul edilir', () => {
  assert.equal(safeNextPath('/home'), '/home')
  assert.equal(safeNextPath('/quiz?topic=a%20b&x=1#top'), '/quiz?topic=a%20b&x=1#top')
})

test('açık yönlendirme denemeleri reddedilir', () => {
  for (const bad of ['//evil.com', '/\\evil.com', '/\\/evil.com', 'https://evil.com', 'javascript:alert(1)', '/%0d%0a//evil.com'.replace('%0d%0a', '\r\n'), '/a\tb', '', null, undefined, 'evil.com', '/\u0000x']) {
    assert.equal(safeNextPath(bad as string | null | undefined), null, String(bad))
  }
})

test('/login varsayılan olarak reddedilir, izin verilirse kabul edilir', () => {
  assert.equal(safeNextPath('/login'), null)
  assert.equal(safeNextPath('/login/student', { allowLogin: true }), '/login/student')
})

test('çok uzun değer reddedilir', () => {
  assert.equal(safeNextPath('/' + 'a'.repeat(3000)), null)
})
