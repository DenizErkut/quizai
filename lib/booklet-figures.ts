// Finds the figure (chart, table drawing, picture) that belongs to each printed
// question of a booklet PDF and returns it as an image, so the admin does not
// have to pick image and question by hand.
//
// How: per page, text positions give the question start markers ("12." / "Soru
// 12 |"); the vertical span between two markers is that question's region.
// Text is painted out of a rendering of the page, so what remains inside the
// region is the figure; its bounding box (plus nearby short labels such as axis
// ticks) is cropped from the normal rendering. Answer lines and options are
// never part of a figure.

export type Box = { left: number; top: number; right: number; bottom: number }
export type Marker = { n: number; top: number; x: number }

/**
 * Keeps only markers that continue the booklet's numbering. A numbered list inside a
 * question ("1. … 2. …") repeats small numbers and is skipped because it does not
 * advance the question sequence.
 */
export function acceptMarkers(candidates: Marker[], known: Set<number>, last: number): Marker[] {
  const accepted: Marker[] = []
  let current = last
  for (const marker of [...candidates].sort((a, b) => a.top - b.top)) {
    if (!known.has(marker.n)) continue
    // The first question starts the sequence ("8. SINIF" on a cover page is not question 8).
    const continues = current === 0 ? marker.n <= 2 : marker.n - current <= 3
    if (marker.n > current && continues) { accepted.push(marker); current = marker.n }
  }
  return accepted
}

/** Bounding box of dark pixels (gray < 235) inside `region`; rows/columns need a few pixels so noise and hairlines are ignored. */
export function figureBox(gray: Uint8ClampedArray | Uint8Array, width: number, region: Box, minSize = 40): Box | null {
  const rows: number[] = []
  const cols = new Map<number, number>()
  for (let y = region.top; y < region.bottom; y++) {
    let count = 0
    for (let x = region.left; x < region.right; x++) {
      if (gray[y * width + x] < 235) { count++; cols.set(x, (cols.get(x) || 0) + 1) }
    }
    rows.push(count)
  }
  // A thin rule spanning the page (question separator, header line) is not a figure; a table border is,
  // because the rows next to it are filled by the table's own vertical lines.
  const regionWidth = region.right - region.left
  const isolatedRule = (i: number) => rows[i] > regionWidth * 0.8
    && [-4, -3, -2, -1, 1, 2, 3, 4].filter(d => rows[i + d] !== undefined).every(d => rows[i + d] < 3 || rows[i + d] > regionWidth * 0.8 && Math.abs(d) <= 1)
  const ruleRows = new Set<number>()
  for (let i = 0; i < rows.length; i++) if (isolatedRule(i)) ruleRows.add(i)
  const goodRows = rows.map((count, i) => count >= 3 && !ruleRows.has(i) ? region.top + i : -1).filter(y => y >= 0)
  const goodCols = [...cols.entries()].filter(([, count]) => count >= 3).map(([x]) => x).sort((a, b) => a - b)
  if (!goodRows.length || !goodCols.length) return null
  const box = { left: goodCols[0], right: goodCols[goodCols.length - 1] + 1, top: goodRows[0], bottom: goodRows[goodRows.length - 1] + 1 }
  return box.right - box.left >= minSize && box.bottom - box.top >= minSize ? box : null
}

export type PageText = { str: string; box: Box }
const ANSWER_LINE = /^\s*(?:cevap|yanıt|doğru cevap|zorluk|seviye|ders|kazanım)\b/iu
const OPTION_LINE = /^\s*\(?[A-E][).]\s/u

/** Items on the same visual line (same baseline band). */
function sameLine(a: Box, b: Box): boolean {
  const mid = (box: Box) => (box.top + box.bottom) / 2
  return Math.abs(mid(a) - mid(b)) <= Math.max(5, (a.bottom - a.top) * 0.6)
}

