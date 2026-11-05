import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeFigureSvg } from '../lib/open-ended-scenarios'

test('figure svg keeps drawing tags and strips scripts, handlers and links', () => {
  const out = sanitizeFigureSvg(`<svg viewBox="0 0 10 10" onload="x()"><script>alert(1)</script><rect x="1" y="1" width="3" height="3" fill="url(#a)" onclick="y()"/><a href="javascript:1"><text x="1" y="2">A</text></a><foreignObject><div>hi</div></foreignObject></svg>`)
  assert.ok(out)
  assert.ok(out!.includes('<rect'))
  assert.ok(out!.includes('<text'))
  assert.ok(out!.includes('xmlns='))
  for (const bad of ['script', 'onload', 'onclick', 'javascript', 'foreignObject', 'url(', '<a']) assert.ok(!out!.includes(bad), bad)
})

test('figure svg rejects non-svg and oversized input', () => {
  assert.equal(sanitizeFigureSvg('<div>x</div>'), null)
  assert.equal(sanitizeFigureSvg(null), null)
  assert.equal(sanitizeFigureSvg(`<svg>${'a'.repeat(21000)}</svg>`), null)
})

import { parseAnswerTable, serializeTableAnswer } from '../lib/open-ended-scenarios'

test('answer table: blank cells are fillable and the answer serializes per row', () => {
  const table = parseAnswerTable('Araç | Karada | Yolcu\nBisiklet | ... |\nOtobüs |  | ')
  assert.ok(table)
  assert.deepEqual(table!.headers, ['Araç', 'Karada', 'Yolcu'])
  assert.deepEqual(table!.rows[0], ['Bisiklet', '', ''])
  const text = serializeTableAnswer(table!, [['', 'VAR', 'YOK'], ['', 'VAR', 'VAR']])
  assert.ok(text.includes('Bisiklet → Karada: VAR; Yolcu: YOK'))
})

test('answer table: needs a header, a blank cell and at least two columns', () => {
  assert.equal(parseAnswerTable('Tek satır | x'), null)
  assert.equal(parseAnswerTable('A | B\nx | y'), null)
  assert.equal(parseAnswerTable('A\nx'), null)
})
