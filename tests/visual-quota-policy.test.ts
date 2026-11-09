import test from 'node:test'
import assert from 'node:assert/strict'
import { bankVisualTarget, isGeometryRequest, visualProfileForSubject, visualQuotaFor, visualRatioFor } from '../lib/visual-quota-policy'
import { visualAttemptCount, requiredVisualCount } from '../lib/quiz-generation-policy'

test('numeric subjects keep the 30% rule; verbal subjects are loosened', () => {
  for (const subject of ['Matematik', 'Fen Bilimleri', 'Fen ve Teknoloji', 'Biyoloji', 'Kimya', 'Fizik', 'Geometri', 'Coğrafya', 'COĞRAFYA', 'MATEMATİK', ' fen bilimleri '])
    assert.equal(visualProfileForSubject(subject), 'numeric', subject)
  for (const subject of ['Türkçe', 'Türk Dili ve Edebiyatı', 'Edebiyat', 'Felsefe', 'Sosyal Bilgiler', 'Tarih', 'İngilizce',
    'Din Kültürü ve Ahlak Bilgisi', 'Hayat Bilgisi', 'T.C. İnkılap Tarihi ve Atatürkçülük'])
    assert.equal(visualProfileForSubject(subject), 'verbal', subject)
})

test('a missing or unknown subject keeps the original strict rule', () => {
  for (const subject of [undefined, null, '', 'Genel', 'Karma', 'Bilinmeyen Ders']) assert.equal(visualProfileForSubject(subject), 'numeric')
})

test('numeric quota is exactly the existing one', () => {
  for (const count of [1, 2, 5, 10, 20]) {
    const quota = visualQuotaFor('Matematik', count)
    assert.equal(quota.required, requiredVisualCount(count))
    assert.equal(quota.attempts, visualAttemptCount(count))
  }
})

test('verbal quota never requires a visual and attempts about 10%', () => {
  assert.deepEqual([5, 10, 20].map(count => visualQuotaFor('Tarih', count).required), [0, 0, 0])
  assert.deepEqual([5, 10, 20].map(count => visualQuotaFor('Tarih', count).attempts), [1, 1, 2])
  assert.equal(visualQuotaFor('Tarih', 0).attempts, 0)
})

test('bank selection targets: numeric 30% (50% for yeni nesil, at least 1), verbal about 10% and may be 0', () => {
  assert.deepEqual([5, 10].map(count => bankVisualTarget('Fen Bilimleri', count, false)), [2, 3])
  assert.deepEqual([5, 10].map(count => bankVisualTarget('Fen Bilimleri', count, true)), [3, 5])
  assert.deepEqual([5, 10, 20].map(count => bankVisualTarget('Edebiyat', count, false)), [0, 1, 2])
  assert.equal(bankVisualTarget('Edebiyat', 10, true), 1)           // yeni nesil does not raise the verbal target
})

test('geometri soruları için görsel oranı %90', () => {
  assert.equal(isGeometryRequest('Geometri', ''), true)
  assert.equal(isGeometryRequest('Matematik', 'Geometrik şekiller'), true)
  assert.equal(isGeometryRequest('Matematik', 'Üçgenler'), true)
  assert.equal(isGeometryRequest('Matematik', 'Denklemler'), false)
  assert.equal(isGeometryRequest('Tarih', 'Osmanlı'), false)
  assert.equal(visualRatioFor('Matematik', 'Çember ve daire'), 0.9)
  assert.equal(visualRatioFor('Matematik', 'Denklemler'), 0.3)
  assert.deepEqual([5, 10, 20].map(count => bankVisualTarget('Matematik', count, false, 'Geometrik şekiller')), [5, 9, 18])
  assert.deepEqual([5, 10].map(count => visualQuotaFor('Matematik', count, 'Üçgenler').required), [5, 9])
  assert.deepEqual([5, 10].map(count => visualQuotaFor('Matematik', count, 'Denklemler').required), [2, 3])
})
