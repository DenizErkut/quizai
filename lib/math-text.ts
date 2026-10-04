import katex from 'katex'

export type MathSegment = { text: string; math: boolean; display: boolean }

export function splitMathText(text: string): MathSegment[] {
  const pattern = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|(?<!\\)\$([^$\n]+)\$/g
  const parts: MathSegment[] = []
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    // Two prices in prose are not a pair of math delimiters.
    if (match[4] !== undefined && (/^\s*\d[\d.,]*\s*[,;]?\s+[\p{L}]/u.test(match[4]) || /^\s*\d[\d.,]*\s*[,;]?\s+$/.test(match[4])) && !match[4].includes('\\')) continue
    if (match.index! > cursor) parts.push({ text: text.slice(cursor, match.index), math: false, display: false })
    parts.push({ text: match[1] ?? match[2] ?? match[3] ?? match[4], math: true, display: match[2] !== undefined || match[3] !== undefined })
    cursor = match.index! + match[0].length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), math: false, display: false })
  // Older generated options sometimes contain an entire formula without delimiters.
  if (cursor === 0 && /^\s*\\(?:sum|int|left)\b/.test(text)) return [{ text, math: true, display: false }]
  const bareFormula = /\\(?:frac|dfrac|tfrac)\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|\\sqrt(?:\[[^\]]+\])?\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|\\(?:pi|theta|alpha|beta)(?:\s*[a-zA-Z](?:\^\{[^{}]+\}|\^[\d]+))?|\\(?:times|cdot|div|pm|leq|geq|neq)\b/g
  return parts.flatMap(part => {
    if (part.math) return [part]
    const result: MathSegment[] = []
    let start = 0
    for (const match of part.text.matchAll(bareFormula)) {
      if (match.index! > start) result.push({ text: part.text.slice(start, match.index), math: false, display: false })
      result.push({ text: match[0], math: true, display: false })
      start = match.index! + match[0].length
    }
    if (start < part.text.length) result.push({ text: part.text.slice(start), math: false, display: false })
    return result
  })
}

export function renderMathFormula(text: string, display: boolean): string | null {
  if (text.length > 8000) return null
  try {
    return katex.renderToString(text, { displayMode: display, trust: false, throwOnError: true, strict: 'ignore', maxExpand: 200, maxSize: 10, output: 'htmlAndMathml', macros: {} })
  } catch { return null }
}

// Native <option> elements cannot contain KaTeX markup. Keep their actual value
// untouched and provide a readable, conservative text label instead.
export function plainMathText(text: string): string {
  return splitMathText(text).map(part => {
    if (!part.math) return part.text
    let value = part.text
    for (let i = 0; i < 8; i++) {
      const next = value.replace(/\\(?:d?frac|tfrac)\{([^{}]*)\}\{([^{}]*)\}/g, (_, numerator: string, denominator: string) =>
        `${/^(?:[+-]?\d+(?:[.,]\d+)?|[a-zA-Z]\w*)$/.test(numerator) ? numerator : `(${numerator})`}/${/^(?:[+-]?\d+(?:[.,]\d+)?|[a-zA-Z]\w*)$/.test(denominator) ? denominator : `(${denominator})`}`)
      if (value === next) break
      value = next
    }
    return value.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)').replace(/\\pi\b/g, 'π')
      .replace(/\\times\b/g, '×').replace(/\\cdot\b/g, '·').replace(/\\div\b/g, '÷')
      .replace(/\\%/g, '%').replace(/\^\{([23])\}|\^([23])/g, (_, a: string, b: string) => (a || b) === '2' ? '²' : '³')
  }).join('')
}
