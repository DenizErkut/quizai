import { Fragment } from 'react'
import MathText from '@/components/MathText'
import { splitMathText } from '@/lib/math-text'

// Deliberately small Markdown subset. Never interpret raw HTML or arbitrary links.
function Inline({ text }: { text: string }) {
  return <>{splitMathText(text).map((segment, i) => segment.math
    ? <MathText key={i} text={segment.display ? `\\[${segment.text}\\]` : `\\(${segment.text}\\)`} />
    : <Fragment key={i}>{segment.text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/).map((part, j) => part.startsWith('**') && part.endsWith('**')
      ? <strong key={j}>{part.slice(2, -2)}</strong> : part.startsWith('`') && part.endsWith('`')
        ? <code key={j}>{part.slice(1, -1)}</code> : <Fragment key={j}>{part}</Fragment>)}</Fragment>)}</>
}

export default function LearningMessage({ text }: { text: string }) {
  // Keep multiline display math intact; other messages use line-based headings/lists.
  if (/\\\[[\s\S]*\n[\s\S]*\\\]|\$\$[\s\S]*\n[\s\S]*\$\$/.test(text)) return <Inline text={text} />
  return <>{text.split('\n').map((line, i) => {
    const heading = line.match(/^#{1,6}\s+(.+)$/)
    const bullet = line.match(/^\s*[-*]\s+(.+)$/)
    return <Fragment key={i}>{i > 0 && <br />}{/^\s*---+\s*$/.test(line) ? <span style={{ display: 'block', borderTop: '1px solid currentColor', opacity: .25, margin: '8px 0' }} />
      : heading ? <strong><Inline text={heading[1]} /></strong> : bullet ? <>• <Inline text={bullet[1]} /></> : <Inline text={line} />}</Fragment>
  })}</>
}
