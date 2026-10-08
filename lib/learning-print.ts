import { renderMathFormula, splitMathText } from './math-text'

export function escapePrintText(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
}

export function printableMath(text: string): string {
  return splitMathText(text).map(part => part.math
    ? renderMathFormula(part.text, part.display) ?? escapePrintText(part.text)
    : escapePrintText(part.text)).join('')
}

type PrintableQuestion = {
  svg?: string | null; correctAnswerText?: string; q?: string; question?: string; opts?: string[]; passage?: string; type?: string
  pairs?: { left: string; right: string }[]; items?: string[]; statements?: { text: string }[]
  tableData?: { headers: string[]; rows: { cells: string[]; blanks?: number[] }[] }
}

/** Inline <svg> markup as an <img>: scripts inside an image never run. */
export function printableFigure(svg: string | null | undefined): string {
  if (typeof svg !== 'string' || !/<svg\b[\s\S]*<\/svg>/i.test(svg)) return ''
  return `<p><img alt="Soru görseli" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" style="max-width:100%;max-height:70mm"></p>`
}

export function questionPrintHtml(questions: PrintableQuestion[]): string {
  return questions.map((question, index) => {
    const options = (!question.type || question.type === 'multiple_choice') ? (question.opts || []).map((option, i) => `<li>${String.fromCharCode(65 + i)}) ${printableMath(option)}</li>`).join('') : ''
    const pairs = question.pairs?.map(pair => `<li>${printableMath(pair.left)} → ..............</li>`).join('') || ''
    const pairChoices = question.pairs?.length ? `<p>Eşleştirme seçenekleri:</p><ul>${[...question.pairs].reverse().map(pair => `<li>${printableMath(pair.right)}</li>`).join('')}</ul>` : ''
    const items = question.items?.map(item => `<li>${printableMath(item)}</li>`).join('') || ''
    const statements = question.statements?.map(statement => `<li>${printableMath(statement.text)} ☐ Doğru ☐ Yanlış</li>`).join('') || ''
    const table = question.tableData ? `<table><thead><tr>${question.tableData.headers.map(header => `<th>${printableMath(header)}</th>`).join('')}</tr></thead><tbody>${question.tableData.rows.map(row => `<tr>${row.cells.map((cell, i) => `<td>${row.blanks?.includes(i) ? '........................' : printableMath(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''
    return `<section class="print-question">${question.passage ? `<div class="print-passage">${printableMath(question.passage)}</div>` : ''}<h2>${index + 1}. ${printableMath(question.q || question.question || '')}</h2>${printableFigure(question.svg)}${options ? `<ul>${options}</ul>` : question.type === 'true_false' ? '<p>☐ Doğru ☐ Yanlış</p>' : ''}${pairs || items || statements ? `<ul>${pairs}${items}${statements}</ul>` : ''}${pairChoices}${table}${['fill_blank', 'short_answer'].includes(question.type || '') ? '<p>................................................................................................</p>' : ''}</section>`
  }).join('')
}

// Browser printing preserves Turkish/Unicode, accessible text and the same KaTeX
// fonts as the screen. It avoids rasterizing formulas or silently deleting glyphs.
export async function printLearningDocument(title: string, subtitle: string, content: string): Promise<void> {
  const frame = document.createElement('iframe')
  frame.title = 'Pratium PDF yazdırma görünümü'
  frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;bottom:0;left:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) { frame.remove(); throw new Error('Yazdırma görünümü açılamadı.') }
  try {
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(node => node.outerHTML).join('')
    doc.open()
    doc.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><base href="${escapePrintText(location.origin + '/')}"><title>${escapePrintText(title)}</title>${styles}<style>@page{size:A4;margin:18mm}html,body{background:white!important;color:#172033!important;font:12pt Arial,sans-serif!important;margin:0!important;padding:0!important}h1{font-size:22pt;margin:0 0 8pt}h2{font-size:12pt;font-weight:600;line-height:1.7;white-space:pre-wrap}p,li{line-height:1.8;white-space:pre-wrap}ul{list-style:none;padding-left:12pt}li{margin:6pt 0}.print-question{margin:20pt 0;break-inside:avoid}.print-passage{padding:10pt;border:1px solid #bbb;white-space:pre-wrap}table{border-collapse:collapse;width:100%;margin:10pt 0}td,th{border:1px solid #bbb;padding:8pt}.katex{color:#172033!important}.katex-display{margin:8pt 0}*{print-color-adjust:exact}</style></head><body><h1>${printableMath(title)}</h1><p>${printableMath(subtitle)}</p><p>Ad Soyad: ................................................. Tarih: ........................</p>${content}<footer>Pratium · pratium.com</footer></body></html>`)
    doc.close()
    await Promise.all(Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(link => link.sheet ? Promise.resolve() : new Promise<void>(resolve => { link.onload = () => resolve(); link.onerror = () => resolve(); setTimeout(resolve, 5000) })))
    await doc.fonts.ready
    win.addEventListener('afterprint', () => frame.remove(), { once: true })
    win.focus()
    win.print()
    // Some mobile browsers don't dispatch afterprint.
    setTimeout(() => frame.remove(), 300000)
  } catch (error) { frame.remove(); throw error }
}

type KeyQuestion = { q?: string; question?: string; type?: string; opts?: string[]; ans?: number; blank?: string; referenceAnswer?: string; exp?: string; explanation?: string; statement?: boolean; statements?: { text: string; correct: boolean }[]; pairs?: { left: string; right: string }[]; correctOrder?: number[]; items?: string[]; tableAnswers?: string[] }

/** Answer key text per question type; falls back to the explanation when the answer is not a single choice. */
export function answerKeyText(question: KeyQuestion): string {
  const options = question.opts || []
  if ((!question.type || question.type === 'multiple_choice') && Number.isInteger(question.ans) && options[question.ans as number] !== undefined) {
    return `${String.fromCharCode(65 + (question.ans as number))}) ${options[question.ans as number]}`
  }
  if (question.type === 'true_false') return question.statement === true || question.ans === 0 ? 'Doğru' : question.statement === false || question.ans === 1 ? 'Yanlış' : (question.exp || question.explanation || '')
  if (question.type === 'multi_true_false' && question.statements) return question.statements.map((statement, index) => `${index + 1}) ${statement.correct ? 'D' : 'Y'}`).join('  ')
  if (question.type === 'matching' && question.pairs) return question.pairs.map(pair => `${pair.left} → ${pair.right}`).join('; ')
  if (question.type === 'ordering' && question.items && question.correctOrder) return question.correctOrder.map(index => question.items![index]).join(' → ')
  if (question.type === 'table_fill' && question.tableAnswers) return question.tableAnswers.join(', ')
  const reference = question.blank || question.referenceAnswer || (options.length === 1 ? options[0] : '')
  return reference || question.exp || question.explanation || ''
}

export function answerKeyHtml(questions: KeyQuestion[]): string {
  return `<div style="break-before:page"></div><h2 style="font-size:14pt">Cevap anahtarı (öğretmen nüshası)</h2><ol style="padding-left:18pt">${questions.map(question => `<li style="margin:4pt 0">${printableMath(answerKeyText(question))}</li>`).join('')}</ol>`
}
