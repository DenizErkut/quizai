import { renderMathFormula, splitMathText } from '@/lib/math-text'

export default function MathText({ text, highlight = false }: { text?: string | null; highlight?: boolean }) {
  if (typeof text !== 'string') return null
  return <>{splitMathText(text).map((part, index) => {
    if (part.math) {
      const html = renderMathFormula(part.text, part.display)
      // Only the constrained renderer's output is HTML; source text is always escaped by React.
      return html ? <span key={index} className={part.display ? 'math-text math-text-display' : 'math-text'} dangerouslySetInnerHTML={{ __html: html }} /> : <span key={index}>{part.text}</span>
    }
    return <span key={index}>{highlight ? part.text.split(/(\[[^\]]+\])/).map((piece, i) => piece.startsWith('[') && piece.endsWith(']')
      ? <span key={i} style={{ textDecoration: 'underline double #6366f1', fontWeight: 700 }}>{piece.slice(1, -1)}</span> : piece) : part.text}</span>
  })}</>
}
