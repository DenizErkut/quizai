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
