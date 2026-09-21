// lib/chart-svg.ts
//
// 21 Eylül 2026 — Deniz'in isteğiyle: "grafik oluşturmada eksiğiz, kaliteyi
// artıralım" sorununa cevap. Önceki yöntem, math_graph kategorisindeki HER
// görsel için OpenAI'ye serbest metin SVG XML yazdırıyordu (bkz.
// generateVisualForQuestion/buildSVGPrompt, app/api/generate-quiz/route.ts) —
// bu hem pahalı/yavaş hem kırılgandı (yanıt kesiliyor, sayılar sorudakiyle
// tutmuyor, bazen bağlamla örtüşmüyordu — ayrı bir OpenAI QA geçidi
// gerektiriyordu).
//
// Bu modül bunun yerine DETERMİNİSTİK bir yaklaşım sağlıyor: model artık SVG
// yazmıyor, sadece küçük ve kesin bir "chartData" JSON nesnesi üretiyor (bkz.
// route.ts'teki chartDataInstruction), bu modül o veriyi HER ZAMAN aynı,
// öngörülebilir şekilde çizer. AI çağrısı yok, kesilme riski yok, sayılar
// sorudaki veriyle birebir aynı (çünkü aynı chartData hem soruyu üreten
// modelden hem çizimden geliyor) — tek risk modelin chartData'yı hiç
// göndermemesi ya da bozuk göndermesi, bu da validateChartData() ile
// yakalanıp eski AI-SVG yoluna güvenle geri düşülüyor (route.ts'te).
//
// Kapsam: yalnızca math_graph kategorisi (koordinat sistemi, sayı doğrusu,
// çubuk/çizgi/pasta grafik gibi VERİ TEMELLİ, yapısı net olan görseller).
// Geometri/harita/biyoloji gibi serbest çizim gerektiren kategoriler bu
// modülün kapsamı dışında, eski AI-SVG yolunda kalmaya devam ediyor.

export type NumberlineChart = {
  type: 'numberline'
  min: number
  max: number
  points?: Array<{ value: number; label?: string }>
}

export type CoordinateChart = {
  type: 'coordinate'
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  points?: Array<{ x: number; y: number; label?: string }>
  lines?: Array<{ points: Array<{ x: number; y: number }>; label?: string }>
}

export type BarOrLineChart = {
  type: 'bar' | 'line'
  categories: string[]
  series: Array<{ label?: string; values: number[] }>
  unit?: string
}

export type PieChart = {
  type: 'pie'
  segments: Array<{ label: string; value: number }>
}

export type ChartData = NumberlineChart | CoordinateChart | BarOrLineChart | PieChart

const W = 400
const H = 280
const COLORS = ['#2563eb', '#ef4444', '#16a34a', '#f97316', '#8b5cf6']

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function escXml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .slice(0, 80)
}

