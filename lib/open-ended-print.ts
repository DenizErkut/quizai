// Printable sheets for open-ended assignments: a student sheet with ruled answer areas and a
// teacher copy with the scoring rubric. The sheet code lets the teacher match scanned papers to
// the assignment later (see the paper-import flow).
import { escapePrintText, printableMath } from './learning-print'

export type PrintableOpenEnded = {
  scenario: string
  question: string
  rubric: Array<{ criterion: string; maxPoints: number; description?: string }>
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
.oe-lines{margin-top:8pt;background:repeating-linear-gradient(to bottom,transparent 0,transparent 8.4mm,#9aa 8.4mm,#9aa 8.8mm)}
.oe-rubric td,.oe-rubric th{font-size:10pt}
.oe-page-break{break-before:page}
</style>`

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
<div class="print-passage">${printableMath(item.scenario)}</div><p><strong>${printableMath(item.question)}</strong></p>
<div class="oe-lines" style="height:${lines * 8.8}mm"></div></section>`).join('')}`
}

/** Teacher copy: question, rubric and expected criteria. */
export function openEndedTeacherKeyHtml(items: PrintableOpenEnded[], options: { code: string }): string {
  return `${SHEET_STYLE}<div class="oe-page-break"></div><h2 style="font-size:14pt">Öğretmen nüshası — puanlama anahtarı (Ödev kodu: ${escapePrintText(options.code)})</h2>
${items.map((item, index) => `<section class="oe-question"><h2>Soru ${index + 1}</h2><p>${printableMath(item.question)}</p>
<table class="oe-rubric"><thead><tr><th>Kriter</th><th>Puan</th><th>Tam puan koşulu</th></tr></thead><tbody>${item.rubric.map(r => `<tr><td>${printableMath(r.criterion)}</td><td>${Number(r.maxPoints) || 0}</td><td>${printableMath(r.description || '')}</td></tr>`).join('')}</tbody></table></section>`).join('')}`
}
