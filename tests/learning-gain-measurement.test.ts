import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inspectMeasurementPair, inspectMeasurementSession, type MeasurementSession } from '../lib/learning-gain-measurement'

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