function fmtNum(v: number): string {
  const rounded = Math.round(v * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

// "Güzel" bir eksen adımı seçer (1/2/5 × 10^n) — herhangi bir min/max
// aralığında etiketler ne çok seyrek ne çok sık olsun diye.
function niceStep(range: number, targetTicks = 8): number {
  if (!isFiniteNum(range) || range <= 0) return 1
  const raw = range / targetTicks
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10
  return step * mag
}

function svgWrap(body: string, title?: string): string {
  const titleEl = title
    ? `<text x="${W / 2}" y="18" font-family="Arial" font-size="13" fill="#333" text-anchor="middle" font-weight="bold">${escXml(title)}</text>`
    : ''
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="white"/>${titleEl}${body}</svg>`
}

// ─── DOĞRULAMA ──────────────────────────────────────────────────────────────
// Model bozuk/eksik chartData gönderirse (yanlış tip, NaN, boş dizi vb.)
// burada reddedilir — çağıran taraf (route.ts) bunu eski AI-SVG yoluna
// güvenle geri düşmek için kullanır.
export function validateChartData(data: any): data is ChartData {
  if (!data || typeof data !== 'object') return false
  switch (data.type) {
    case 'numberline':
      return (
        isFiniteNum(data.min) && isFiniteNum(data.max) && data.max > data.min &&
        (data.points === undefined ||
          (Array.isArray(data.points) && data.points.length <= 8 &&
            data.points.every((p: any) => isFiniteNum(p?.value))))
      )
    case 'coordinate':
      return (
        isFiniteNum(data.xMin) && isFiniteNum(data.xMax) && isFiniteNum(data.yMin) && isFiniteNum(data.yMax) &&
        data.xMax > data.xMin && data.yMax > data.yMin &&
        (data.points === undefined ||
          (Array.isArray(data.points) && data.points.length <= 10 &&
            data.points.every((p: any) => isFiniteNum(p?.x) && isFiniteNum(p?.y)))) &&
        (data.lines === undefined ||
          (Array.isArray(data.lines) && data.lines.length <= 4 &&
            data.lines.every((l: any) =>
              Array.isArray(l?.points) && l.points.length >= 2 && l.points.length <= 40 &&
              l.points.every((p: any) => isFiniteNum(p?.x) && isFiniteNum(p?.y)))))
      )
    case 'bar':
    case 'line':
      return (
        Array.isArray(data.categories) && data.categories.length >= 1 && data.categories.length <= 12 &&
        data.categories.every((c: any) => typeof c === 'string') &&
        Array.isArray(data.series) && data.series.length >= 1 && data.series.length <= 4 &&
        data.series.every((s: any) =>
          Array.isArray(s?.values) && s.values.length === data.categories.length &&
          s.values.every(isFiniteNum))
      )
    case 'pie':
      return (
        Array.isArray(data.segments) && data.segments.length >= 2 && data.segments.length <= 8 &&
        data.segments.every((s: any) => typeof s?.label === 'string' && isFiniteNum(s?.value) && s.value >= 0) &&
        data.segments.some((s: any) => s.value > 0)
      )
    default:
      return false
  }
}

// ─── SAYI DOĞRUSU ───────────────────────────────────────────────────────────
function renderNumberline(d: NumberlineChart): string {
  const x0 = 30, x1 = W - 30, y = H / 2
  const scale = (v: number) => x0 + ((v - d.min) / (d.max - d.min)) * (x1 - x0)
  let body = `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#333" stroke-width="2"/>`
  body += `<polygon points="${x1},${y} ${x1 - 9},${y - 5} ${x1 - 9},${y + 5}" fill="#333"/>`
  body += `<polygon points="${x0},${y} ${x0 + 9},${y - 5} ${x0 + 9},${y + 5}" fill="#333"/>`
  const step = niceStep(d.max - d.min, 10)
  const startTick = Math.ceil(d.min / step) * step
  for (let v = startTick; v <= d.max + 1e-9; v += step) {
    const px = scale(v)
    body += `<line x1="${px}" y1="${y - 6}" x2="${px}" y2="${y + 6}" stroke="#333" stroke-width="1.5"/>`
    body += `<text x="${px}" y="${y + 22}" font-family="Arial" font-size="12" fill="#333" text-anchor="middle">${fmtNum(v)}</text>`
  }
  for (const p of d.points || []) {
    const px = scale(p.value)
    body += `<circle cx="${px}" cy="${y}" r="5.5" fill="#ef4444" stroke="white" stroke-width="1.5"/>`
    if (p.label) body += `<text x="${px}" y="${y - 14}" font-family="Arial" font-size="13" fill="#2563eb" text-anchor="middle" font-weight="bold">${escXml(p.label)}</text>`
  }
  return svgWrap(body)
}

// ─── KOORDİNAT SİSTEMİ ──────────────────────────────────────────────────────
function renderCoordinate(d: CoordinateChart): string {
  const pad = 34
  const x0 = pad, x1 = W - 16, y0 = H - pad, y1 = 34
  const sx = (x: number) => x0 + ((x - d.xMin) / (d.xMax - d.xMin)) * (x1 - x0)
  const sy = (y: number) => y0 - ((y - d.yMin) / (d.yMax - d.yMin)) * (y0 - y1)

  let body = ''
  const stepX = niceStep(d.xMax - d.xMin, 8)
  const stepY = niceStep(d.yMax - d.yMin, 6)
  // ızgara çizgileri
  for (let x = Math.ceil(d.xMin / stepX) * stepX; x <= d.xMax + 1e-9; x += stepX) {
    body += `<line x1="${sx(x)}" y1="${y0}" x2="${sx(x)}" y2="${y1}" stroke="#e5e7eb" stroke-width="1"/>`
  }
  for (let y = Math.ceil(d.yMin / stepY) * stepY; y <= d.yMax + 1e-9; y += stepY) {
    body += `<line x1="${x0}" y1="${sy(y)}" x2="${x1}" y2="${sy(y)}" stroke="#e5e7eb" stroke-width="1"/>`
  }
  // eksenler (0 aralıkta değilse kenara sabitlenir)
  const axisX = d.yMin <= 0 && d.yMax >= 0 ? sy(0) : y0
  const axisY = d.xMin <= 0 && d.xMax >= 0 ? sx(0) : x0
  body += `<line x1="${x0}" y1="${axisX}" x2="${x1}" y2="${axisX}" stroke="#333" stroke-width="1.5"/>`
  body += `<line x1="${axisY}" y1="${y0}" x2="${axisY}" y2="${y1}" stroke="#333" stroke-width="1.5"/>`
  body += `<text x="${x1 - 4}" y="${axisX - 6}" font-family="Arial" font-size="11" fill="#333" text-anchor="end">x</text>`
  body += `<text x="${axisY + 8}" y="${y1 + 10}" font-family="Arial" font-size="11" fill="#333">y</text>`
  // eksen etiketleri (sadece min/max ve 0 — kalabalık olmasın)
  for (const v of [d.xMin, d.xMax]) body += `<text x="${sx(v)}" y="${axisX + 16}" font-family="Arial" font-size="10" fill="#666" text-anchor="middle">${fmtNum(v)}</text>`
  for (const v of [d.yMin, d.yMax]) body += `<text x="${axisY - 6}" y="${sy(v) + 4}" font-family="Arial" font-size="10" fill="#666" text-anchor="end">${fmtNum(v)}</text>`

  for (const line of d.lines || []) {
    const pts = line.points.map(p => `${sx(p.x)},${sy(p.y)}`).join(' ')
    body += `<polyline points="${pts}" fill="none" stroke="#2563eb" stroke-width="2"/>`
    if (line.label) {
      const last = line.points[line.points.length - 1]
      // Sağ kenara çok yakınsa etiket taşmasın diye çapayı ("start"→"end") ve
      // yönü tersine çeviriyoruz — sağ kenar civarında metin sola doğru yazılır.
      const nearRight = sx(last.x) > W - 40
      const lx = nearRight ? sx(last.x) - 6 : sx(last.x) + 6
      body += `<text x="${Math.min(Math.max(lx, 4), W - 4)}" y="${Math.min(Math.max(sy(last.y) - 6, 12), H - 4)}" font-family="Arial" font-size="11" fill="#2563eb" font-weight="bold" text-anchor="${nearRight ? 'end' : 'start'}">${escXml(line.label)}</text>`
    }
  }
  for (const p of d.points || []) {
    body += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="4.5" fill="#ef4444" stroke="white" stroke-width="1.5"/>`
    if (p.label) {
      const nearRight = sx(p.x) > W - 40
      const lx = nearRight ? sx(p.x) - 8 : sx(p.x) + 8
      body += `<text x="${Math.min(Math.max(lx, 4), W - 4)}" y="${Math.min(Math.max(sy(p.y) - 8, 12), H - 4)}" font-family="Arial" font-size="12" fill="#ef4444" font-weight="bold" text-anchor="${nearRight ? 'end' : 'start'}">${escXml(p.label)}</text>`
    }
  }
  return svgWrap(body)
}

// ─── ÇUBUK / ÇİZGİ GRAFİK ───────────────────────────────────────────────────
function renderBarOrLine(d: BarOrLineChart): string {
  const padL = 40, padR = 14, padT = 34, padB = 44
  const x0 = padL, x1 = W - padR, y0 = H - padB, y1 = padT
  const allValues = d.series.flatMap(s => s.values)
  const rawMax = Math.max(0, ...allValues)
  const rawMin = Math.min(0, ...allValues)
  const step = niceStep(Math.max(1e-6, rawMax - rawMin), 5)
  const yMax = Math.ceil(rawMax / step) * step || step
  const yMin = Math.floor(rawMin / step) * step
  const sy = (v: number) => y0 - ((v - yMin) / (yMax - yMin)) * (y0 - y1)
  const n = d.categories.length
  const slotW = (x1 - x0) / n

  let body = ''
  for (let v = yMin; v <= yMax + 1e-9; v += step) {
    body += `<line x1="${x0}" y1="${sy(v)}" x2="${x1}" y2="${sy(v)}" stroke="#e5e7eb" stroke-width="1"/>`
    body += `<text x="${x0 - 6}" y="${sy(v) + 4}" font-family="Arial" font-size="10" fill="#666" text-anchor="end">${fmtNum(v)}</text>`
  }
  body += `<line x1="${x0}" y1="${sy(0)}" x2="${x1}" y2="${sy(0)}" stroke="#333" stroke-width="1.5"/>`
  d.categories.forEach((c, i) => {
    body += `<text x="${x0 + slotW * (i + 0.5)}" y="${y0 + 16}" font-family="Arial" font-size="11" fill="#333" text-anchor="middle">${escXml(c).slice(0, 10)}</text>`
  })

  if (d.type === 'bar') {
    const seriesCount = d.series.length
    const groupPad = slotW * 0.18
    const barW = (slotW - groupPad * 2) / seriesCount
    d.series.forEach((s, si) => {
      const color = COLORS[si % COLORS.length]
      s.values.forEach((v, i) => {
        const bx = x0 + slotW * i + groupPad + barW * si
        const by = sy(Math.max(0, v))
        const bh = Math.abs(sy(v) - sy(0))
        body += `<rect x="${bx}" y="${Math.min(by, sy(0))}" width="${Math.max(1, barW - 2)}" height="${Math.max(1, bh)}" fill="${color}"/>`
      })
    })
  } else {
    d.series.forEach((s, si) => {
      const color = COLORS[si % COLORS.length]
      const pts = s.values.map((v, i) => `${x0 + slotW * (i + 0.5)},${sy(v)}`).join(' ')
      body += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5"/>`
      s.values.forEach((v, i) => {
        body += `<circle cx="${x0 + slotW * (i + 0.5)}" cy="${sy(v)}" r="3.5" fill="${color}"/>`
      })
    })
  }

  // gösterge (birden fazla seri varsa)
  if (d.series.length > 1) {
    d.series.forEach((s, si) => {
      const color = COLORS[si % COLORS.length]
      const ly = padT - 16 + si * 0 // tek satırda yan yana
      body += `<rect x="${padL + si * 90}" y="${padT - 26}" width="9" height="9" fill="${color}"/>`
      body += `<text x="${padL + si * 90 + 13}" y="${padT - 18}" font-family="Arial" font-size="10" fill="#333">${escXml(s.label || `Seri ${si + 1}`)}</text>`
    })
  }
  const title = d.unit ? `(${d.unit})` : undefined
  return svgWrap(body, title)
}

