// "Yazılıya Hazırlanıyorum" setinin tüm sorularını tek seferde yazdırmak için sayfa üretimi: öğrenci kâğıdı (cevap satırlı)
// ve öğretmen nüshası (puanlama anahtarı). Kâğıt kodu, öğrencinin fotoğrafladığı cevap kâğıdını sete eşlemek için basılır.
import { escapePrintText, printableMath } from './learning-print'
import { splitTextBlocks } from './written-exam'

export type PrintableWrittenQuestion = { position: number; title: string; scenario: string; question: string; maxPoints: number }
export type PrintableWrittenKey = PrintableWrittenQuestion & { rubric: Array<{ criterion: string; maxPoints: number; description?: string }>; answerKey?: string }

const STYLE = `<style>
.wy-meta{font-size:9.5pt;color:#555;margin:0 0 10pt}
.wy-question{margin:14pt 0 18pt;break-inside:avoid}
.wy-question h2{margin:0 0 4pt}
.wy-lines{margin-top:8pt}
.wy-line{height:8.4mm;border-bottom:0.4mm solid #9aa}
.wy-table td,.wy-table th{font-size:10.5pt;padding:4pt 8pt}
.wy-table th{background:#eee}
.wy-break{break-before:page}
</style>`

/** "A | B | C" satırlarını tabloya çeviren yazdırma HTML'i; diğer metin olduğu gibi (satır sonları korunur). */
export function richPrintHtml(text: string): string {
  return splitTextBlocks(text || '').map(block => block.type === 'table'
    ? `<table class="wy-table"><thead><tr>${block.rows[0].map(cell => `<th>${printableMath(cell)}</th>`).join('')}</tr></thead><tbody>${block.rows.slice(1).map(row => `<tr>${row.map(cell => `<td>${printableMath(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : `<p>${printableMath(block.text)}</p>`).join('')
}

/** Puana göre cevap satırı sayısı: kısa yanıtlı küçük sorulara az, çok puanlı sorulara daha çok yer. */
export function answerLinesFor(maxPoints: number): number {
  return Math.min(14, Math.max(5, Math.round(maxPoints * 0.8) + 3))
}

export function writtenSheetCode(setId: string): string {
  return setId.replace(/-/g, '').slice(0, 8).toUpperCase()
}

export function writtenExamStudentSheetHtml(questions: PrintableWrittenQuestion[], options: { code: string; meta: string }): string {
  return `${STYLE}<p class="wy-meta">${escapePrintText(options.meta)} · Kâğıt kodu: <strong>${escapePrintText(options.code)}</strong> · Her soruyu altındaki alana, soru numarasını belirterek yazınız.</p>
${questions.map(q => `<section class="wy-question"><h2>Soru ${q.position}${q.title ? ` · ${printableMath(q.title)}` : ''} <span style="font-weight:400;font-size:10pt">(${q.maxPoints} puan)</span></h2>
<div class="print-passage" style="${q.scenario ? '' : 'display:none'}">${richPrintHtml(q.scenario)}</div><div style="font-weight:600">${richPrintHtml(q.question)}</div>
<div class="wy-lines">${Array.from({ length: answerLinesFor(q.maxPoints) }, () => '<div class="wy-line"></div>').join('')}</div></section>`).join('')}`
}

export function writtenExamTeacherKeyHtml(questions: PrintableWrittenKey[], options: { code: string }): string {
  return `${STYLE}<div class="wy-break"></div><h2 style="font-size:14pt">Öğretmen nüshası — puanlama anahtarı (Kâğıt kodu: ${escapePrintText(options.code)})</h2>
${questions.map(q => `<section class="wy-question"><h2>Soru ${q.position} (${q.maxPoints} puan)</h2>
<table class="wy-table"><thead><tr><th>Ölçüt</th><th>Puan</th><th>Beklenen yanıt</th></tr></thead><tbody>${q.rubric.map(r => `<tr><td>${printableMath(r.criterion)}</td><td>${Number(r.maxPoints) || 0}</td><td>${printableMath(r.description || '')}</td></tr>`).join('')}</tbody></table>
${q.answerKey ? `<p style="font-size:10pt;color:#444">${printableMath(q.answerKey)}</p>` : ''}</section>`).join('')}`
}
