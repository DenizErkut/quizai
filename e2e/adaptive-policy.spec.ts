import { expect, test } from '@playwright/test'
import { nextQuestionPolicy, startingDifficultyFromMastery } from '../lib/adaptive-difficulty'

test('mastery başlangıç zorluğunu güvenli basamaklara ayırır', () => {
  expect(startingDifficultyFromMastery(null)).toBe('normal')
  expect(startingDifficultyFromMastery(25)).toBe('kolay')
  expect(startingDifficultyFromMastery(55)).toBe('normal')
  expect(startingDifficultyFromMastery(85)).toBe('zor')
})

test('iki yanlışta zorluğu düşürür, biçimi sadeleştirir ve müdahale ister', () => {
  expect(nextQuestionPolicy('zor', [{ correct: false }, { correct: false }], 'matching')).toEqual({
    difficulty: 'normal',
    questionType: 'multiple_choice',
    supportLevel: 'scaffold',
    showIntervention: true,
    reason: 'Art arda iki yanlış: zorluk bir kademe düşürüldü ve soru biçimi sadeleştirildi.',
  })
})

test('üç doğru sonrası yalnızca bir zorluk basamağı yükseltir', () => {
  const policy = nextQuestionPolicy('normal', [{ correct: true }, { correct: true }, { correct: true }], 'ordering')
  expect(policy.difficulty).toBe('zor')
  expect(policy.questionType).toBe('ordering')
  expect(policy.supportLevel).toBe('none')
  expect(policy.showIntervention).toBe(false)
})

test('zorluk merdiveninin alt ve üst sınırlarını aşmaz', () => {
  expect(nextQuestionPolicy('kolay', [{ correct: false }, { correct: false }], 'multiple_choice').difficulty).toBe('kolay')
  expect(nextQuestionPolicy('cok zor', [{ correct: true }, { correct: true }, { correct: true }], 'multiple_choice').difficulty).toBe('cok zor')
})

test('dengeli performansta cevabı açmadan isteğe bağlı ipucu seçer', () => {
  expect(nextQuestionPolicy('normal', [{ correct: true }, { correct: false }], 'fill_blank').supportLevel).toBe('hint')
})

test('adaptif politika endpointi anonim erişimi reddeder', async ({ request }) => {
  const response = await request.get('/api/student/adaptive-policy?topic=Kesirler')
  expect(response.status()).toBe(401)
})

test('adaptif cevap kaydı anonim erişimi reddeder', async ({ request }) => {
  const response = await request.post('/api/adaptive-answer', { data: { sessionId: '00000000-0000-0000-0000-000000000000', questionIndex: 0 } })
  expect(response.status()).toBe(401)
})
