import { expect, test } from '@playwright/test'
import { assessQuestionRigor, attachQuestionRigorMetadata, summarizeQuestionSetRigor } from '../lib/question-rigor'

test('tek adımlı ezber sorusunu düşük bilişsel düzeyde işaretler', () => {
  const result = assessQuestionRigor({
    type: 'multiple_choice',
    q: 'Fotosentez nedir?',
    opts: ['Besin üretimi', 'Solunum', 'Boşaltım', 'Hareket'],
    exp: 'Doğru cevap besin üretimidir.',
  })
  expect(result.level).toBe('temel')
  expect(result.issues).toContain('doğrudan-ezber')
})

test('bağlam, veri ve çıkarım içeren soruyu muhakeme olarak ölçer', () => {
  const result = assessQuestionRigor({
    type: 'multiple_choice',
    q: 'Bir öğrenci üç günlük sıcaklık grafiğinde pazartesi 12, salı 18 ve çarşamba 9 derece ölçüyor. Buna göre salıdan çarşambaya değişim ile pazartesiden salıya değişim karşılaştırıldığında hangi sonuca ulaşılır?',
    opts: ['İlk artış daha büyüktür', 'İkinci değişim daha büyüktür', 'İkisi eşittir', 'Karşılaştırılamaz'],
    exp: 'Önce 18-12=6 derecelik artış bulunur. Sonra 9-18=-9 olduğundan değişimin büyüklüğü 9 derecedir ve ikinci değişim daha büyüktür.',
    chartData: { type: 'line' },
  })
  expect(result.level).toBe('muhakeme')
  expect(result.signals).toContain('çıkarım-karşılaştırma')
  expect(result.signals).toContain('veri-görsel-yorumlama')
})

test('test özeti hedeflenen uygulama ve muhakeme dağılımını raporlar', () => {
  const reasoningQuestion = {
    type: 'multiple_choice',
    q: 'Bir araştırmada aşağıdaki tablo verileri karşılaştırılıyor. Birinci ölçüm 12, ikinci ölçüm 18, üçüncü ölçüm 9 ise buna göre değişimin nedeni ve sonucu hangi seçenekte birlikte doğru yorumlanmıştır?',
    opts: ['A ve sonucu', 'B ve sonucu', 'C ve sonucu', 'D ve sonucu'],
    exp: 'Önce üç ölçüm arasındaki farklar bulunur. Ardından değişim yönleri karşılaştırılarak doğru sonuca ulaşılır.',
    chartData: { type: 'bar' },
  }
  const summary = summarizeQuestionSetRigor(Array.from({ length: 10 }, () => ({ ...reasoningQuestion })), 'normal')
  expect(summary.applicationCount).toBe(10)
  expect(summary.reasoningCount).toBe(10)
  expect(summary.meetsTarget).toBe(true)
  expect(summary.targetReasoningCount).toBe(5)
})

test('kalite ölçümünü soru JSONuna izlenebilir alanlarla ekler', () => {
  const [question] = attachQuestionRigorMetadata([{ q: '2 + 2 kaçtır?', opts: ['1', '2', '3', '4'], type: 'multiple_choice' }])
  expect(question.qualityRigorVersion).toBe('question-rigor-v1')
  expect(typeof question.qualityRigorScore).toBe('number')
  expect(question.qualityCognitiveLevel).toBe('temel')
})
