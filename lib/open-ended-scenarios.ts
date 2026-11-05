// Açık Uçlu "senaryo kartları": sınıf + ders + dönem + senaryo numarası. Yönetici örnek yükler, yapay zeka benzerini üretir.
import { gradeNumberOf } from './written-exam'

export type ScenarioRubricItem = { criterion: string; maxPoints: number; description: string }
export type ScenarioExampleInput = {
  gradeNumber: number; subject: string; term: number; scenarioNo: number
  title: string; scenario: string; question: string; rubric: ScenarioRubricItem[]; figureSvg?: string | null; figureImage?: string | null; answerTable?: string | null
}
export const SCENARIO_RUBRIC_TOTAL = 100

export const scenarioLabel = (term: number, no: number) => `${term}. dönem ${no}. senaryo`

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\r/g, '').trim().slice(0, max) : '')

export function validateScenarioExample(input: Record<string, unknown>):
  { ok: true; value: ScenarioExampleInput } | { ok: false; error: string } {
  const gradeNumber = gradeNumberOf(input.gradeNumber)
  const subject = clean(input.subject, 120)
  const term = Number(input.term)
  const scenarioNo = Number(input.scenarioNo)
  if (!gradeNumber) return { ok: false, error: 'Sınıf seçin (1-12).' }
  if (subject.length < 2) return { ok: false, error: 'Ders adı gerekli.' }
  if (term !== 1 && term !== 2) return { ok: false, error: 'Dönem 1 veya 2 olmalı.' }
  if (!Number.isInteger(scenarioNo) || scenarioNo < 1 || scenarioNo > 99) return { ok: false, error: 'Senaryo numarası 1-99 arası olmalı.' }
  const scenario = clean(input.scenario, 4000)
  const question = clean(input.question, 2000)
  if (scenario.length < 10) return { ok: false, error: 'Senaryo metni çok kısa.' }
  if (question.length < 5) return { ok: false, error: 'Soru metni çok kısa.' }
  const rubricInput = Array.isArray(input.rubric) ? input.rubric as Array<Record<string, unknown>> : []
  if (rubricInput.length < 1 || rubricInput.length > 10) return { ok: false, error: 'Rubrik 1-10 ölçütten oluşmalı.' }
  const rubric: ScenarioRubricItem[] = []
  for (const entry of rubricInput) {
    const criterion = clean(entry?.criterion, 300)
    const maxPoints = Number(entry?.maxPoints)
    if (!criterion) return { ok: false, error: 'Rubrik ölçütünün adı boş.' }
    if (!Number.isInteger(maxPoints) || maxPoints < 1 || maxPoints > 100) return { ok: false, error: `"${criterion}" ölçütünün puanı 1-100 arası tam sayı olmalı.` }
    rubric.push({ criterion, maxPoints, description: clean(entry?.description, 800) })
  }
  const total = rubric.reduce((sum, item) => sum + item.maxPoints, 0)
  if (total !== SCENARIO_RUBRIC_TOTAL) return { ok: false, error: `Rubrik toplamı ${SCENARIO_RUBRIC_TOTAL} olmalı (şu an ${total}).` }
  return { ok: true, value: { gradeNumber, subject, term, scenarioNo, title: clean(input.title, 200), scenario, question, rubric, figureSvg: sanitizeFigureSvg(input.figureSvg), figureImage: sanitizeFigureImage(input.figureImage), answerTable: sanitizeAnswerTable(input.answerTable) } }
}

/** Yönetici örneklerini yapay zeka istemine koyar: örneği kopyalamak değil, aynı beceriyi ölçen yeni bir senaryo yazmak istenir. */
export function exampleBlock(examples: Array<{ scenario: string; question: string; rubric: ScenarioRubricItem[]; figure_svg?: string | null; answer_table?: string | null }>): string {
  return examples.map((example, index) => `ÖRNEK ${index + 1}:
Senaryo: ${example.scenario}
Soru: ${example.question}${example.answer_table ? `\nDoldurulacak tablo (boş hücreleri öğrenci doldurur):\n${example.answer_table}` : ''}${example.figure_svg ? `\nŞekil (SVG): ${example.figure_svg}` : ''}
Rubrik: ${example.rubric.map(item => `${item.criterion} (${item.maxPoints} puan): ${item.description}`).join(' | ')}`).join('\n\n')
}

export function pickExamples<T>(examples: T[], count: number, random: () => number = Math.random): T[] {
  const pool = [...examples]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

/** Ölçüt puanlarını toplamı tam 100 olacak şekilde ölçekler (PDF'den ayıklanan rubrikler için). */
export function normalizeRubricTo100(rubric: ScenarioRubricItem[]): ScenarioRubricItem[] {
  const sum = rubric.reduce((s, r) => s + r.maxPoints, 0)
  if (!rubric.length || sum <= 0) return rubric
  const scaled = rubric.map(r => ({ ...r, maxPoints: Math.max(1, Math.round((r.maxPoints / sum) * 100)) }))
  const diff = SCENARIO_RUBRIC_TOTAL - scaled.reduce((s, r) => s + r.maxPoints, 0)
  scaled[scaled.length - 1].maxPoints = Math.max(1, scaled[scaled.length - 1].maxPoints + diff)
  return scaled
}

const SVG_ALLOWED_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'marker', 'title', 'desc'])

