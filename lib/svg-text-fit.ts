// Modelin serbest yazdığı SVG'lerde başlık/etiket metni çoğu zaman çizim alanına sığmıyor
// (ör. "Bir üçgende köşeden karşı kenarın orta noktasına çizilen doğru…" başlığı iki yandan kesiliyordu).
// Bu modül her <text> öğesinin genişliğini tahmin eder; taşıyorsa önce yazıyı küçültür, hâlâ sığmıyorsa
// kelime sınırlarında satırlara böler ve x konumunu görünür alana çeker. Döndürülmüş metinlere dokunmaz.

const MARGIN = 6
const MIN_FONT = 10
const MAX_LINES = 3
const LINE_HEIGHT = 1.2

type Box = { w: number; h: number }

function viewBoxOf(svg: string): Box {
  const vb = svg.match(/viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i)
  if (vb) {
    const w = Number(vb[3]); const h = Number(vb[4])
    if (w > 0 && h > 0) return { w, h }
  }
  const w = Number(svg.match(/<svg[^>]*\swidth\s*=\s*["']?([\d.]+)/i)?.[1])
  const h = Number(svg.match(/<svg[^>]*\sheight\s*=\s*["']?([\d.]+)/i)?.[1])
  return { w: w > 0 ? w : 400, h: h > 0 ? h : 280 }
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1]
}

function setAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`(\\s${name}\\s*=\\s*)["'][^"']*["']`, 'i')
  return re.test(tag) ? tag.replace(re, `$1"${value}"`) : tag.replace(/^<text/i, `<text ${name}="${value}"`)
}

function decode(text: string): string {
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
}

function encode(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Arial için yaklaşık genişlik: ortalama karakter ~0.55em, kalınsa ~0.6em. */
export function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  return text.length * fontSize * (bold ? 0.6 : 0.55)
}

function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + word).length > maxChars) { lines.push(line); line = word } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines
}

function available(anchor: string, x: number, width: number): number {
  if (anchor === 'middle') return 2 * Math.max(0, Math.min(x - MARGIN, width - MARGIN - x))
  if (anchor === 'end') return Math.max(0, x - MARGIN)
  return Math.max(0, width - MARGIN - x)
}

export function fitSvgText(svg: string): string {
  if (!/<svg\b/i.test(svg)) return svg
  const { w: width } = viewBoxOf(svg)
  return svg.replace(/<text\b([^>]*)>([^<]*)<\/text>/gi, (whole, _attrs: string, inner: string) => {
    const open = whole.slice(0, whole.indexOf('>') + 1)
    if (/\btransform\s*=/i.test(open)) return whole
    const raw = decode(inner).replace(/\s+/g, ' ').trim()
    if (!raw) return whole
    const x = Number(attr(open, 'x') ?? 0)
    const fontSize = Number(attr(open, 'font-size')?.replace(/px$/i, '')) || 16
    const anchor = (attr(open, 'text-anchor') ?? 'start').toLowerCase()
    const bold = /bold|[6-9]00/.test(attr(open, 'font-weight') ?? '')
    if (!Number.isFinite(x)) return whole

    let size = fontSize
    let tag = open
    const room = () => available(anchor, x, width)
    if (estimateTextWidth(raw, size, bold) <= room()) return whole

    // 1) Önce 10px'e kadar küçült.
    size = Math.max(MIN_FONT, Math.min(size, room() / (raw.length * (bold ? 0.6 : 0.55))))
    if (estimateTextWidth(raw, size, bold) <= room()) return setAttr(tag, 'font-size', String(Math.floor(size * 10) / 10)) + inner + '</text>'

    // 2) Satırlara böl; çok dar alanda (kenara yakın etiket) x'i içeri çek.
    let cx = x
    if (room() < width * 0.4) {
      const half = width * 0.45
      cx = anchor === 'middle' ? width / 2 : anchor === 'end' ? Math.min(width - MARGIN, half * 2) : MARGIN
    }
    const avail = available(anchor, cx, width)
    const maxChars = Math.max(6, Math.floor(avail / (size * (bold ? 0.6 : 0.55))))
    const lines = wrap(raw, maxChars)
    const kept = lines.slice(0, MAX_LINES)
    if (lines.length > MAX_LINES) kept[MAX_LINES - 1] = kept[MAX_LINES - 1].replace(/\s*\S*$/, '') + '…'
    tag = setAttr(setAttr(tag, 'font-size', String(Math.floor(size * 10) / 10)), 'x', String(Math.round(cx * 10) / 10))
    const tspans = kept.map((line, index) => `<tspan x="${Math.round(cx * 10) / 10}"${index ? ` dy="${LINE_HEIGHT}em"` : ''}>${encode(line)}</tspan>`).join('')
    return tag + tspans + '</text>'
  })
}
