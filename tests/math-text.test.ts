import test from 'node:test'
import assert from 'node:assert/strict'
import { plainMathText, renderMathFormula, splitMathText } from '../lib/math-text'

test('reported fraction and mixed text render without altering the source', () => {
  const parts = splitMathText(String.raw`Değer: \(\frac{6}{100}\), yüzde %6.`)
  assert.equal(parts[1].text, String.raw`\frac{6}{100}`)
  assert.match(renderMathFormula(parts[1].text, false)!, /<mfrac>/)
  assert.equal(parts[2].text, ', yüzde %6.')
})
test('supports inline, display, powers, roots and legacy undelimited fractions', () => {
  assert.equal(splitMathText(String.raw`\[x^2\] $$\sqrt{4}$$ $50\%$`).filter(p => p.math).length, 3)
  assert.equal(splitMathText(String.raw`\frac{6}{10}`)[0].math, true)
  assert.match(renderMathFormula('x^2', false)!, /<msup>/)
})
test('plain percentages and currency remain plain, malformed formulas fail safely', () => {
  assert.equal(splitMathText('Başarı %60; ücret $15.')[0].math, false)
  assert.equal(renderMathFormula(String.raw`\frac{`, false), null)
  assert.equal(renderMathFormula('x'.repeat(8001), false), null)
})
test('multiple prices remain text and undelimited math inside prose is recognized', () => {
  assert.deepEqual(splitMathText('Ücret $15, diğer ücret $20.'), [{ text: 'Ücret $15, diğer ücret $20.', math: false, display: false }])
  assert.equal(splitMathText('$15, $20')[0].math, false)
  assert.equal(splitMathText(String.raw`\frac{6}{100} olur.`)[1].text, ' olur.')
  const parts = splitMathText(String.raw`Alan = \pi r^2; sonuç \frac{6}{100} olur.`)
  assert.equal(parts.filter(p => p.math).length, 2)
  assert.match(renderMathFormula(parts.find(p => p.math)!.text, false)!, /<msup>/)
})
test('native dropdown labels preserve readable fractions and grouping', () => {
  assert.equal(plainMathText(String.raw`\(\frac{6}{100}\)`), '6/100')
  assert.equal(plainMathText(String.raw`\(\frac{x+1}{x-1}\)`), '(x+1)/(x-1)')
  assert.equal(plainMathText(String.raw`Alan = \pi r^2`), 'Alan = π r²')
})
test('untrusted formulas cannot create executable links or raw HTML', () => {
  const html = renderMathFormula(String.raw`\href{javascript:alert(1)}{x}`, false)
  assert.ok(!html?.includes('href='))
  const plain = splitMathText('<img src=x onerror=alert(1)>')
  assert.equal(plain[0].math, false)
})
