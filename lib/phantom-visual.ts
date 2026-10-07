// A question that points at a visual the student will never see ("Aşağıdaki
// görselde…", "[Görsel: …]", a hallucinated image URL, leaked <svg> text) cannot
// be answered. 7-day sample: Fen 80%, Türkçe 100%, Sosyal Bilgiler 44% of the
// reported visual questions. Such candidates are rejected before they reach a
// student; the generator then tops the set up with a fresh question.

type Q = Record<string, unknown>

const LEAKED_MARKUP = /<svg\b|<\/svg>|```\s*svg|^\s*svg\s*$/im
const PLACEHOLDER = /\[\s*(görsel|şekil|resim|grafik|harita|diyagram|tablo)\s*[:：]/i
const IMAGE_URL = /https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)\b|imgur\.com|data:image\//i
// "şekil" alone is also a noun ("aşağıdaki şekillerden hangisi…"), so only the locative/attributive forms count.
const VISUAL_CLAIM = new RegExp([
  String.raw`(?<!\p{L})(aşağıdaki|yukarıdaki|verilen)\s+(görsel|grafik|harita|resim|diyagram|şema|çizim|tablo|şekil(?!ler))`,
  String.raw`(?<!\p{L})(görsel|grafik|harita|resim|diyagram|şema|çizim|şekil)(de|da|deki|daki|e göre|ye göre|a göre)(?!\p{L})`,
  String.raw`(?<!\p{L})tablo(da|daki|ya göre|dan)(?!\p{L})`,
].join('|'), 'iu')

function text(question: Q): string {
  const opts = Array.isArray(question.opts) ? (question.opts as unknown[]).map(String).join('\n') : ''
  return `${String(question.q ?? '')}\n${opts}`
}

/** A real, self-contained visual: inline <svg> without external images, or structured table data. */
export function hasRealVisualAsset(question: Q): boolean {
  const svg = typeof question.svg === 'string' ? question.svg : ''
  // Embedded data: images (booklet figures) are real; links to remote images are not.
  if (/<svg\b[\s\S]*<\/svg>/i.test(svg) && !/href\s*=\s*["']\s*(?:https?:)?\/\//i.test(svg)) return true
  const table = question.tableData as { rows?: unknown[] } | undefined
  return Array.isArray(table?.rows) && table.rows.length > 0
}

function hasInlineTextTable(q: string): boolean {
  return q.split('\n').filter(line => (line.match(/\|/g) || []).length >= 2).length >= 2
}

/** Returns why the question is unanswerable, or null when it is fine. */
export function phantomVisualIssue(question: Q): 'leaked_markup' | 'placeholder' | 'image_url' | 'missing_visual' | null {
  const all = text(question)
  if (LEAKED_MARKUP.test(all)) return 'leaked_markup'
  if (PLACEHOLDER.test(all)) return 'placeholder'
  if (IMAGE_URL.test(all)) return 'image_url'
  if (hasRealVisualAsset(question)) return null
  const stem = String(question.q ?? '')
  if (VISUAL_CLAIM.test(stem) && !hasInlineTextTable(stem)) return 'missing_visual'
  return null
}
