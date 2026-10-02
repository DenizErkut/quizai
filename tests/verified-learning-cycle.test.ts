import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allocateVerifiedItemSets, scoreVerifiedAnswers, type VerifiedBankRow } from '../lib/verified-learning-cycle'

function row(index: number, difficulty: string): VerifiedBankRow {
  return { id: `item-${index}`, grade_key: '6 sinif', subject_key: 'matematik', question: {
    q: `Soru ${index}`, opts: ['A', 'B', 'C', 'D'], ans: index % 4, difficulty,
    learningObjectiveId: 'objective-1', objectiveMappingStatus: 'human_approved', objectiveVerified: true,
    qualityVerificationVersion: 'quiz-quality-v2',
  } }
}

test('15 farklı doğrulanmış soru üç denk sete ayrılır', () => {
  const sets = allocateVerifiedItemSets(Array.from({ length: 15 }, (_, index) => row(index, index < 9 ? 'normal' : 'zor')), 'objective-1')
  assert.ok(sets)
  assert.equal(sets.baseline.length, 5)
  assert.equal(new Set([...sets.baseline, ...sets.post, ...sets.transfer]).size, 15)
  assert.equal(sets.baseline.filter(id => Number(id.slice(5)) < 9).length, sets.post.filter(id => Number(id.slice(5)) < 9).length)
})

test('eksik veya onaysız stok ölçüm seti oluşturmaz', () => {
  assert.equal(allocateVerifiedItemSets(Array.from({ length: 14 }, (_, index) => row(index, 'normal')), 'objective-1'), null)
  const rows = Array.from({ length: 15 }, (_, index) => row(index, 'normal'))
  rows[0].question.objectiveVerified = false
  assert.equal(allocateVerifiedItemSets(rows, 'objective-1'), null)
})

test('puan istemciye değil sunucudaki cevap anahtarına dayanır', () => {
  const questions = [row(0, 'normal').question, row(1, 'normal').question]
  assert.deepEqual(scoreVerifiedAnswers(questions, [0, 1])?.score, 2)
  assert.deepEqual(scoreVerifiedAnswers(questions, [1, 1])?.score, 1)
  assert.equal(scoreVerifiedAnswers(questions, [0]), null)
})
