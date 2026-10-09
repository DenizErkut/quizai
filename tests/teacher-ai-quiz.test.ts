import test from 'node:test'
import assert from 'node:assert/strict'
import { QUESTION_BANK, QUIZ_MAX_LEVEL, QUIZ_TOPICS, isQuizDue, nextLevel, pickRound, presentRound, scoreRound } from '../lib/teacher-ai-quiz-bank'

test('bank has 3 questions per topic and level, ids unique, four distinct options', () => {
  assert.equal(new Set(QUESTION_BANK.map(question => question.id)).size, QUESTION_BANK.length)
  for (const topic of QUIZ_TOPICS) for (const level of [1, 2, 3]) {
    assert.equal(QUESTION_BANK.filter(question => question.topic === topic && question.level === level).length, 3, `${topic} L${level}`)
  }
  for (const question of QUESTION_BANK) assert.equal(new Set(question.options).size, 4, question.id)
})

test('a round has one question per topic at the level and never repeats seen questions while unseen ones exist', () => {
  const seen = new Set<string>()
  for (let round = 0; round < 3; round++) {
    const picked = pickRound(2, seen)
    assert.deepEqual(picked.map(item => item.id[0]), ['v', 'c', 'p', 's'])
    for (const item of picked) { assert.ok(!seen.has(item.id)); seen.add(item.id) }
  }
  assert.equal(seen.size, 12) // all level-2 questions used exactly once
})

test('later levels are harder: the level only rises on a pass and stops at the maximum', () => {
  assert.equal(nextLevel(1, true), 2)
  assert.equal(nextLevel(2, false), 2)
  assert.equal(nextLevel(QUIZ_MAX_LEVEL, true), QUIZ_MAX_LEVEL)
})

test('scoring maps shuffled positions back to the correct option; presented rounds hide answers', () => {
  const round = pickRound(1, [])
  const shown = presentRound(round)
  assert.ok(shown.every(item => item.options.length === 4 && !('correct' in item)))
  const perfect = scoreRound(round, round.map(item => item.order.indexOf(0)))
  assert.deepEqual([perfect?.score, perfect?.passed], [4, true])
  const wrong = scoreRound(round, round.map(item => (item.order.indexOf(0) + 1) % 4))
  assert.deepEqual([wrong?.score, wrong?.passed], [0, false])
  assert.equal(scoreRound(round, [0, 1, 2]), null)
  assert.equal(scoreRound(round, [0, 1, 2, 9]), null)
})

test('a test is due every ten days (and immediately when nothing was taken yet)', () => {
  const now = new Date('2026-10-20T10:00:00Z')
  assert.equal(isQuizDue(null, now), true)
  assert.equal(isQuizDue('2026-10-12T10:00:00Z', now), false)
  assert.equal(isQuizDue('2026-10-10T10:00:00Z', now), true)
})
