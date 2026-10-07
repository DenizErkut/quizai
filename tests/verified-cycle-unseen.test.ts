import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateVerifiedItemSets, excludeSeenItems, seenQuestionTexts, type VerifiedBankRow } from '../lib/verified-learning-cycle'

const OBJ = 'obj-1'
const row = (i: number, difficulty: string): VerifiedBankRow => ({
  id: `b${i}`, grade_key: '6', subject_key: 'fen',
  question: { q: `Soru ${i}?`, opts: ['a', 'b', 'c'], ans: 0, difficulty, learningObjectiveId: OBJ, objectiveMappingStatus: 'human_approved', objectiveVerified: true, qualityVerificationVersion: 'quiz-quality-v2' },
})

test('seen texts come from served attempts and the guided item only', () => {
  const seen = seenQuestionTexts([{ questions: [{ q: ' Soru 1? ' }, { q: 'SORU 2?' }] }, { questions: 'bad' }], [{ question: { q: 'soru 3?' } }, { question: null }])
  assert.deepEqual([...seen].sort(), ['soru 1?', 'soru 2?', 'soru 3?'])
})

test('a repeat cycle cannot reuse served questions and needs enough new ones', () => {
  const bank = Array.from({ length: 16 }, (_, i) => row(i, 'normal'))
  assert.ok(allocateVerifiedItemSets(bank, OBJ))                                   // first cycle: 16 fresh items
  const seen = seenQuestionTexts([{ questions: bank.slice(0, 15).map(r => r.question) }], [{ question: bank[15].question }])
  const left = excludeSeenItems(bank, seen)
  assert.equal(left.length, 0)
  assert.equal(allocateVerifiedItemSets(left, OBJ), null)                          // nothing new: no second cycle
  const grown = [...bank, ...Array.from({ length: 16 }, (_, i) => row(100 + i, 'normal'))]
  const fresh = excludeSeenItems(grown, seen)
  const sets = allocateVerifiedItemSets(fresh, OBJ)
  assert.ok(sets)
  const used = new Set([...sets!.baseline, ...sets!.post, ...sets!.transfer])
  assert.ok([...used].every(id => Number(id.slice(1)) >= 100))                    // only new items are allocated
})
