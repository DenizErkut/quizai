import assert from 'node:assert/strict'
import { test } from 'node:test'
import { learningGradeKey, sameLearningScope } from '../lib/learning-evidence-scope'

test('catalog and bank school-grade labels identify the same scope', () => {
  for (const grade of ['7. sınıf', '7 sinif', 'ortaokul 7 sinif', '7']) assert.equal(learningGradeKey(grade), 'grade:7')
  assert.ok(sameLearningScope({ grade: 'ortaokul 6 sinif', subject: 'fen bilimleri' }, { grade: '6. sınıf', subject: 'Fen Bilimleri' }))
})

test('missing, unknown or different grade and subject never authorize stock', () => {
  for (const grade of [null, '', 'üniversite', '0', '13', '6-D']) assert.equal(learningGradeKey(grade), null)
  assert.equal(sameLearningScope({ grade: '7', subject: 'matematik' }, { grade: '6', subject: 'matematik' }), false)
  assert.equal(sameLearningScope({ grade: '6', subject: 'matematik' }, { grade: '6', subject: 'fen bilimleri' }), false)
  assert.equal(sameLearningScope({ grade: '', subject: '' }, { grade: '', subject: '' }), false)
})
