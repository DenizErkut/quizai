import { test } from 'node:test'
import assert from 'node:assert/strict'
import { educationEvalSubjectKey } from '../lib/education-eval-subject'

test('English catalog matches imported Turkish and ASCII spellings', () => {
  for (const value of ['Ingilizce', 'İngilizce', 'INGILIZCE', 'ıngilizce', ' ingilizce ']) {
    assert.equal(educationEvalSubjectKey(value), 'ingilizce')
  }
})
test('subject normalization never merges other lessons or empty scope', () => {
  assert.notEqual(educationEvalSubjectKey('Matematik'), educationEvalSubjectKey('İngilizce'))
  assert.notEqual(educationEvalSubjectKey(''), educationEvalSubjectKey('İngilizce'))
  assert.equal(educationEvalSubjectKey('Fen Bilimleri'), educationEvalSubjectKey('FEN BİLİMLERİ'))
})
