import test from 'node:test'
import assert from 'node:assert/strict'
import { isTurkishLanguageSubject, turkishLanguagePrompt, turkishSkills } from '../lib/turkish-question-rules'

const cand = (title: string) => [{ ref: 'LO1', id: '1', objectiveCode: 'T.1', title, subject: 'Türkçe', grade: '6', unit: null, topic: null, curriculumVersionId: 'v', revisionId: 'r', matchBasis: 'topic_exact' as const }]

test('Türkçe dersi tanınır', () => {
  assert.equal(isTurkishLanguageSubject('Türkçe'), true)
  assert.equal(isTurkishLanguageSubject('Matematik'), false)
})
test('yazım/noktalama kazanımı uygulama kuralı ekler', () => {
  const p = turkishLanguagePrompt('Türkçe', cand('Yazım kurallarını ve noktalama işaretlerini uygulayabilme'))
  assert.match(p, /UYGULAMA sorusu/)
  assert.match(p, /önemi/)
})
test('anlam kazanımı metin verilmesini ister', () => {
  const p = turkishLanguagePrompt('Türkçe', cand('Cümlede anlamı belirleyebilme'))
  assert.match(p, /kısa bir metin/)
  assert.deepEqual(turkishSkills(cand('Sözcükte anlam')), ['meaning'])
})
test('diğer derslerde boş döner', () => {
  assert.equal(turkishLanguagePrompt('Fen Bilimleri', cand('Yazım')), '')
})
