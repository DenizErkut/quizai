import { expect, test } from '@playwright/test'
import { createBlindEvalPrompt, isCompleteBenchmark, parseBlindEvalAnswer, shouldUnblindResults, toBlindQuestion } from '../lib/education-eval-runner'

test('parses strict JSON plus common provider formatting wrappers without guessing', () => {
  const options = ['Birinci', 'İkinci', 'Üçüncü', 'Dördüncü']
  expect(parseBlindEvalAnswer('{"answerIndex":2,"explanation":"Açıklama"}', options)).toEqual({ answerIndex: 2, explanation: 'Açıklama' })
  expect(parseBlindEvalAnswer('Yanıtım: {"answerIndex":1,"explanation":"Gerekçe"}', options)).toEqual({ answerIndex: 1, explanation: 'Gerekçe' })
  expect(parseBlindEvalAnswer('{"answer":"C","explanation":"Gerekçe"}', options)).toEqual({ answerIndex: 2, explanation: 'Gerekçe' })
  expect(parseBlindEvalAnswer('Cevap: C — Çünkü işlem sonucu budur.', options)).toEqual({ answerIndex: 2, explanation: '— Çünkü işlem sonucu budur.' })
  expect(parseBlindEvalAnswer('Cevap: Dördüncü', options)).toEqual({ answerIndex: 3, explanation: '' })
  expect(parseBlindEvalAnswer('Cevap: E', options)).toBeNull()
  expect(parseBlindEvalAnswer('{"answerIndex":null}', options)).toBeNull()
  expect(parseBlindEvalAnswer('Bu soruyu yanıtlayamıyorum.', options)).toBeNull()
})

test('only a complete fifty-question set with valid answer indices can start evaluation', () => {
  const items = Array.from({ length: 50 }, () => ({
    question_snapshot: { q: 'Aşağıdakilerden hangisi doğrudur?', opts: ['Bir', 'İki', 'Üç', 'Dört'] },
    answer_key: { answerIndex: 1 },
  }))
  expect(isCompleteBenchmark(items)).toBe(true)
  expect(isCompleteBenchmark(items.slice(0, 49))).toBe(false)
  expect(isCompleteBenchmark([...items.slice(0, 49), { ...items[49], answer_key: { answerIndex: 4 } }])).toBe(false)
  expect(isCompleteBenchmark([...items.slice(0, 49), { ...items[49], question_snapshot: { q: 'Kısa?', opts: ['A', 'B'] } }])).toBe(false)
})

test('model prompt only receives the question and options, never answer-key metadata', () => {
  const snapshot = { q: 'Aşağıdakilerden hangisi doğrudur?', opts: ['A', 'B', 'C', 'D'], ans: 2, answer: 'secret', distractorMisconceptions: ['x'] }
  const question = toBlindQuestion(snapshot)
  expect(question).toEqual({ q: snapshot.q, opts: snapshot.opts })
  const prompt = createBlindEvalPrompt({ grade: '7', subject: 'Matematik', objectiveCode: 'MAT.7.1', objectiveTitle: 'Sayılar', question: question! })
  expect(prompt.userPrompt).toContain(snapshot.q)
  expect(prompt.userPrompt).not.toContain('secret')
  expect(prompt.userPrompt).not.toContain('distractorMisconceptions')
  expect(prompt.userPrompt).not.toContain('answerIndex')
})

test('provider identities are unblinded only after every one of the 150 outputs is rated', () => {
  expect(shouldUnblindResults(150, 149)).toBe(false)
  expect(shouldUnblindResults(149, 149)).toBe(false)
  expect(shouldUnblindResults(150, 150)).toBe(true)
})
