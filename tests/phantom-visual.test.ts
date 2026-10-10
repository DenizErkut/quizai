import test from 'node:test'
import assert from 'node:assert/strict'
import { phantomVisualIssue, salvageLeakedSvg } from '../lib/phantom-visual'

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

test('a figure claim is only deferred, never excused: markup/placeholders still fail and the final check still fails', () => {
  const claim = { q: 'Aşağıdaki şekilde verilen üçgenin çevresi kaç cm’dir?', opts: ['10', '12', '14', '16'] }
  assert.equal(phantomVisualIssue(claim), 'missing_visual')
  assert.equal(phantomVisualIssue(claim, { deferMissingVisual: true }), null)
  assert.equal(phantomVisualIssue({ q: '[Şekil: ABC üçgeni] çevresi?', opts: [] }, { deferMissingVisual: true }), 'placeholder')
  assert.equal(phantomVisualIssue({ q: '<svg></svg> alan?', opts: [] }, { deferMissingVisual: true }), 'leaked_markup')
  assert.equal(phantomVisualIssue({ ...claim, svg: '<svg viewBox="0 0 10 10"><rect/></svg>' }), null)
})

test('salvageLeakedSvg moves complete inline svg out of the stem', () => {
  const out = salvageLeakedSvg({ q: 'Aşağıdaki şekilde ABC üçgeninin alanı kaçtır?\n<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>', opts: ['A', 'B'] })
  assert.match(String((out as { svg?: string }).svg), /<svg/)
  assert.doesNotMatch(String(out.q), /<svg/)
  assert.equal(phantomVisualIssue(out), null)
})

test('salvageLeakedSvg leaves unsafe or incomplete markup untouched', () => {
  const bad = { q: 'Alan? <svg><script>x</script></svg>', opts: [] }
  assert.equal(salvageLeakedSvg(bad), bad)
  const partial = { q: 'Alan? <svg viewBox="0 0 1 1">', opts: [] }
  assert.equal(salvageLeakedSvg(partial), partial)
})
