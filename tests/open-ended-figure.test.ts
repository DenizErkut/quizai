import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeFigureSvg } from '../lib/open-ended-scenarios'

test('figure svg keeps drawing tags and strips scripts, handlers and links', () => {
  const out = sanitizeFigureSvg(`<svg viewBox="0 0 10 10" onload="x()"><script>alert(1)</script><rect x="1" y="1" width="3" height="3" fill="url(#a)" onclick="y()"/><a href="javascript:1"><text x="1" y="2">A</text></a><foreignObject><div>hi</div></foreignObject></svg>`)
  assert.ok(out)
  assert.ok(out!.includes('<rect'))
  assert.ok(out!.includes('<text'))
  assert.ok(out!.includes('xmlns='))
  for (const bad of ['script', 'onload', 'onclick', 'javascript', 'foreignObject', '<a']) assert.ok(!out!.includes(bad), bad)
  assert.ok(out!.includes('url(#a)'), 'yalnızca sayfa içi url(#kimlik) referansı korunur')
})

test('figure svg rejects non-svg and oversized input', () => {
  assert.equal(sanitizeFigureSvg('<div>x</div>'), null)
  assert.equal(sanitizeFigureSvg(null), null)
  assert.equal(sanitizeFigureSvg(`<svg>${'a'.repeat(41000)}</svg>`), null)
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

import { extractInlineTable } from '../lib/open-ended-scenarios'

test('inline table pulled out of scenario text', () => {
  const result = extractInlineTable('Aşağıdaki tabloda bilgiler verilmiştir. Tablo 1: Özellikler. Teknoloji | Yörünge | Astronot. Yapay Uydu | ... | .... Uzay İstasyonu | ... | ....')
  assert.ok(result)
  const parsed = parseAnswerTable(result!.table)
  assert.deepEqual(parsed!.headers, ['Teknoloji', 'Yörünge', 'Astronot'])
  assert.deepEqual(parsed!.rows, [['Yapay Uydu', '', ''], ['Uzay İstasyonu', '', '']])
  assert.ok(!result!.scenario.includes('|'))
  assert.ok(result!.scenario.includes('Tablo 1'))
})

import { teacherQrPayload, parseTeacherQr } from '../lib/open-ended-print'

test('teacher class-sheet QR carries student and assignment ids and nothing else', () => {
  const student = '123e4567-e89b-42d3-a456-426614174000', assignment = '987e6543-e21b-42d3-a456-426614174999'
  assert.deepEqual(parseTeacherQr(teacherQrPayload(student, assignment)), { studentId: student, assignmentId: assignment })
  assert.equal(parseTeacherQr('PRATIUM-OE:' + student), null)
  assert.equal(parseTeacherQr(`PRATIUM-OEA:${student}:x`), null)
  assert.equal(parseTeacherQr(null), null)
})

import { gradeNumberOf } from '../lib/written-exam'

test('grade number parses bare digits as stored in classrooms and the "7. sınıf" forms', () => {
  assert.equal(gradeNumberOf('7'), 7)
  assert.equal(gradeNumberOf(' 12 '), 12)
  assert.equal(gradeNumberOf('7. sınıf'), 7)
  assert.equal(gradeNumberOf('ortaokul 6. sınıf'), 6)
  assert.equal(gradeNumberOf('13'), null)
  assert.equal(gradeNumberOf('0'), null)
  assert.equal(gradeNumberOf(''), null)
})

test('figure svg: gradyanlar kabul edilir, harici url() ve dış kaynaklar kaldırılır', () => {
  const out = sanitizeFigureSvg('<svg viewBox="0 0 600 220"><defs><radialGradient id="g"><stop offset="0" stop-color="#fc0"/><stop offset="1" stop-color="#f60"/></radialGradient></defs><circle cx="100" cy="100" r="60" fill="url(#g)"/><rect width="10" height="10" fill="url(http://evil.example/x.svg#a)"/><image href="http://evil.example/x.png"/></svg>')
  assert.ok(out)
  assert.ok(out!.includes('<radialGradient id="g">'))
  assert.ok(out!.includes('<stop '))
  assert.ok(out!.includes('fill="url(#g)"'))
  assert.ok(!out!.includes('evil.example'))
  assert.ok(!out!.includes('<image'))
})

test('figure svg: 12000 karakterlik panelli çizim kabul edilir', () => {
  const body = Array.from({ length: 200 }, (_, i) => `<circle cx="${i}" cy="${i}" r="3" fill="#abc"/>`).join('')
  const out = sanitizeFigureSvg(`<svg viewBox="0 0 600 220">${body}</svg>`)
  assert.ok(out && out.length > 8000)
})
