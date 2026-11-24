import test from 'node:test'
import assert from 'node:assert/strict'
import { compareAnswers, parseNumberLiteral, parseQuantity, normalizeAnswerText } from '../lib/answer-equivalence'
import { isNearDuplicate, jaccard, minHash, minHashSimilarity, shingles } from '../lib/text-similarity'

test('sayı biçimleri denk sayılır', () => {
  assert.equal(compareAnswers('0,75', '3/4'), 'equal')
  assert.equal(compareAnswers('1/2', '0.5'), 'equal')
  assert.equal(compareAnswers('1.234,5', '1234,5'), 'equal')
  assert.equal(compareAnswers('%50', '50%'), 'equal')
  assert.equal(compareAnswers('5 cm', '5cm'), 'equal')
})

test('aynı birimde farklı sayı kesin farklıdır; birim farkı karar vermez', () => {
  assert.equal(compareAnswers('5 cm', '6 cm'), 'different')
  assert.equal(compareAnswers('5 cm', '5 m'), 'unknown')
  assert.equal(compareAnswers('5 cm', '5'), 'unknown')
})

test('belirsiz biçimler karar vermez', () => {
  assert.equal(parseNumberLiteral('2.500'), null)
  assert.equal(parseNumberLiteral('1/0'), null)
  assert.equal(compareAnswers('fotosentez', 'solunum'), 'unknown')
  assert.equal(compareAnswers('', 'x'), 'unknown')
})

test('Türkçe büyük/küçük harf ve noktalama', () => {
  assert.equal(normalizeAnswerText('  IŞIK. '), 'ışık')
  assert.equal(compareAnswers('İstanbul', 'istanbul.'), 'equal')
  assert.deepEqual(parseQuantity('%12,5'), { value: 12.5, unit: '%' })
})

test('benzer metin tespiti', () => {
  const a = 'Bir dikdörtgenin kısa kenarı 5 cm, uzun kenarı 8 cm ise çevresi kaç cm dir?'
  const b = 'Bir dikdörtgenin kısa kenarı 5 cm, uzun kenarı 8 cm ise çevresi kaç cm’dir?'
  const c = 'Fotosentez sırasında bitkiler hangi gazı alır?'
  assert.equal(isNearDuplicate(a, b, 0.6), true)
  assert.equal(isNearDuplicate(a, c), false)
  assert.ok(jaccard(shingles(a), shingles(a)) === 1)
  const sa = minHash(shingles(a)); const sb = minHash(shingles(a)); const sc = minHash(shingles(c))
  assert.equal(minHashSimilarity(sa, sb), 1)
  assert.ok(minHashSimilarity(sa, sc) < 0.2)
})