// ─── PASTA GRAFİK ───────────────────────────────────────────────────────────
function renderPie(d: PieChart): string {
  const cx = W / 2 - 40, cy = H / 2 + 6, r = 90
  const total = d.segments.reduce((sum, s) => sum + Math.max(0, s.value), 0) || 1
  let angle = -Math.PI / 2
  let body = ''
  d.segments.forEach((s, i) => {
    const frac = Math.max(0, s.value) / total
    const sweep = frac * Math.PI * 2
    const a0 = angle
    const a1 = angle + sweep
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    const large = sweep > Math.PI ? 1 : 0
    const color = COLORS[i % COLORS.length]
    if (frac > 0.0001) {
      body += `<path d="M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z" fill="${color}" stroke="white" stroke-width="1.5"/>`
    }
    angle = a1
  })
  // gösterge (sağ tarafta dikey liste — etiket + yüzde)
  let ly = cy - (d.segments.length * 16) / 2
  d.segments.forEach((s, i) => {
    const color = COLORS[i % COLORS.length]
    const pct = Math.round((Math.max(0, s.value) / total) * 100)
    body += `<rect x="${cx + r + 20}" y="${ly - 8}" width="10" height="10" fill="${color}"/>`
    body += `<text x="${cx + r + 34}" y="${ly + 1}" font-family="Arial" font-size="10.5" fill="#333">${escXml(s.label).slice(0, 14)} (%${pct})</text>`
    ly += 18
  })
  return svgWrap(body)
}

// ─── ANA GİRİŞ NOKTASI ──────────────────────────────────────────────────────
// chartData GEÇERLİ değilse null döner — çağıran taraf bunu eski AI-SVG
// yoluna güvenle geri düşmek için kullanmalı, ASLA kısmi/bozuk bir SVG
// döndürülmez.
export function renderChartSVG(data: any): string | null {
  if (!validateChartData(data)) return null
  switch (data.type) {
    case 'numberline': return renderNumberline(data)
    case 'coordinate': return renderCoordinate(data)
    case 'bar':
    case 'line': return renderBarOrLine(data)
    case 'pie': return renderPie(data)
    default: return null
  }
}
