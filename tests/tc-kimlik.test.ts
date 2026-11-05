import test from 'node:test'
import assert from 'node:assert/strict'
import { maskTcKimlikNo, tcKimlikRequired, validateTcKimlikNo } from '../lib/tc-kimlik'

test('validateTcKimlikNo accepts numbers with correct check digits', () => {
  assert.equal(validateTcKimlikNo('10000000146'), true)
  assert.equal(validateTcKimlikNo(' 10000000146 '), true)
})

test('validateTcKimlikNo rejects malformed or wrong-checksum numbers', () => {
  assert.equal(validateTcKimlikNo('10000000147'), false) // 11. basamak yanlış
  assert.equal(validateTcKimlikNo('10000000246'), false) // 10. basamak yanlış
  assert.equal(validateTcKimlikNo('00000000000'), false) // 0 ile başlayamaz
  assert.equal(validateTcKimlikNo('1234567890'), false)  // 10 hane
  assert.equal(validateTcKimlikNo('1000000014a'), false)
  assert.equal(validateTcKimlikNo(undefined), false)
  assert.equal(validateTcKimlikNo(10000000146), false)
})

test('maskTcKimlikNo hides the middle digits', () => {
  assert.equal(maskTcKimlikNo('10000000146'), '100******46')
  assert.equal(maskTcKimlikNo('123'), '')
})

test('tcKimlikRequired: everyone except students outside Turkey', () => {
  assert.equal(tcKimlikRequired('student', 'TR'), true)
  assert.equal(tcKimlikRequired('student', ''), true)
  assert.equal(tcKimlikRequired('student', 'GB'), false)
  assert.equal(tcKimlikRequired('parent', 'GB'), true)
  assert.equal(tcKimlikRequired('teacher', undefined), true)
})
