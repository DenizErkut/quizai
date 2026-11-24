import test from 'node:test'
import assert from 'node:assert/strict'
import { containsPii, isValidTcNumber, maskPii, STUDENT_LABEL } from '../lib/ai-gateway/pii-guard'

test('e-posta, telefon ve IBAN maskelenir', () => {
  assert.equal(maskPii('Bana ali.veli@ornek.com adresinden yaz'), 'Bana [e-posta] adresinden yaz')
  assert.equal(maskPii('Telefonum 0532 123 45 67'), 'Telefonum [telefon]')
  assert.equal(maskPii('+90 (532) 123-45-67 beni ara'), '[telefon] beni ara')
  assert.equal(maskPii('IBAN TR33 0006 1005 1978 6457 8413 26'), 'IBAN [iban]')
})

test('yalnız sağlaması geçen T.C. kimlik numarası maskelenir', () => {
  assert.equal(isValidTcNumber('10000000146'), true)
  assert.equal(maskPii('No 10000000146'), 'No [kimlik-no]')
  assert.equal(maskPii('Sayı 12345678901'), 'Sayı 12345678901')
})

test('matematik/ders içeriği etkilenmez', () => {
  const text = '2024 yılında 150 cm uzunluğunda 3,14 ve 45 derece; 7. sınıf, 1/2 + 3/4 = 5/4'
  assert.equal(maskPii(text), text)
  assert.equal(containsPii(text), false)
  assert.equal(containsPii('mail: a@b.co'), true)
})

test('öğrenci etiketi sabit', () => { assert.equal(STUDENT_LABEL, 'Öğrenci') })
