// Printable sheets for open-ended assignments: a student sheet with ruled answer areas and a
// teacher copy with the scoring rubric. The sheet code lets the teacher match scanned papers to
// the assignment later (see the paper-import flow).
import { escapePrintText, printableMath } from './learning-print'
import { parseAnswerTable, svgDataUri } from './open-ended-scenarios'

export type PrintableOpenEnded = {
  scenario: string
  question: string
  rubric: Array<{ criterion: string; maxPoints: number; description?: string }>
  figureSvg?: string | null
  answerTable?: string | null
  code?: string
}

export function answerLineCount(grade: string | null | undefined): number {
  const key = String(grade || '').toLocaleLowerCase('tr')
  if (key.includes('ilkokul') || /^[1-4]\b/.test(key)) return 6
  if (key.includes('lise') || /^(9|10|11|12)\b/.test(key)) return 11
  return 8
}

const SHEET_STYLE = `<style>
.oe-header{display:grid;grid-template-columns:2fr 1fr;gap:8pt 16pt;margin:0 0 14pt;font-size:11pt}
.oe-field{border-bottom:1px solid #444;padding-bottom:2pt;min-height:16pt}
.oe-meta{font-size:9.5pt;color:#555;margin:0 0 10pt}
.oe-question{margin:14pt 0 18pt;break-inside:avoid}
.oe-question h2{margin:0 0 4pt}
.oe-lines{margin-top:8pt}
.oe-line{height:8.4mm;border-bottom:0.4mm solid #9aa}
.oe-rubric td,.oe-rubric th{font-size:10pt}
.oe-page-break{break-before:page}
</style>`

function printFigure(item: PrintableOpenEnded): string {
  return item.figureSvg ? `<p style="text-align:center"><img alt="" style="max-width:100%;max-height:70mm" src="${escapePrintText(svgDataUri(item.figureSvg))}"></p>` : ''
}

/** Doldurulacak tablo: boş hücreler çizgili kutu olarak basılır. */
function printTable(item: PrintableOpenEnded): string {
  const table = parseAnswerTable(item.answerTable)
  if (!table) return ''
  const th = (cell: string) => `<th style="border:1px solid #444;padding:4pt 6pt;background:#eee;text-align:left">${printableMath(cell)}</th>`
  const td = (cell: string, first: boolean) => `<td style="border:1px solid #444;padding:${cell ? '4pt 6pt' : '10pt 6pt'};${first ? 'font-weight:700' : ''}">${cell ? printableMath(cell) : ''}</td>`
  return `<table style="border-collapse:collapse;width:100%;margin:6pt 0 10pt;font-size:10.5pt"><thead><tr>${table.headers.map(th).join('')}</tr></thead><tbody>${table.rows.map(row => `<tr>${row.map((cell, i) => td(cell, i === 0)).join('')}</tr>`).join('')}</tbody></table>`
}

export function shortSheetCode(batchOrAssignmentId: string): string {
  return batchOrAssignmentId.replace(/-/g, '').slice(0, 8).toUpperCase()
}

/** Student sheet. `code` identifies the assignment/batch on the paper. */
export function openEndedStudentSheetHtml(items: PrintableOpenEnded[], options: { code: string; title: string; grade?: string | null; subject?: string | null; topic?: string | null }): string {
  const lines = answerLineCount(options.grade)
  const meta = [options.subject, options.topic, options.grade ? `${options.grade}. sınıf`.replace('. sınıf. sınıf', '. sınıf') : ''].filter(Boolean).map(value => escapePrintText(String(value))).join(' · ')
  const total = (item: PrintableOpenEnded) => item.rubric.reduce((sum, r) => sum + (Number(r.maxPoints) || 0), 0)
  return `${SHEET_STYLE}<div class="oe-header"><div class="oe-field">Ad Soyad: </div><div class="oe-field">No: </div><div class="oe-field">Sınıf / Şube: </div><div class="oe-field">Tarih: </div></div>
<p class="oe-meta">${meta}${meta ? ' · ' : ''}Ödev kodu: <strong>${escapePrintText(options.code)}</strong> · Her soruyu ilgili alana, soru numarasını belirterek yazınız.</p>
${items.map((item, index) => `<section class="oe-question"><h2>Soru ${index + 1} <span style="font-weight:400;font-size:10pt">(${total(item)} puan)</span></h2>
<div class="print-passage">${printableMath(item.scenario)}</div>${printFigure(item)}<p><strong>${printableMath(item.question)}</strong></p>${printTable(item)}
${item.code ? `<p class="oe-meta">Soru kodu: <strong>${escapePrintText(item.code)}</strong></p>` : ''}<div class="oe-lines">${Array.from({ length: lines }, () => '<div class="oe-line"></div>').join('')}</div></section>`).join('')}`
}