/** Lines that belong to the question, not to the figure: answers, options, and sentences. */
function questionLines(texts: PageText[]): Set<PageText> {
  const blocked = new Set<PageText>()
  for (const text of texts) {
    const label = text.str.trim()
    const sentence = label.length > 24 || /[?.:]$/.test(label)
    if (!label || sentence || ANSWER_LINE.test(label) || OPTION_LINE.test(label) || /^\(?[A-E][).]$/u.test(label)) {
      for (const other of texts) if (sameLine(text.box, other.box)) blocked.add(other)
    }
  }
  return blocked
}

/** Short labels touching the figure (axis ticks, legend) belong to it; options, answers and sentences never do. */
export function expandWithLabels(box: Box, texts: PageText[], pageWidth: number, reach: number): Box {
  const blocked = questionLines(texts)
  let result = { ...box }
  for (let pass = 0; pass < 2; pass++) {
    for (const text of texts) {
      if (blocked.has(text) || !text.str.trim() || text.box.right - text.box.left > pageWidth * 0.5) continue
      const near = text.box.right >= result.left - reach && text.box.left <= result.right + reach
        && text.box.bottom >= result.top - reach && text.box.top <= result.bottom + reach
      if (near) result = { left: Math.min(result.left, text.box.left), right: Math.max(result.right, text.box.right), top: Math.min(result.top, text.box.top), bottom: Math.max(result.bottom, text.box.bottom) }
    }
  }
  return result
}

/** Shrinks the crop so no text line outside the figure is cut or included. */
export function clampCrop(crop: Box, box: Box, texts: PageText[]): Box {
  const out = { ...crop }
  for (const text of texts) {
    const overlaps = text.box.right > out.left && text.box.left < out.right && text.box.bottom > out.top && text.box.top < out.bottom
    const inside = text.box.top >= box.top - 2 && text.box.bottom <= box.bottom + 2 && text.box.left >= box.left - 2 && text.box.right <= box.right + 2
    if (!overlaps || inside) continue
    if ((text.box.top + text.box.bottom) / 2 < (box.top + box.bottom) / 2) out.top = Math.max(out.top, Math.min(Math.ceil(text.box.bottom) + 1, box.top))
    else out.bottom = Math.min(out.bottom, Math.max(Math.floor(text.box.top) - 1, box.bottom))
  }
  return out
}

export type PageFigure = { questionNumber: number; data: Buffer; mime: 'image/png' | 'image/jpeg'; width: number; height: number }
export type FigurePageResult = { pageCount: number; lastQuestion: number; figures: PageFigure[] }

const SCALE = 2
// "6. Sınıf | …" page footers are not question starts.
const MARKER = /^\s*(?:[Ss][Oo][Rr][Uu]\s*)?(\d{1,4})\s*(?:\||[.)])(?!\s*[Ss][ıiIİ]n[ıiIİ]f)/u

