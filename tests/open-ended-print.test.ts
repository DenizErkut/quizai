import test from 'node:test'
import assert from 'node:assert/strict'
import { answerLineCount, openEndedStudentSheetHtml, openEndedTeacherKeyHtml, shortSheetCode } from '../lib/open-ended-print'

const item = { scenario: 'Bir bahçede <b>sulama</b> yapılıyor.', question: 'Nedenini açıklayınız.', rubric: [{ criterion: 'Gerekçe', maxPoints: 60, description: 'Nedeni yazar.' }, { criterion: 'Örnek', maxPoints: 40 }] }

test('student sheet has header fields, code, every question and ruled answer space; no rubric', () => {
  const html = openEndedStudentSheetHtml([item, item], { code: 'ABC12345', title: 'T', grade: 'ortaokul 6. sınıf', subject: 'Fen' })
  assert.match(html, /Ad Soyad/); assert.match(html, /Ödev kodu: <strong>ABC12345<\/strong>/)
  assert.equal((html.match(/oe-question"/g) || []).length, 2)
  assert.match(html, /Soru 2 /); assert.match(html, /\(100 puan\)/)
  assert.doesNotMatch(html, /Tam puan koşulu/); assert.doesNotMatch(html, /<b>sulama/)
})

test('teacher key lists the rubric and starts on a new page', () => {
  const html = openEndedTeacherKeyHtml([item], { code: 'ABC12345' })
  assert.match(html, /oe-page-break/); assert.match(html, /Tam puan koşulu/); assert.match(html, /Nedeni yazar/)
})

test('answer space follows the school level; code is stable', () => {
  assert.deepEqual(['ilkokul 3. sınıf', 'ortaokul 6. sınıf', 'lise 10. sınıf', '', '6'].map(answerLineCount), [6, 8, 11, 8, 8])
  assert.equal(shortSheetCode('3b8a5e5f-0d38-45e4-8489-b5e24358e995'), '3B8A5E5F')
})

test('printed sheet is not hidden by site print css and uses border-based answer lines', async () => {
  const fs = await import('node:fs')
  const learning = fs.readFileSync('lib/learning-print.ts', 'utf8')
  assert.match(learning, /@media print\{html body \*\{visibility:visible!important\}/)
  const html = openEndedStudentSheetHtml([{ scenario: 'Senaryo X', question: 'Soru Y', rubric: [{ criterion: 'k', maxPoints: 2 }] }], { code: 'ABCD1234', title: 't', grade: '6' })
  assert.ok(!html.includes('linear-gradient'))
  assert.equal((html.match(/class="oe-line"/g) || []).length, 8)
})