/** Teacher copy: question, rubric and expected criteria. */
export function openEndedTeacherKeyHtml(items: PrintableOpenEnded[], options: { code: string }): string {
  return `${SHEET_STYLE}<div class="oe-page-break"></div><h2 style="font-size:14pt">Öğretmen nüshası — puanlama anahtarı (Ödev kodu: ${escapePrintText(options.code)})</h2>
${items.map((item, index) => `<section class="oe-question"><h2>Soru ${index + 1}</h2><p>${printableMath(item.question)}</p>
<table class="oe-rubric"><thead><tr><th>Kriter</th><th>Puan</th><th>Tam puan koşulu</th></tr></thead><tbody>${item.rubric.map(r => `<tr><td>${printableMath(r.criterion)}</td><td>${Number(r.maxPoints) || 0}</td><td>${printableMath(r.description || '')}</td></tr>`).join('')}</tbody></table></section>`).join('')}`
}

export const OE_QR_PREFIX = 'PRATIUM-OE:'

export type ScenarioSheetItem = PrintableOpenEnded & { sessionId: string; qrDataUrl: string; position: number; total: number }

/** Senaryo dökümü: her soru ayrı sayfa; öğrenci adı hazır, sağ üstte soruya özel QR (yüklemede sayfa bu QR'dan tanınır). */
export function openEndedScenarioSheetHtml(items: ScenarioSheetItem[], options: { studentName: string; title: string; grade?: string | null }): string {
  const lines = answerLineCount(options.grade)
  const total = (item: PrintableOpenEnded) => item.rubric.reduce((sum, r) => sum + (Number(r.maxPoints) || 0), 0)
  const name = options.studentName ? escapePrintText(options.studentName) : ''
  return `${SHEET_STYLE}<style>.oe-sheet{break-after:page;position:relative}.oe-sheet:last-child{break-after:auto}.oe-qr{position:absolute;top:0;right:0;width:26mm;height:26mm}.oe-sheet .oe-header{margin-right:30mm}</style>
${items.map(item => `<section class="oe-sheet"><img class="oe-qr" alt="QR" src="${escapePrintText(item.qrDataUrl)}">
<div class="oe-header"><div class="oe-field">Ad Soyad: <strong>${name}</strong></div><div class="oe-field">No: </div><div class="oe-field">Sınıf / Şube: </div><div class="oe-field">Tarih: </div></div>
<p class="oe-meta">${escapePrintText(options.title)} · Soru ${item.position}/${item.total} · Soru kodu: <strong>${escapePrintText(item.code || '')}</strong><br>Bu sayfayı yazdıktan sonra fotoğrafını çek/tara ve Pratium'da "Kâğıtları yükle" ile gönder. QR kodu kapatma.</p>
<div class="oe-question"><h2>Soru ${item.position} <span style="font-weight:400;font-size:10pt">(${total(item)} puan)</span></h2>
<div class="print-passage">${printableMath(item.scenario)}</div>${printFigure(item)}<p><strong>${printableMath(item.question)}</strong></p>${printTable(item)}
<div class="oe-lines">${Array.from({ length: lines }, () => '<div class="oe-line"></div>').join('')}</div></div></section>`).join('')}`
}
