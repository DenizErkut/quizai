import test from 'node:test'
import assert from 'node:assert/strict'
import { validateLead } from '../lib/lead-validation'

const base = { leadType: 'bireysel', name: 'Ayşe', email: 'ayse@example.com' }

test('geçerli talep kabul edilir ve kırpılır', () => {
  const r = validateLead({ ...base, name: '  Ayşe  ', message: ' merhaba ' })
  assert.equal(r.ok, true)
  if (r.ok) { assert.equal(r.value.name, 'Ayşe'); assert.equal(r.value.message, 'merhaba'); assert.equal(r.value.phone, null) }
})
test('zorunlu alanlar, tür ve e-posta biçimi denetlenir', () => {
  assert.equal(validateLead({}).ok, false)
  assert.equal(validateLead({ ...base, leadType: 'x' }).ok, false)
  assert.equal(validateLead({ ...base, email: 'yanlis' }).ok, false)
  assert.equal(validateLead({ ...base, email: 'a b@c.com' }).ok, false)
  assert.equal(validateLead({ ...base, name: '   ' }).ok, false)
  assert.equal(validateLead(null).ok, false)
})
test('uzun alanlar reddedilir', () => {
  assert.equal(validateLead({ ...base, message: 'x'.repeat(2001) }).ok, false)
  assert.equal(validateLead({ ...base, name: 'x'.repeat(101) }).ok, false)
  assert.equal(validateLead({ ...base, message: 'x'.repeat(2000) }).ok, true)
})
