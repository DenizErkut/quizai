// Test/Quiz ödevleri için basılı sınıf dökümü: her öğrenci için QR'lı optik cevap kâğıdı + soru kitapçığı.
// QR yalnızca dahili kimlikleri taşır (öğrenci + ödev); ad, T.C. vb. içermez.
import { escapePrintText, printableMath, questionPrintHtml } from './learning-print'

export const QZ_QR_PREFIX = 'PRATIUM-QZ:'
export function quizQrPayload(studentId: string, assignmentId: string): string { return `${QZ_QR_PREFIX}${studentId}:${assignmentId}` }
export function parseQuizQr(text: string | null | undefined): { studentId: string; assignmentId: string } | null {
  const match = /^PRATIUM-QZ:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(text || '')
  return match ? { studentId: match[1], assignmentId: match[2] } : null
}

export type PrintQuizQuestion = { q?: string; opts?: string[]; type?: string }
export type QuizSheetStudent = { name: string; schoolNo?: string | null; qrDataUrl: string }
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/** Optik okunabilen soru: şıklı çoktan seçmeli veya doğru/yanlış. Diğer tipler (boşluk doldurma, eşleştirme…) çevrim içi çözülür. */
export function hasOptions(question: PrintQuizQuestion): boolean {
  const type = question.type || 'multiple_choice'
  return (type === 'multiple_choice' || type === 'true_false') && Array.isArray(question.opts) && question.opts.length >= 2 && question.opts.length <= LETTERS.length
}

const STYLE = `<style>
.qz-sheet{break-after:page;position:relative}
.qz-qr{position:absolute;top:0;right:0;width:28mm;height:28mm}
.qz-header{display:grid;grid-template-columns:2fr 1fr;gap:6pt 14pt;margin:0 32mm 10pt 0;font-size:11pt}
.qz-field{border-bottom:1px solid #444;padding-bottom:2pt;min-height:15pt}
.qz-meta{font-size:9.5pt;color:#555;margin:0 32mm 8pt 0}
.qz-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5pt 14pt;margin-top:8pt}
.qz-row{display:flex;align-items:center;gap:5pt;font-size:11pt;break-inside:avoid}
.qz-row b{min-width:20pt}
.qz-bubble{display:inline-flex;align-items:center;justify-content:center;width:15pt;height:15pt;border:1.3pt solid #222;border-radius:50%;font-size:8pt}
.qz-title{font:700 13pt Arial,sans-serif!important;margin:6pt 0 4pt}
</style>`

/** Öğrenci başına: 1. sayfa QR'lı optik cevap kâğıdı, sonraki sayfalar soru kitapçığı. */
export function quizClassSheetsHtml(questions: PrintQuizQuestion[], students: QuizSheetStudent[], options: { title: string; classroom: string; code: string }): string {
  const rows = questions.map((question, index) => hasOptions(question)
    ? `<div class="qz-row"><b>${index + 1}.</b>${(question.opts as string[]).map((_, i) => `<span class="qz-bubble">${LETTERS[i]}</span>`).join('')}</div>`
    : `<div class="qz-row"><b>${index + 1}.</b><span style="font-size:9pt;color:#666">(bu soru çevrim içi çözülür)</span></div>`).join('')
  // Soru kitapçığı: şekil, tablo ve formüller dahil ortak yazdırma bileşeni; şıklı sorular (D/Y dahil) harfli basılır.
  const booklet = questionPrintHtml(questions.map(question => hasOptions(question) ? { ...question, type: 'multiple_choice' } : question))
  return `${STYLE}${students.map(student => `<section class="qz-sheet"><img class="qz-qr" alt="QR" src="${escapePrintText(student.qrDataUrl)}">
<div class="qz-header"><div class="qz-field">Ad Soyad: <strong>${escapePrintText(student.name)}</strong></div><div class="qz-field">No: ${student.schoolNo ? `<strong>${escapePrintText(student.schoolNo)}</strong>` : ''}</div><div class="qz-field">Sınıf: ${escapePrintText(options.classroom)}</div><div class="qz-field">Tarih: </div></div>
<p class="qz-meta">${escapePrintText(options.title)} · Ödev kodu: <strong>${escapePrintText(options.code)}</strong> · Doğru şıkkın balonunu koyu kalemle tamamen doldurun. Bu sayfanın fotoğrafını çekip/tarayıp Pratium'a yükleyin; QR kodu kapatmayın.</p>
<h2 class="qz-title">Optik cevap kâğıdı</h2><div class="qz-grid">${rows}</div></section>
<section class="qz-sheet"><h2 class="qz-title">${escapePrintText(options.title)} — Soru kitapçığı</h2>${booklet}</section>`).join('')}`
}

/** Öğretmen cevap anahtarı. */
export function quizAnswerKeyHtml(questions: Array<PrintQuizQuestion & { ans?: number }>, options: { title: string; code: string }): string {
  return `${STYLE}<section><h2 class="qz-title">Cevap anahtarı — ${escapePrintText(options.title)} (Ödev kodu: ${escapePrintText(options.code)})</h2><div class="qz-grid">${questions.map((question, index) => `<div class="qz-row"><b>${index + 1}.</b> ${hasOptions(question) && typeof question.ans === 'number' ? LETTERS[question.ans] || '?' : '—'}</div>`).join('')}</div></section>`
}
