import assert from 'node:assert/strict'
import { test } from 'node:test'
import { noteMatchesObjectiveReview } from '../lib/objective-review-note.ts'

const question = 'Bir pazarcı 40 kg elma ve 56 kg portakalı eşit ağırlıktaki kasalara koyacaktır. Bir kasanın alacağı meyve kütlesi en fazla kaç kg olabilir?'
const explanation = '40 ile 56 sayılarının en büyük ortak böleni (EBOB) 8 dir.'

test('başka derse ait gezegen notu matematik sorusunu onaylatmaz', () => {
  const note = 'Soru, Güneş sistemindeki gezegenlerin yapısal özelliklerini ve halkalarını sınıflandırma becerisini ölçmektedir.'
  assert.equal(noteMatchesObjectiveReview(note, question, explanation, 'Doğal sayıların ortak bölenlerini bulur'), false)
})

test('soruya özgü EBOB gerekçesi kabul edilir', () => {
  const note = '40 ve 56 kg meyvelerin artmadan yerleştirilmesi için en büyük ortak bölen bulunur; cevap 8 kg olur.'
  assert.equal(noteMatchesObjectiveReview(note, question, explanation, 'Doğal sayıların ortak bölenlerini bulur'), true)
})

test('yalnızca genel onay cümlesi yeterli değildir', () => {
  assert.equal(noteMatchesObjectiveReview('Bu soru kazanıma uygundur ve öğrencileri ölçer.', question, explanation), false)
})
