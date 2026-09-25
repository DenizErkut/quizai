import { expect, test } from '@playwright/test'
import { evaluateQuestionConsistency } from '../lib/question-consistency'

test('yalnız görünüş kare sayılarıyla en az küp soran eksik tanımlı soruyu reddeder', () => {
  const result = evaluateQuestionConsistency({
    type: 'multiple_choice',
    q: 'Bir yapının ön görünüşünde 6, üst görünüşünde 4 ve yan görünüşünde 5 kare vardır. Bu yapıyı oluşturmak için en az kaç küp gerekir?',
    opts: ['10', '15', '12', '20'],
    ans: 2,
    exp: 'En büyük görünüş 6 kare olduğundan cevap 12 olur.',
  })
  expect(result.verdict).toBe('reject')
  expect(result.reasonCode).toBe('PROJECTION_LAYOUT_MISSING')
})

test('yan görünüşte yalnız sayı verildiğinde eksik tanımlı küp sorusunu da yakalar', () => {
  const result = evaluateQuestionConsistency({
    type: 'multiple_choice',
    q: 'Ön görünüş 4, üst görünüş 2, yan görünüş 3 kareden oluşuyor. En az kaç birim küp gerekir?',
    opts: ['5', '6', '7', '8'],
    ans: 2,
    exp: 'En büyük görünüş 7 olduğundan cevap 7 olur.',
  })
  expect(result.verdict).toBe('reject')
})

test('yalnızca siluetten söz etmek yerleşim verisi yerine geçmez', () => {
  const result = evaluateQuestionConsistency({
    type: 'multiple_choice',
    q: 'Kareli zemindeki ön, üst ve yan görünüş siluetleri verilmiştir. Bu yapıyı oluşturmak için en az kaç birim küp gerekir?',
    opts: ['6', '7', '8', '9'],
    ans: 1,
    exp: 'Her sütundaki yükseklikler karşılaştırılarak en küçük yapı bulunur.',
  })
  expect(result.verdict).toBe('reject')
})

test('sayısal yerleşim koordinatları verilmişse izdüşüm sorusunu geçirebilir', () => {
  const result = evaluateQuestionConsistency({
    type: 'multiple_choice',
    q: 'Ön görünüş koordinatları (0,0), (1,0), (0,1); üst görünüş koordinatları (0,0), (1,0); yan görünüş koordinatları (0,0), (0,1). Bu yapıyı oluşturmak için en az kaç birim küp gerekir?',
    opts: ['3', '4', '5', '6'],
    ans: 1,
    exp: 'Verilen hücre yerleşimine göre yükseklikler karşılaştırılır.',
  })
  expect(result.verdict).toBe('accept')
})