export async function figuresForPages(
  pdf: Uint8Array,
  options: { fromPage: number; pages: number; lastQuestion: number; knownNumbers: Set<number> },
): Promise<FigurePageResult> {
  const canvasLib = await import('@napi-rs/canvas')
  const { createCanvas } = canvasLib
  // pdfjs draws glyphs with Path2D; it must be the canvas library's own class.
  const scope = globalThis as unknown as Record<string, unknown>
  scope.Path2D = canvasLib.Path2D; scope.DOMMatrix = scope.DOMMatrix || canvasLib.DOMMatrix; scope.ImageData = scope.ImageData || canvasLib.ImageData
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const path = await import('node:path')
  const standardFontDataUrl = path.join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/') 
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), standardFontDataUrl, useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise
  const figures: PageFigure[] = []
  let last = options.lastQuestion
  try {
    const end = Math.min(doc.numPages, options.fromPage + options.pages)
    for (let pageIndex = options.fromPage; pageIndex < end; pageIndex++) {
      const page = await page_(doc, pageIndex + 1)
      const viewport = page.getViewport({ scale: SCALE })
      const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height)
      const canvas = createCanvas(width, height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height)
      await page.render({ canvasContext: ctx as never, viewport, canvas: canvas as never }).promise

      const content = await page.getTextContent()
      const texts: PageText[] = []
      for (const item of content.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>) {
        if (!item.str || !item.transform) continue
        const [px, py] = viewport.convertToViewportPoint(item.transform[4], item.transform[5])
        const h = Math.max(6, (item.height || Math.hypot(item.transform[2], item.transform[3]) || 8) * SCALE)
        texts.push({ str: item.str, box: { left: px, right: px + (item.width || 0) * SCALE, top: py - h * 0.95, bottom: py + h * 0.28 } })
      }
      const candidates: Marker[] = []
      for (const text of texts) {
        const match = MARKER.exec(text.str)
        if (match && text.box.left < width * 0.2) candidates.push({ n: Number(match[1]), top: text.box.top, x: text.box.left })
      }
      const markers = acceptMarkers(candidates, options.knownNumbers, last)

      // Page with text masked out, to find what is not text.
      const image = ctx.getImageData(0, 0, width, height)
      const gray = new Uint8ClampedArray(width * height)
      for (let i = 0; i < gray.length; i++) gray[i] = (image.data[i * 4] * 299 + image.data[i * 4 + 1] * 587 + image.data[i * 4 + 2] * 114) / 1000
      for (const text of texts) {
        for (let y = Math.max(0, Math.floor(text.box.top) - 3); y < Math.min(height, Math.ceil(text.box.bottom) + 3); y++) {
          for (let x = Math.max(0, Math.floor(text.box.left) - 3); x < Math.min(width, Math.ceil(text.box.right) + 3); x++) gray[y * width + x] = 255
        }
      }

      const headerFooter = height * 0.05
      const regions: Array<{ n: number; top: number; bottom: number }> = []
      if (last > 0 && (!markers.length || markers[0].top - headerFooter > 20)) regions.push({ n: last, top: headerFooter, bottom: markers.length ? markers[0].top : height - headerFooter })
      markers.forEach((marker, i) => regions.push({ n: marker.n, top: marker.top, bottom: markers[i + 1] ? markers[i + 1].top : height - headerFooter }))
      if (markers.length) last = markers[markers.length - 1].n

      for (const region of regions) {
        const top = Math.max(Math.floor(region.top), Math.floor(headerFooter)), bottom = Math.min(Math.floor(region.bottom), Math.floor(height - headerFooter))
        if (bottom - top < 50) continue
        const found = figureBox(gray, width, { left: Math.floor(width * 0.04), right: Math.floor(width * 0.96), top, bottom })
        if (!found) continue
        const box = expandWithLabels(found, texts.filter(t => t.box.top >= top - 4 && t.box.bottom <= bottom + 4), width, 14)
        const pad = 10
        const left = Math.max(0, Math.floor(box.left) - pad), right = Math.min(width, Math.ceil(box.right) + pad)
        const clamped = clampCrop({ left, right, top: Math.max(top, Math.floor(box.top) - pad), bottom: Math.min(bottom, Math.ceil(box.bottom) + pad) }, box, texts)
        const cropTop = Math.floor(clamped.top), cropBottom = Math.ceil(clamped.bottom)
        const cropW = right - left, cropH = cropBottom - cropTop
        if (cropW < 60 || cropH < 50) continue
        const outScale = Math.min(1, 1000 / cropW)
        const out = createCanvas(Math.max(1, Math.round(cropW * outScale)), Math.max(1, Math.round(cropH * outScale)))
        const outCtx = out.getContext('2d')
        outCtx.fillStyle = '#fff'; outCtx.fillRect(0, 0, out.width, out.height)
        outCtx.drawImage(canvas, left, cropTop, cropW, cropH, 0, 0, out.width, out.height)
        let data = out.toBuffer('image/png'), mime: 'image/png' | 'image/jpeg' = 'image/png'
        if (data.length > 1_800_000) { data = out.toBuffer('image/jpeg', 80); mime = 'image/jpeg' }
        if (data.length > 1_900_000) continue
        figures.push({ questionNumber: region.n, data, mime, width: out.width, height: out.height })
      }
      page.cleanup()
    }
    return { pageCount: doc.numPages, lastQuestion: last, figures }
  } finally {
    await doc.destroy()
  }
}

function page_(doc: { getPage(n: number): Promise<any> }, n: number) { return doc.getPage(n) }