/**
 * Yapay zekâdan ya da yöneticiden gelen SVG'yi güvenli hâle getirir: yalnızca çizim etiketleri kalır;
 * script, foreignObject, image, olay özellikleri (on*), harici bağlantılar ve style/url() kaldırılır.
 * Geçersiz ya da çok büyükse null döner. Ek olarak SVG yalnızca <img data:> olarak gösterilir (betik çalışmaz).
 */
export function sanitizeFigureSvg(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw || raw.length > 20000) return null
  const start = raw.search(/<svg[\s>]/i)
  const end = raw.lastIndexOf('</svg>')
  if (start < 0 || end < 0) return null
  const body = raw.slice(start, end + 6)
  const out = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?\s*([a-zA-Z][\w:-]*)([^>]*)>/g, (full, tag: string, attrs: string) => {
      const name = tag.toLowerCase()
      if (!SVG_ALLOWED_TAGS.has(name)) return ''
      if (full.startsWith('</')) return `</${name}>`
      const kept = attrs.replace(/\s+([a-zA-Z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g, (_m: string, attr: string, value: string) => {
        const lower = attr.toLowerCase()
        const val = value.slice(1, -1)
        if (lower.startsWith('on') || lower === 'style' || lower === 'href' || lower === 'xlink:href') return ''
        if (/javascript:|url\s*\(|data:|expression\(/i.test(val)) return ''
        return ` ${attr}=${value}`
      }).replace(/\s*\/\s*$/, '')
      const selfClose = /\/\s*>$/.test(full) ? ' /' : ''
      return `<${name}${kept}${selfClose}>`
    })
  if (!/^<svg[\s>]/i.test(out)) return null
  // xmlns <img> içinde gereklidir.
  return /xmlns\s*=/.test(out.slice(0, 300)) ? out : out.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** PDF'ten kırpılan şekil görseli: yalnızca PNG/JPEG data URL ve en çok 900.000 karakter. */
export function sanitizeFigureImage(input: unknown): string | null {
  if (typeof input !== 'string') return null
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(input) && input.length <= 900000 ? input : null
}

export type AnswerTable = { headers: string[]; rows: string[][] }
const BLANK = /^(?:\.{2,}|…+|_+|\?+|-+|—+)$/

/** "Başlık | Başlık\nSatır | | " biçimini tabloya çevirir; boş (ya da ... gibi) hücre öğrencinin dolduracağı hücredir. */
export function parseAnswerTable(text: unknown): AnswerTable | null {
  if (typeof text !== 'string') return null
  const lines = text.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length < 2 || lines.length > 15) return null
  const cells = lines.map(line => line.replace(/^\||\|$/g, '').split('|').map(cell => { const value = cell.trim().slice(0, 80); return BLANK.test(value) ? '' : value }))
  const width = cells[0].length
  if (width < 2 || width > 8) return null
  const rows = cells.slice(1).map(row => Array.from({ length: width }, (_, i) => row[i] ?? ''))
  if (!rows.some(row => row.some(cell => cell === ''))) return null
  return { headers: cells[0], rows }
}

export function sanitizeAnswerTable(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const text = input.replace(/\r/g, '').trim().slice(0, 3000)
  return parseAnswerTable(text) ? text : null
}

/** Öğrencinin doldurduğu tabloyu puanlayıcıya giden düz metne çevirir. */
export function serializeTableAnswer(table: AnswerTable, values: string[][]): string {
  const lines: string[] = []
  table.rows.forEach((row, r) => {
    const parts = row.map((cell, c) => c === 0 ? '' : `${table.headers[c]}: ${cell !== '' ? cell : (values[r]?.[c] || '(boş)').trim()}`).filter(Boolean)
    lines.push(`${row[0] || `Satır ${r + 1}`} → ${parts.join('; ')}`)
  })
  return `Tablo cevabı:\n${lines.join('\n')}`
}

/**
 * Yedek: model tabloyu senaryo metnine "A | B | C. Satır | ... | ...." biçiminde gömmüşse ayıklar.
 * Dönen scenario, tablo satırları çıkarılmış metindir; table, doldurulabilir tablo metnidir.
 */
export function extractInlineTable(scenario: string): { scenario: string; table: string } | null {
  if (!scenario.includes('|')) return null
  const sentences = scenario.split(/(?<=\.)\s+(?=[A-ZÇĞİÖŞÜ0-9])/u)
  const rowIndexes = sentences.map((sentence, i) => sentence.includes('|') ? i : -1).filter(i => i >= 0)
  if (rowIndexes.length < 2) return null
  const rows = rowIndexes.map(i => sentences[i].replace(/\.$/, ''))
  const table = rows.map(row => row.split('|').map(cell => cell.trim()).map(cell => /^(\.{2,}|…+)$/.test(cell) ? '' : cell).join(' | ')).join('\n')
  if (!parseAnswerTable(table)) return null
  const rest = sentences.filter((_, i) => !rowIndexes.includes(i)).join(' ').trim()
  return { scenario: rest || scenario, table }
}
