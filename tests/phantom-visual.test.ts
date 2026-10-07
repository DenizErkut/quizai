import test from 'node:test'
import assert from 'node:assert/strict'
import { phantomVisualIssue } from '../lib/phantom-visual'

const svg = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>'

test('visual claim without an asset is rejected', () => {
  assert.equal(phantomVisualIssue({ q: 'Aşağıdaki görselde Türkiye\'nin konumu gösterilmiştir. Hangi kıtalar arasındadır?', opts: ['A', 'B'] }), 'missing_visual')
  assert.equal(phantomVisualIssue({ q: 'Aşağıdaki tabloda bazı kıtaların konumları verilmiştir. Buna göre…' }), 'missing_visual')
  assert.equal(phantomVisualIssue({ q: 'Şekilde verilen üçgenin alanı kaçtır?' }), 'missing_visual')
})

test('a real asset or an inline text table makes the claim valid', () => {
  assert.equal(phantomVisualIssue({ q: 'Aşağıdaki görselde ne gösterilmiştir?', svg }), null)
  assert.equal(phantomVisualIssue({ q: 'Aşağıdaki tabloya göre?', tableData: { rows: [{ cells: ['a'] }] } }), null)
  assert.equal(phantomVisualIssue({ q: 'Aşağıdaki tabloya göre:\n| Kıta | Nüfus |\n| Asya | 4,7 |\nHangisi en kalabalıktır?' }), null)
})

test('placeholders, urls and leaked markup are rejected', () => {
  assert.equal(phantomVisualIssue({ q: '[Görsel: bir harita] Türkiye hangi kıtadadır?' }), 'placeholder')
  assert.equal(phantomVisualIssue({ q: 'Soru https://i.imgur.com/abc.png' }), 'image_url')
  assert.equal(phantomVisualIssue({ q: 'Harita:\nsvg\n<svg viewBox="0 0 1 1"></svg>', svg }), 'leaked_markup')
  assert.equal(phantomVisualIssue({ q: 'Aşağıdaki görselde ne var?', svg: '<svg><image href="https://x.com/a.png"/></svg>' }), 'missing_visual')
})

test('embedded data-URI booklet figures count as real visuals', () => {
  const figure = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><image width="2" height="2" href="data:image/png;base64,AAAA"/></svg>'
  assert.equal(phantomVisualIssue({ q: 'Aşağıdaki grafiğe göre hangisi doğrudur?', svg: figure }), null)
})

test('ordinary questions are untouched', () => {
  assert.equal(phantomVisualIssue({ q: 'Aşağıdaki şekillerden hangisi bir üçgendir?', opts: ['Kare', 'Üçgen'] }), null)
  assert.equal(phantomVisualIssue({ q: 'Türkiye hangi kıtalar arasında yer alır?', opts: ['Avrupa-Asya'] }), null)
})
