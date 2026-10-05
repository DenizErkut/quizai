import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bookletQuestionLabels, printedQuestionObjective, printedQuestionNumber } from '../lib/booklet-objective-label'
test('printed question label overrides guesses and excludes cover codes', () => {
  const labels = bookletQuestionLabels('FB.8.1.1 FB.8.1.2\nSoru 001 | Kolay\nFB.8.1.1 (a) · Çoktan seçmeli\nDünyanın eksen eğikliği hangi sonucu doğurur?\nA) x\nSoru 002 | Kolay\nFB.8.1.2 (c) · Çoktan seçmeli\nİklim ile hava olayları nasıl karşılaştırılır?\nA) x')
  assert.equal(printedQuestionObjective('Dünyanın eksen eğikliği hangi sonucu doğurur?', labels, ['FB.8.1.1', 'FB.8.1.2']), 'FB.8.1.1')
  assert.equal(printedQuestionObjective('İklim ile hava olayları nasıl karşılaştırılır?', labels, ['FB.8.1.1', 'FB.8.1.2']), 'FB.8.1.2')
  assert.equal(printedQuestionObjective('İklim ile hava olayları nasıl karşılaştırılır?', labels, ['FB.8.1.1']), null)
  assert.equal(printedQuestionObjective('Kaynakta yer almayan farklı bir soru?', labels, ['FB.8.1.1']), null)
})

test('original PDF numbers survive skipped questions and never become list positions', () => {
  const labels = bookletQuestionLabels('Soru 001 | Kolay\nİlk sorunun yeterince uzun metni nedir?\nSoru 017 | Zor\nSonraki sorunun yeterince uzun metni nedir?')
  assert.equal(printedQuestionNumber('Sonraki sorunun yeterince uzun metni nedir?', labels), 17)
  assert.equal(printedQuestionNumber('Kaynakta olmayan yeterince uzun bir soru?', labels), null)
  assert.equal(printedQuestionNumber('Aynı soru metni hangi cevabı gerektirir?', bookletQuestionLabels('2. Aynı soru metni hangi cevabı gerektirir?\n8. Aynı soru metni hangi cevabı gerektirir?')), null)
})
