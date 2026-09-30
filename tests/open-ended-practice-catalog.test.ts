import assert from 'node:assert/strict'
import test from 'node:test'
import { gradeKeyFromProfile, isSelectableOpenEndedTopic, normalizeCatalogTopics, resolveOpenEndedCatalog } from '../lib/open-ended-practice-catalog'

test('öğrencinin profil sınıfı doğru katalog anahtarına çevrilir', () => {
  assert.equal(gradeKeyFromProfile('ortaokul 6. sınıf'), '6')
  assert.equal(gradeKeyFromProfile('lise 9. sınıf'), '9')
  assert.equal(gradeKeyFromProfile('Üniversite 1. sınıf'), 'universite')
})

test('yönetici ders konularını değiştirdiğinde başlangıç listesinin yerine geçer', () => {
  const result = resolveOpenEndedCatalog('6', [{ id: 'override', grade_key: '6', subject: 'Matematik', topics: ['Tam sayılar'], is_active: true }])
  const math = result.find(item => item.subject === 'Matematik')
  assert.deepEqual(math?.topics, ['Tam sayılar'])
  assert.equal(math?.customized, true)
})

test('başlangıç dersi gizlenebilir, diğer sınıflar etkilenmez', () => {
  const override = { grade_key: '6', subject: 'Matematik', topics: [], is_active: false }
  assert.equal(resolveOpenEndedCatalog('6', [override]).find(item => item.subject === 'Matematik')?.isActive, false)
  assert.equal(resolveOpenEndedCatalog('7', [override]).find(item => item.subject === 'Matematik')?.isActive, true)
})

test('konu listesi boş ve tekrar eden değerleri temizler', () => {
  assert.deepEqual(normalizeCatalogTopics([' Tam sayılar ', 'tam sayılar', 'Kesirler']), ['Tam sayılar', 'Kesirler'])
  assert.equal(normalizeCatalogTopics(['']), null)
})

test('soru üretimi gizli, yanlış sınıf ve katalog dışı konuları reddeder', () => {
  const hidden = resolveOpenEndedCatalog('6', [{ grade_key: '6', subject: 'Matematik', topics: ['Tam sayılar'], is_active: false }])
  assert.equal(isSelectableOpenEndedTopic(hidden, 'Matematik', 'Tam sayılar'), false)
  const active = resolveOpenEndedCatalog('6', [{ grade_key: '6', subject: 'Matematik', topics: ['Tam sayılar'], is_active: true }])
  assert.equal(isSelectableOpenEndedTopic(active, 'Matematik', 'Tam sayılar'), true)
  assert.equal(isSelectableOpenEndedTopic(active, 'Matematik', 'Üniversite konusu'), false)
})
