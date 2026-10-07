import test from 'node:test'
import assert from 'node:assert/strict'
import { bookletDifficulty, isMixedSubject, mixedObjectiveReferences, placeMixedQuestion, validBookletQuestion, type CatalogObjective } from '../lib/booklet-mixed'

const obj: CatalogObjective = { objective_code: 'FB.6.1.1', title: 'Güneş sistemi', subject: 'Fen Bilimleri', topic: 'Güneş Sistemi ve Tutulmalar', unit: null }

test('mixed subject spellings', () => {
  for (const s of ['Karışık', 'karisik', 'Tüm Dersler', 'Karışık (ders soru bazında)']) assert.equal(isMixedSubject(s), true, s)
  for (const s of ['Matematik', '', 'Fen Bilimleri']) assert.equal(isMixedSubject(s), false, s)
})

test('difficulty maps all four levels', () => {
  assert.deepEqual(['easy', 'medium', 'hard', 'very_hard', 'çok zor', undefined].map(bookletDifficulty), ['kolay', 'normal', 'zor', 'cok zor', 'cok zor', 'normal'])
})

test('multiple choice and one-sentence short answers are valid, the rest is not', () => {
  assert.equal(validBookletQuestion({ q: 'Soru?', opts: ['a', 'b', 'c', 'd'], ans: 2, exp: 'e' }), true)
  assert.equal(validBookletQuestion({ q: 'Soru?', type: 'short_answer', opts: ['Güneş.'], ans: 0, exp: 'e' }), true)
  assert.equal(validBookletQuestion({ q: 'Soru?', type: 'short_answer', opts: ['Bir cümle. İki cümle.'], ans: 0, exp: 'e' }), false)
  assert.equal(validBookletQuestion({ q: 'Soru?', opts: ['a', 'b'], ans: 0, exp: 'e' }), false)
  assert.equal(validBookletQuestion({ q: 'Soru?', opts: ['a', 'b', 'c', 'd'], ans: 4, exp: 'e' }), false)
})

test('placement comes from the catalog objective only', () => {
  const byCode = new Map([[obj.objective_code, obj]])
  assert.deepEqual(placeMixedQuestion('fb.6.1.1', byCode), { subject: 'Fen Bilimleri', topic: 'Güneş Sistemi ve Tutulmalar', objectiveCode: 'FB.6.1.1', verified: true })
  assert.equal(placeMixedQuestion('XX.1', byCode, 'Fen', 'x').verified, false)
  assert.match(mixedObjectiveReferences([{ ...obj, title: 'a'.repeat(300) }]), /^FB\.6\.1\.1 \| Fen Bilimleri \| a{110}$/)
})

import { bookletQuestionLabels } from '../lib/booklet-objective-label'
import { bookletBatches } from '../lib/booklet-processing'

test('Turkish two-segment codes are read whole and page footers are not questions', () => {
  const text = 'Soru 001 | T.O.6.10 | Orta\nÇoktan seçmeli\nSoru?\nA) a\nCevap: A\n6. Sınıf | Altı ders | 300 soru 3\nSoru 002 | ENG.6.1.R3 | Zor\nQ?\n'
  const labels = bookletQuestionLabels(text)
  assert.deepEqual(labels.map(label => label.number), [1, 2])
  assert.deepEqual(labels.map(label => label.codes), [['T.O.6.10'], ['ENG.6.1.R3']])
  assert.equal(bookletBatches(text).length, 1)
})
