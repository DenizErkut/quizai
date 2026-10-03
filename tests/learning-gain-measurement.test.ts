import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inspectMeasurementPair, inspectMeasurementSession, type MeasurementSession } from '../lib/learning-gain-measurement'
import { objectiveReviewContent } from '../lib/objective-mapping-verification'

function session(id: string, prefix: string, score: number, objectiveId = 'objective-1'): MeasurementSession {
  return {
    id, user_id: 'student-1', completed: true, question_count: 5,
    questions: Array.from({ length: 5 }, (_, index) => ({
      q: `${prefix} soru ${index + 1}`,
      difficulty: index < 2 ? 'kolay' : 'normal',
      learningObjectiveId: objectiveId,
      objectiveMappingStatus: 'mapped',
      objectiveVerified: true,
      qualityVerificationVersion: 'quiz-quality-v2',
    })),
    answers: Array.from({ length: 5 }, (_, index) => ({ correct: index < score })),
  }
}

test('farklı sorularla yapılan eşdeğer testlerin yüzde puan farkı hesaplanır', () => {
  const pre = inspectMeasurementSession(session('pre', 'ilk', 2))
  const post = inspectMeasurementSession(session('post', 'son', 4))
  assert.ok(pre.evidence && post.evidence)
  assert.equal(pre.evidence.scorePct, 40)
  assert.equal(post.evidence.scorePct, 80)
  assert.equal(inspectMeasurementPair(pre.evidence, post.evidence, '2026-09-01T10:00:00Z', '2026-09-03T10:00:00Z'), null)
})

test('aynı soru ön ve son testte kullanılamaz', () => {
  const pre = inspectMeasurementSession(session('pre', 'aynı', 2))
  const post = inspectMeasurementSession(session('post', 'aynı', 4))
  assert.ok(pre.evidence && post.evidence)
  assert.match(inspectMeasurementPair(pre.evidence, post.evidence, '2026-09-01T10:00:00Z', '2026-09-03T10:00:00Z') || '', /aynı soru/)
})

test('doğrulanmamış kazanım eşleşmesi ölçüme alınmaz', () => {
  const candidate = session('pre', 'ilk', 2)
  ;(candidate.questions as Array<Record<string, unknown>>)[0].objectiveVerified = false
  assert.match(inspectMeasurementSession(candidate).reason || '', /kanıtı eksik/)
})

test('insan onaylı ve bağımsız kalite denetiminden geçmiş tarihsel soru ölçüme alınır', () => {
  const reviewed = session('pre', 'insan', 3)
  for (const question of reviewed.questions as Array<Record<string, unknown>>) {
    question.objectiveMappingStatus = 'human_approved'
    question.qualityVerificationVersion = 'historical-bank-quality-v1'
    question.historicalBankQuality = { status: 'added', score: 85, policyVersion: 'historical-bank-quality-v1' }
  }
  assert.ok(inspectMeasurementSession(reviewed).evidence)
  ;(reviewed.questions as Array<Record<string, unknown>>)[0].historicalBankQuality = { status: 'excluded', score: 85, policyVersion: 'historical-bank-quality-v1' }
  assert.match(inspectMeasurementSession(reviewed).reason || '', /kanıtı eksik/)
})

test('farklı kazanım veya zorluk dağılımı eşleştirilemez', () => {
  const pre = inspectMeasurementSession(session('pre', 'ilk', 2))
  const otherObjective = inspectMeasurementSession(session('post', 'son', 4, 'objective-2'))
  assert.ok(pre.evidence && otherObjective.evidence)
  assert.match(inspectMeasurementPair(pre.evidence, otherObjective.evidence, '2026-09-01T10:00:00Z', '2026-09-03T10:00:00Z') || '', /farklı kazanımları/)
  const changed = session('post', 'son', 4)
  ;(changed.questions as Array<Record<string, unknown>>)[0].difficulty = 'zor'
  const post = inspectMeasurementSession(changed)
  assert.ok(post.evidence)
  assert.match(inspectMeasurementPair(pre.evidence, post.evidence, '2026-09-01T10:00:00Z', '2026-09-03T10:00:00Z') || '', /zorluk dağılımı/)
})

test('erken son test ilerleme ölçümü olarak kaydedilemez', () => {
  const pre = inspectMeasurementSession(session('pre', 'ilk', 2))
  const post = inspectMeasurementSession(session('post', 'son', 4))
  assert.ok(pre.evidence && post.evidence)
  assert.match(inspectMeasurementPair(pre.evidence, post.evidence, '2026-09-01T10:00:00Z', '2026-09-01T12:00:00Z') || '', /1–90 gün/)
})

test('two audited AI approvals are eligible, but changed content or missing difficulty proof is not', () => {
  const reviewed = session('pre', 'AI', 3)
  for (const question of reviewed.questions as Array<Record<string, unknown>>) {
    question.objectiveMappingStatus = 'ai_approved'
    question.learningObjectiveCode = 'MAT.7.1.1'
    question.qualityVerificationVersion = 'historical-objective-backfill-v1'
    question.objectiveBackfillReview = {
      policyVersion: 'historical-objective-backfill-v1', decision: 'approved',
      content: objectiveReviewContent(question), reviewedDifficulty: question.difficulty,
      audits: ['openai', 'mistral'].map(provider => ({ provider, approved: true,
        objectiveCode: 'MAT.7.1.1', score: 90, difficultyMatches: true, answerCorrect: true,
        explanationConsistent: true, ageAppropriate: true, unambiguous: true, directObjectiveMatch: true })),
    }
  }
  assert.ok(inspectMeasurementSession(reviewed).evidence)
  const question = (reviewed.questions as Array<Record<string, unknown>>)[0]
  question.difficulty = 'zor'
  assert.equal(inspectMeasurementSession(reviewed).evidence, null)
  question.difficulty = 'kolay'
  question.q = 'Changed after approval'
  assert.equal(inspectMeasurementSession(reviewed).evidence, null)
})
