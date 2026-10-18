import test from 'node:test'
import assert from 'node:assert/strict'
import { validateLocationDetails, validateCurriculumScope, curriculumScopeSuffix, placeLabels, scopeLabel } from '../lib/location/validate'

test('öğrenci konumu: ülke, eyalet/il ve şehir/ilçe zorunlu', () => {
  assert.deepEqual(validateLocationDetails({}), { ok: false, field: 'country' })
  assert.deepEqual(validateLocationDetails({ country: 'tr' }), { ok: false, field: 'state' })
  assert.deepEqual(validateLocationDetails({ country: 'TR', state: 'İstanbul' }), { ok: false, field: 'city' })
  assert.deepEqual(validateLocationDetails({ country: 'TUR', state: 'x', city: 'y' }), { ok: false, field: 'country' })
  const ok = validateLocationDetails({ country: ' tr ', state: ' İstanbul ', city: 'Kadıköy' })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.deepEqual(ok.value, { country: 'TR', state: 'İstanbul', city: 'Kadıköy', postalCode: '', addressLine: '' })
})

test('posta kodu ve açık adres opsiyonel; verilirse doğrulanır', () => {
  assert.equal(validateLocationDetails({ country: 'US', state: 'California', city: 'Fresno', postalCode: '93650' }).ok, true)
  assert.equal(validateLocationDetails({ country: 'GB', state: 'England', city: 'London', postalCode: 'SW1A 1AA' }).ok, true)
  assert.deepEqual(validateLocationDetails({ country: 'TR', state: 'A', city: 'B', postalCode: '<script>' }), { ok: false, field: 'postal' })
  assert.deepEqual(validateLocationDetails({ country: 'TR', state: 'A', city: 'B', addressLine: 'x'.repeat(301) }), { ok: false, field: 'address' })
  assert.deepEqual(validateLocationDetails({ country: 'TR', state: 'A'.repeat(121), city: 'B' }), { ok: false, field: 'state' })
})

test('müfredat kapsamı: ülke zorunlu, eyalet/şehir boşsa ülke geneli', () => {
  assert.equal(validateCurriculumScope({ country: 'TR' }).ok, true)
  assert.deepEqual(validateCurriculumScope({ country: '' }), { ok: false, field: 'country' })
  assert.deepEqual(validateCurriculumScope({ country: 'TR', city: 'Kadıköy' }), { ok: false, field: 'state' })
  assert.equal(curriculumScopeSuffix({ country: 'TR', state: '', city: '' }), '')
  assert.equal(curriculumScopeSuffix({ country: 'US', state: 'California', city: '' }), '-US-CALIFORNIA')
  assert.equal(curriculumScopeSuffix({ country: 'TR', state: 'İstanbul', city: 'Kadıköy' }), '-TR-ISTANBUL-KADIKOY')
})

test('etiketler: Türkiye için il/ilçe, diğer ülkeler için eyalet/şehir', () => {
  assert.deepEqual(placeLabels('TR'), { state: 'İl', city: 'İlçe' })
  assert.deepEqual(placeLabels('US'), { state: 'Eyalet / Bölge', city: 'Şehir' })
  assert.equal(scopeLabel({ country: 'TR', state: 'İstanbul', city: '' }, 'tr-TR'), 'Türkiye › İstanbul')
  assert.equal(scopeLabel(null), '')
})
