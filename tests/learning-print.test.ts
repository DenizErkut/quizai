import test from 'node:test'
import assert from 'node:assert/strict'
import { escapePrintText, printableMath, questionPrintHtml } from '../lib/learning-print'

test('printed questions preserve Turkish and render real fractions', () => {
  const html = questionPrintHtml([{ q: 'Öğrenci, yüzde kaçını çözmüştür?', opts: [String.raw`\(\frac{6}{100}\)`, 'Türkçe'], passage: 'İşlem: ğ, ü, ş, ı, ö, ç' }])
  assert.match(html, /Öğrenci/)
  assert.match(html, /ğ, ü, ş, ı, ö, ç/)
  assert.match(html, /<mfrac>/)
  assert.match(html, /A\)/)
})
test('printed text cannot inject markup, event handlers or executable links', () => {
  assert.equal(escapePrintText('<script>'), '&lt;script&gt;')
  assert.ok(!printableMath('<img src=x onerror=alert(1)>').includes('<img'))
  assert.ok(!printableMath(String.raw`\(\href{javascript:alert(1)}{x}\)`).includes('href='))
})
test('blank tables and answer space do not leak answers in printed worksheets', () => {
  const html = questionPrintHtml([{ q: 'Tabloyu doldur', type: 'table_fill', tableData: { headers: ['Kesir'], rows: [{ cells: ['GİZLİ CEVAP'], blanks: [0] }] } }, { q: 'Cevabı yaz', type: 'short_answer', opts: ['GİZLİ ÖRNEK YANIT'] }])
  assert.ok(!html.includes('GİZLİ CEVAP'))
  assert.ok(!html.includes('GİZLİ ÖRNEK YANIT'))
  assert.match(html, /<table>/)
  assert.match(html, /\.\.\.\.\.\./)
})
test('matching worksheet lists candidates separately instead of printing solved pairs', () => {
  const html = questionPrintHtml([{ q: 'Eşleştir', type: 'matching', pairs: [{ left: 'Kesir', right: '6/100' }, { left: 'Yüzde', right: '%6' }] }])
  assert.match(html, /Kesir → \.\./)
  assert.ok(!html.includes('Kesir — 6/100'))
  assert.match(html, /Eşleştirme seçenekleri/)
})

test('questions with a figure print it as an image (scripts in svg never run)', () => {
  const html = questionPrintHtml([{ q: 'Grafiğe göre?', opts: ['a', 'b'], svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="3"/></svg>' }])
  assert.match(html, /<img alt="Soru görseli" src="data:image\/svg\+xml/)
  assert.doesNotMatch(html, /<script>/)
  assert.equal(questionPrintHtml([{ q: 'Şekilsiz', svg: 'not svg' }]).includes('<img'), false)
})

import { answerKeyHtml, answerKeyText } from '../lib/learning-print'
test('answer key covers the common question types', () => {
  assert.equal(answerKeyText({ q: 'x', opts: ['a', 'b', 'c'], ans: 1 }), 'B) b')
  assert.equal(answerKeyText({ type: 'true_false', statement: true }), 'Doğru')
  assert.equal(answerKeyText({ type: 'short_answer', opts: ['Güneş'], ans: 0 }), 'Güneş')
  assert.equal(answerKeyText({ type: 'ordering', items: ['a', 'b', 'c'], correctOrder: [2, 0, 1] }), 'c → a → b')
  assert.match(answerKeyHtml([{ opts: ['a', 'b'], ans: 0 }]), /Cevap anahtarı[\s\S]*A\) a/)
})

import { looksLikeObjectiveList } from '../lib/learning-print'

const OBJECTIVES = 'MAT.7.4.1. Eş küplerle oluşturulan yapılar\na) ...\n\nMAT.7.4.2. Dikdörtgenler prizmasının yüzey alanı\nb) ...\n\nMAT.7.4.3. Hacim'

test('kitapçığa MEB kazanım listesi basılmaz; "kazanımlı döküman"da basılır ve kod eklenir', () => {
  const question = { q: 'Soru metni', opts: ['a', 'b'], passage: OBJECTIVES, passageKind: 'meb' as const, learningObjectiveCode: 'MAT.7.4.2' }
  assert.equal(looksLikeObjectiveList(OBJECTIVES), true)
  assert.equal(questionPrintHtml([question]).includes('MAT.7.4.1'), false)
  assert.equal(questionPrintHtml([{ ...question, passageKind: undefined }]).includes('MAT.7.4.1'), false) // eski kayıt: biçimden anlaşılır
  const withObjectives = questionPrintHtml([question], { withObjectives: true })
  assert.ok(withObjectives.includes('MAT.7.4.1') && withObjectives.includes('Kazanım: MAT.7.4.2'))
})

test('kullanıcının dosya metni (soru için gerekli) varsayılanda da basılır', () => {
  const html = questionPrintHtml([{ q: 'Metne göre ...', passage: 'Ali okula gitti. Hava yağmurluydu.', passageKind: 'file' as const }])
  assert.ok(html.includes('Ali okula gitti'))
  assert.equal(looksLikeObjectiveList('Ali okula gitti.'), false)
})
