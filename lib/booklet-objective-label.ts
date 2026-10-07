// Codes such as MAT.6.1.1, ENG.6.1.R3 and Turkish T.O.6.10 / T.Y.6.15 (an extra one-to-three letter segment).
const codePattern = /(?<![\p{L}\d.])[A-ZÇĞİÖŞÜ]{1,12}(?:\.[A-ZÇĞİÖŞÜ]{1,3})?\.\d{1,2}(?:\.[A-Z0-9]+){1,6}(?![\p{L}\d])/gu
const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]/gu, '')

export function bookletQuestionLabels(text: string) {
  const starts = [...text.matchAll(/(?:^|\n)\s*(?:Soru\s+\d{1,3}\s*(?:\||[.)])|\d{1,3}[.)]\s+(?![Ss][ıiIİ]n[ıiIİ]f))/giu)].map(item => item.index!)
  return starts.map((start, index) => {
    const block = text.slice(start, starts[index + 1] ?? text.length).trim()
    // Only the question heading, never the booklet cover or page footer.
    const heading = block.split('\n').slice(0, 3).join('\n')
    const codes = [...new Set(heading.match(codePattern) || [])]
    const number = block.match(/^(?:Soru\s+)?(\d{1,3})\s*(?:\||[.)])/iu)
    return { text: normalized(block), codes, number: number ? Number(number[1]) : null }
  })
}

export function printedQuestionNumber(question: string, labels: ReturnType<typeof bookletQuestionLabels>): number | null {
  const needle = normalized(question)
  const matches = needle.length >= 15 ? labels.filter(label => label.text.includes(needle)) : []
  return matches.length === 1 ? matches[0].number : null
}

export function printedQuestionObjective(question: string, labels: ReturnType<typeof bookletQuestionLabels>, verifiedCodes: string[]) {
  const needle = normalized(question)
  const matches = needle.length >= 15 ? labels.filter(label => label.text.includes(needle)) : []
  if (matches.length !== 1 || matches[0].codes.length !== 1) return null
  const code = matches[0].codes[0]
  return verifiedCodes.includes(code) ? code : null
}
