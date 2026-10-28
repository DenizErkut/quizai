import test from 'node:test'
import assert from 'node:assert/strict'
import { gradeNumberOf, normalizeParsedQuestions, summarizeResults, validateQuestions, validateSlot } from '../lib/written-exam'

const q = (over: Record<string, unknown> = {}) => ({
  question: 'Bileşke kuvveti bulunuz.', maxPoints: 8,
  rubric: [{ criterion: 'a) Doğu toplamı', maxPoints: 4, description: '18+7=25 N' }, { criterion: 'b) Bileşke', maxPoints: 4, description: '25-11=14 N' }], ...over,
})

test('validateSlot accepts valid slots and rejects bad ones', () => {
  assert.deepEqual(validateSlot({ gradeNumber: '6. sınıf', subject: ' Fen Bilimleri ', term: 1, examNumber: 2 }), { ok: true, value: { gradeNumber: 6, subject: 'Fen Bilimleri', term: 1, examNumber: 2 } })
  assert.equal(validateSlot({ gradeNumber: 13, subject: 'Fen', term: 1, examNumber: 1 }).ok, false)
  assert.equal(validateSlot({ gradeNumber: 6, subject: 'Fen', term: 3, examNumber: 1 }).ok, false)
  assert.equal(validateSlot({ gradeNumber: 6, subject: 'Fen', term: 1, examNumber: 5 }).ok, false)
})

test('gradeNumberOf', () => {
  assert.equal(gradeNumberOf('6. Sınıf'), 6)
  assert.equal(gradeNumberOf(8), 8)
  assert.equal(gradeNumberOf('x'), null)
})

test('validateQuestions requires rubric total to equal question points', () => {
  const good = validateQuestions([q(), q({ maxPoints: 4, rubric: [{ criterion: 'x', maxPoints: 4, description: '' }] })])
  assert.equal(good.ok && good.totalPoints, 12)
  const bad = validateQuestions([q({ maxPoints: 10 })])
  assert.equal(bad.ok, false)
  assert.equal(validateQuestions([]).ok, false)
  assert.equal(validateQuestions([q({ question: '' })]).ok, false)
  assert.equal(validateQuestions([q({ rubric: [] })]).ok, false)
})

test('normalizeParsedQuestions reports mismatches as warnings instead of throwing', () => {
  const { questions, warnings } = normalizeParsedQuestions([q({ maxPoints: 10 }), { question: 'x', rubric: [] }])
  assert.equal(questions.length, 2)
  assert.equal(warnings.length, 2)
  assert.deepEqual(normalizeParsedQuestions(null).questions, [])
})

test('summarizeResults treats unanswered as zero and caps at max', () => {
  const s = summarizeResults([{ questionId: 'a', maxPoints: 8, earned: 6 }, { questionId: 'b', maxPoints: 8, earned: null }, { questionId: 'c', maxPoints: 4, earned: 9 }])
  assert.deepEqual(s, { totalEarned: 10, totalPossible: 20, answered: 2, percent: 50 })
})
