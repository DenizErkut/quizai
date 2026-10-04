import katex from 'katex'

export type MathSegment = { text: string; math: boolean; display: boolean }

export function splitMathText(text: string): MathSegment[] {
  const pattern = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|(?<!\\)\$([^$\n]+)\$/g
  const parts: MathSegment[] = []
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index! > cursor) parts.push({ text: text.slice(cursor, match.index), math: false, display: false })
    parts.push({ text: match[1] ?? match[2] ?? match[3] ?? match[4], math: true, display: match[2] !== undefined || match[3] !== undefined })
    cursor = match.index! + match[0].length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), math: false, display: false })
  // Older generated options sometimes contain an entire formula without delimiters.
  if (cursor === 0 && /^\s*\\(?:frac|dfrac|sqrt|sum|int|left)\b/.test(text)) return [{ text, math: true, display: false }]
  return parts
}

export function renderMathFormula(text: string, display: boolean): string | null {
  if (text.length > 8000) return null
  try {
    return katex.renderToString(text, { displayMode: display, trust: false, throwOnError: true, strict: 'ignore', maxExpand: 200, maxSize: 10, output: 'htmlAndMathml', macros: {} })
  } catch { return null }
}
