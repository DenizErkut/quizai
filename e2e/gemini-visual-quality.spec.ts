import { expect, test } from '@playwright/test'
import { parseGeminiVisualReview } from '../lib/gemini-visual-quality'

test('Gemini görsel değerlendirmesini katı kalite eşiğine göre kabul eder', () => {
  const result = parseGeminiVisualReview(JSON.stringify({
    score: 95,
    contextMatch: true,
    answerLeak: false,
    useful: true,
    renderingIssue: false,
    reason: 'Görsel soru verileriyle tutarlı.',
  }))

  expect(result?.passed).toBe(true)
  expect(result?.score).toBe(95)
})

test('Gemini matematiksel görsel uyumsuzluğunu reddeder', () => {
  const result = parseGeminiVisualReview(JSON.stringify({
    score: 95,
    contextMatch: false,
    answerLeak: false,
    useful: true,
    renderingIssue: false,
    reason: 'D noktası açıortay teoremine göre yanlış yerde.',
  }))

  expect(result?.passed).toBe(false)
  expect(result?.contextMatch).toBe(false)
})

test('bozuk veya eksik Gemini yanıtını geçerli kabul etmez', () => {
  expect(parseGeminiVisualReview('not json')).toBeNull()
  expect(parseGeminiVisualReview('{"score":150,"contextMatch":true}')).toBeNull()
})
