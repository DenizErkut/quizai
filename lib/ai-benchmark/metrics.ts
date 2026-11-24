// Benchmark ölçüm fonksiyonları (AI altyapı planı P1-1). Saf ve bağımlılıksız: hem birim testlerle hem scripts/ai-benchmark/run.mjs ile kullanılır.

export function mean(values: number[]): number { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN }

/** En yakın sıra yöntemiyle yüzdelik (p ∈ [0,100]). */
export function percentile(values: number[], p: number): number {
  if (!values.length) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

export function topKAccuracy(ranked: string[][], gold: string[], k: number): number {
  if (!gold.length) return NaN
  let hit = 0
  gold.forEach((label, i) => { if ((ranked[i] || []).slice(0, k).includes(label)) hit++ })
  return hit / gold.length
}

export function precisionRecallF1(predicted: boolean[], actual: boolean[]): { precision: number; recall: number; f1: number } {
  let tp = 0, fp = 0, fn = 0
  predicted.forEach((p, i) => { const a = actual[i]; if (p && a) tp++; else if (p && !a) fp++; else if (!p && a) fn++ })
  const precision = tp + fp ? tp / (tp + fp) : 0
  const recall = tp + fn ? tp / (tp + fn) : 0
  return { precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 }
}

export function macroF1(predicted: string[], actual: string[]): number {
  const labels = [...new Set(actual)]
  if (!labels.length) return NaN
  const scores = labels.map(label => precisionRecallF1(predicted.map(p => p === label), actual.map(a => a === label)).f1)
  return mean(scores)
}

/** İkinci dereceden ağırlıklı kappa (QWK): açık uçlu puanlamada makine–insan uyumu. Puanlar tam sayı [min,max]. */
export function quadraticWeightedKappa(a: number[], b: number[], min: number, max: number): number {
  const n = max - min + 1
  if (a.length !== b.length || a.length === 0 || n < 2) return NaN
  const observed = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  const histA = new Array<number>(n).fill(0); const histB = new Array<number>(n).fill(0)
  a.forEach((x, i) => { const ix = Math.min(n - 1, Math.max(0, x - min)); const iy = Math.min(n - 1, Math.max(0, b[i] - min)); observed[ix][iy]++; histA[ix]++; histB[iy]++ })
  let num = 0, den = 0
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const w = ((i - j) ** 2) / ((n - 1) ** 2)
    num += w * observed[i][j]
    den += w * (histA[i] * histB[j]) / a.length
  }
  return den === 0 ? 1 : 1 - num / den
}

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

/** Ortalama için bootstrap güven aralığı (sabit tohum → tekrarlanabilir). */
export function bootstrapCI(values: number[], iterations = 2000, alpha = 0.05, seed = 42): { low: number; high: number; mean: number } {
  if (!values.length) return { low: NaN, high: NaN, mean: NaN }
  const rand = seeded(seed)
  const means: number[] = []
  for (let i = 0; i < iterations; i++) {
    let sum = 0
    for (let j = 0; j < values.length; j++) sum += values[Math.floor(rand() * values.length)]
    means.push(sum / values.length)
  }
  return { low: percentile(means, (alpha / 2) * 100), high: percentile(means, (1 - alpha / 2) * 100), mean: mean(values) }
}

/** Eşleşmiş fark (aday − referans) için bootstrap güven aralığı. Alt sınır > −margin ise "aşağı değil" iddiası desteklenir. */
export function pairedNonInferiority(candidate: number[], reference: number[], margin: number, iterations = 2000, seed = 7): { meanDiff: number; low: number; high: number; nonInferior: boolean } {
  if (candidate.length !== reference.length || !candidate.length) return { meanDiff: NaN, low: NaN, high: NaN, nonInferior: false }
  const diffs = candidate.map((c, i) => c - reference[i])
  const ci = bootstrapCI(diffs, iterations, 0.05, seed)
  return { meanDiff: ci.mean, low: ci.low, high: ci.high, nonInferior: ci.low > -Math.abs(margin) }
}

export type SimpleSchema = Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>

/** Hafif şema doğrulama: gereken anahtarlar ve türleri. Onarımsız geçerli JSON oranı için kullanılır. */
export function validateJsonShape(text: string, schema: SimpleSchema): boolean {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return false }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
  const record = parsed as Record<string, unknown>
  return Object.entries(schema).every(([key, type]) => {
    const value = record[key]
    if (type === 'array') return Array.isArray(value)
    if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    return typeof value === type
  })
}

/** USD maliyet: fiyatlar USD / 1M token. */
export function costUsd(inputTokens: number, outputTokens: number, priceInPerM: number, priceOutPerM: number): number {
  return (inputTokens / 1e6) * priceInPerM + (outputTokens / 1e6) * priceOutPerM
}
