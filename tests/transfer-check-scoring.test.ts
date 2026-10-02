import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gradeTransferChoice, usableTransferQuestion } from '../lib/transfer-check-scoring'

const question = { q: 'Yeni bağlamda soru', opts: ['A', 'B', 'C', 'D'], ans: 2, difficulty: 'normal', learningObjectiveId: 'objective-1', objectiveMappingStatus: 'mapped', objectiveVerified: true, qualityVerificationVersion: 'quiz-quality-v2' }

test('yalnız doğrulanmış ve farklı soru kullanılabilir', () => {
  assert.equal(usableTransferQuestion(question, 'objective-1', 'Eski soru'), true)
  assert.equal(usableTransferQuestion(question, 'objective-1', 'Yeni bağlamda soru'), false)
  assert.equal(usableTransferQuestion({ ...question, objectiveVerified: false }, 'objective-1', 'Eski soru'), false)
  assert.equal(usableTransferQuestion({ ...question, learningObjectiveId: 'wrong' }, 'objective-1', 'Eski soru'), false)
  assert.equal(usableTransferQuestion(question, 'objective-1', 'Eski soru', 'zor'), false)
})

test('sonucu istemci değil sunucu cevap anahtarından belirler', () => {
  assert.equal(gradeTransferChoice(2, 2), 'independent_success')
  assert.equal(gradeTransferChoice(1, 2), 'not_transferred')
  assert.equal(gradeTransferChoice(undefined, 2), 'unanswered')
})
