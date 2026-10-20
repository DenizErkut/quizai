import test from 'node:test'
import assert from 'node:assert/strict'
import { liveAnswerDecision } from '../lib/live-quiz-rules'

const ok = { status: 'active', currentQuestion: 2, questionIndex: 2, isMember: true, alreadyAnswered: false }

test('sınıf öğrencisi aktif quizde açık soruya ilk kez cevap verebilir', () => {
  assert.equal(liveAnswerDecision(ok), null)
})
test('sınıf dışı kullanıcı reddedilir', () => {
  assert.deepEqual(liveAnswerDecision({ ...ok, isMember: false }), { error: 'Bu quiz sınıfınıza ait değil.', status: 403 })
})
test('aktif olmayan quizde cevap reddedilir', () => {
  assert.equal(liveAnswerDecision({ ...ok, status: 'waiting' })?.status, 409)
  assert.equal(liveAnswerDecision({ ...ok, status: 'finished' })?.status, 409)
})
test('açık olmayan soruya cevap (önceden/sonradan) reddedilir', () => {
  assert.equal(liveAnswerDecision({ ...ok, questionIndex: 3 })?.status, 409)
  assert.equal(liveAnswerDecision({ ...ok, questionIndex: 0 })?.status, 409)
  assert.equal(liveAnswerDecision({ ...ok, currentQuestion: null })?.status, 409)
})
test('aynı soruya ikinci cevap reddedilir', () => {
  assert.equal(liveAnswerDecision({ ...ok, alreadyAnswered: true })?.status, 409)
})
