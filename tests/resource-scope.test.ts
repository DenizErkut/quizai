import test from 'node:test'
import assert from 'node:assert/strict'
import { filterRowsByUserScope, parseResourceScope, rowScope, userScopeOrDefault } from '../lib/location/resource-scope'

test('ülke zorunlu; eyalet/şehir isteğe bağlı', () => {
  assert.equal(parseResourceScope({}).ok, false)
  assert.deepEqual(parseResourceScope({ country: 'us' }), { ok: true, value: { country: 'US', state: null, city: null } })
  assert.deepEqual(parseResourceScope({ country: 'TR', state: 'Ankara', city: 'Çankaya' }), { ok: true, value: { country: 'TR', state: 'Ankara', city: 'Çankaya' } })
  assert.equal(parseResourceScope({ country: 'TR', city: 'Çankaya' }).ok, false)
  assert.equal(parseResourceScope({ country: 'Turkey' }).ok, false)
})

test('konumsuz kullanıcı ve kapsamsız kayıt Türkiye sayılır', () => {
  assert.deepEqual(userScopeOrDefault(null), { country: 'TR' })
  assert.equal(rowScope({}).country, 'TR')
})

test('kayıtlar kullanıcının ülke/eyalet/şehrine göre süzülür', () => {
  const rows = [
    { id: 'tr', country: 'TR' }, { id: 'us', country: 'US' },
    { id: 'tr-ankara', country: 'TR', state: 'Ankara' }, { id: 'tr-izmir', country: 'TR', state: 'İzmir' },
  ]
  const ids = (user: any) => filterRowsByUserScope(rows, user, row => row).map(row => row.id)
  assert.deepEqual(ids({ country: 'TR', state: 'Ankara', city: 'Çankaya' }), ['tr', 'tr-ankara'])
  assert.deepEqual(ids({ country: 'US', state: 'Texas', city: 'Austin' }), ['us'])
  assert.deepEqual(ids(null), ['tr'])
})
