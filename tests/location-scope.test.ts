import test from 'node:test'
import assert from 'node:assert/strict'
import { applicableScopes, hasLocation, scopeApplies } from '../lib/location/curriculum-scope'

const tr = { country: 'TR', state: null, city: null }
const ist = { country: 'TR', state: 'Istanbul', city: null }
const kad = { country: 'TR', state: 'Istanbul', city: 'Kadıköy' }
const us = { country: 'US', state: null, city: null }

test('konum boşsa hiçbir müfredat uygulanmaz', () => {
  assert.equal(hasLocation({ country: null }), false)
  assert.equal(scopeApplies(tr, { country: '' }), false)
  assert.deepEqual(applicableScopes([tr], {}), [])
})

test('ülke geneli müfredat o ülkenin tüm kullanıcılarına uygulanır, başka ülkeye uygulanmaz', () => {
  assert.equal(scopeApplies(tr, { country: 'TR', state: 'Ankara', city: 'Çankaya' }), true)
  assert.equal(scopeApplies(tr, { country: 'tr' }), true)
  assert.equal(scopeApplies(us, { country: 'TR' }), false)
})

test('eyalet/şehir kapsamlı müfredat yalnızca eşleşen konuma uygulanır', () => {
  assert.equal(scopeApplies(ist, { country: 'TR', state: 'istanbul' }), true)
  assert.equal(scopeApplies(ist, { country: 'TR', state: 'Ankara' }), false)
  assert.equal(scopeApplies(kad, { country: 'TR', state: 'Istanbul', city: 'Kadıköy' }), true)
  assert.equal(scopeApplies(kad, { country: 'TR', state: 'Istanbul', city: 'Üsküdar' }), false)
})

test('birden çok müfredat uyuyorsa en özel kapsam seçilir', () => {
  const user = { country: 'TR', state: 'Istanbul', city: 'Kadıköy' }
  assert.deepEqual(applicableScopes([tr, ist, kad, us], user), [kad])
  assert.deepEqual(applicableScopes([tr, ist, kad], { country: 'TR', state: 'Istanbul', city: 'Üsküdar' }), [ist])
  assert.deepEqual(applicableScopes([tr, ist, kad], { country: 'TR', state: 'Ankara' }), [tr])
})
